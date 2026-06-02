import { FieldMeta } from './types';
import { matchRule, normalizeLabel } from './rules';
import { faker } from '@faker-js/faker';

/**
 * Extracts a "for example, X" or "e.g. X" example from hint/error text and
 * generates a similar value by randomising only the digit positions.
 * "Enter a valid postcode (for example, BB17004)" → "BB53291"
 * "for example, 2345678, 1-246-234-5678" → "7813942" (first example used)
 */
export function generateFromHintExample(hint: string): string | null {
  const match = hint.match(/(?:for example[,:\s]+|e\.?g\.?[,:\s]+)([^\s,;(]+)/i);
  if (!match) return null;

  const example = match[1].replace(/[.)]+$/, ''); // strip trailing punctuation
  if (!example || example.length > 30) return null;

  // Randomise digit positions only; preserve letters, dashes, spaces, etc.
  const varied = example.replace(/[0-9]/g, () => faker.string.numeric(1));
  return varied || null;
}

/**
 * Attempts to generate a string that satisfies a HTML `pattern` attribute by
 * structurally substituting known character-class tokens with real characters.
 * Returns null when the pattern is too complex to handle locally (→ AI fallback).
 */
export function generateForPattern(pattern: string): string | null {
  try {
    const re = new RegExp(`^(?:${pattern})$`);

    const value = pattern
      // Quantified classes — process before single-char classes
      .replace(/\\d\{(\d+),(\d+)\}/g, (_, _min, max) => faker.string.numeric(parseInt(max)))
      .replace(/\\d\{(\d+)\}/g, (_, n) => faker.string.numeric(parseInt(n)))
      .replace(/\[0-9\]\{(\d+),(\d+)\}/g, (_, _min, max) => faker.string.numeric(parseInt(max)))
      .replace(/\[0-9\]\{(\d+)\}/g, (_, n) => faker.string.numeric(parseInt(n)))
      .replace(/\[A-Z\]\{(\d+),(\d+)\}/g, (_, _min, max) =>
        faker.string.alpha({ length: parseInt(max), casing: 'upper' }))
      .replace(/\[A-Z\]\{(\d+)\}/g, (_, n) =>
        faker.string.alpha({ length: parseInt(n), casing: 'upper' }))
      .replace(/\[a-z\]\{(\d+),(\d+)\}/g, (_, _min, max) =>
        faker.string.alpha({ length: parseInt(max), casing: 'lower' }))
      .replace(/\[a-z\]\{(\d+)\}/g, (_, n) =>
        faker.string.alpha({ length: parseInt(n), casing: 'lower' }))
      .replace(/\[A-Za-z0-9\]\{(\d+),(\d+)\}/g, (_, _min, max) =>
        faker.string.alphanumeric(parseInt(max)).toUpperCase())
      .replace(/\[A-Za-z0-9\]\{(\d+)\}/g, (_, n) =>
        faker.string.alphanumeric(parseInt(n)).toUpperCase())
      .replace(/\[A-Z0-9\]\{(\d+),(\d+)\}/g, (_, _min, max) =>
        faker.string.alphanumeric(parseInt(max)).toUpperCase())
      .replace(/\[A-Z0-9\]\{(\d+)\}/g, (_, n) =>
        faker.string.alphanumeric(parseInt(n)).toUpperCase())
      // + and * quantifiers — use a short fixed length
      .replace(/\\d\+/g, () => faker.string.numeric(5))
      .replace(/\[0-9\]\+/g, () => faker.string.numeric(5))
      .replace(/\\d\*/g, () => faker.string.numeric(3))
      .replace(/\[0-9\]\*/g, () => faker.string.numeric(3))
      .replace(/\[A-Z\]\+/g, () => faker.string.alpha({ length: 3, casing: 'upper' }))
      // Single character classes (no quantifier)
      .replace(/\\d/g, () => faker.string.numeric(1))
      .replace(/\[0-9\]/g, () => faker.string.numeric(1))
      .replace(/\[A-Z\]/g, () => faker.string.alpha({ length: 1, casing: 'upper' }))
      .replace(/\[a-z\]/g, () => faker.string.alpha({ length: 1, casing: 'lower' }))
      .replace(/\[A-Za-z\]/g, () => faker.string.alpha({ length: 1, casing: 'mixed' }))
      .replace(/\[A-Za-z0-9\]/g, () => faker.string.alphanumeric(1))
      .replace(/\[A-Z0-9\]/g, () => faker.string.alphanumeric(1).toUpperCase())
      // Optional quantifier after a resolved token — just drop the ?
      .replace(/\?/g, '')
      // Escaped literal characters
      .replace(/\\\+/g, '+')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\./g, '.')
      .replace(/\\-/g, '-')
      .replace(/\\ /g, ' ')
      .replace(/\\s/g, ' ');

    // If unresolved regex syntax remains, the pattern is too complex for local generation
    if (/[[\]{}()|\\^$*+?]/.test(value)) return null;

    return re.test(value) ? value : null;
  } catch {
    return null;
  }
}

