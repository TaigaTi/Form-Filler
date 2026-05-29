# Keyboard shortcut to toggle invalid mode

Date: 2026-05-29
Spec: [docs/superpowers/specs/2026-05-29-invalid-mode-shortcut-design.md](../specs/2026-05-29-invalid-mode-shortcut-design.md)
Plan: [docs/superpowers/plans/2026-05-29-invalid-mode-shortcut.md](../superpowers/plans/2026-05-29-invalid-mode-shortcut.md)

## What changed

Invalid (test-validation) mode can now be toggled with a keyboard shortcut —
**Ctrl+Shift+X** (Mac **⌘+Shift+X**) — without opening the popup. The shortcut
flips `testValidationMode`, and an on-page toast confirms the new state
(`🧪 Invalid mode ON — next fill: invalid format` / `Invalid mode OFF`).

## Why it looks this way

- **Mirrors the existing `fill-form` command.** The extension already had one
  keyboard command declared in `manifest.json`'s `commands` block and handled in a
  single `chrome.commands.onCommand` listener. Rather than invent a message
  round-trip through the popup, the new `toggle-test-mode` command is a second
  branch in that same listener — the background already owns `chrome.storage`, so it
  flips the flag directly. The listener's old `if (command !== 'fill-form') return;`
  guard became a per-command dispatch, with `fill-form` behaviour left identical.
- **Enabling resets the cycle.** Turning the mode on also zeroes `invalidCycleStep`,
  so the next fill starts at pass 1 (invalid format) — a predictable starting point,
  chosen over resuming mid-cycle. Disabling leaves the step untouched.
- **Feedback is a toast, not popup state.** A shortcut is used while the popup is
  closed, so the popup can't reflect the change in the moment. The popup already
  re-reads state on open via `GET_SETTINGS`, so no popup code changed; the toast
  carries the in-the-moment confirmation.
- **Keybinding avoids Chrome-reserved combos.** Ctrl+Shift+X sits beside the existing
  Ctrl+Shift+F and dodges Chrome's reserved bindings (T = reopen tab, N = incognito,
  I/J/C = devtools, W = close window). Users can rebind at
  `chrome://extensions/shortcuts`.

## Testing

No automated tests — the handler is glue over `chrome.commands` / `chrome.storage` /
`chrome.tabs`, and the repo has no harness for the Chrome runtime (the existing
`fill-form` command path is likewise untested). This was an explicit, recorded
decision in the spec, not an omission.

Verified statically: full suite 149/149 green, `vite build` clean, `manifest.json`
parses and both commands (`fill-form`, `toggle-test-mode`) appear in `dist/`.

Still needs manual in-browser verification (deferred by the plan): both toasts fire,
the cycle resets on enable, and Ctrl+Shift+F still fills with no command collision.
