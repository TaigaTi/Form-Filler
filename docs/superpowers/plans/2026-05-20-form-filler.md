# Form Filler Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome MV3 extension that fills all form fields on the current page with realistic fake data via a hotkey or toolbar popup, with Claude Haiku as an AI fallback for unusual field labels.

**Architecture:** A content script scans the active page for form fields and extracts their labels, sends metadata to the background service worker which runs a rules engine (~40 patterns using Faker.js) and batches any unmatched labels to Claude Haiku, then sends fill instructions back to the content script which applies values and fires synthetic events for React/Vue compatibility. A toolbar popup provides a fill button and settings management.

**Tech Stack:** TypeScript, Vite 5, `@crxjs/vite-plugin` (beta), `@faker-js/faker`, Claude Haiku API via `fetch`, Vitest + jsdom for unit tests.

---

## File Map

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 extension manifest — permissions, content scripts, service worker, commands |
| `vite.config.ts` | Extension bundler config — crxjs plugin wires up manifest entries |
| `vitest.config.ts` | Test runner config — jsdom environment for DOM tests |
| `tsconfig.json` | TypeScript compiler config |
| `src/shared/types.ts` | All shared TypeScript types — `FieldMeta`, `FillInstruction`, `FillResult`, `StoredSettings`, message unions |
| `src/shared/rules.ts` | Rules engine — maps normalized label text to Faker.js calls; `matchRule(label) → string \| null` |
| `src/shared/fieldExtractor.ts` | DOM field detection — 6-level label priority chain; `extractFields(doc) → FieldMeta[]` |
| `src/shared/valueGenerator.ts` | Type-based value generation — handles select, checkbox, radio, date, number before label matching |
| `src/background/index.ts` | Service worker — hotkey listener, orchestration, Claude API call, popup message handlers |
| `src/content/index.ts` | Content script — receives messages, calls `extractFields`, calls `applyValues` |
| `src/popup/index.html` | Popup markup — fill button, status area, settings view |
| `src/popup/index.ts` | Popup logic — sends messages to background, renders state |
| `tests/rules.test.ts` | Unit tests for `matchRule` |
| `tests/fieldExtractor.test.ts` | Unit tests for `extractFields` using jsdom |
| `tests/valueGenerator.test.ts` | Unit tests for `generateValue` |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `manifest.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "form-filler",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "beta",
    "@types/chrome": "^0.0.268",
    "@vitest/coverage-v8": "^2.0.0",
    "jsdom": "^24.0.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^2.0.0"
  },
  "dependencies": {
    "@faker-js/faker": "^8.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["ESNext", "DOM"],
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 4: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Form Filler",
  "version": "1.0.0",
  "description": "Instantly fill form fields with realistic fake data for testing",
  "permissions": ["activeTab", "storage", "tabs"],
  "host_permissions": ["https://api.anthropic.com/*"],
  "action": {
    "default_popup": "src/popup/index.html"
  },
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/index.ts"]
    }
  ],
  "commands": {
    "fill-form": {
      "suggested_key": {
        "default": "Ctrl+Shift+F",
        "mac": "Command+Shift+F"
      },
      "description": "Fill all form fields on the current page"
    }
  }
}
```

- [ ] **Step 5: Create `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    minify: false,
  },
});
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` populated, no errors. If `@crxjs/vite-plugin@beta` fails to resolve, try `npm install @crxjs/vite-plugin@2.0.0-beta.28` explicitly.

- [ ] **Step 7: Create placeholder source files so Vite doesn't error on missing entries**

Create `src/background/index.ts`:
```typescript
export {};
```

Create `src/content/index.ts`:
```typescript
export {};
```

Create `src/popup/index.html`:
```html
<!DOCTYPE html>
<html><body><p>Loading...</p></body></html>
```

Create `src/popup/index.ts`:
```typescript
export {};
```

- [ ] **Step 8: Verify the build compiles**

```bash
npm run build
```

Expected: `dist/` directory created with at minimum `manifest.json` inside. No TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json vite.config.ts vitest.config.ts manifest.json src/
git commit -m "feat: scaffold Vite + TypeScript extension project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Create `src/shared/types.ts`**

