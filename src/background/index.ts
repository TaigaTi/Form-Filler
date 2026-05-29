import {
  generateValue,
  generateGenericText,
  generateInvalidValue,
  activeViolationKinds,
  violationLabel,
} from '../shared/valueGenerator';
import { isConfirmationLabel, normalizeLabel } from '../shared/rules';
import { pollForFields } from './poll';
import {
  ExtractFieldsResponse,
  FieldMeta,
  FillInstruction,
  FillResult,
  MessageFromContent,
  MessageToBackground,
  StoredSettings,
  ToastState,
} from '../shared/types';

// Keyed by tabId — stores the instructions applied by the last fill so the
// VALIDATION_ERRORS_APPEARED handler can compute corrections.
const pendingCorrections = new Map<number, FillInstruction[]>();

async function getSettings(): Promise<StoredSettings> {
  const r = await chrome.storage.sync.get([
    'claudeApiKey', 'lastFillResult', 'testValidationMode', 'invalidCycleStep',
  ]);
  return {
    claudeApiKey: r.claudeApiKey ?? '',
    lastFillResult: r.lastFillResult,
    testValidationMode: r.testValidationMode ?? false,
    invalidCycleStep: r.invalidCycleStep ?? 0,
  };
}

async function getAiValues(
  labels: string[],
  apiKey: string,
  fieldMetas: FieldMeta[]
): Promise<Record<string, string>> {
  const cacheKeys = labels.map((l) => `ai_cache_${l}`);
  const cached = await chrome.storage.local.get(cacheKeys);

  const uncached = labels.filter((l) => !cached[`ai_cache_${l}`]);
  const result: Record<string, string> = {};

  for (const label of labels) {
    if (cached[`ai_cache_${label}`]) result[label] = cached[`ai_cache_${label}`];
  }

  if (uncached.length === 0 || !apiKey) return result;

  // Build field descriptions with pattern/hint context so Claude generates valid values
  const fieldDescriptions = uncached.map((label) => {
    const meta = fieldMetas.find((f) => f.label === label);
    const extras: string[] = [];
    if (meta?.hint) extras.push(`hint: "${meta.hint}"`);
    if (meta?.pattern) extras.push(`pattern: ${meta.pattern}`);
    if (meta?.maxLength) extras.push(`max length: ${meta.maxLength}`);
    return extras.length > 0 ? `"${label}" (${extras.join(', ')})` : `"${label}"`;
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content:
              `You are filling a web form with realistic fake data for testing. ` +
              `Return a JSON object mapping each field label to an appropriate fake value. ` +
              `Be concise — values should be realistic but brief. ` +
              `For fields with a pattern, the value MUST match the pattern exactly.\n\n` +
              `Fields: [${fieldDescriptions.join(', ')}]`,
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`Claude API ${res.status}`);

    const data = await res.json();
    const text: string = data.content[0]?.text ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');

    const aiMap: Record<string, string> = JSON.parse(jsonMatch[0]);

    const toCache: Record<string, string> = {};
    for (const [label, value] of Object.entries(aiMap)) {
      const strValue = String(value);
      result[label] = strValue;
      toCache[`ai_cache_${label}`] = strValue;
    }
    await chrome.storage.local.set(toCache);
  } catch (e) {
    console.error('[FormFiller] AI error:', e);
  }

  return result;
}

async function ensureContentScript(tabId: number): Promise<void> {
  // Inject the content script into tabs that were open before the extension loaded.
  // Read the actual filename from the built manifest so the hash is always correct.
  const files = chrome.runtime.getManifest().content_scripts?.[0]?.js ?? [];
  if (files.length === 0) throw new Error('No content script files in manifest');
  await chrome.scripting.executeScript({ target: { tabId }, files });
}

// Fire-and-forget toast in the page; never let a failed toast break the fill.
function sendToast(tabId: number, state: ToastState, text: string): void {
  chrome.tabs.sendMessage(tabId, { type: 'TOAST', state, text }).catch(() => {});
}

async function extractFromTab(tabId: number): Promise<FieldMeta[] | null> {
  const response = (await chrome.tabs
    .sendMessage(tabId, { type: 'EXTRACT_FIELDS' })
    .catch(() => null)) as ExtractFieldsResponse | null;
  return response?.fields ?? null;
}

