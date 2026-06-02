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

  it('undercuts a hint-stated minimum length that has no minlength attribute', () => {
    const f = field({ type: 'textarea', hint: 'Please write at least 20 characters' });
    expect(applicableViolations(f)).toContain('tooShort');
    const v = generateInvalidValue(f, 'tooShort') as string;
    expect(v.length).toBeLessThan(20);
  });

  it('exceeds maxLength on the tooLong kind', () => {
    const v = generateInvalidValue(field({ type: 'text', maxLength: 8 }), 'tooLong') as string;
    expect(v.length).toBeGreaterThan(8);
  });

  it('puts a number below min on the belowMin kind', () => {
    const f = field({ type: 'number', min: '1', max: '10' });
    expect(generateInvalidValue(f, 'belowMin')).toBe('0');
  });

  it('puts a number above max on the aboveMax kind', () => {
    const f = field({ type: 'number', min: '1', max: '10' });
    expect(generateInvalidValue(f, 'aboveMax')).toBe('11');
  });

  it('emits a date before min on the belowMin kind', () => {
    const f = field({ type: 'date', min: '2020-01-01' });
    const v = generateInvalidValue(f, 'belowMin') as string;
    expect(v < '2020-01-01').toBe(true);
  });

  it('emits a date after max on the aboveMax kind', () => {
    const f = field({ type: 'date', max: '2020-12-31' });
    const v = generateInvalidValue(f, 'aboveMax') as string;
    expect(v > '2020-12-31').toBe(true);
  });

  it('violates a hint-stated numeric minimum that has no HTML min attribute', () => {
    const f = field({ type: 'number', hint: 'You must be 18 or older' });
    expect(generateInvalidValue(f, 'belowMin')).toBe('17');
  });

  it('undercuts the larger of HTML min and hint-stated min on belowMin', () => {
    const f = field({ type: 'number', min: '1', hint: 'Must be at least 10' });
    expect(generateInvalidValue(f, 'belowMin')).toBe('9');
  });

  it('exceeds the smaller of HTML max and hint-stated max on aboveMax', () => {
    const f = field({ type: 'number', max: '100', hint: 'no more than 50' });
    expect(generateInvalidValue(f, 'aboveMax')).toBe('51');
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

describe('generateInvalidValue — number fields skip non-landing passes', () => {
  it('does not express invalidChars (non-numeric junk is dropped by number inputs)', () => {
    expect(applicableViolations(field({ type: 'number' }))).not.toContain('invalidChars');
  });

  it('skips (null) an unconstrained number on the invalidChars pass', () => {
    expect(generateInvalidValue(field({ type: 'number' }), 'invalidChars')).toBeNull();
  });

  it('skips (null) a number on a pass it cannot express, rather than emitting junk', () => {
    // number with only a min can not express tooLong → skip, not !!!INVALID!!!
    expect(generateInvalidValue(field({ type: 'number', min: '1' }), 'tooLong')).toBeNull();
  });

  it('still empties a required number on the empty pass', () => {
    expect(generateInvalidValue(field({ type: 'number', required: true }), 'empty')).toBe('');
  });

  it('does not express tooShort/tooLong (length violations do not land on number inputs)', () => {
    const f = field({ type: 'number', minLength: 5, maxLength: 8 });
    const kinds = applicableViolations(f);
    expect(kinds).not.toContain('tooShort');
    expect(kinds).not.toContain('tooLong');
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
    expect(generateInvalidValue(f, 'aboveMax')).toBe('');
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
      field({ type: 'number', min: '1', max: '10', required: true }), // belowMin, aboveMax, empty
    ];
    expect(activeViolationKinds(fields)).toEqual([
      'invalidChars', 'tooShort', 'tooLong', 'belowMin', 'aboveMax', 'empty',
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
    expect(violationLabel('tooShort')).toBe('below minimum length');
    expect(violationLabel('tooLong')).toBe('above maximum length');
    expect(violationLabel('belowMin')).toBe('below minimum value');
    expect(violationLabel('aboveMax')).toBe('above maximum value');
    expect(violationLabel('empty')).toBe('empty');
  });
});
