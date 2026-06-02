# Manual Re-run on Validation Errors — Design

**Date:** 2026-06-02

## Problem

After a fill, the content script fires `blur` on each field and installs a
`MutationObserver` (`watchForValidationErrors`). When a validation error appears
in the DOM, it sends `VALIDATION_ERRORS_APPEARED` to the background, which
automatically recomputes corrected values and re-applies them. This automatic
re-run is jarring — values change on screen without the user asking.

## Goal

When validation errors appear, stop the automatic correction. Instead show a
brief hint toast and let the user re-run the filler themselves. A manual re-run
already works as a correction path: `extractFields` captures on-screen error
text as a field `hint`, and `generateValue` consumes those hints (min-length,
numeric bounds, "e.g." examples), so re-running regenerates better values.

## Changes

### 1. Content script (`src/content/index.ts`)

- Repurpose `watchForValidationErrors()`: when an error node is detected, call
  `showToast('error', 'Some fields need fixing — run the filler again')`
  directly. Remove the re-extraction (`extractFields(document)`) and the
  `chrome.runtime.sendMessage({ type: 'VALIDATION_ERRORS_APPEARED', ... })`
  round-trip to the background.
- Install the watcher only when a new `showErrorHint` flag on `APPLY_VALUES` is
  true, so it runs for normal fills but not invalid mode.
- Keep `fireValidation` (blur firing) unchanged so errors still surface.

### 2. Background (`src/background/index.ts`)

- Delete the entire `VALIDATION_ERRORS_APPEARED` listener (the
  sanitize / regenerate / re-apply block).
- Delete the `pendingCorrections` map and its `.set` / `.delete` calls.
- Normal `runFill` → `APPLY_VALUES { fireValidation: true, showErrorHint: true }`.
- `runInvalidFill` → `APPLY_VALUES { fireValidation: true }` (no hint — errors
  are expected in invalid mode, so "run again to fix" would mislead).
- Drop now-unused imports: `sanitizeToAllowedChars`, `MessageFromContent`.

### 3. Types (`src/shared/types.ts`)

- Add `showErrorHint?: boolean` to the `APPLY_VALUES` variant of
  `MessageToContent`.
- Remove the now-unused `MessageFromContent` / `VALIDATION_ERRORS_APPEARED`
  type machinery.

## Behavior after the change

- A clean fill shows `✓ N fields filled` (auto-hides after 2s).
- If the generated data trips a validator, the success toast is replaced by
  the error-style toast `Some fields need fixing — run the filler again`
  (persists until dismissed). Nothing else happens until the user re-triggers
  the fill.
- Invalid mode is unchanged: it surfaces errors deliberately and shows its own
  `… (invalid mode)` success toast, with no "run again" hint.

## Tradeoff (accepted)

The deleted auto-correction included a dedicated charset-repair step
(`sanitizeToAllowedChars`, e.g. "only letters, hyphens, or apostrophes"). On a
manual re-run, `generateValue` regenerates from scratch, which usually produces
charset-valid values anyway — but the explicit repair is gone. Accepted as
within scope of the goal.

## Testing

- No existing tests cover the `VALIDATION_ERRORS_APPEARED` / auto-correction
  flow, so nothing breaks there.
- `toast.test.ts` and other suites are unaffected by the message-shape change.