// Test validation mode: fill every field with data that should FAIL validation,
// then fire the form's validators so the errors surface. Auto-correction is
// intentionally NOT registered, so the bad data is left in place. Each pass
// targets ONE violation kind across the whole form (format → below-min → above-max
// → out-of-range → empty, skipping kinds no field can express). The cycle step
// advances each fill so successive fills walk the form's active kinds.
async function runInvalidFill(
  tabId: number,
  fields: FieldMeta[],
  step: number
): Promise<FillResult> {
  // The form-wide cycle. Empty only when every field is a structured type or date
  // part (which break regardless of kind) — fall back to one nominal pass so the
  // pass math and labelling stay valid.
  const activeKinds = activeViolationKinds(fields);
  const kinds = activeKinds.length > 0 ? activeKinds : (['empty'] as const);
  const pass = ((step % kinds.length) + kinds.length) % kinds.length;
  const kind = kinds[pass];

  sendToast(tabId, 'loading',
    `Filling invalid data — pass ${pass + 1} of ${kinds.length}: ${violationLabel(kind)}…`);

  const instructions: FillInstruction[] = [];
  for (const field of fields) {
    const value = generateInvalidValue(field, kind);
    if (value !== null) instructions.push({ fieldId: field.id, value });
  }

  // fireValidation surfaces the errors; clearing pendingCorrections ensures the
  // VALIDATION_ERRORS_APPEARED handler won't "fix" the values we deliberately broke.
  await chrome.tabs.sendMessage(tabId, { type: 'APPLY_VALUES', instructions, fireValidation: true });
  pendingCorrections.delete(tabId);

  // Advance the cycle so the next fill targets the next constraint per field.
  await chrome.storage.sync.set({ invalidCycleStep: step + 1 });

  const result: FillResult = {
    fieldsFilled: instructions.length,
    fieldsSkipped: fields.length - instructions.length,
    aiFieldCount: 0,
    timestamp: Date.now(),
  };
  await chrome.storage.sync.set({ lastFillResult: result });
  sendToast(tabId, 'success',
    `✓ ${result.fieldsFilled} fields filled — ${violationLabel(kind)} (invalid mode)`);
  return result;
}

async function runFill(tabId: number): Promise<FillResult> {
  // 1. Extract fields — inject content script first if it's not already present
  let fields = await extractFromTab(tabId);

  if (!fields) {
    await ensureContentScript(tabId);
    // The injected loader registers its message listener only after an async
    // dynamic import resolves, so poll a few times rather than asking just once.
    fields = await pollForFields(() => extractFromTab(tabId));
    if (!fields) throw new Error('Failed to extract fields — try reloading the tab');
  }

  const settings = await getSettings();

  // Test validation mode fills with deliberately-invalid data instead.
  if (settings.testValidationMode) {
    return runInvalidFill(tabId, fields, settings.invalidCycleStep ?? 0);
  }

  // Content script is confirmed alive now — show the loading toast, which stays
  // up through the (possibly slow) AI call until values are applied.
  sendToast(tabId, 'loading', 'Filling form…');

  const instructions: FillInstruction[] = [];
  const aiNeeded: FieldMeta[] = [];

  // Shared per-fill cache so the three Day/Month/Year inputs of a date triplet
  // resolve to parts of the same generated date.
  const dateGroupCache = new Map<string, Date>();

  // Most recent email value generated this fill, so "confirm email" fields can
  // reuse it instead of generating a fresh, mismatched address.
  let lastEmail: string | null = null;
  const isEmailField = (f: FieldMeta): boolean =>
    f.type === 'email' || /\bemail\b/.test(normalizeLabel(f.label));

  // 2. Generate values — generateValue handles pattern validation internally
  for (const field of fields) {
    // Reuse the prior email for a "confirm email" field rather than regenerating
    if (isEmailField(field) && isConfirmationLabel(field.label) && lastEmail !== null) {
      instructions.push({ fieldId: field.id, value: lastEmail });
      continue;
    }

    const value = generateValue(field, dateGroupCache);
    if (value !== null) {
      instructions.push({ fieldId: field.id, value });
      if (typeof value === 'string' && isEmailField(field)) lastEmail = value;
    } else {
      aiNeeded.push(field);
    }
  }

  // 3. AI fallback for unmatched text fields
  let aiFieldCount = 0;
  if (aiNeeded.length > 0) {
    const uniqueLabels = [...new Set(aiNeeded.map((f) => f.label))];
    const aiValues = await getAiValues(uniqueLabels, settings.claudeApiKey, aiNeeded);

    for (const field of aiNeeded) {
      let value = aiValues[field.label];
      if (value !== undefined) {
        // Respect maxLength for AI-generated values too
        if (field.maxLength && value.length > field.maxLength) {
          value = value.slice(0, field.maxLength);
        }
        instructions.push({ fieldId: field.id, value });
        aiFieldCount++;
      } else {
        // No AI value (no key, or AI failed/omitted it) — generic local fallback
        // so free-text fields aren't left blank.
        const generic = generateGenericText(field);
        if (generic !== null) instructions.push({ fieldId: field.id, value: generic });
      }
    }
  }

  // 4. Apply values; content script fires blur + installs MutationObserver to
  //    auto-correct when validation errors appear (blur-triggered OR submit-triggered)
  await chrome.tabs.sendMessage(tabId, { type: 'APPLY_VALUES', instructions, fireValidation: true });

  // Store so VALIDATION_ERRORS_APPEARED can apply corrections for this tab
  pendingCorrections.set(tabId, instructions);

  const result: FillResult = {
    fieldsFilled: instructions.length,
    fieldsSkipped: fields.length - instructions.length,
    aiFieldCount,
    timestamp: Date.now(),
  };

  await chrome.storage.sync.set({ lastFillResult: result });

  const aiStr = aiFieldCount > 0 ? ` (${aiFieldCount} via AI)` : '';
  sendToast(tabId, 'success', `✓ ${result.fieldsFilled} fields filled${aiStr}`);

  return result;
}