function applyMaxLength(value: string, maxLength?: number): string {
  return maxLength && value.length > maxLength ? value.slice(0, maxLength) : value;
}

const TEXT_LIKE_TYPES = ['text', 'textarea', 'email', 'tel', 'url', 'password', 'search'];

/**
 * Parses a minimum-character requirement out of hint/error text, e.g.
 * "Please write at least 20 characters" → 20, "minimum of 8 characters" → 8.
 * Many forms enforce this in JS only (no `minlength` attribute), so the number
 * is often only discoverable from the hint or validation message.
 */
export function parseMinChars(text: string | undefined): number | null {
  if (!text) return null;
  const m =
    text.match(/(?:at least|minimum(?:\s+of)?|min\.?|no fewer than)\s+(\d{1,4})\s*(?:characters|chars|letters)/i) ??
    text.match(/(\d{1,4})\s*(?:characters|chars|letters)\s*(?:or more|minimum|at least)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 && n <= 5000 ? n : null;
}

/** Effective minimum length: the larger of the HTML minlength and any hint-stated minimum. */
function effectiveMinChars(field: FieldMeta): number {
  return Math.max(field.minLength ?? 0, parseMinChars(field.hint) ?? 0);
}

/**
 * Parses a numeric value range out of hint/error text — the numeric analogue of
 * `parseMinChars`. Many forms enforce a range ("you must be 18 or older",
 * "between 1 and 100") in JS only, with no HTML `min`/`max`, so the bound is only
 * discoverable from the text. Returns `{ min?, max? }`, or null when no recognizable
 * numeric bound is stated. A number immediately followed by characters/chars/letters
 * is treated as a length statement (parseMinChars' job) and ignored here.
 */
export function parseNumericBounds(
  text: string | undefined
): { min?: number; max?: number } | null {
  if (!text) return null;
  // A complete number: the trailing `(?![\d.])` stops `\d+` from backtracking to a
  // partial match (so "20 characters" can't sneak through as "2"). `notLen` then
  // rejects the whole match when a length word follows.
  const NUM = '(-?\\d+(?:\\.\\d+)?)(?![\\d.])';
  const notLen = '(?!\\s*(?:characters|chars|letters))';
  const bounds: { min?: number; max?: number } = {};

  // "between X and Y" — sets both ends at once. Leading `\b` on every keyword group
  // keeps "min."/"max" from matching mid-word (e.g. the "min" inside "admin.").
  const range = text.match(
    new RegExp(`\\bbetween\\s+${NUM}${notLen}\\s+and\\s+${NUM}${notLen}`, 'i')
  );
  if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]) };

  const min =
    text.match(
      new RegExp(`\\b(?:at least|minimum(?:\\s+of)?|min\\.?|no fewer than|no less than)\\s+${NUM}${notLen}`, 'i')
    ) ?? text.match(new RegExp(`${NUM}\\s+or\\s+(?:older|more|greater|above|over)\\b`, 'i'));
  if (min) bounds.min = parseFloat(min[1]);

  const max =
    text.match(
      new RegExp(`\\b(?:no more than|at most|maximum(?:\\s+of)?|max\\.?|up to|not (?:to )?exceed(?:ing)?)\\s+${NUM}${notLen}`, 'i')
    ) ?? text.match(new RegExp(`${NUM}\\s+or\\s+(?:younger|less|fewer|below|under)\\b`, 'i'));
  if (max) bounds.max = parseFloat(max[1]);

  return bounds.min !== undefined || bounds.max !== undefined ? bounds : null;
}

