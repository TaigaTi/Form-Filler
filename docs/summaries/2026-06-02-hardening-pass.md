# Hardening pass: selector escaping, label cap, storage area, polish

Date: 2026-06-02
Plan: [docs/plans/hardening-pass.md](../plans/hardening-pass.md)
Issue: [#1](https://github.com/TaigaTi/Form-Filler/issues/1)

## What changed

A batch of low-risk correctness and polish fixes surfaced by a full code review,
plus a real README. No feature work.

1. **`CSS.escape` on page-controlled selector values** (`fieldExtractor.ts` ×4,
   `content/index.ts` ×1). `id`/`name`/`for` values were interpolated raw into
   `querySelector`, so a field whose `name` contained a `"` or `\` threw a
   `SyntaxError` and aborted the whole extract/fill. Now escaped.
2. **Capped `resolveLabel`'s preceding-sibling walk at 3 hops** — it previously
   walked *all* preceding siblings and could adopt unrelated far-away text as a
   field's label. Mirrors the existing `prevChecked < 3` cap in `resolveHint`.
3. **Moved all settings `storage.sync` → `storage.local`** (`background/index.ts`,
   6 call sites). See [decision 0002](../decisions/0002-extension-state-uses-storage-local.md).
4. **Reworded stale "AI fallback" comments** (`valueGenerator.ts` ×3, plus the
   loading-toast comment in `background/index.ts`) left over from
   [decision 0001](../decisions/0001-local-only-fake-data-generation.md)'s removal
   of the AI path. They described a code path that no longer exists.
5. **Filtered `disabled` `<option>`s** when building select options, so a disabled
   option can never be selected.
6. **Platform-aware shortcut display** in the popup — renders `Cmd` instead of
   `Ctrl` on macOS, matching the manifest's `mac` suggested keys.
7. **README** — overwrote the UTF-16 stub with a UTF-8 file covering features,
   build/load-unpacked, usage, testing, layout, and privacy.

## Why it looks this way

These are independent edits, deliberately kept minimal — each is a targeted fix,
not a refactor. Items 1, 2, and 5 are in the framework-agnostic `shared/` layer
and got TDD regression tests (failing-first, then fixed). Items 3, 4, 6, 7 are
mechanical or manual-verify (no automated chrome-storage/popup test in this tier,
per the plan).

### The `CSS.escape` / jsdom detour

`CSS.escape` is the correct production fix (it exists natively in Chrome content
scripts), but **jsdom 24 does not implement the `CSS` interface at all** —
`window.CSS` is `undefined` under test. Applying the fix broke 12 tests across
multiple files that exercise `extractFields`.

Rather than hand-roll an escape in production code (worse than the standard API)
or pin a newer jsdom, the fix is a guarded WHATWG-spec `CSS.escape` shim in a
shared **`tests/setup.ts`**, registered via `setupFiles` in `vitest.config.ts`.
The shim only installs when `CSS.escape` is missing, so it fills the jsdom gap
without masking the real browser API. (First attempt put the shim in a single
test file; relocated to setup once it was clear multiple suites hit the path.)

## Verification

- Full suite **172/172 green** (3 new tests: quote-in-`name`/`id` no longer
  throws; sibling-walk cap; disabled-option filter).
- `vite build` clean, emits to `dist/`.
- Items 3 (storage) and 6 (Mac shortcut) are manual-verify; not exercised by an
  automated test this tier.

## Scope notes

Deferred (out of this tier, noted on issue #1): MV3 service-worker eviction of
`pendingCorrections`, dropping the always-on `<all_urls>` content script /
`tabs` permission, and orchestration tests for `runFill`/the correction handler.
