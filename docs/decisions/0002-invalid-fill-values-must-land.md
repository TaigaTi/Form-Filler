# 0002 — Invalid-fill values must land in their input

Date: 2026-06-02
Status: Accepted

## Principle

In test-validation ("invalid") fill mode, a deliberately-invalid value must be one
the target input will **accept and retain**, so it actually reaches the validators
and surfaces an error. If a violation kind cannot produce such a value for a field's
input type, the field is **skipped** for that pass (the generator returns `null`) —
it is never filled with a value the browser silently discards.

## Context

Invalid mode walks a form-wide cycle of violation kinds (`invalidChars`, `tooShort`,
`tooLong`, `belowMin`, `aboveMax`, `empty`), filling every applicable field with a
value that should fail validation. The original design leaned on a generic
`!!!INVALID!!!` string as a catch-all so every field "participated" in every pass.

That catch-all is a lie for `type=number` inputs: the browser rejects non-numeric
keystrokes outright, so `'abc'` / `!!!INVALID!!!` never lands — the field just goes
empty and only fails if it happens to be required. The same is true of length
violations (`minlength`/`maxlength` are ignored by `type=number`, and an alpha string
is non-numeric anyway). A field that looks like it's being exercised actually isn't.

## Decision

Make applicability honest about what lands:

- `type=number` is excluded from `invalidChars`, `tooShort`, and `tooLong`. Its only
  expressible invalid states are `belowMin`, `aboveMax`, and `empty`.
- When a field cannot express the targeted kind and generic garbage wouldn't land in
  its input (currently: number inputs), `generateInvalidValue` returns `null` to skip
  the field rather than emitting a value the input drops.
- Generic `!!!INVALID!!!` is retained only for input types where it visibly lands
  (text-like fields).

## Consequences

- `fieldsSkipped` honestly reflects that an unconstrained optional number has no
  expressible invalid state; it isn't padded with non-landing fills.
- Any **new** violation kind (or new input type) must answer "does this value land and
  stick in this input?" before claiming applicability. If not, skip — don't emit junk.
- This constrains the value-range work too: numeric bounds are violated with real
  numbers (`min − 1`, `max + 1`), and date bounds with real out-of-range dates, never
  with sentinel strings.
