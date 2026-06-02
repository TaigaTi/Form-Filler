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

  it('uses an error-summary message (linked by href) as the field hint', () => {
    const doc = makeDoc(`
      <div data-error-summary="true" role="alert">
        <h2>There is a problem</h2>
        <ul><li><a href="#motivation">Please write at least 20 characters</a></li></ul>
      </div>
      <div data-field="true">
        <label for="motivation">Why are you applying?</label>
        <textarea id="motivation"></textarea>
      </div>
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(1);
    expect(fields[0].hint).toBe('Please write at least 20 characters');
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

  it('captures the radio group question from the fieldset <legend> as groupLabel', () => {
    const doc = makeDoc(`
      <fieldset>
        <legend>Do you want to add another dependant?</legend>
        <label for="aa-yes">Yes</label>
        <input type="radio" id="aa-yes" name="addAnother" value="yes" />
        <label for="aa-no">No</label>
        <input type="radio" id="aa-no" name="addAnother" value="no" />
      </fieldset>
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(1);
    expect(fields[0].groupLabel).toBe('Do you want to add another dependant?');
    // Options are the option label text (preferred over the value attribute)
    expect(fields[0].options).toEqual(['Yes', 'No']);
  });

  it('uses label text for options when radios have no value attribute', () => {
    const doc = makeDoc(`
      <fieldset>
        <legend>Add another?</legend>
        <input type="radio" id="aa-yes" name="Add Another" />
        <label for="aa-yes">Yes</label>
        <input type="radio" id="aa-no" name="Add Another" />
        <label for="aa-no">No</label>
      </fieldset>
    `);
    const fields = extractFields(doc);
    expect(fields[0].options).toEqual(['Yes', 'No']);
  });

  it('extracts every checkbox in a shared-name group individually', () => {
    const doc = makeDoc(`
      <input type="checkbox" name="interests" value="sports" />
      <input type="checkbox" name="interests" value="music" />
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(2);
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

  it('tags Day/Month/Year inputs inside a fieldset[data-date-field] with shared dateGroupId', () => {
    const doc = makeDoc(`
      <fieldset data-date-field>
        <legend>Date of birth</legend>
        <div><label>Day</label><input type="number" min="1" max="31" /></div>
        <div><label>Month</label><input type="number" min="1" max="12" /></div>
        <div><label>Year</label><input type="number" /></div>
      </fieldset>
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(3);
    expect(fields[0].datePart).toBe('day');
    expect(fields[1].datePart).toBe('month');
    expect(fields[2].datePart).toBe('year');
    // All three share one group id
    expect(fields[0].dateGroupId).toBeDefined();
    expect(fields[0].dateGroupId).toBe(fields[1].dateGroupId);
    expect(fields[1].dateGroupId).toBe(fields[2].dateGroupId);
  });

  it('does not tag ordinary number inputs as date parts', () => {
    const doc = makeDoc(`<input type="number" aria-label="Age" min="18" max="65" />`);
    const fields = extractFields(doc);
    expect(fields[0].datePart).toBeUndefined();
    expect(fields[0].dateGroupId).toBeUndefined();
  });

  it('detects date triplet via sibling labels even without data-date-field', () => {
    const doc = makeDoc(`
      <div>
        <div><label>Day</label><input type="number" min="1" max="31" /></div>
        <div><label>Month</label><input type="number" min="1" max="12" /></div>
        <div><label>Year</label><input type="number" /></div>
      </div>
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(3);
    expect(fields.map((f) => f.datePart)).toEqual(['day', 'month', 'year']);
    expect(fields[0].dateGroupId).toBe(fields[2].dateGroupId);
  });

  it('detects a text/inputmode="numeric" triplet with label[for] (alpha-site markup)', () => {
    const doc = makeDoc(`
      <div class="flex flex-col">
        <label for="dob">Date of birth</label>
      </div>
      <div class="flex gap-s">
        <div class="flex flex-col">
          <label for="dob-day">Day</label>
          <div class="relative"><input id="dob-day" inputmode="numeric" type="text" name="dob[day]" /></div>
        </div>
        <div class="flex flex-col">
          <label for="dob-month">Month</label>
          <div class="relative"><input id="dob-month" inputmode="numeric" type="text" name="dob[month]" /></div>
        </div>
        <div class="flex flex-col">
          <label for="dob-year">Year</label>
          <div class="relative"><input id="dob-year" inputmode="numeric" type="text" name="dob[year]" /></div>
        </div>
      </div>
    `);
    const fields = extractFields(doc);
    expect(fields).toHaveLength(3);
    expect(fields.map((f) => f.datePart)).toEqual(['day', 'month', 'year']);
    expect(fields[0].dateGroupId).toBeDefined();
    expect(fields[0].dateGroupId).toBe(fields[1].dateGroupId);
    expect(fields[1].dateGroupId).toBe(fields[2].dateGroupId);
  });

  it('does not tag a lone "Day" text input with no Month/Year sibling', () => {
    const doc = makeDoc(`
      <div><label for="d">Day</label><input id="d" type="text" inputmode="numeric" /></div>
    `);
    const fields = extractFields(doc);
    expect(fields[0].datePart).toBeUndefined();
    expect(fields[0].dateGroupId).toBeUndefined();
  });
});