```typescript
export type FieldType =
  | 'text' | 'email' | 'password' | 'number'
  | 'date' | 'datetime-local' | 'tel' | 'url'
  | 'textarea' | 'select' | 'checkbox' | 'radio' | 'other';

export interface FieldMeta {
  id: string;           // data-ff-uid assigned by fieldExtractor
  elementId: string;    // element's id attribute (may be empty)
  elementName: string;  // element's name attribute (may be empty)
  label: string;        // resolved label text
  type: FieldType;
  options?: string[];   // select options or radio values
  groupName?: string;   // name attribute for radio/checkbox groups
}

export interface FillInstruction {
  fieldId: string;      // matches FieldMeta.id (data-ff-uid)
  value: string | boolean;
}

export interface FillResult {
  fieldsFilled: number;
  fieldsSkipped: number;
  aiFieldCount: number;
  timestamp: number;
}

export interface StoredSettings {
  claudeApiKey: string;
  lastFillResult?: FillResult;
}

// Messages sent TO content script
export type MessageToContent =
  | { type: 'EXTRACT_FIELDS' }
  | { type: 'APPLY_VALUES'; instructions: FillInstruction[] };

// Messages sent FROM content script back to background
export interface ExtractFieldsResponse {
  fields: FieldMeta[];
}

// Messages sent TO background (from popup)
export type MessageToBackground =
  | { type: 'FILL_REQUEST' }
  | { type: 'SAVE_API_KEY'; key: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'CLEAR_AI_CACHE' };

// Messages sent FROM background to popup
export type MessageFromBackground =
  | { type: 'FILL_COMPLETE'; result: FillResult }
  | { type: 'FILL_ERROR'; error: string }
  | { type: 'SETTINGS'; settings: StoredSettings };
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Rules Engine

**Files:**
- Create: `tests/rules.test.ts`
- Create: `src/shared/rules.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/rules.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: Multiple test failures — `matchRule` and `normalizeLabel` are not defined.

- [ ] **Step 3: Implement `src/shared/rules.ts`**

```typescript
import { faker } from '@faker-js/faker';

export function normalizeLabel(label: string): string {
  return label
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase → spaced
    .replace(/[_\-]/g, ' ')                  // snake_case / kebab-case → spaced
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

interface Rule {
  patterns: RegExp[];
  generate: () => string;
}

const RULES: Rule[] = [
  {
    patterns: [/\bfirst[\s\-_]?name\b/, /\bfname\b/, /\bgiven[\s\-_]?name\b/],
    generate: () => faker.person.firstName(),
  },
  {
    patterns: [/\blast[\s\-_]?name\b/, /\blname\b/, /\bsurname\b/, /\bfamily[\s\-_]?name\b/],
    generate: () => faker.person.lastName(),
  },
  {
    patterns: [/\bfull[\s\-_]?name\b/],
    generate: () => faker.person.fullName(),
  },
  {
    patterns: [/\bemail\b/],
    generate: () => faker.internet.email(),
  },
  {
    patterns: [/\bphone\b/, /\bmobile\b/, /\btel\b/, /\bcell\b/, /\bcontact[\s\-_]?number\b/],
    generate: () => faker.phone.number({ style: 'international' }),
  },
  {
    patterns: [/\baddress\b/, /\bstreet\b/],
    generate: () => faker.location.streetAddress(),
  },
  {
    patterns: [/\bapt\b/, /\bapartment\b/, /\bsuite\b/, /\bunit\b/],
    generate: () => faker.location.secondaryAddress(),
  },
  {
    patterns: [/\bcity\b/, /\btown\b/, /\blocality\b/],
    generate: () => faker.location.city(),
  },
  {
    patterns: [/\bstate\b/, /\bprovince\b/, /\bcounty\b/, /\bregion\b/],
    generate: () => faker.location.state(),
  },
  {
    patterns: [/\bzip\b/, /\bpostal[\s\-_]?code\b/, /\bpost[\s\-_]?code\b/],
    generate: () => faker.location.zipCode(),
  },
  {
    patterns: [/\bcountry\b/, /\bnation\b/],
    generate: () => faker.location.country(),
  },
  {
    patterns: [/\bcompany\b/, /\borganisati?on\b/, /\bemployer\b/, /\bfirm\b/],
    generate: () => faker.company.name(),
  },
  {
    patterns: [/\bjob[\s\-_]?title\b/, /\bposition\b/, /\brole\b/, /\boccupation\b/, /\bdesignation\b/],
    generate: () => faker.person.jobTitle(),
  },
  {
    patterns: [/\bwebsite\b/, /\bhomepage\b/, /\bweb[\s\-_]?url\b/, /\bsite[\s\-_]?url\b/],
    generate: () => faker.internet.url(),
  },
  {
    patterns: [/\busername\b/, /\buser[\s\-_]?name\b/, /\bhandle\b/, /\bscreen[\s\-_]?name\b/],
    generate: () => faker.internet.username(),
  },
  {
    patterns: [/\bpassword\b/, /\bpassphrase\b/, /\bpin\b/],
    generate: () => 'TestPassword123!',
  },
  {
    patterns: [/\bage\b/],
    generate: () => String(faker.number.int({ min: 18, max: 65 })),
  },
  {
    patterns: [/\bdob\b/, /\bdate[\s\-_]?of[\s\-_]?birth\b/, /\bbirthday\b/, /\bbirth[\s\-_]?date\b/],
    generate: () =>
      faker.date
        .birthdate({ min: 18, max: 65, mode: 'age' })
        .toISOString()
        .split('T')[0],
  },
  {
    patterns: [/\bgender\b/, /\bsex\b/],
    generate: () => 'Male',
  },
  {
    patterns: [/\bnationality\b/, /\bcitizenship\b/],
    generate: () => faker.location.country(),
  },
  {
    patterns: [/\bbio\b/, /\babout[\s\-_]?me\b/, /\babout[\s\-_]?yourself\b/],
    generate: () => faker.lorem.paragraph(),
  },
  {
    patterns: [/\bmessage\b/, /\bcomment\b/, /\bnotes?\b/, /\bfeedback\b/, /\bremarks?\b/],
    generate: () => faker.lorem.paragraph(),
  },
  {
    patterns: [/\bdescription\b/],
    generate: () => faker.lorem.paragraph(),
  },
  {
    patterns: [/\bsubject\b/],
    generate: () => faker.lorem.sentence(),
  },
  {
    patterns: [/\bamount\b/, /\bprice\b/, /\bcost\b/, /\bfee\b/],
    generate: () => String(faker.number.int({ min: 10, max: 500 })),
  },
  {
    patterns: [/\bquantity\b/, /\bqty\b/, /\bcount\b/],
    generate: () => String(faker.number.int({ min: 1, max: 10 })),
  },
  {
    patterns: [/\bcard[\s\-_]?number\b/, /\bcredit[\s\-_]?card\b/],
    generate: () => faker.finance.creditCardNumber(),
  },
  {
    patterns: [/\bcvv\b/, /\bcvc\b/, /\bsecurity[\s\-_]?code\b/],
    generate: () => faker.finance.creditCardCVV(),
  },
  {
    patterns: [/\bexpir/],
    generate: () => faker.date.future().toLocaleDateString('en-US', { month: '2-digit', year: '2-digit' }),
  },
  {
    patterns: [/\biban\b/, /\bbank[\s\-_]?account\b/, /\baccount[\s\-_]?number\b/],
    generate: () => faker.finance.iban(),
  },
  {
    patterns: [/\bvoucher\b/, /\bpromo[\s\-_]?code\b/, /\bdiscount[\s\-_]?code\b/, /\bcoupon\b/],
    generate: () => faker.string.alphanumeric(8).toUpperCase(),
  },
  {
    patterns: [/\bsearch\b/, /\bquery\b/, /\bkeyword\b/],
    generate: () => faker.lorem.words(2),
  },
  {
    // Generic "name" — must be last to avoid shadowing specific name patterns above
    patterns: [/\bname\b/],
    generate: () => faker.person.fullName(),
  },
];

export function matchRule(label: string): string | null {
  const normalized = normalizeLabel(label);
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(normalized))) {
      return rule.generate();
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests in `tests/rules.test.ts` pass. If `matchRule('testimonial')` returns a non-null value, check that no rule pattern accidentally matches it and fix.

- [ ] **Step 5: Commit**

```bash
git add src/shared/rules.ts tests/rules.test.ts
git commit -m "feat: add rules engine with 33 label patterns"
```

---

## Task 4: Field Extractor

**Files:**
- Create: `tests/fieldExtractor.test.ts`
- Create: `src/shared/fieldExtractor.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/fieldExtractor.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: Multiple failures — `extractFields` is not defined.

