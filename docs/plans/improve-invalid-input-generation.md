# Improve the invalid-input generation cycle

## Goal

Test-validation ("invalid") fill mode exercises **both** ends of a numeric/date
range — not just one — and stops emitting junk that never reaches the field. After
this change a form with bounded number/date inputs gets a distinct below-minimum
pass *and* an above-maximum pass, JS-only numeric bounds stated in hint text can be
violated, JS-only minimum-length rules can be undercut, and number inputs stop
"participating" in passes whose garbage the browser silently drops.

## Background

Invalid mode breaks the form **one violation kind at a time, form-wide**. The
orchestrator (`runInvalidFill`, `src/background/index.ts`) computes the form's
active cycle via `activeViolationKinds(fields)` and walks it one kind per fill,
passing the targeted kind to `generateInvalidValue(field, kind)`.

Today's cycle (`VIOLATION_ORDER` in `src/shared/valueGenerator.ts`):

```
invalidChars → tooShort → tooLong → outOfRange → empty
```

Length is symmetric (`tooShort` undercuts `minLength`, `tooLong` exceeds
`maxLength`), but value range is a single one-sided `outOfRange`: for both numbers
and dates it prefers the lower bound and only touches the upper bound when there is
no lower one (`violate`, valueGenerator.ts:307–323). A field with `min=1 max=10`
never has its `max` tested.

## Approach

Mirror the length pair for value range: split `outOfRange` into two distinct kinds,
`belowMin` and `aboveMax`, each gated on the relevant bound so the form-wide union
drops a pass no field can express. Layer on hint-parsed numeric bounds and
hint-derived minimum length so JS-only constraints are reachable, and make number
fields skip passes whose invalid value would be non-numeric.

Alternatives considered:

- **Keep one `outOfRange` pass that alternates/covers both bounds.** Rejected — the
  user wants two distinct, separately-labelled passes, consistent with
  `tooShort`/`tooLong`.
- **Parse natural-language date bounds from hint text too.** Rejected for this round
  — prose dates ("after 1 Jan 2020") are a parsing rabbit hole and date inputs
  almost always carry real HTML `min`/`max`. Date-range hints stay out of scope;
  date bounds remain HTML-attribute-only.
- **Force a value to "land" in number inputs (#3).** Rejected — non-numeric values
  are silently dropped by `type=number`, so forcing one just blanks the field while
  pretending it participated. Skipping is honest.

## Scope

### 1. Split `outOfRange` into `belowMin` / `aboveMax`

- Replace `'outOfRange'` in the `ViolationKind` union with `'belowMin' | 'aboveMax'`.
- New `VIOLATION_ORDER`:
  `invalidChars → tooShort → tooLong → belowMin → aboveMax → empty`.
- `VIOLATION_LABELS`: `belowMin → 'below minimum value'`, `aboveMax →
  'above maximum value'` (keep `tooShort`/`tooLong` as "below minimum"/"above
  maximum" length labels, or disambiguate to "…length" — decide during impl to keep
  toasts unambiguous).
- `applicableViolations`:
  - `belowMin`: numeric/date/datetime-local **and** a lower bound exists (HTML `min`,
    or a hint-parsed numeric min for number fields).
  - `aboveMax`: numeric/date/datetime-local **and** an upper bound exists (HTML
    `max`, or a hint-parsed numeric max for number fields).
- `violate`:
  - `belowMin`: number → `String(effectiveMin − 1)`; date/datetime →
    `outOfRangeDate(min, 'before', …)`.
  - `aboveMax`: number → `String(effectiveMax + 1)`; date/datetime →
    `outOfRangeDate(max, 'after', …)`.
- `effectiveMin` / `effectiveMax` helpers for numbers combine HTML and hint bounds:
  below the **larger** stated min, above the **smaller** stated max, so the emitted
  value is guaranteed rejected when both sources are present.

### 2. Hint-parsed numeric bounds (#1)

- Add `parseNumericBounds(text): { min?: number; max?: number } | null` —
  the numeric analogue of `parseMinChars`. Recognize at least: "between X and Y",
  "X or older/more/greater", "at least X", "minimum X", "no more than Y",
  "maximum Y", "up to Y", "X or younger/less". Bound sanity-checked (finite, sane
  magnitude).
- Feed these into `effectiveMin`/`effectiveMax` and into `belowMin`/`aboveMax`
  applicability for `type=number` fields only.

### 3. Hint-derived minimum length in invalid mode (#2)

- `applicableViolations.tooShort` uses `effectiveMinChars(field) > 1` instead of
  `field.minLength > 1`, matching valid-fill (`effectiveMinChars` already folds in
  `parseMinChars(field.hint)`).
- `violate('tooShort')` builds a string one char short of `effectiveMinChars`, not
  of `field.minLength`.

### 4. Number fields skip non-landing passes (#3)

- In `generateInvalidValue`'s default branch, when the targeted kind is inapplicable
  **and** the field is `type=number` (and not pattern-constrained), return `null`
  (skip) rather than the generic `!!!INVALID!!!` — non-numeric garbage can't land in
  a number input.
- Also stop emitting `'abc'` as the `invalidChars` value for bare number fields: a
  number's expressible invalid states become `belowMin` / `aboveMax` / `empty`.
  `tel`/`email`/`url`/text keep their existing format garbage (it lands there).
- Net effect: an unconstrained optional number participates in no invalid pass and is
  honestly counted in `fieldsSkipped`; a required one still fails via `empty`.

### 5. Orchestrator + type comments

- Update the cycle-order comment in `runInvalidFill` (`src/background/index.ts:60`)
  and the `invalidCycleStep` doc comment (`src/shared/types.ts:42`) to the new order.
- No behavioural change needed in `runInvalidFill` itself — it already walks
  whatever `activeViolationKinds` returns.

## Files

- `src/shared/valueGenerator.ts` — `ViolationKind`, `VIOLATION_ORDER`,
  `VIOLATION_LABELS`, `applicableViolations`, `violate`, `generateInvalidValue`, new
  `parseNumericBounds` + `effectiveMin`/`effectiveMax` helpers.
- `src/shared/types.ts` — `invalidCycleStep` comment.
- `src/background/index.ts` — cycle-order comment.
- `tests/invalidValue.test.ts` — replace `outOfRange` cases with `belowMin`/
  `aboveMax`; add both-bounds coverage, hint-parsed numeric bound, hint-derived
  min-length undercut, number-skips-format-pass.
- `tests/valueGenerator.test.ts` — add `parseNumericBounds` unit tests; check for any
  `outOfRange` references to update.

## Verify

- `parseNumericBounds` unit tests pass for the recognized phrasings and reject junk.
- A `number` field with `min=1 max=10` yields `belowMin → '0'` and
  `aboveMax → '11'` on the respective passes; a field with only `min` adds nothing to
  the `aboveMax` pass.
- A date field with `min` and `max` produces an out-of-range value before `min` on
  `belowMin` and after `max` on `aboveMax`.
- A `type=number` field returns `null` on the `invalidChars` pass; an unconstrained
  optional number is skipped on every pass; a required one is emptied on `empty`.
- A field whose only minimum length is hint-stated ("at least 20 characters", no
  `minLength` attr) is undercut on `tooShort`.
- Full suite green; `vite build` clean.

## Open questions

- **Label wording.** With both length and value-range pairs, "below minimum" /
  "above maximum" become ambiguous in the toast. Decide during impl whether to suffix
  length labels with "length" (e.g. "below minimum length" vs "below minimum value").
- **`step` violations** (a number that isn't a multiple of `step`) remain out of
  scope — `step` isn't extracted today. Flag only.
