import { describe, it, expect } from 'vitest';
import { generateValue, generateForPattern, generateFromHintExample, generateGenericText, parseMinChars, parseNumericBounds } from '../src/shared/valueGenerator';
import { FieldMeta } from '../src/shared/types';

function field(overrides: Partial<FieldMeta>): FieldMeta {
  return {
    id: 'test-uid',
    elementId: '',
    elementName: '',
    label: '',
    type: 'text',
    ...overrides,
  };
}

describe('generateValue', () => {
  it('returns the 2nd non-blank option for a select with multiple options', () => {
    const f = field({ type: 'select', options: ['BB', 'US', 'CA'] });
    expect(generateValue(f)).toBe('US');
  });

  it('returns the only option for a select with one option', () => {
    const f = field({ type: 'select', options: ['BB'] });
    expect(generateValue(f)).toBe('BB');
  });

  it('returns null for a select with no options', () => {
    const f = field({ type: 'select', options: [] });
    expect(generateValue(f)).toBeNull();
  });

  it('returns true for a checkbox', () => {
    expect(generateValue(field({ type: 'checkbox' }))).toBe(true);
  });

  it('returns the first radio option value', () => {
    const f = field({ type: 'radio', options: ['male', 'female', 'other'] });
    expect(generateValue(f)).toBe('male');
  });

  it('returns null for radio with no options', () => {
    expect(generateValue(field({ type: 'radio' }))).toBeNull();
  });

  it('defaults an "Add another?" radio group to its No option', () => {
    const f = field({
      type: 'radio',
      groupLabel: 'Do you want to add another dependant?',
      options: ['yes', 'no'],
    });
    expect(generateValue(f)).toBe('no');
  });

  it('matches the No option by "false" value for an add-more group', () => {
    const f = field({
      type: 'radio',
      groupLabel: 'Add more children',
      options: ['true', 'false'],
    });
    expect(generateValue(f)).toBe('false');
  });

  it('leaves an "Add another?" group on the first option when no No option exists', () => {
    const f = field({
      type: 'radio',
      groupLabel: 'Add another contact',
      options: ['email', 'phone'],
    });
    expect(generateValue(f)).toBe('email');
  });

  it('does not force No on a non-add-another radio group', () => {
    const f = field({
      type: 'radio',
      groupLabel: 'Are you a citizen?',
      options: ['yes', 'no'],
    });
    expect(generateValue(f)).toBe('yes');
  });

  it('returns a YYYY-MM-DD string for date type', () => {
    const result = generateValue(field({ type: 'date' }));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a YYYY-MM-DDTHH:MM string for datetime-local', () => {
    const result = generateValue(field({ type: 'datetime-local' }));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('returns a numeric string for number type', () => {
    const result = generateValue(field({ type: 'number', label: '' }));
    expect(result).not.toBeNull();
    expect(Number.isFinite(Number(result))).toBe(true);
  });

  it('returns a matched string for a known label (email)', () => {
    const result = generateValue(field({ type: 'email', label: 'Email' }));
    expect(result).toMatch(/@/);
  });

  it('returns null for an unknown label (testimonial)', () => {
    const result = generateValue(field({ type: 'text', label: 'testimonial' }));
    expect(result).toBeNull();
  });

  it('generates a valid BB postcode on the first pass (no hint, no pattern)', () => {
    // gov-bb's postcode field exposes no pattern and no extractable hint on the
    // first fill, so the value must be valid from the rule alone — not only after
    // the validation-error round-trip supplies "for example, BB17004".
    const result = generateValue(field({ type: 'text', label: 'Postcode' }));
    expect(result).toMatch(/^BB\d{5}$/);
  });

  it('respects min/max for number fields', () => {
    const result = generateValue(field({ type: 'number', min: '5', max: '5' }));
    expect(result).toBe('5');
  });

  it('truncates text values to maxLength', () => {
    const result = generateValue(field({ type: 'email', label: 'Email', maxLength: 5 }));
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeLessThanOrEqual(5);
  });

  it('uses pattern generator when rule value does not match pattern', () => {
    // Email rule generates "user@example.com" which does not match an all-digit pattern
    const result = generateValue(field({
      type: 'email',
      label: 'Email',
      pattern: '[0-9]{6}',
    }));
    // Should generate 6 digits via generateForPattern, not fall through to null
    expect(result).toMatch(/^\d{6}$/);
  });

  it('returns null when pattern is present and both rule and pattern generator fail', () => {
    // No rule for "testimonial" and pattern is a complex lookahead (too hard for local gen)
    const result = generateValue(field({
      type: 'text',
      label: 'testimonial',
      pattern: '(?=.*[A-Z])(?=.*[0-9]).{8,}',
    }));
    expect(result).toBeNull();
  });

  describe('date triplet (datePart / dateGroupId)', () => {
    it('emits day in 1..31, month in 1..12, year in the past, sharing one date', () => {
      const cache = new Map<string, Date>();
      const groupId = 'g1';
      const day = generateValue(
        field({ type: 'number', datePart: 'day', dateGroupId: groupId }),
        cache,
      );
      const month = generateValue(
        field({ type: 'number', datePart: 'month', dateGroupId: groupId }),
        cache,
      );
      const year = generateValue(
        field({ type: 'number', datePart: 'year', dateGroupId: groupId }),
        cache,
      );

      expect(day).toMatch(/^\d{1,2}$/);
      expect(month).toMatch(/^\d{1,2}$/);
      expect(year).toMatch(/^\d{4}$/);

      const d = Number(day), m = Number(month), y = Number(year);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(31);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(12);

      // Reconstruct the date — must be valid and in the past
      const reconstructed = new Date(Date.UTC(y, m - 1, d));
      expect(reconstructed.getUTCFullYear()).toBe(y);
      expect(reconstructed.getUTCMonth()).toBe(m - 1);
      expect(reconstructed.getUTCDate()).toBe(d);
      expect(reconstructed.getTime()).toBeLessThan(Date.now());
    });

    it('separate dateGroupIds get separate dates', () => {
      const cache = new Map<string, Date>();
      const yearA = generateValue(
        field({ type: 'number', datePart: 'year', dateGroupId: 'a' }),
        cache,
      );
      const yearB = generateValue(
        field({ type: 'number', datePart: 'year', dateGroupId: 'b' }),
        cache,
      );
      expect(cache.size).toBe(2);
      expect(typeof yearA).toBe('string');
      expect(typeof yearB).toBe('string');
    });
  });
});

describe('generateGenericText', () => {
  it('returns placeholder words for an unmatched text field', () => {
    const result = generateGenericText(field({ type: 'text', label: 'Place of baptism' }));
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeGreaterThan(0);
  });

  it('never includes full stops in the filler text', () => {
    for (let i = 0; i < 20; i++) {
      const short = generateGenericText(field({ type: 'text', label: 'Anything' })) as string;
      const long = generateGenericText(field({ type: 'textarea', label: 'Why are you applying?' })) as string;
      const padded = generateGenericText(field({ type: 'text', minLength: 60 })) as string;
      expect(short).not.toContain('.');
      expect(long).not.toContain('.');
      expect(padded).not.toContain('.');
    }
  });

  it('returns an email for an email-typed field', () => {
    expect(generateGenericText(field({ type: 'email' }))).toMatch(/@/);
  });

  it('respects maxLength', () => {
    const result = generateGenericText(field({ type: 'text', maxLength: 4 }));
    expect((result as string).length).toBeLessThanOrEqual(4);
  });

  it('returns null for structured (select) types', () => {
    expect(generateGenericText(field({ type: 'select', options: ['a'] }))).toBeNull();
  });

  it('returns null when a pattern is present (avoids invalid values)', () => {
    expect(generateGenericText(field({ type: 'text', pattern: '[0-9]{6}' }))).toBeNull();
  });

  it('fills a textarea with paragraph-length prose, not two words', () => {
    const result = generateGenericText(field({ type: 'textarea', label: 'Why are you applying?' })) as string;
    expect(result.length).toBeGreaterThan(20);
  });

  it('meets a minimum length stated in the hint', () => {
    const result = generateGenericText(field({
      type: 'textarea',
      hint: 'Please write at least 50 characters',
    })) as string;
    expect(result.length).toBeGreaterThanOrEqual(50);
  });

  it('meets a minlength attribute', () => {
    const result = generateGenericText(field({ type: 'text', minLength: 40 })) as string;
    expect(result.length).toBeGreaterThanOrEqual(40);
  });
});

describe('parseMinChars', () => {
  it('parses "at least N characters"', () => {
    expect(parseMinChars('Please write at least 20 characters')).toBe(20);
  });
  it('parses "minimum of N characters"', () => {
    expect(parseMinChars('Enter a minimum of 8 characters')).toBe(8);
  });
  it('parses "N characters or more"', () => {
    expect(parseMinChars('Use 12 characters or more')).toBe(12);
  });
  it('returns null when no requirement is stated', () => {
    expect(parseMinChars('Tell us a bit about yourself')).toBeNull();
    expect(parseMinChars(undefined)).toBeNull();
  });
});

describe('parseNumericBounds', () => {
  it('parses a "between X and Y" range', () => {
    expect(parseNumericBounds('Enter a value between 1 and 100')).toEqual({ min: 1, max: 100 });
  });
  it('parses "X or older" as a lower bound', () => {
    expect(parseNumericBounds('You must be 18 or older')).toEqual({ min: 18 });
  });
  it('parses "at least N" as a lower bound', () => {
    expect(parseNumericBounds('Must be at least 5')).toEqual({ min: 5 });
  });
  it('parses "no more than N" as an upper bound', () => {
    expect(parseNumericBounds('Choose no more than 50')).toEqual({ max: 50 });
  });
  it('parses "maximum of N" as an upper bound', () => {
    expect(parseNumericBounds('A maximum of 10 is allowed')).toEqual({ max: 10 });
  });
  it('parses "up to N" as an upper bound', () => {
    expect(parseNumericBounds('Request up to 3 copies')).toEqual({ max: 3 });
  });
  it('handles negative and decimal bounds', () => {
    expect(parseNumericBounds('between -2.5 and 2.5')).toEqual({ min: -2.5, max: 2.5 });
  });
  it('parses "no fewer than N" as a lower bound', () => {
    expect(parseNumericBounds('Provide no fewer than 3')).toEqual({ min: 3 });
  });
  it('parses "at most N" as an upper bound', () => {
    expect(parseNumericBounds('Select at most 7')).toEqual({ max: 7 });
  });
  it('parses "N or less" as an upper bound', () => {
    expect(parseNumericBounds('Enter 5 or less')).toEqual({ max: 5 });
  });
  it('ignores character-length phrasing (handled by parseMinChars)', () => {
    expect(parseNumericBounds('at least 20 characters')).toBeNull();
  });
  it('does not match a number bound inside a word like "admin."', () => {
    expect(parseNumericBounds('Contact admin. 9 for help')).toBeNull();
  });
  it('returns null when no numeric bound is stated', () => {
    expect(parseNumericBounds('Tell us a bit about yourself')).toBeNull();
    expect(parseNumericBounds(undefined)).toBeNull();
  });
});

describe('generateValue — minimum-length fields', () => {
  it('fills enough prose when a hint states a minimum and nothing else matches', () => {
    const f = field({ type: 'textarea', label: 'Why are you applying?', hint: 'Please write at least 20 characters' });
    const result = generateValue(f) as string;
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThanOrEqual(20);
  });

  it('still returns null for an unmatched free-text field with no minimum', () => {
    const f = field({ type: 'textarea', label: 'Anything else?' });
    expect(generateValue(f)).toBeNull();
  });
});

describe('generateForPattern', () => {
  it('generates digits for [0-9]{N}', () => {
    const result = generateForPattern('[0-9]{9}');
    expect(result).toMatch(/^\d{9}$/);
  });

  it('generates digits for \\d{N}', () => {
    const result = generateForPattern('\\d{13}');
    expect(result).toMatch(/^\d{13}$/);
  });

  it('generates digits for range [0-9]{M,N} using max length', () => {
    const result = generateForPattern('[0-9]{9,12}');
    expect(result).toMatch(/^\d{12}$/);
  });

  it('generates uppercase letters for [A-Z]{N}', () => {
    const result = generateForPattern('[A-Z]{3}');
    expect(result).toMatch(/^[A-Z]{3}$/);
  });

  it('generates alphanumeric for [A-Z0-9]{N}', () => {
    const result = generateForPattern('[A-Z0-9]{6}');
    expect(result).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('handles mixed literal + class pattern (postcode-like)', () => {
    const result = generateForPattern('[A-Z]{2}[0-9]{5}');
    expect(result).toMatch(/^[A-Z]{2}\d{5}$/);
  });

  it('handles literal characters between classes', () => {
    const result = generateForPattern('[0-9]{3}-[0-9]{4}');
    expect(result).toMatch(/^\d{3}-\d{4}$/);
  });

  it('returns null for patterns too complex to generate locally', () => {
    expect(generateForPattern('(?=.*[A-Z]).{8}')).toBeNull();
  });
});

describe('generateFromHintExample', () => {
  it('extracts Barbados postcode example and randomises digits', () => {
    const result = generateFromHintExample('Enter a valid postcode (for example, BB17004)');
    expect(result).toMatch(/^BB\d{5}$/);
  });

  it('extracts first phone example from a multi-format hint', () => {
    const result = generateFromHintExample(
      'Please enter a valid phone number (for example, 2345678, 1-246-234-5678, or 1 246 234 5678)'
    );
    expect(result).toMatch(/^\d{7}$/);
  });

  it('works with "e.g." prefix', () => {
    const result = generateFromHintExample('Must be in format e.g. AB1234');
    expect(result).toMatch(/^AB\d{4}$/);
  });

  it('returns null when no example pattern is present', () => {
    expect(generateFromHintExample('This field is required')).toBeNull();
    expect(generateFromHintExample('Must be at least 8 characters')).toBeNull();
  });

  it('hint example takes priority over rule value in generateValue', () => {
    // Postcode rule generates a US zip; hint says "BB17004" → should use BB format
    const result = generateValue({
      id: 'x', elementId: '', elementName: '', label: 'Postcode', type: 'text',
      hint: 'Enter a valid postcode (for example, BB17004)',
    });
    expect(result).toMatch(/^BB\d{5}$/);
  });
});