- [ ] **Step 3: Implement `src/shared/fieldExtractor.ts`**

```typescript
import { FieldMeta, FieldType } from './types';

function getFieldType(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
): FieldType {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  const t = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
  const valid: FieldType[] = [
    'text', 'email', 'password', 'number', 'date',
    'datetime-local', 'tel', 'url', 'checkbox', 'radio',
  ];
  return (valid as string[]).includes(t) ? (t as FieldType) : 'other';
}

function resolveLabel(el: HTMLElement, doc: Document): string {
  // Priority 1: aria-label
  const ariaLabel = el.getAttribute('aria-label')?.trim();
  if (ariaLabel) return ariaLabel;

  // Priority 2: aria-labelledby
  const labelledById = el.getAttribute('aria-labelledby');
  if (labelledById) {
    const text = doc.getElementById(labelledById)?.textContent?.trim();
    if (text) return text;
  }

  // Priority 3: <label for="id">
  const id = el.id;
  if (id) {
    const text = doc
      .querySelector<HTMLLabelElement>(`label[for="${id}"]`)
      ?.textContent?.trim();
    if (text) return text;
  }

  // Priority 4: wrapping <label> (strip nested input text)
  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input,select,textarea').forEach((n) => n.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }

  // Priority 5: preceding sibling text content
  let sibling = el.previousElementSibling;
  while (sibling) {
    const text = sibling.textContent?.trim();
    if (text) return text;
    sibling = sibling.previousElementSibling;
  }

  // Priority 6: placeholder / name / id
  return (
    (el as HTMLInputElement).placeholder?.trim() ||
    el.getAttribute('name')?.trim() ||
    el.id?.trim() ||
    ''
  );
}

let _uidCounter = 0;

export function extractFields(doc: Document = document): FieldMeta[] {
  const selector =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
    ':not([type="reset"]):not([type="image"]):not([type="file"]), select, textarea';

  const elements = Array.from(
    doc.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)
  );

  const fields: FieldMeta[] = [];
  const radioGroups = new Set<string>();
  const checkboxGroups = new Set<string>();

  for (const el of elements) {
    const type = getFieldType(el);
    if (type === 'other') continue;

    const elementName = el.getAttribute('name') ?? '';

    // Deduplicate radio groups
    if (type === 'radio' && elementName) {
      if (radioGroups.has(elementName)) continue;
      radioGroups.add(elementName);
    }

    // Deduplicate checkbox groups (same name = group; no name = standalone)
    if (type === 'checkbox' && elementName) {
      if (checkboxGroups.has(elementName)) continue;
      checkboxGroups.add(elementName);
    }

    const uid = `ff-${Date.now()}-${_uidCounter++}`;
    (el as HTMLElement).dataset.ffUid = uid;

    const meta: FieldMeta = {
      id: uid,
      elementId: el.id ?? '',
      elementName,
      label: resolveLabel(el, doc),
      type,
    };

    if (type === 'select') {
      meta.options = Array.from((el as HTMLSelectElement).options)
        .map((o) => o.value)
        .filter((v) => v !== '');
    }

    if (type === 'radio') {
      meta.groupName = elementName;
      meta.options = Array.from(
        doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${elementName}"]`)
      ).map((r) => r.value);
    }

    if (type === 'checkbox' && elementName) {
      meta.groupName = elementName;
    }

    fields.push(meta);
  }

  return fields;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All `fieldExtractor` tests pass. Fix any failures before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/shared/fieldExtractor.ts tests/fieldExtractor.test.ts
