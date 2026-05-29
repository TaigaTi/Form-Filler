import { describe, it, expect } from 'vitest';
import {
  generateInvalidValue,
  applicableViolations,
  activeViolationKinds,
  violationLabel,
} from '../src/shared/valueGenerator';
import { FieldMeta } from '../src/shared/types';

function field(overrides: Partial<FieldMeta>): FieldMeta {
  return { id: 'f', elementId: '', elementName: '', label: 'L', type: 'text', ...overrides };
}

describe('generateInvalidValue — expresses the targeted kind', () => {
  it('produces a malformed email (no @) on the invalidChars kind', () => {
    const v = generateInvalidValue(field({ type: 'email' }), 'invalidChars');
    expect(v).toBe('not-an-email');
    expect(String(v)).not.toContain('@');
  });

  it('undercuts minLength on the tooShort kind', () => {
    const v = generateInvalidValue(field({ type: 'text', minLength: 6 }), 'tooShort') as string;
    expect(v.length).toBeLessThan(6);
  });

  it('exceeds maxLength on the tooLong kind', () => {
    const v = generateInvalidValue(field({ type: 'text', maxLength: 8 }), 'tooLong') as string;
    expect(v.length).toBeGreaterThan(8);
  });

  it('puts a number below min on the outOfRange kind', () => {
    const f = field({ type: 'number', min: '1', max: '10' });
    expect(generateInvalidValue(f, 'outOfRange')).toBe('0');
  });

  it('emits an out-of-range date before min on the outOfRange kind', () => {
    const f = field({ type: 'date', min: '2020-01-01' });
    const v = generateInvalidValue(f, 'outOfRange') as string;
    expect(v < '2020-01-01').toBe(true);
  });

  it('empties on the empty kind', () => {
    expect(generateInvalidValue(field({ type: 'text', required: true }), 'empty')).toBe('');
  });

  it('never emits a value that satisfies the pattern', () => {
    const pattern = '[A-Z]{2}[0-9]{5}';
    const f = field({ type: 'text', pattern });
    const v = generateInvalidValue(f, 'invalidChars') as string;
    expect(new RegExp(`^(?:${pattern})$`).test(v)).toBe(false);
  });
});

describe('generateInvalidValue — generic-garbage fallback', () => {
  it('falls back to generic garbage when the kind is not applicable', () => {
    // text field with no max can not express tooLong
    expect(generateInvalidValue(field({ type: 'text' }), 'tooLong')).toBe('!!!INVALID!!!');
  });

  it('falls back when an above-max pass hits a field with no max', () => {
    // email with no maxLength: tooLong inapplicable → generic garbage, not a bad email
    expect(generateInvalidValue(field({ type: 'email' }), 'tooLong')).toBe('!!!INVALID!!!');
  });
});

describe('generateInvalidValue — structured types ignore the kind', () => {
  it('leaves checkboxes unchecked regardless of kind', () => {
    expect(generateInvalidValue(field({ type: 'checkbox' }), 'invalidChars')).toBe(false);
    expect(generateInvalidValue(field({ type: 'checkbox' }), 'empty')).toBe(false);
  });

  it('skips radios regardless of kind', () => {
    const f = field({ type: 'radio', options: ['a', 'b'] });
    expect(generateInvalidValue(f, 'tooLong')).toBeNull();
  });

  it('deselects a select regardless of kind', () => {
    const f = field({ type: 'select', options: ['a', 'b'] });
    expect(generateInvalidValue(f, 'outOfRange')).toBe('');
  });

  it('breaks a date-triplet part regardless of kind', () => {
    expect(generateInvalidValue(field({ type: 'number', datePart: 'year' }), 'tooShort')).toBe('0');
    expect(generateInvalidValue(field({ type: 'number', datePart: 'day' }), 'empty')).toBe('99');
  });
});

describe('applicableViolations — global order', () => {
  it('returns kinds in the format-first global order', () => {
    const f = field({ type: 'text', minLength: 4, maxLength: 10, pattern: '[a-z]+', required: true });
    expect(applicableViolations(f)).toEqual(['invalidChars', 'tooShort', 'tooLong', 'empty']);
  });

  it('an unconstrained text field can only express invalidChars', () => {
    expect(applicableViolations(field({ type: 'text' }))).toEqual(['invalidChars']);
  });

  it('an optional bound-less date falls back to empty only', () => {
    expect(applicableViolations(field({ type: 'date' }))).toEqual(['empty']);
  });
});

describe('activeViolationKinds — the form-wide cycle', () => {
  it('unions expressible kinds across fields, in global order', () => {
    const fields = [
      field({ type: 'email' }),                       // invalidChars
      field({ type: 'text', minLength: 5 }),          // invalidChars, tooShort
      field({ type: 'text', maxLength: 5 }),          // invalidChars, tooLong
      field({ type: 'number', min: '1', required: true }), // invalidChars, outOfRange, empty
    ];
    expect(activeViolationKinds(fields)).toEqual([
      'invalidChars', 'tooShort', 'tooLong', 'outOfRange', 'empty',
    ]);
  });

  it('omits kinds no field can express', () => {
    const fields = [field({ type: 'email' }), field({ type: 'text', minLength: 5 })];
    expect(activeViolationKinds(fields)).toEqual(['invalidChars', 'tooShort']);
  });

  it('ignores structured-type and date-triplet fields', () => {
    const fields = [
      field({ type: 'checkbox', required: true }),
      field({ type: 'radio', options: ['a'] }),
      field({ type: 'select', options: ['a'] }),
      field({ type: 'number', datePart: 'year' }),
    ];
    expect(activeViolationKinds(fields)).toEqual([]);
  });
});

describe('cycling across the whole form', () => {
  it('every field violates the same kind on a given pass', () => {
    const email = field({ type: 'email' });
    const short = field({ type: 'text', minLength: 6 });

    // Pass targeting tooShort: the min-length field undercuts, the email falls back to garbage
    expect((generateInvalidValue(short, 'tooShort') as string).length).toBeLessThan(6);
    expect(generateInvalidValue(email, 'tooShort')).toBe('!!!INVALID!!!');

    // Pass targeting invalidChars: email gets a malformed address; plain text gets garbage
    expect(generateInvalidValue(email, 'invalidChars')).toBe('not-an-email');
    expect(generateInvalidValue(short, 'invalidChars')).toBe('!!!INVALID!!!');
  });
});

describe('violationLabel — human-readable pass names', () => {
  it('maps each kind to a label', () => {
    expect(violationLabel('invalidChars')).toBe('invalid format');
    expect(violationLabel('tooShort')).toBe('below minimum');
    expect(violationLabel('tooLong')).toBe('above maximum');
    expect(violationLabel('outOfRange')).toBe('out of range');
    expect(violationLabel('empty')).toBe('empty');
  });
});