// Keyboard shortcut handler
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'fill-form') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await runFill(tab.id);
  } catch (e) {
    console.error('[FormFiller] Fill failed:', e);
    sendToast(tab.id, 'error', 'Fill failed — try reloading the tab');
  }
});

// Popup message handler
chrome.runtime.onMessage.addListener(
  (message: MessageToBackground, _sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case 'FILL_REQUEST': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            sendResponse({ type: 'FILL_ERROR', error: 'No active tab found' });
            return;
          }
          try {
            const result = await runFill(tab.id);
            sendResponse({ type: 'FILL_COMPLETE', result });
          } catch (e) {
            console.error('[FormFiller] runFill error:', e);
            sendToast(tab.id, 'error', 'Fill failed — try reloading the tab');
            sendResponse({ type: 'FILL_ERROR', error: String(e) });
          }
          break;
        }

        case 'SAVE_API_KEY':
          await chrome.storage.sync.set({ claudeApiKey: message.key });
          sendResponse({ type: 'SETTINGS', settings: await getSettings() });
          break;

        case 'SET_TEST_MODE':
          await chrome.storage.sync.set({ testValidationMode: message.enabled });
          sendResponse({ type: 'SETTINGS', settings: await getSettings() });
          break;

        case 'GET_SETTINGS':
          sendResponse({ type: 'SETTINGS', settings: await getSettings() });
          break;

        case 'CLEAR_AI_CACHE': {
          const all = await chrome.storage.local.get(null);
          const cacheKeys = Object.keys(all).filter((k) => k.startsWith('ai_cache_'));
          if (cacheKeys.length > 0) await chrome.storage.local.remove(cacheKeys);
          sendResponse({ type: 'SETTINGS', settings: await getSettings() });
          break;
        }

        default:
          sendResponse({});
          break;
      }
    })();
    return true; // keep channel open for async response
  }
);

// Content-script message handler — fires when MutationObserver detects validation errors
chrome.runtime.onMessage.addListener(
  (message: MessageFromContent, sender, sendResponse) => {
    if (message.type !== 'VALIDATION_ERRORS_APPEARED') return false;

    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({}); return false; }

    const stored = pendingCorrections.get(tabId);
    if (!stored) { sendResponse({}); return false; }

    (async () => {
      const appliedByFieldId = new Map(stored.map((i) => [i.fieldId, i.value]));
      const corrections: FillInstruction[] = [];
      const dateGroupCache = new Map<string, Date>();

      for (const field of message.fields) {
        if (!field.hint) continue;
        const newValue = generateValue(field, dateGroupCache);
        if (newValue === null) continue;
        // Only correct if the hint-informed value differs from what was applied
        if (String(newValue) !== String(appliedByFieldId.get(field.id) ?? '')) {
          corrections.push({ fieldId: field.id, value: newValue });
        }
      }

      if (corrections.length > 0) {
        await chrome.tabs.sendMessage(tabId, { type: 'APPLY_VALUES', instructions: corrections });
      }

      pendingCorrections.delete(tabId);
      sendResponse({});
    })();

    return true; // async response
  }
);