git commit -m "feat: add field extractor with 6-level label detection"
```

---

## Task 5: Value Generator

**Files:**
- Create: `tests/valueGenerator.test.ts`
- Create: `src/shared/valueGenerator.ts`

The value generator handles fields where the answer comes from the field **type** (select, checkbox, radio, date, number) rather than the label. It calls `matchRule` for text-like fields and returns `null` when AI fallback is needed.

- [ ] **Step 1: Write the failing test**

Create `tests/valueGenerator.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: Failures — `generateValue` is not defined.

- [ ] **Step 3: Implement `src/shared/valueGenerator.ts`**

```typescript
import { FieldMeta } from './types';
import { matchRule } from './rules';
import { faker } from '@faker-js/faker';

export function generateValue(field: FieldMeta): string | boolean | null {
  switch (field.type) {
    case 'select': {
      if (!field.options || field.options.length === 0) return null;
      return field.options.length > 1 ? field.options[1] : field.options[0];
    }

    case 'checkbox':
      return true;

    case 'radio':
      return field.options?.[0] ?? null;

    case 'date': {
      const d = faker.date.past({ years: 5 });
      return d.toISOString().split('T')[0];
    }

    case 'datetime-local': {
      const d = faker.date.past({ years: 5 });
      return d.toISOString().slice(0, 16);
    }

    case 'number':
      return String(faker.number.int({ min: 1, max: 100 }));

    default:
      return matchRule(field.label);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All tests in `tests/valueGenerator.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/valueGenerator.ts tests/valueGenerator.test.ts
git commit -m "feat: add value generator for type-based field filling"
```

---

## Task 6: Content Script

**Files:**
- Modify: `src/content/index.ts`

- [ ] **Step 1: Implement `src/content/index.ts`**

Replace the placeholder content:

```typescript
import { extractFields } from '../shared/fieldExtractor';
import { FillInstruction, FillResult, MessageToContent } from '../shared/types';

// Use native setter so React controlled inputs pick up the change
const nativeInputSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value'
)?.set;
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  'value'
)?.set;

function applyValues(instructions: FillInstruction[]): FillResult {
  let fieldsFilled = 0;
  let fieldsSkipped = 0;

  for (const instruction of instructions) {
    const el = document.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(`[data-ff-uid="${instruction.fieldId}"]`);

    if (!el) {
      fieldsSkipped++;
      continue;
    }

    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      el.checked = instruction.value === true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      fieldsFilled++;
      continue;
    }

    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const radio = document.querySelector<HTMLInputElement>(
        `input[type="radio"][name="${el.name}"][value="${instruction.value}"]`
      );
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        fieldsFilled++;
      } else {
        fieldsSkipped++;
      }
      continue;
    }

    if (el instanceof HTMLSelectElement) {
      el.value = String(instruction.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      fieldsFilled++;
      continue;
    }

    // Text-like inputs and textareas — use native setter for React compatibility
    if (el instanceof HTMLTextAreaElement) {
      nativeTextareaSetter?.call(el, String(instruction.value));
    } else {
      nativeInputSetter?.call(el, String(instruction.value));
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    fieldsFilled++;
  }

  return {
    fieldsFilled,
    fieldsSkipped,
    aiFieldCount: 0,
    timestamp: Date.now(),
  };
}