/**
 * Effective numeric bound for a `type=number` field, combining the HTML `min`/`max`
 * attribute with any hint-stated bound (`parseNumericBounds`). For `min` the binding
 * constraint is the *larger* of the two sources; for `max`, the *smaller* — so a value
 * one step outside it is guaranteed to violate whichever source the form enforces.
 * Returns undefined when neither source states that end. Number-only: date `min`/`max`
 * are ISO strings, not parseable here, and date hints aren't parsed.
 */
function numericBound(field: FieldMeta, end: 'min' | 'max'): number | undefined {
  const attr = field[end] !== undefined ? parseFloat(field[end] as string) : undefined;
  const hint = parseNumericBounds(field.hint)?.[end];
  const vals = [attr, hint].filter((v): v is number => v !== undefined && !isNaN(v));
  if (vals.length === 0) return undefined;
  return end === 'min' ? Math.max(...vals) : Math.min(...vals);
}

const SHORT_WORDS = { min: 2, max: 5 };
const LONG_WORDS = { min: 12, max: 24 };

/**
 * Space-joined filler words of at least `minChars`, capped at `maxLength`. Built
 * from `faker.lorem.words` (lowercase, no terminal/internal periods) so the value
 * can never carry a full stop that trips "letters only"-style charset validators
 * or reads as obvious lorem boilerplate.
 */
function fillerAtLeast(
  minChars: number,
  spread: { min: number; max: number },
  maxLength?: number
): string {
  let value = faker.lorem.words(spread);
  let guard = 0;
  while (value.length < minChars && guard < 50) {
    value += ' ' + faker.lorem.words(spread);
    guard++;
  }
  return applyMaxLength(value, maxLength);
}

// Label/hint keywords that signal a long, free-prose answer is expected.
const LONG_FORM_RE =
  /\b(describe|description|explain|reason|details?|comment|why|tell us|summary|background|elaborate)\b/;

function isLongFormText(field: FieldMeta): boolean {
  if (field.type === 'textarea') return true;
  return LONG_FORM_RE.test(normalizeLabel(`${field.label} ${field.hint ?? ''}`));
}

/**
 * Last-resort value for a free-text field whose label matched no rule — so the
 * field isn't left blank. Returns null for structured types (select/radio/checkbox)
 * and pattern-constrained fields, where arbitrary text would be invalid; those are
 * better left blank than filled wrongly. Free text is built from words only (never
 * full stops); long-form prompts get a longer phrase.
 */
export function generateGenericText(field: FieldMeta): string | null {
  if (!TEXT_LIKE_TYPES.includes(field.type)) return null;
  if (field.pattern) return null;

  switch (field.type) {
    case 'email': return applyMaxLength(faker.internet.email(), field.maxLength);
    case 'url': return applyMaxLength(faker.internet.url(), field.maxLength);
    case 'password': return applyMaxLength('TestPassword123!', field.maxLength);
  }

  const longForm = isLongFormText(field);
  const spread = longForm ? LONG_WORDS : SHORT_WORDS;
  const minChars = Math.max(effectiveMinChars(field), longForm ? 40 : 0);
  return fillerAtLeast(minChars, spread, field.maxLength);
}

// --- Charset-restriction errors --------------------------------------------
//
// Some validators reject a value by its characters, e.g. "Name must contain only
// letters, hyphens, or apostrophes". No HTML attribute carries this — it's only in
// the rendered error text. We parse the allowed set out of that text so the
// error-feedback loop can repair the value already in the field.

// Each keyword (and its plurals/synonyms) maps to the characters it permits.
const CHARSET_KEYWORDS: { re: RegExp; chars: string }[] = [
  { re: /\b(letters?|alphabetic|alphabet)\b/, chars: 'A-Za-z' },
  { re: /\b(numbers?|digits?|numeric)\b/, chars: '0-9' },
  { re: /\b(spaces?|whitespace)\b/, chars: ' ' },
  { re: /\b(hyphens?|dashes|dash)\b/, chars: '\\-' },
  { re: /\b(apostrophes?|single quotes?)\b/, chars: "'" },
  { re: /\b(periods?|full stops?|dots?)\b/, chars: '.' },
  { re: /\b(commas?)\b/, chars: ',' },
  { re: /\b(underscores?)\b/, chars: '_' },
];

