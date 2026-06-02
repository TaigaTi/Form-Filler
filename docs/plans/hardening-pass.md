# Hardening pass: selector escaping, label cap, storage area, polish

Tracking issue: [#1](https://github.com/TaigaTi/Form-Filler/issues/1)

## Goal

Close a set of low-risk correctness and polish gaps surfaced by a full code
review. No new features. The form filler should survive forms with awkward
attribute values, stop mislabelling fields from stray sibling text, stay within
storage write limits, and shed misleading leftovers. Exactly one user-visible
behavior change: the test-mode toggle stops syncing across machines.

## Approach

Six independent edits, each small and self-contained. They touch four files and
their tests. None changes the fill algorithm or messaging contract; item 3 is
the only behavior change and it's a storage-area swap.

Grouped by area:

- **Robustness** (1, 2) — stop page-controlled DOM from throwing or poisoning labels.
- **Storage** (3) — move ephemeral + preference state off `storage.sync`.
- **Polish** (4, 5, 6) — stale comments, disabled options, Mac shortcut.

**Alternatives considered:**

- *Storage: keep `testValidationMode` in `sync`, move only the ephemeral keys to
  `local`.* Rejected: it splits `getSettings()` across two storage areas for a
  niche testing toggle. Single-machine tool — one read path is simpler and the
  lost cross-device sync of a debug toggle is immaterial.
- *Selector escaping: filter elements in JS instead of querying by interpolated
  attribute.* Rejected: `CSS.escape` is the minimal, standard fix and keeps the
  existing query shape; no MV3/jsdom support concerns.

## Scope

1. **Escape page-controlled attribute values in selectors.** Wrap interpolated
   `id`/`name`/`for` values with `CSS.escape(...)`:
   - `fieldExtractor.ts:114` — `label[for="${CSS.escape(id)}"]`
   - `fieldExtractor.ts:177` — `label[for="${CSS.escape(id)}"]` (in `resolveOptionLabel`)
   - `fieldExtractor.ts:386` — `input[type="radio"][name="${CSS.escape(elementName)}"]`
   - `content/index.ts:48` — `input[type="radio"][name="${CSS.escape(el.name)}"]`
   - Also audit `findDatePartLabel` (`fieldExtractor.ts:209`) `label[for="${el.id}"]`
     for the same fix.

2. **Cap the label sibling-walk.** In `resolveLabel` priority 5
   (`fieldExtractor.ts:129-134`), bound the preceding-sibling loop to ~3 hops
   (mirror `resolveHint`'s `prevChecked < 3` pattern) so an unrelated preceding
   block can't become the label.

3. **Move all settings to `chrome.storage.local`.** Swap `chrome.storage.sync`
   for `chrome.storage.local` everywhere it appears in `background/index.ts`
   (`getSettings` read at :27, and the `.set` calls at :91, :98, :172, :197-199,
   :233). Keys unchanged. This stops every fill from writing to rate-limited
   sync storage and removes the cross-device sync of the test-mode toggle.

4. **Remove stale "AI fallback" comments** in `valueGenerator.ts`
   (`:26`, `:465`, `:467`) — the AI path was removed by decision 0001's follow-up
   (`drop-ai-faker-routing`). Reword to describe the actual behavior: `null`
   means "leave blank / defer to generic fallback."

5. **Filter `disabled` options** when building select options
   (`fieldExtractor.ts:375`): exclude `<option disabled>` in addition to the
   existing empty-value filter, so a disabled option is never selected.

6. **Fix Mac shortcut display** in `popup/index.html` (`:133-139`). Render
   `Cmd` instead of `Ctrl` on macOS — detect via `navigator.platform`/
   `userAgentData` in `popup/index.ts` and set the key cap text, rather than
   hardcoding `Ctrl`. (The settings-view test-mode shortcut at `:151-157` gets
   the same treatment.)

## Files

- **Modify:** `src/shared/fieldExtractor.ts` — items 1, 2, 5.
- **Modify:** `src/content/index.ts` — item 1.
- **Modify:** `src/background/index.ts` — item 3.
- **Modify:** `src/shared/valueGenerator.ts` — item 4 (comments only).
- **Modify:** `src/popup/index.html` + `src/popup/index.ts` — item 6.
- **Modify:** `tests/fieldExtractor.test.ts` — regression tests for items 1, 2, 5.

## Verify

- **Item 1:** a radio/text field whose `name` or `id` contains `"`, `]`, or a
  space is extracted and filled without throwing; existing radio/label tests
  still pass.
- **Item 2:** a field preceded by a long unrelated `<p>` (4+ siblings back) does
  **not** adopt that text as its label; nearby legitimate labels still resolve.
- **Item 3:** manual — toggle test mode, fill several times rapidly, confirm no
  sync-throttling warnings; values persist via `storage.local`. (Covered by
  manual load-unpacked check; no automated chrome-storage test in this tier.)
- **Item 5:** a `<select>` with a `disabled` option never yields that option
  from `generateValue`.
- **Item 6:** manual — popup shows `Cmd+Shift+F` on macOS, `Ctrl+Shift+F` on
  Windows/Linux.
- `npm test` green; `npm run build` succeeds.

## Open questions

- None blocking. Item 3's manual verification is acceptable for this tier; if we
  later add a mocked-`chrome` test harness (deferred orchestration-test item),
  fold a storage-area assertion in then.