chrome.runtime.onMessage.addListener(
  (message: MessageToContent, _sender, sendResponse) => {
    if (message.type === 'EXTRACT_FIELDS') {
      const fields = extractFields(document);
      sendResponse({ fields });
      return false;
    }

    if (message.type === 'APPLY_VALUES') {
      applyValues(message.instructions);
      sendResponse({ ok: true });
      return false;
    }
  }
);
```

- [ ] **Step 2: Build the extension**

```bash
npm run build
```

Expected: `dist/` updated with no TypeScript errors.

- [ ] **Step 3: Load in Chrome and verify field extraction**

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked** → select the `dist/` folder
4. Navigate to any page with a form
5. Open `chrome://extensions` → click **Service Worker** under Form Filler → **Inspect** to open the service worker DevTools
6. In the service worker console, run:

```javascript
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const result = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_FIELDS' });
console.log(result);
```

Expected: An object `{ fields: [...] }` logged, with each field having a non-empty `label` and correct `type`.

- [ ] **Step 4: Commit**

```bash
git add src/content/index.ts
git commit -m "feat: add content script with field extraction and value application"
```

---

## Task 7: Background Service Worker

**Files:**
- Modify: `src/background/index.ts`

- [ ] **Step 1: Implement `src/background/index.ts`**

Replace the placeholder content:

```typescript
import { generateValue } from '../shared/valueGenerator';
import {
  ExtractFieldsResponse,
  FieldMeta,
  FillInstruction,
  FillResult,
  MessageToBackground,
  StoredSettings,
} from '../shared/types';

async function getSettings(): Promise<StoredSettings> {
  const r = await chrome.storage.sync.get(['claudeApiKey', 'lastFillResult']);
  return { claudeApiKey: r.claudeApiKey ?? '', lastFillResult: r.lastFillResult };
}

async function getAiValues(
  labels: string[],
  apiKey: string
): Promise<Record<string, string>> {
  const cacheKeys = labels.map((l) => `ai_cache_${l}`);
  const cached = await chrome.storage.local.get(cacheKeys);

  const uncached = labels.filter((l) => !cached[`ai_cache_${l}`]);
  const result: Record<string, string> = {};

  for (const label of labels) {
    if (cached[`ai_cache_${label}`]) result[label] = cached[`ai_cache_${label}`];
  }

  if (uncached.length === 0 || !apiKey) return result;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content:
              `You are filling a web form with realistic fake data for testing. ` +
              `Return a JSON object mapping each field label to an appropriate fake value. ` +
              `Be concise — values should be realistic but brief.\n\n` +
              `Fields: ${JSON.stringify(uncached)}`,
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`Claude API ${res.status}`);

    const data = await res.json();
    const text: string = data.content[0]?.text ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');

    const aiMap: Record<string, string> = JSON.parse(jsonMatch[0]);

    const toCache: Record<string, string> = {};
    for (const [label, value] of Object.entries(aiMap)) {
      result[label] = value;
      toCache[`ai_cache_${label}`] = value;
    }
    await chrome.storage.local.set(toCache);
  } catch (e) {
    console.error('[FormFiller] AI error:', e);
  }

  return result;
}

async function runFill(tabId: number): Promise<FillResult> {
  // 1. Extract fields from active page
  const { fields } = (await chrome.tabs.sendMessage(tabId, {
    type: 'EXTRACT_FIELDS',
  })) as ExtractFieldsResponse;

  const instructions: FillInstruction[] = [];
  const aiNeeded: FieldMeta[] = [];

  // 2. Generate values via rules engine / type logic
  for (const field of fields) {
    const value = generateValue(field);
    if (value !== null) {
      instructions.push({ fieldId: field.id, value });
    } else {
      aiNeeded.push(field);
    }
  }

  // 3. AI fallback for unmatched text fields
  let aiFieldCount = 0;
  if (aiNeeded.length > 0) {
    const settings = await getSettings();
    const uniqueLabels = [...new Set(aiNeeded.map((f) => f.label))];
    const aiValues = await getAiValues(uniqueLabels, settings.claudeApiKey);

    for (const field of aiNeeded) {
      const value = aiValues[field.label];
      if (value !== undefined) {
        instructions.push({ fieldId: field.id, value });
        aiFieldCount++;
      }
    }
  }

  // 4. Apply values
  await chrome.tabs.sendMessage(tabId, { type: 'APPLY_VALUES', instructions });

  const result: FillResult = {
    fieldsFilled: instructions.length,
    fieldsSkipped: fields.length - instructions.length,
    aiFieldCount,
    timestamp: Date.now(),
  };

  await chrome.storage.sync.set({ lastFillResult: result });
  return result;
}

// Keyboard shortcut handler
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'fill-form') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await runFill(tab.id);
  } catch (e) {
    console.error('[FormFiller] Fill failed:', e);
  }
});

// Popup message handler
chrome.runtime.onMessage.addListener(
  (message: MessageToBackground, _sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case 'FILL_REQUEST': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) {
            sendResponse({ type: 'FILL_ERROR', error: 'No active tab found' });
            return;
          }
          try {
            const result = await runFill(tab.id);
            sendResponse({ type: 'FILL_COMPLETE', result });
          } catch (e) {
            sendResponse({ type: 'FILL_ERROR', error: String(e) });
          }
          break;
        }

        case 'SAVE_API_KEY':
          await chrome.storage.sync.set({ claudeApiKey: message.key });
          sendResponse({ type: 'SETTINGS', settings: await getSettings() });
          break;

        case 'GET_SETTINGS':
          sendResponse({ type: 'SETTINGS', settings: await getSettings() });
          break;

        case 'CLEAR_AI_CACHE': {
          const all = await chrome.storage.local.get(null);
          const cacheKeys = Object.keys(all).filter((k) => k.startsWith('ai_cache_'));
          if (cacheKeys.length > 0) await chrome.storage.local.remove(cacheKeys);
          sendResponse({ type: 'SETTINGS', settings: await getSettings() });
          break;
        }
      }
    })();
    return true; // keep channel open for async response
  }
);
```