/**
 * Parses an allowed-character restriction out of a validation message such as
 * "Name must contain only letters, hyphens, or apostrophes" and returns a regex
 * character-class body (e.g. `A-Za-z\-'`) listing the permitted characters.
 * Requires the word "only" to anchor the restriction intent, plus at least one
 * recognized character-class keyword. Returns null otherwise.
 */
export function parseAllowedCharset(text: string | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (!/\bonly\b/.test(lower)) return null;

  const chars = CHARSET_KEYWORDS.filter((k) => k.re.test(lower)).map((k) => k.chars);
  return chars.length > 0 ? chars.join('') : null;
}

/**
 * Strips characters disallowed by a charset-restriction error out of `value`.
 * Returns the sanitized string, or null when `text` states no recognizable
 * charset restriction (so the caller can fall back to other strategies).
 */
export function sanitizeToAllowedChars(value: string, text: string | undefined): string | null {
  const allowed = parseAllowedCharset(text);
  if (allowed === null) return null;
  return value.replace(new RegExp(`[^${allowed}]`, 'g'), '');
}

// --- Test validation mode: deliberately-invalid values ---------------------
//
// Each invalid-mode fill targets ONE violation *kind* across the whole form, so
// a single pass breaks every applicable field the same way. The orchestrator
// walks the global order below (skipping kinds no field can express) and passes
// the targeted kind to `generateInvalidValue` per field. A field that can't express
// the targeted kind falls back to generic garbage — except number inputs, which skip
// the pass (their inputs silently drop non-numeric junk).

export type ViolationKind =
  | 'tooShort' | 'invalidChars' | 'tooLong' | 'belowMin' | 'aboveMax' | 'empty';

// Format first, then length (short→long), then value range (below→above), then empty.
const VIOLATION_ORDER: ViolationKind[] = [
  'invalidChars', 'tooShort', 'tooLong', 'belowMin', 'aboveMax', 'empty',
];

// Types whose only invalid state is type-specific (uncheck / skip / deselect) and
// so don't participate in the format/length/range cycle.
const STRUCTURED_TYPES = ['checkbox', 'radio', 'select'];

const VIOLATION_LABELS: Record<ViolationKind, string> = {
  invalidChars: 'invalid format',
  tooShort: 'below minimum length',
  tooLong: 'above maximum length',
  belowMin: 'below minimum value',
  aboveMax: 'above maximum value',
  empty: 'empty',
};

/** Human-readable name for a violation kind, used to label invalid-fill passes. */
export function violationLabel(kind: ViolationKind): string {
  return VIOLATION_LABELS[kind];
}

/** The violation kinds that can actually be applied to this field, in cycle order. */
export function applicableViolations(field: FieldMeta): ViolationKind[] {
  const has: Record<ViolationKind, boolean> = {
    // A minimum length to undercut — HTML minlength or a hint-stated minimum
    // ("write at least 20 characters"), matching valid-fill's effectiveMinChars.
    // Length only lands on text-like inputs; minlength/maxlength are ignored by
    // type=number (and the alpha undercut would be dropped anyway).
    tooShort: TEXT_LIKE_TYPES.includes(field.type) && effectiveMinChars(field) > 1,
    // Junk content: any text-like field (so plain text gets visible garbage rather
    // than being left blank) plus pattern-constrained fields. Number inputs are
    // excluded — non-numeric junk is silently dropped by type=number, so it never
    // lands; a bare number's only real invalid states are belowMin/aboveMax/empty.
    invalidChars:
      TEXT_LIKE_TYPES.includes(field.type) || !!field.pattern,
    // A maximum length to exceed (text-like only, same reasoning as tooShort)
    tooLong: TEXT_LIKE_TYPES.includes(field.type) && !!field.maxLength,
    // A lower value bound to undercut (number: HTML min or hint-stated min; date: HTML min)
    belowMin:
      (field.type === 'number' && numericBound(field, 'min') !== undefined) ||
      ((field.type === 'date' || field.type === 'datetime-local') && field.min !== undefined),
    // An upper value bound to exceed (number: HTML max or hint-stated max; date: HTML max)
    aboveMax:
      (field.type === 'number' && numericBound(field, 'max') !== undefined) ||
      ((field.type === 'date' || field.type === 'datetime-local') && field.max !== undefined),
    // Emptying only fails validation on a required field — so don't blank others.
    empty: !!field.required,
  };
  const kinds = VIOLATION_ORDER.filter((k) => has[k]);
  // Fallback: a field with no other way to be invalid (e.g. an optional date with
  // no bounds) can at least be emptied.
  return kinds.length > 0 ? kinds : ['empty'];
}

