# Improve the invalid-input generation cycle

Date: 2026-06-02
Issue: [#2](https://github.com/TaigaTi/Form-Filler/issues/2)

## What changed

Test-validation ("invalid") fill mode now exercises **both ends** of a numeric/date
range and stops emitting values that never reach the field. The form-wide cycle grew
from one one-sided range pass to two:

```
invalid format → below minimum length → above maximum length
→ below minimum value → above maximum value → empty
```

Four improvements, all in `src/shared/valueGenerator.ts`:

1. **`outOfRange` split into `belowMin` / `aboveMax`.** Value range now mirrors the
   length pair (`tooShort`/`tooLong`). Each pass is gated on its own bound, so a field
   with only a `min` adds nothing to the `aboveMax` pass and the form-wide union drops
   a pass no field can express.
2. **`parseNumericBounds`** — a numeric analogue of `parseMinChars` that reads value
   ranges out of hint text ("18 or older", "between 1 and 100", "no more than 50"), so
   JS-only bounds with no HTML `min`/`max` can be violated.
3. **Hint-derived minimum length is reachable.** `tooShort` now keys off
   `effectiveMinChars` (HTML `minlength` *or* a hint-stated minimum), matching
   valid-fill — a "write at least 20 characters" rule enforced only in JS can now be
   undercut.
4. **Number inputs skip non-landing passes.** `type=number` no longer claims
   `invalidChars`/`tooShort`/`tooLong`, and `generateInvalidValue` returns `null`
   (skip) on any pass it can't express instead of emitting junk the browser drops.

## Why it looks this way

The plan called the missing min/max coverage the headline gap: length had a symmetric
below/above pair, but value range collapsed into a single `outOfRange` that preferred
the lower bound and only touched the upper bound when there was no lower one — so a
field with both `min` and `max` never had its `max` tested. Splitting it was the point
of the session.

Key decisions made while building:

- **Labels disambiguate length vs value.** With two min/max pairs, "below minimum"
  alone is ambiguous in the toast, so the labels read "below minimum length" /
  "below minimum value" etc. (This resolved the plan's one open question.)
- **Effective numeric bound combines HTML + hint.** `numericBound` takes the *larger*
  of the two stated minimums and the *smaller* of the two maximums, so a value one
  step outside it is guaranteed to violate whichever source the form actually enforces.
- **Date-range hints stay out of scope.** Prose dates are a parsing rabbit hole and
  date inputs almost always carry real `min`/`max`; `parseNumericBounds` is numeric
  only, and date bounds remain HTML-attribute-driven.
- **Numbers skip rather than fake participation.** Non-numeric junk is silently
  dropped by `type=number`, so emitting it was a lie — the field looked exercised but
  wasn't. This is now recorded as a principle in
  [docs/decisions/0002-invalid-fill-values-must-land.md](../decisions/0002-invalid-fill-values-must-land.md).

## From the review pass

A post-implementation review caught two real holes, both fixed before commit:

- `parseNumericBounds`' `min.`/`max.` keywords lacked a word boundary and matched
  mid-word (the "min" in "admin."). Added leading `\b` to every keyword group.
- A `type=number` carrying a `minlength`/`maxlength` attribute still expressed
  `tooShort`/`tooLong` and emitted alpha junk — the same non-landing problem the
  number-skip was meant to solve. Gated both length kinds on `TEXT_LIKE_TYPES`.

The review also flagged that `numericBound`'s attr+hint combining was correct but
untested; tests now lock it in.

## Open follow-up

- **`step` violations** (a number that isn't a multiple of `step`) remain out of
  scope — `step` isn't extracted today.
- The new value-range passes haven't been exercised on a live form. As with the prior
  invalid-fill work, there's no browser harness in this repo, so whether `0`/`11` and
  out-of-range dates land and trigger errors on real GovBB inputs is unverified.

## Verification

- Full suite **193/193 green** (was 169; +24 tests across `invalidValue.test.ts` and
  `valueGenerator.test.ts` covering the split passes, hint-parsed bounds, the
  combining logic, the number-skip, and the two review fixes).
- `vite build` clean.
- Not exercised in the live extension (toast + Chrome storage cycling).