- [ ] **Step 2: Build and reload the extension**

```bash
npm run build
```

In `chrome://extensions`, click the **reload** icon on the Form Filler card.

- [ ] **Step 3: Test the hotkey**

1. Navigate to any page with a form
2. Press `Ctrl+Shift+F`
3. Observe form fields fill

Expected: Standard fields (name, email, phone) fill instantly. If a Claude API key is not set, unusual fields are skipped silently.

- [ ] **Step 4: Test with a Claude API key** *(requires a valid key)*

Open the extension's service worker DevTools: `chrome://extensions` → Form Filler → **Service Worker** → **Inspect**.

In the console:
```javascript
chrome.storage.sync.set({ claudeApiKey: 'sk-ant-YOUR_KEY_HERE' })
```

Navigate to a page with a "testimonial" or "reason" field and press `Ctrl+Shift+F`.

Expected: The unusual field fills after a brief pause (~1–2s for first call; cached thereafter).

- [ ] **Step 5: Commit**

```bash
git add src/background/index.ts
git commit -m "feat: add background service worker with rules engine, AI fallback, and hotkey"
```

---

## Task 8: Popup UI

**Files:**
- Modify: `src/popup/index.html`
- Modify: `src/popup/index.ts`

- [ ] **Step 1: Implement `src/popup/index.html`**