/**
 * The form-wide invalid-fill cycle: the violation kinds (in global order) that at
 * least one field can express. Structured types (checkbox/radio/select) and
 * date-triplet parts are excluded — their single invalid state isn't one of the
 * cycle kinds, so they don't add or gate a pass. The orchestrator walks this list
 * one kind per fill, so empty passes are never wasted.
 */
export function activeViolationKinds(fields: FieldMeta[]): ViolationKind[] {
  const expressible = new Set<ViolationKind>();
  for (const field of fields) {
    if (STRUCTURED_TYPES.includes(field.type) || field.datePart) continue;
    for (const kind of applicableViolations(field)) expressible.add(kind);
  }
  return VIOLATION_ORDER.filter((k) => expressible.has(k));
}

function outOfRangeDate(bound: string, dir: 'before' | 'after', isDatetime: boolean): string {
  const d = new Date(bound);
  if (isNaN(d.getTime())) return '';
  d.setUTCFullYear(d.getUTCFullYear() + (dir === 'before' ? -1 : 1));
  return isDatetime ? d.toISOString().slice(0, 16) : d.toISOString().split('T')[0];
}

function violate(field: FieldMeta, kind: ViolationKind): string | boolean | null {
  switch (kind) {
    case 'empty':
      return '';

    case 'tooShort':
      // One char short of the effective minimum (effectiveMinChars > 1 is guaranteed
      // by applicability, so the length is always >= 1).
      return faker.string.alpha({ length: effectiveMinChars(field) - 1 });

    case 'tooLong':
      return faker.string.alpha({ length: (field.maxLength ?? 10) + 5 });

    case 'belowMin': {
      if (field.type === 'number') {
        const min = numericBound(field, 'min');
        return min !== undefined ? String(min - 1) : '-999999';
      }
      const isDatetime = field.type === 'datetime-local';
      return field.min !== undefined ? outOfRangeDate(field.min, 'before', isDatetime) : '';
    }

    case 'aboveMax': {
      if (field.type === 'number') {
        const max = numericBound(field, 'max');
        return max !== undefined ? String(max + 1) : '999999';
      }
      const isDatetime = field.type === 'datetime-local';
      return field.max !== undefined ? outOfRangeDate(field.max, 'after', isDatetime) : '';
    }

    case 'invalidChars': {
      if (field.type === 'email') return 'not-an-email';
      if (field.type === 'url') return 'not a url';
      if (field.type === 'tel') return 'abc';
      // Pattern field — make sure the junk actually fails the regex; if it somehow
      // matches, leave the field empty rather than emit an accidentally-valid value.
      if (field.pattern) {
        const bad = '!!!INVALID!!!';
        try {
          return new RegExp(`^(?:${field.pattern})$`).test(bad) ? '' : bad;
        } catch {
          return bad;
        }
      }
      return '!!!INVALID!!!';
    }
  }
}

/**
 * Produces a value that should FAIL the field's validation. `kind` is the
 * violation the current pass targets (chosen form-wide by the orchestrator). If
 * the field can express that kind it does so; otherwise it falls back to generic
 * garbage so the field still visibly fails. Structured types and date-triplet
 * parts have a single invalid state and ignore the kind. Returns null to skip the
 * field (radios — leaving the group unselected is itself an invalid/required test).
 */
