import { describe, it, expect } from 'vitest';
import { generateValue } from '../src/shared/valueGenerator';
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
});
