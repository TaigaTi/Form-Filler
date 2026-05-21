import { generateValue } from '../shared/valueGenerator';
import {
  ExtractFieldsResponse,
  FieldMeta,
  FillInstruction,
  FillResult,
  MessageToBackground,
  StoredSettings,
} from '../shared/types';

async function getSettings(): Promise<StoredSettings> {
  const r = await chrome.storage.sync.get(['claudeApiKey', 'lastFillResult']);
  return { claudeApiKey: r.claudeApiKey ?? '', lastFillResult: r.lastFillResult };
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

async function runFill(tabId: number): Promise<FillResult> {
  // 1. Extract fields — inject content script first if it's not already present
  let response = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_FIELDS' })
    .catch(() => null) as ExtractFieldsResponse | null;

  if (!response?.fields) {
    await ensureContentScript(tabId);
    response = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_FIELDS' })
      .catch(() => null) as ExtractFieldsResponse | null;
    if (!response?.fields) throw new Error('Failed to extract fields — try reloading the tab');
  }

  const { fields } = response;

  const instructions: FillInstruction[] = [];
  const aiNeeded: FieldMeta[] = [];

  // 2. Generate values via rules engine / type logic
  for (const field of fields) {
    const value = generateValue(field);
    if (value !== null) {
      // Validate string values against the field's pattern attribute
      if (field.pattern && typeof value === 'string') {
        try {
          if (!new RegExp(`^(?:${field.pattern})$`).test(value)) {
            aiNeeded.push(field);
            continue;
          }
        } catch { /* invalid regex — skip pattern check */ }
      }
      instructions.push({ fieldId: field.id, value });
    } else {
      aiNeeded.push(field);
    }
  }

  // 3. AI fallback for unmatched text fields
  let aiFieldCount = 0;
  if (aiNeeded.length > 0) {
    const settings = await getSettings();
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
      }
    }
  }

  // 4. Apply values
  await chrome.tabs.sendMessage(tabId, { type: 'APPLY_VALUES', instructions });

  const result: FillResult = {
    fieldsFilled: instructions.length,
    fieldsSkipped: fields.length - instructions.length,
    aiFieldCount,
    timestamp: Date.now(),
  };

  await chrome.storage.sync.set({ lastFillResult: result });
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
            sendResponse({ type: 'FILL_ERROR', error: String(e) });
          }
          break;
        }

        case 'SAVE_API_KEY':
          await chrome.storage.sync.set({ claudeApiKey: message.key });
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