Replace the placeholder:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Form Filler</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 240px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1a1a2e;
      color: #ccc;
      font-size: 13px;
    }
    .header {
      background: #12122a;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid #2a2a4a;
    }
    .logo {
      width: 22px; height: 22px;
      background: #6c63ff;
      border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: #fff;
    }
    .title { font-size: 14px; font-weight: 600; color: #fff; flex: 1; }
    .view { display: none; }
    .view.active { display: block; }
    .body { padding: 14px; }
    .btn-fill {
      width: 100%;
      background: #6c63ff;
      color: #fff;
      border: none;
      padding: 10px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.3px;
    }
    .btn-fill:hover { background: #7c73ff; }
    .btn-fill:disabled { background: #3a3a6a; cursor: default; }
    .hint { text-align: center; color: #555; font-size: 11px; margin-top: 6px; }
    .status-box {
      background: #12122a;
      border: 1px solid #2a2a4a;
      border-radius: 4px;
      padding: 8px 10px;
      margin-top: 10px;
    }
    .status-box.success { background: #0d2a1a; border-color: #2d6a4f; }
    .status-box.error { background: #2a0d0d; border-color: #6a2d2d; }
    .status-label { font-size: 10px; color: #555; }
    .status-text { font-size: 11px; margin-top: 2px; color: #888; }
    .status-text.ok { color: #57cc99; }
    .status-text.err { color: #cc5757; }
    .footer {
      border-top: 1px solid #2a2a4a;
      padding: 8px 14px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .key-label { font-size: 10px; color: #555; }
    .key-status { font-size: 10px; margin-left: 4px; }
    .key-status.set { color: #57cc99; }
    .key-status.unset { color: #cc5757; }
    .settings-link { font-size: 10px; color: #6c63ff; cursor: pointer; margin-left: auto; text-decoration: none; }
    .settings-link:hover { text-decoration: underline; }
    .settings-body { padding: 14px; display: flex; flex-direction: column; gap: 12px; }
    .field-label { font-size: 10px; color: #888; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .field-input {
      width: 100%; background: #12122a;
      border: 1px solid #3a3a5a; border-radius: 4px;
      padding: 6px 8px; color: #ccc; font-size: 11px;
      font-family: monospace;
    }
    .field-hint { font-size: 10px; color: #555; margin-top: 3px; }
    .shortcut-display { display: flex; gap: 3px; align-items: center; }
    .kbd {
      background: #12122a; border: 1px solid #3a3a5a;
      border-radius: 3px; padding: 3px 6px;
      color: #ccc; font-size: 10px; font-family: monospace;
    }
    .kbd.accent { background: #6c63ff; border-color: #9d9aff; color: #fff; }
    .btn-danger {
      background: #2a1a1a; border: 1px solid #4a2a2a;
      border-radius: 4px; padding: 7px 10px;
      color: #cc5757; font-size: 11px; cursor: pointer; width: 100%; text-align: left;
    }
    .btn-danger:hover { background: #3a1a1a; }
    .back-btn { font-size: 11px; color: #6c63ff; cursor: pointer; background: none; border: none; }
    .back-btn:hover { text-decoration: underline; }
    .settings-title { font-size: 14px; font-weight: 600; color: #fff; margin-left: 4px; }
    .save-btn {
      background: #6c63ff; color: #fff; border: none;
      padding: 7px; border-radius: 4px; font-size: 12px;
      cursor: pointer; width: 100%;
    }
    .save-btn:hover { background: #7c73ff; }
    .save-feedback { font-size: 10px; color: #57cc99; text-align: center; margin-top: 4px; display: none; }
  </style>
</head>
<body>

  <!-- Main view -->
  <div id="view-main" class="view active">
    <div class="header">
      <div class="logo">F</div>
      <span class="title">Form Filler</span>
    </div>
    <div class="body">
      <button id="btn-fill" class="btn-fill">⚡ Fill All Fields</button>
      <p class="hint">or press Ctrl+Shift+F</p>
      <div id="status-box" class="status-box">
        <div class="status-label">Last fill</div>
        <div id="status-text" class="status-text">No fills yet</div>
      </div>
    </div>
    <div class="footer">
      <span class="key-label">Claude API key:</span>
      <span id="key-status" class="key-status unset">Not set</span>
      <a class="settings-link" id="open-settings">Settings →</a>
    </div>
  </div>

  <!-- Settings view -->
  <div id="view-settings" class="view">
    <div class="header">
      <button class="back-btn" id="btn-back">←</button>
      <span class="settings-title">Settings</span>
    </div>
    <div class="settings-body">
      <div>
        <div class="field-label">Claude API Key</div>
        <input id="api-key-input" class="field-input" type="password" placeholder="sk-ant-..." autocomplete="off" />
        <div class="field-hint">Used only for unusual field labels</div>
      </div>
      <div>
        <div class="field-label">Shortcut</div>
        <div class="shortcut-display">
          <span class="kbd">Ctrl</span>
          <span>+</span>
          <span class="kbd">Shift</span>
          <span>+</span>
          <span class="kbd accent">F</span>
        </div>
        <div class="field-hint" style="margin-top:4px">
          Change at <code>chrome://extensions/shortcuts</code>
        </div>
      </div>
      <button id="btn-save-key" class="save-btn">Save API Key</button>
      <div id="save-feedback" class="save-feedback">Saved ✓</div>
      <button id="btn-clear-cache" class="btn-danger">🗑 Clear AI Cache</button>
    </div>
  </div>

  <script type="module" src="./index.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Implement `src/popup/index.ts`**

Replace the placeholder:

```typescript
import {
  MessageFromBackground,
  MessageToBackground,
  StoredSettings,
} from '../shared/types';

function sendToBackground(msg: MessageToBackground): Promise<MessageFromBackground> {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function renderSettings(settings: StoredSettings) {
  const keyStatus = document.getElementById('key-status')!;
  const keyInput = document.getElementById('api-key-input') as HTMLInputElement;

  if (settings.claudeApiKey) {
    keyStatus.textContent = 'Set ✓';
    keyStatus.className = 'key-status set';
    keyInput.placeholder = 'sk-ant-••••••••••••';
  } else {
    keyStatus.textContent = 'Not set';
    keyStatus.className = 'key-status unset';
    keyInput.placeholder = 'sk-ant-...';
  }
}

function renderLastFill(settings: StoredSettings) {
  const box = document.getElementById('status-box')!;
  const text = document.getElementById('status-text')!;

  if (!settings.lastFillResult) {
    text.textContent = 'No fills yet';
    text.className = 'status-text';
    box.className = 'status-box';
    return;
  }

  const { fieldsFilled, aiFieldCount, timestamp } = settings.lastFillResult;
  const ago = Math.round((Date.now() - timestamp) / 1000);
  const timeStr = ago < 60 ? 'just now' : ago < 3600 ? `${Math.floor(ago / 60)}m ago` : `${Math.floor(ago / 3600)}h ago`;
  const aiStr = aiFieldCount > 0 ? ` (${aiFieldCount} via AI)` : '';
  text.textContent = `${fieldsFilled} fields filled${aiStr} — ${timeStr}`;
  text.className = 'status-text ok';
  box.className = 'status-box success';
}

function showView(id: 'view-main' | 'view-settings') {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(id)!.classList.add('active');
}

async function init() {
  const response = await sendToBackground({ type: 'GET_SETTINGS' });
  if (response?.type === 'SETTINGS') {
    renderSettings(response.settings);
    renderLastFill(response.settings);
  }

  // Fill button
  document.getElementById('btn-fill')!.addEventListener('click', async () => {
    const btn = document.getElementById('btn-fill') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Filling…';

    const res = await sendToBackground({ type: 'FILL_REQUEST' });

    if (res?.type === 'FILL_COMPLETE') {
      renderLastFill({ claudeApiKey: '', lastFillResult: res.result });
      const box = document.getElementById('status-box')!;
      box.className = 'status-box success';
    } else if (res?.type === 'FILL_ERROR') {
      const text = document.getElementById('status-text')!;
      text.textContent = res.error;
      text.className = 'status-text err';
      document.getElementById('status-box')!.className = 'status-box error';
    }

    btn.disabled = false;
    btn.textContent = '⚡ Fill All Fields';
  });

  // Open settings
  document.getElementById('open-settings')!.addEventListener('click', () => showView('view-settings'));
  document.getElementById('btn-back')!.addEventListener('click', () => showView('view-main'));

  // Save API key
  document.getElementById('btn-save-key')!.addEventListener('click', async () => {
    const key = (document.getElementById('api-key-input') as HTMLInputElement).value.trim();
    const res = await sendToBackground({ type: 'SAVE_API_KEY', key });
    if (res?.type === 'SETTINGS') renderSettings(res.settings);
    const feedback = document.getElementById('save-feedback')!;
    feedback.style.display = 'block';
    setTimeout(() => (feedback.style.display = 'none'), 2000);
  });

  // Clear AI cache
  document.getElementById('btn-clear-cache')!.addEventListener('click', async () => {
    await sendToBackground({ type: 'CLEAR_AI_CACHE' });
    const btn = document.getElementById('btn-clear-cache')!;
    btn.textContent = '✓ Cache cleared';
    setTimeout(() => (btn.textContent = '🗑 Clear AI Cache'), 2000);
  });
}

init();
```

- [ ] **Step 3: Build and reload extension**

```bash
npm run build
```

Reload extension in `chrome://extensions`.

- [ ] **Step 4: Verify the popup**

1. Click the Form Filler icon in the toolbar — popup should open
2. Check the default state: "No fills yet", API key shows "Not set"
3. Click **Settings →** — settings view should slide in
4. Enter a test API key, click **Save API Key** — "Saved ✓" feedback appears
5. Click **←** to go back — "Claude API key: Set ✓" appears in the footer
6. Navigate to a form page, click **⚡ Fill All Fields** — form fills; status updates

- [ ] **Step 5: Commit**

```bash
git add src/popup/index.html src/popup/index.ts
git commit -m "feat: add popup UI with fill button, status display, and settings"
```

---

## Task 9: End-to-End Verification

- [ ] **Step 1: Test on a standard HTML form**

Navigate to `https://www.w3schools.com/html/tryit.asp?filename=tryhtml_form_submit` or any registration form.

Press `Ctrl+Shift+F`.

Expected: Name, email, password, and other standard fields fill within ~200ms. Checkboxes check the first option. Select dropdowns pick the second option.

- [ ] **Step 2: Test on a React-managed form**

Navigate to a page using React with controlled inputs (e.g. any modern SPA with a login form).

Press `Ctrl+Shift+F`.

Expected: Input values appear AND the React form state updates (submit button enables, validation clears, etc.). If React state does not update, confirm the `nativeInputSetter` approach is working — check that `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set` is non-null in the content script context.

- [ ] **Step 3: Test AI fallback with an unusual field**

Find or create a page with a field labeled "testimonial" or "reason for selling".

Ensure a Claude API key is set in Settings.

Press `Ctrl+Shift+F`.

Expected: After 1–3 seconds, the unusual field fills with contextually appropriate text. Subsequent presses fill it instantly (cached).

- [ ] **Step 4: Test keyboard shortcut vs popup parity**

Perform a fill via hotkey, then via popup button, on the same page. Both should produce equivalent results.

- [ ] **Step 5: Commit any fixes**

```bash
git add -p   # stage only changed files
git commit -m "fix: <describe what was fixed>"
```

---

## Verification Checklist

- [ ] `npm test` passes (rules engine, field extractor, value generator)
- [ ] Extension loads in Chrome without errors
- [ ] Standard form fields fill via hotkey in < 300ms
- [ ] Select picks 2nd option; checkbox checks first in group; radio selects first option
- [ ] React/Vue inputs update their framework state after filling
- [ ] Unusual labels ("testimonial") fill via Claude Haiku when API key is set
- [ ] AI responses are cached — second fill of same labels is instant
- [ ] Popup shows correct fill count and AI usage after each fill
- [ ] API key persists across browser restarts
- [ ] Clear AI Cache removes cached values from `chrome.storage.local`
