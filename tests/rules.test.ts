import { describe, it, expect } from 'vitest';
import { matchRule, normalizeLabel } from '../src/shared/rules';

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

  it('matches "telephone number" to a non-empty string', () => {
    expect(matchRule('telephone number')).not.toBeNull();
  });

  it('matches "national id number" to a numeric string', () => {
    const result = matchRule('national id number');
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\d+$/);
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
});
