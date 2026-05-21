import { describe, it, expect, beforeEach } from 'vitest';
import { extractFields } from '../src/shared/fieldExtractor';

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = html;
  return doc;
}

describe('extractFields', () => {
  it('extracts a text input with an aria-label', () => {
    const doc = makeDoc(`<input type="text" aria-label="First Name" />`);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe('First Name');
    expect(fields[0].type).toBe('text');
  });

  it('extracts label via <label for="id">', () => {
    const doc = makeDoc(`
      <label for="email">Email Address</label>
      <input type="email" id="email" />
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe('Email Address');
    expect(fields[0].type).toBe('email');
  });

  it('extracts label from wrapping <label>', () => {
    const doc = makeDoc(`
      <label>Phone Number <input type="tel" /></label>
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe('Phone Number');
  });

  it('falls back to aria-labelledby', () => {
    const doc = makeDoc(`
      <span id="lbl">Company</span>
      <input type="text" aria-labelledby="lbl" />
    `);
    const fields = extractFields(doc);
    expect(fields[0].label).toBe('Company');
  });

  it('falls back to placeholder when no label exists', () => {
    const doc = makeDoc(`<input type="text" placeholder="Enter your city" />`);
    const fields = extractFields(doc);
    expect(fields[0].label).toBe('Enter your city');
  });

  it('falls back to name attribute as last resort', () => {
    const doc = makeDoc(`<input type="text" name="postal_code" />`);
    const fields = extractFields(doc);
    expect(fields[0].label).toBe('postal_code');
  });

  it('extracts select options', () => {
    const doc = makeDoc(`
      <label for="country">Country</label>
      <select id="country">
        <option value="">Select...</option>
        <option value="BB">Barbados</option>
        <option value="US">United States</option>
      </select>
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(1);
    expect(fields[0].type).toBe('select');
    expect(fields[0].options).toEqual(['BB', 'US']);
    expect(fields[0].label).toBe('Country');
  });

  it('extracts textarea', () => {
    const doc = makeDoc(`
      <label for="msg">Message</label>
      <textarea id="msg"></textarea>
    `);
    const fields = extractFields(doc);
    expect(fields[0].type).toBe('textarea');
    expect(fields[0].label).toBe('Message');
  });

  it('deduplicates radio group — emits only first', () => {
    const doc = makeDoc(`
      <input type="radio" name="gender" value="male" />
      <input type="radio" name="gender" value="female" />
      <input type="radio" name="gender" value="other" />
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(1);
    expect(fields[0].options).toEqual(['male', 'female', 'other']);
  });

  it('deduplicates checkbox group — emits only first', () => {
    const doc = makeDoc(`
      <input type="checkbox" name="interests" value="sports" />
      <input type="checkbox" name="interests" value="music" />
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(1);
  });

  it('emits standalone checkboxes individually', () => {
    const doc = makeDoc(`
      <input type="checkbox" id="tos" />
      <input type="checkbox" id="newsletter" />
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(2);
  });

  it('skips hidden inputs', () => {
    const doc = makeDoc(`<input type="hidden" name="csrf" value="abc" />`);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(0);
  });

  it('skips submit, button, reset, image, file inputs', () => {
    const doc = makeDoc(`
      <input type="submit" value="Submit" />
      <input type="button" value="Click" />
      <input type="reset" value="Reset" />
      <input type="image" />
      <input type="file" />
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(0);
  });

  it('assigns a unique id (data-ff-uid) to each field', () => {
    const doc = makeDoc(`
      <input type="text" aria-label="A" />
      <input type="text" aria-label="B" />
    `);
    const fields = extractFields(doc);
    expect(fields[0].id).not.toBe(fields[1].id);
  });

  it('extracts pattern attribute', () => {
    const doc = makeDoc(`<input type="text" aria-label="Postcode" pattern="[A-Z]{2}[0-9]{1,2} [0-9][A-Z]{2}" />`);
    const fields = extractFields(doc);
    expect(fields[0].pattern).toBe('[A-Z]{2}[0-9]{1,2} [0-9][A-Z]{2}');
  });

  it('extracts maxlength attribute', () => {
    const doc = makeDoc(`<input type="text" aria-label="Code" maxlength="6" />`);
    const fields = extractFields(doc);
    expect(fields[0].maxLength).toBe(6);
  });

  it('extracts min and max attributes', () => {
    const doc = makeDoc(`<input type="number" aria-label="Age" min="18" max="65" />`);
    const fields = extractFields(doc);
    expect(fields[0].min).toBe('18');
    expect(fields[0].max).toBe('65');
  });

  it('extracts hint text from aria-describedby', () => {
    const doc = makeDoc(`
      <span id="ph">Format: AA9 9AA</span>
      <input type="text" aria-label="Postcode" aria-describedby="ph" />
    `);
    const fields = extractFields(doc);
    expect(fields[0].hint).toBe('Format: AA9 9AA');
  });

  it('extracts hint text from following <small> sibling', () => {
    const doc = makeDoc(`
      <input type="text" aria-label="Phone" />
      <small>Format: +1-XXX-XXX-XXXX</small>
    `);
    const fields = extractFields(doc);
    expect(fields[0].hint).toBe('Format: +1-XXX-XXX-XXXX');
  });

  it('does not set pattern or hint when absent', () => {
    const doc = makeDoc(`<input type="text" aria-label="Name" />`);
    const fields = extractFields(doc);
    expect(fields[0].pattern).toBeUndefined();
    expect(fields[0].hint).toBeUndefined();
  });
});