export function generateInvalidValue(
  field: FieldMeta,
  kind: ViolationKind
): string | boolean | null {
  // Date triplet member — an out-of-range part makes the whole date invalid.
  if (field.datePart) {
    return field.datePart === 'year' ? '0' : '99';
  }

  switch (field.type) {
    case 'checkbox':
      return false; // unchecked → fails required "I agree" boxes
    case 'radio':
      return null; // skip → leaves the group unselected
    case 'select':
      return ''; // deselect → fails required-choice
    default:
      if (applicableViolations(field).includes(kind)) return violate(field, kind);
      // Generic garbage only "works" where it lands. A type=number input silently
      // drops non-numeric junk, so a number skips (null) any pass it can't express
      // rather than pretending to participate with a value that never appears.
      if (field.type === 'number') return null;
      return '!!!INVALID!!!';
  }
}

export function generateValue(
  field: FieldMeta,
  dateGroupCache?: Map<string, Date>
): string | boolean | null {
  // Date triplet member — emit the requested part of a shared past date.
  // The cache keys by dateGroupId so all three siblings see the same date.
  if (field.datePart && field.dateGroupId) {
    const cache = dateGroupCache ?? new Map<string, Date>();
    let date = cache.get(field.dateGroupId);
    if (!date) {
      date = faker.date.past({ years: 30 });
      cache.set(field.dateGroupId, date);
    }
    if (field.datePart === 'day') return String(date.getUTCDate());
    if (field.datePart === 'month') return String(date.getUTCMonth() + 1);
    return String(date.getUTCFullYear());
  }

  switch (field.type) {
    case 'select': {
      if (!field.options || field.options.length === 0) return null;
      return field.options.length > 1 ? field.options[1] : field.options[0];
    }

    case 'checkbox':
      return true;

    case 'radio': {
      if (!field.options || field.options.length === 0) return null;
      // "Add another?"-type groups default to No so we don't expand the form with
      // extra (likely required) fields that then fail validation on the first pass.
      const question = normalizeLabel(field.groupLabel ?? field.label);
      if (/\badd (another|more)\b/.test(question)) {
        const no = field.options.find((o) => /^(no|false|n|0)$/i.test(o));
        if (no) return no;
      }
      return field.options[0];
    }

    case 'date': {
      const d = faker.date.past({ years: 5 });
      return d.toISOString().split('T')[0];
    }

    case 'datetime-local': {
      const d = faker.date.past({ years: 5 });
      return d.toISOString().slice(0, 16);
    }

    case 'number': {
      const min = field.min !== undefined ? parseFloat(field.min) : 1;
      const max = field.max !== undefined ? parseFloat(field.max) : 100;
      return String(faker.number.int({
        min: isNaN(min) ? 1 : min,
        max: isNaN(max) ? 100 : max,
      }));
    }

    default: {
      const ruleValue = matchRule(field.label);

      // Build candidate list in priority order:
      // 1. Hint example — most format-specific (e.g. "BB17004" → "BB53291")
      // 2. Rule value — label-matched faker output
      // 3. Pattern generator — structural regex expansion
      const hintValue = field.hint ? generateFromHintExample(field.hint) : null;

      const candidates = [hintValue, ruleValue].filter((v): v is string => v !== null);

      if (!field.pattern) {
        if (candidates[0]) return applyMaxLength(candidates[0], field.maxLength);
        // No label/hint-example match, but a minimum length is stated (e.g. a
        // "write at least 20 characters" validation error) — fill enough words to
        // satisfy it rather than leaving it short. Otherwise defer to generic.
        const minChars = effectiveMinChars(field);
        if (minChars > 0) return fillerAtLeast(minChars, SHORT_WORDS, field.maxLength);
        return null;
      }

      // Pattern present — pick the first candidate that satisfies it
      try {
        const re = new RegExp(`^(?:${field.pattern})$`);
        for (const candidate of candidates) {
          if (re.test(candidate)) return applyMaxLength(candidate, field.maxLength);
        }
        // No candidate matched — try structural pattern generation
        const patternValue = generateForPattern(field.pattern);
        if (patternValue !== null && re.test(patternValue)) {
          return applyMaxLength(patternValue, field.maxLength);
        }
      } catch { /* invalid regex — fall through to AI */ }

      return null; // signal AI fallback needed
    }
  }
}
