import {
  generateValue,
  generateGenericText,
  generateInvalidValue,
  activeViolationKinds,
  violationLabel,
  sanitizeToAllowedChars,
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
  const r = await chrome.storage.local.get([
    'lastFillResult', 'testValidationMode', 'invalidCycleStep',
  ]);
  return {
    lastFillResult: r.lastFillResult,
    testValidationMode: r.testValidationMode ?? false,
    invalidCycleStep: r.invalidCycleStep ?? 0,
  };
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
// targets ONE violation kind across the whole form (format → below-min length →
// above-max length → below-min value → above-max value → empty, skipping kinds no
// field can express). The cycle step advances each fill so successive fills walk
// the form's active kinds.
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
  await chrome.storage.local.set({ invalidCycleStep: step + 1 });

  const result: FillResult = {
    fieldsFilled: instructions.length,
    fieldsSkipped: fields.length - instructions.length,
    timestamp: Date.now(),
  };
  await chrome.storage.local.set({ lastFillResult: result });
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
  // up until values are generated and applied.
  sendToast(tabId, 'loading', 'Filling form…');

  const instructions: FillInstruction[] = [];

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
      // Unmatched free-text field — generic local fallback (word-based, period-free)
      // so it isn't left blank. Null only for structured/pattern fields, left blank.
      const generic = generateGenericText(field);
      if (generic !== null) instructions.push({ fieldId: field.id, value: generic });
    }
  }

  // 3. Apply values; content script fires blur + installs MutationObserver to
  //    auto-correct when validation errors appear (blur-triggered OR submit-triggered)
  await chrome.tabs.sendMessage(tabId, { type: 'APPLY_VALUES', instructions, fireValidation: true });

  // Store so VALIDATION_ERRORS_APPEARED can apply corrections for this tab
  pendingCorrections.set(tabId, instructions);

  const result: FillResult = {
    fieldsFilled: instructions.length,
    fieldsSkipped: fields.length - instructions.length,
    timestamp: Date.now(),
  };

  await chrome.storage.local.set({ lastFillResult: result });

  sendToast(tabId, 'success', `✓ ${result.fieldsFilled} fields filled`);

  return result;
}

// Keyboard shortcut handler
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'fill-form') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await runFill(tab.id);
    } catch (e) {
      console.error('[FormFiller] Fill failed:', e);
      sendToast(tab.id, 'error', 'Fill failed — try reloading the tab');
    }
    return;
  }

  if (command === 'toggle-test-mode') {
    const { testValidationMode } = await getSettings();
    const enabled = !testValidationMode;
    // Enabling restarts the cycle so the next fill begins at pass 1 (invalid format).
    await chrome.storage.local.set(
      enabled ? { testValidationMode: true, invalidCycleStep: 0 } : { testValidationMode: false }
    );
    // Toast confirms the new state — the popup is closed when using a shortcut.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      sendToast(tab.id, 'success',
        enabled ? '🧪 Invalid mode ON — next fill: invalid format' : 'Invalid mode OFF');
    }
    return;
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

        case 'SET_TEST_MODE':
          await chrome.storage.local.set({ testValidationMode: message.enabled });
          sendResponse({ type: 'SETTINGS', settings: await getSettings() });
          break;

        case 'GET_SETTINGS':
          sendResponse({ type: 'SETTINGS', settings: await getSettings() });
          break;

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
        const applied = String(appliedByFieldId.get(field.id) ?? '');

        // Charset-restriction error (e.g. "only letters, hyphens, or apostrophes"):
        // no HTML attribute carries this rule, so generateValue can't satisfy it.
        // Repair the value already in the field by stripping disallowed characters.
        const sanitized = sanitizeToAllowedChars(applied, field.hint);
        if (sanitized && sanitized !== applied) {
          corrections.push({ fieldId: field.id, value: sanitized });
          continue;
        }
        if (sanitized) continue; // value already satisfies the stated charset
        // sanitized is null (no charset rule) or '' (stripped empty) → regenerate

        const newValue = generateValue(field, dateGroupCache);
        if (newValue === null) continue;
        // Only correct if the hint-informed value differs from what was applied
        if (String(newValue) !== applied) {
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
