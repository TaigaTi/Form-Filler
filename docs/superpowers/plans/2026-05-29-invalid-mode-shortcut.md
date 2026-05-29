# Plan — Keyboard shortcut to toggle invalid mode

Date: 2026-05-29
Spec: [docs/superpowers/specs/2026-05-29-invalid-mode-shortcut-design.md](../specs/2026-05-29-invalid-mode-shortcut-design.md)

## Goal

A keyboard shortcut (Ctrl+Shift+X / ⌘+Shift+X) flips invalid (test-validation) mode on and off without opening the popup, confirming the new state with an on-page toast. Enabling resets the cycle to pass 1.

## Approach

Mirror the existing `fill-form` command: one entry in `manifest.json`'s `commands` block and one branch in the existing `chrome.commands.onCommand` listener in the background service worker. No new message types, no popup changes. (Full rationale and alternatives in the spec.)

## Steps

1. **`manifest.json` — declare the command.** Add a second entry to the existing `commands` object:

   ```json
   "toggle-test-mode": {
     "suggested_key": { "default": "Ctrl+Shift+X", "mac": "Command+Shift+X" },
     "description": "Toggle invalid-data test mode on/off"
   }
   ```

2. **`src/background/index.ts` — handle the command.** The current listener early-returns on any command that isn't `fill-form`:

   ```ts
   chrome.commands.onCommand.addListener(async (command) => {
     if (command !== 'fill-form') return;
     ...
   });
   ```

   Replace the guard so it dispatches both commands. Add a `toggle-test-mode` branch that:
   - reads `testValidationMode` via `getSettings()` (or a direct `chrome.storage.sync.get`),
   - computes `enabled = !current`,
   - builds the storage patch: `{ testValidationMode: enabled }`, plus `invalidCycleStep: 0` only when `enabled` is true,
   - `await chrome.storage.sync.set(patch)`,
   - resolves the active tab; if one exists, `sendToast(tab.id, 'success', …)` with the enable/disable copy from the spec; if not, skip the toast.

   Keep the `fill-form` branch behaviour identical.

3. **Manual verification** (see Verify).

## Files

- `manifest.json` — add `toggle-test-mode` command.
- `src/background/index.ts` — branch the `onCommand` listener.

## Verify

No automated tests — the handler is glue over `chrome.commands`/`chrome.storage`/`chrome.tabs`, consistent with the untested `fill-form` path (decision recorded in the spec). After `pnpm test` (unchanged, still green) and a clean `vite build`, load the unpacked `dist/` and confirm:

- Shortcut with mode off → toast `🧪 Invalid mode ON — next fill: invalid format`; reopened popup shows toggle on + badge visible.
- Shortcut again → toast `Invalid mode OFF`; popup shows toggle off + badge hidden.
- Enable via shortcut, then Fill → first pass is "invalid format" (step reset confirmed).
- `Ctrl+Shift+F` still fills (no command collision).

## Open questions

None — the design is fully specified.
