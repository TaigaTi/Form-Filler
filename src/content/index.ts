import { extractFields, resolveOptionLabel } from '../shared/fieldExtractor';
import { FillInstruction, FillResult, MessageToContent } from '../shared/types';
import { showToast } from './toast';

// Use native setters so React/Vue controlled inputs pick up the change
const nativeInputSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value'
)?.set;
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  'value'
)?.set;

export function applyValues(instructions: FillInstruction[]): FillResult {
  let fieldsFilled = 0;
  let fieldsSkipped = 0;

  for (const instruction of instructions) {
    const el = document.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(`[data-ff-uid="${instruction.fieldId}"]`);

    if (!el) {
      fieldsSkipped++;
      continue;
    }

    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      const wantChecked = instruction.value === true;
      // click() toggles state and fires the native click event that React/Vue
      // event delegation listens to — only call if the state actually needs to change
      if (el.checked !== wantChecked) {
        el.click();
      }
      fieldsFilled++;
      continue;
    }

    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const want = String(instruction.value);
      // Match on the .value *property*, not a [value="…"] attribute selector: a
      // radio with no value attribute reports .value === "on" but has no value
      // attribute, so [value="on"] would never match and nothing got selected.
      const group = el.name
        ? Array.from(
            document.querySelectorAll<HTMLInputElement>(
              `input[type="radio"][name="${CSS.escape(el.name)}"]`
            )
          )
        : [el];
      // Match by value first; fall back to the option's label text, since
      // value-less radios all report value "on" and are only distinguishable by
      // label (this is what fieldExtractor stored in `options`).
      const radio =
        group.find((r) => r.value === want) ??
        group.find((r) => resolveOptionLabel(r, document) === want) ??
        group[0] ??
        el;
      if (!radio.checked) {
        radio.click(); // selects this radio, deselects others, triggers framework events
      }
      fieldsFilled++;
      continue;
    }

    if (el instanceof HTMLSelectElement) {
      el.value = String(instruction.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      fieldsFilled++;
      continue;
    }

    // Text-like inputs and textareas — use native setter for React compatibility
    if (el instanceof HTMLTextAreaElement) {
      nativeTextareaSetter?.call(el, String(instruction.value));
    } else {
      nativeInputSetter?.call(el, String(instruction.value));
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    fieldsFilled++;
  }

  return {
    fieldsFilled,
    fieldsSkipped,
    timestamp: Date.now(),
  };
}

// Trigger classes that indicate a validation error has appeared
const ERROR_CLASS_RE = /\b(error|invalid|danger)\b/;

function watchForValidationErrors(): void {
  let fired = false;

  const trigger = () => {
    if (fired) return;
    fired = true;
    observer.disconnect();
    clearTimeout(timer);
    // Re-extract now that error elements are in the DOM (hints updated)
    const updatedFields = extractFields(document);
    chrome.runtime.sendMessage({ type: 'VALIDATION_ERRORS_APPEARED', fields: updatedFields });
  };

  const isErrorNode = (node: Element): boolean => {
    const cls = (node.className ?? '').toLowerCase();
    const role = node.getAttribute('role') ?? '';
    return ERROR_CLASS_RE.test(cls) || role === 'alert' || role === 'status';
  };

  const observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      if (mut.type === 'childList') {
        for (const node of mut.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (isErrorNode(node) && node.textContent?.trim()) {
            trigger();
            return;
          }
          // Error element nested inside an added container
          const nested = node.querySelector('[role="alert"],[role="status"],[aria-live]');
          if (nested?.textContent?.trim()) {
            trigger();
            return;
          }
        }
      } else if (mut.type === 'attributes') {
        const target = mut.target as HTMLInputElement;
        if (target.getAttribute?.('aria-invalid') === 'true') {
          trigger();
          return;
        }
      }
    }
  });

  // Auto-disconnect after 8 seconds so the observer doesn't linger indefinitely
  const timer = setTimeout(() => observer.disconnect(), 8000);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-invalid'],
  });
}

// Guarded so the module can be imported in tests (where `chrome` is absent)
// without registering the listener.
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(
    (message: MessageToContent, _sender, sendResponse) => {
    if (message.type === 'EXTRACT_FIELDS') {
      sendResponse({ fields: extractFields(document) });
      return false;
    }

    if (message.type === 'TOAST') {
      showToast(message.state, message.text);
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'APPLY_VALUES') {
      applyValues(message.instructions);

      if (message.fireValidation) {
        // Fire blur so that blur-triggered validators run immediately
        for (const { fieldId } of message.instructions) {
          const el = document.querySelector(`[data-ff-uid="${fieldId}"]`);
          if (el) {
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
          }
        }
        // Watch for errors that appear from blur OR from the user clicking Continue
        watchForValidationErrors();
      }

      sendResponse({ ok: true });
      return false;
    }
    }
  );
}
