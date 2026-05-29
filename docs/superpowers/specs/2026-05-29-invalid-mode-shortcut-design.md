# Spec — Keyboard shortcut to toggle invalid (test-validation) mode

Date: 2026-05-29
Topic: Add a keyboard shortcut that switches invalid-data test mode on and off without opening the popup.

## Goal

A user testing a form's validators wants to flip invalid mode on, fill, observe, and flip it off — without reaching for the mouse or the popup. Provide a keyboard shortcut that toggles `testValidationMode` and confirms the new state with an on-page toast.

## Approach

Follow the existing command pattern verbatim. The extension already exposes one keyboard command — `fill-form` (Ctrl+Shift+F) — declared in `manifest.json`'s `commands` block and handled in a single `chrome.commands.onCommand` listener in the background service worker. Add a second command alongside it. No new infrastructure, no new message types, no popup changes.

### Alternatives considered

- **A popup-only button / extra UI.** Rejected — the request is specifically a *shortcut*, and the popup already has the toggle.
- **A new message round-trip (`TOGGLE_TEST_MODE`) through the popup handler.** Unnecessary — the command fires directly in the background, which already owns `chrome.storage`. Reusing the existing `SET_TEST_MODE` message would mean routing a background event through the popup channel for no benefit.

## Behavior

New command id: `toggle-test-mode`.

- **Suggested key:** `Ctrl+Shift+X` (Mac: `Command+Shift+X`). Chosen to sit beside the existing `Ctrl+Shift+F` and to avoid Chrome-reserved combinations (T = reopen tab, N = incognito, I/J/C = devtools, W = close window). Users can rebind at `chrome://extensions/shortcuts`.
- **On fire:**
  1. Read current `testValidationMode` (default `false`).
  2. Flip it.
  3. If the new value is `true` (enabling), also set `invalidCycleStep: 0` so the next fill starts at pass 1 (invalid format). Disabling leaves the step untouched.
  4. Persist via `chrome.storage.sync.set`.
  5. Show a toast on the active tab confirming the new state.
- **Toast copy:**
  - Enable → `🧪 Invalid mode ON — next fill: invalid format` (state `success`).
  - Disable → `Invalid mode OFF` (state `success`).
- **No active tab / no tab id:** flip and persist anyway (storage is global); skip the toast. Mirrors how `fill-form` bails when there's no tab, but here the state change is still meaningful even without a page to toast.

### Why a toast, not popup feedback

A keyboard shortcut is used while the popup is closed, so the popup can't reflect the change in the moment. The popup already reads state on open via `GET_SETTINGS` (`renderSettings` syncs the toggle + badge), so it shows the correct state the next time it's opened. No popup code changes are needed.

## Files

- `manifest.json` — add `toggle-test-mode` to the `commands` block with the suggested keys and a description (`Toggle invalid-data test mode on/off`).
- `src/background/index.ts` — extend the existing `chrome.commands.onCommand` listener to branch on `toggle-test-mode`: read + flip `testValidationMode`, conditionally zero `invalidCycleStep`, persist, and toast the active tab.

## Testing

This is glue over Chrome APIs (`chrome.commands`, `chrome.storage`, `chrome.tabs`). The repo does not unit-test the existing `onCommand` handler or any command path — there is no harness for the Chrome runtime in the test suite. The only non-trivial logic is "flip the flag, and zero the step on enable," which is a one-liner.

Decision: match the existing code and keep the handler inline rather than introduce a Chrome-runtime test harness for a single branch. Verify manually in the browser:

- Press the shortcut with invalid mode off → toast `Invalid mode ON …`; popup (reopened) shows the toggle on and badge visible.
- Press again → toast `Invalid mode OFF`; popup shows toggle off, badge hidden.
- Enable via shortcut, then Fill → first pass is "invalid format" (confirms the step reset).
- Confirm the existing `Ctrl+Shift+F` fill shortcut still works (no command collision).

## Open questions

None.
