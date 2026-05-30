import { describe, it, expect } from 'vitest';
import { matchRule, normalizeLabel, isConfirmationLabel } from '../src/shared/rules';

describe('normalizeLabel', () => {
  it('lowercases text', () => {
    expect(normalizeLabel('First Name')).toBe('first name');
  });

  it('converts snake_case to spaces', () => {
    expect(normalizeLabel('first_name')).toBe('first name');
  });

  it('converts camelCase to spaces', () => {
    expect(normalizeLabel('firstName')).toBe('first name');
  });

  it('converts kebab-case to spaces', () => {
    expect(normalizeLabel('first-name')).toBe('first name');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeLabel('first  name')).toBe('first name');
  });
});

describe('matchRule', () => {
  it('matches "First Name" to a non-empty string', () => {
    const result = matchRule('First Name');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('matches "Middle Name" to a single name without titles or surnames', () => {
    const result = matchRule('Middle Name');
    expect(result).not.toBeNull();
    // A middle name is a single token — not a full name ("John Doe") or a
    // titled name ("Bert Steuber PhD"), both of which contain spaces.
    expect(result).not.toMatch(/\s/);
  });

  it('matches "Email Address" to something containing @', () => {
    const result = matchRule('Email Address');
    expect(result).toMatch(/@/);
  });

  it('matches "phone" to a non-empty string', () => {
    expect(matchRule('phone')).not.toBeNull();
  });

  it('matches "mobile" to a non-empty string', () => {
    expect(matchRule('mobile')).not.toBeNull();
  });

  it('matches "Street Address" to a non-empty string', () => {
    expect(matchRule('Street Address')).not.toBeNull();
  });

  it('matches "City" to a non-empty string', () => {
    expect(matchRule('City')).not.toBeNull();
  });

  it('matches "zip_code" to a non-empty string', () => {
    expect(matchRule('zip_code')).not.toBeNull();
  });

  it('matches "Company Name" to a non-empty string', () => {
    expect(matchRule('Company Name')).not.toBeNull();
  });

  it('returns "TestPassword123!" for "password"', () => {
    expect(matchRule('password')).toBe('TestPassword123!');
  });

  it('returns "TestPassword123!" for "Confirm Password"', () => {
    expect(matchRule('Confirm Password')).toBe('TestPassword123!');
  });

  it('matches "telephone number" to the Barbados shape (1-246-XXX-XXXX)', () => {
    expect(matchRule('telephone number')).toMatch(/^1-246-\d{3}-\d{4}$/);
  });

  it('matches "phone" to the Barbados shape with no extension', () => {
    const result = matchRule('phone');
    expect(result).toMatch(/^1-246-\d{3}-\d{4}$/);
    expect(result).not.toMatch(/x/i);
  });

  it('matches "mobile" to the Barbados shape', () => {
    expect(matchRule('mobile')).toMatch(/^1-246-\d{3}-\d{4}$/);
  });

  it('matches "national id number" to the Barbados shape (6 digits, dash, 4 digits)', () => {
    const result = matchRule('national id number');
    expect(result).toMatch(/^\d{6}-\d{4}$/);
  });

  it('matches "National Identification (ID) Number" to the Barbados shape', () => {
    const result = matchRule('National Identification (ID) Number');
    expect(result).toMatch(/^\d{6}-\d{4}$/);
  });

  it('matches "passport number" to a numeric string of at least 6 chars', () => {
    const result = matchRule('passport number');
    expect(result).toMatch(/^\d{6,}$/);
  });

  it('matches "SSN" to a numeric string (not the BB national-id shape)', () => {
    const result = matchRule('SSN');
    expect(result).toMatch(/^\d+$/);
  });

  it('matches "National Insurance number" to the NIS shape (AA######A)', () => {
    const result = matchRule('National Insurance number');
    expect(result).toMatch(/^[A-Z]{2}\d{6}[A-Z]$/);
  });

  it('matches "NIS" to the NIS shape', () => {
    const result = matchRule('NIS');
    expect(result).toMatch(/^[A-Z]{2}\d{6}[A-Z]$/);
  });

  it('matches "TAMIS number" to a numeric string', () => {
    const result = matchRule('TAMIS number');
    expect(result).toMatch(/^\d+$/);
  });

  it('matches "Place of birth" to a non-empty string (city)', () => {
    expect(matchRule('Place of birth')).not.toBeNull();
  });

  it('matches "Place of baptism" to a non-empty string (city)', () => {
    expect(matchRule('Place of baptism')).not.toBeNull();
  });

  it('returns null for an unrecognised label', () => {
    expect(matchRule('testimonial')).toBeNull();
  });

  it('returns null for "reason for selling goods"', () => {
    expect(matchRule('reason for selling goods')).toBeNull();
  });

  it('matches "username" to a non-empty string', () => {
    expect(matchRule('username')).not.toBeNull();
  });

  it('matches "date of birth" to an ISO date string (YYYY-MM-DD)', () => {
    const result = matchRule('date of birth');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches "bio" to a non-empty paragraph', () => {
    const result = matchRule('bio');
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(10);
  });

  it('matches the plural "names" (e.g. "Mother other names") to a name, not lorem', () => {
    const result = matchRule('Mother other names');
    expect(result).not.toBeNull();
    // A person name: letters, spaces, hyphens, apostrophes — no lorem punctuation
    expect(result!).toMatch(/^[A-Za-z'\- ]+$/);
  });

  it('matches a title/salutation field', () => {
    expect(matchRule('Title')).not.toBeNull();
    expect(matchRule('Salutation')).not.toBeNull();
  });

  it('matches marital status to a plausible value', () => {
    expect(matchRule('Marital status')).toMatch(/Single|Married|Divorced|Widowed/);
  });

  it('matches relationship to a plausible value', () => {
    expect(matchRule('Relationship to applicant')).not.toBeNull();
  });

  it('matches religion to a non-empty value', () => {
    expect(matchRule('Religion')).not.toBeNull();
  });

  it('matches colour/color to a colour name', () => {
    expect(matchRule('Vehicle colour')).not.toBeNull();
    expect(matchRule('Favourite color')).not.toBeNull();
  });

  it('matches vehicle make and model', () => {
    expect(matchRule('Vehicle make')).not.toBeNull();
    expect(matchRule('Car model')).not.toBeNull();
  });

  it('matches a "number of" count to a numeric string', () => {
    expect(matchRule('Number of dependants')).toMatch(/^\d+$/);
    expect(matchRule('How many children')).toMatch(/^\d+$/);
  });

  it('matches profession to a job title', () => {
    expect(matchRule('Profession')).not.toBeNull();
  });
});

describe('isConfirmationLabel', () => {
  it.each([
    'Confirm Email',
    'Confirm Email Address',
    'Re-enter Email',
    'Re-enter your email address',
    'Retype Email',
    'Repeat Email',
    'Verify Email',
    'Email Confirmation',
  ])('returns true for "%s"', (label) => {
    expect(isConfirmationLabel(label)).toBe(true);
  });

  it.each([
    'Email',
    'Email Address',
    'Work Email',
    'First Name',
  ])('returns false for "%s"', (label) => {
    expect(isConfirmationLabel(label)).toBe(false);
  });
});
