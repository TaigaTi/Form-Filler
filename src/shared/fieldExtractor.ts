import { FieldMeta, FieldType } from './types';

function getFieldType(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
): FieldType {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  const t = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
  if (t === 'search') return 'text'; // search behaves identically to text for filling
  const valid: FieldType[] = [
    'text', 'email', 'password', 'number', 'date',
    'datetime-local', 'tel', 'url', 'checkbox', 'radio',
  ];
  return (valid as string[]).includes(t) ? (t as FieldType) : 'other';
}

const HINT_CLASS_RE = /hint|help|note|caption|helper|info|format|description|error|invalid|message|alert|validation|feedback|warning|danger|required/;

function resolveHint(el: HTMLElement, doc: Document): string {
  // aria-describedby (highest priority — explicit association)
  const describedById = el.getAttribute('aria-describedby');
  if (describedById) {
    for (const id of describedById.trim().split(/\s+/)) {
      const text = doc.getElementById(id)?.textContent?.trim();
      if (text) return text;
    }
  }

  // aria-errormessage (newer ARIA pattern for inline errors)
  const errorMsgId = el.getAttribute('aria-errormessage');
  if (errorMsgId) {
    const text = doc.getElementById(errorMsgId)?.textContent?.trim();
    if (text) return text;
  }

  // Error-summary link that targets this field by id (GOV.UK pattern): the
  // message lives in a summary box elsewhere on the page, linked via href="#id".
  // Carries requirements like "Please write at least 20 characters".
  if (el.id) {
    const summaryLinks = doc.querySelectorAll<HTMLAnchorElement>(
      '[role="alert"] a[href], [data-error-summary] a[href], .error-summary a[href], .govuk-error-summary a[href]'
    );
    for (const link of summaryLinks) {
      if (link.getAttribute('href') === `#${el.id}`) {
        const text = link.textContent?.trim();
        if (text) return text;
      }
    }
  }

  const matchesHintEl = (node: Element): boolean => {
    const tag = node.tagName.toLowerCase();
    const cls = (node.className ?? '').toLowerCase();
    const role = node.getAttribute('role') ?? '';
    return tag === 'small' || HINT_CLASS_RE.test(cls) || role === 'alert' || role === 'status';
  };

  // Preceding siblings — validation errors are often injected above the input
  let prev = el.previousElementSibling;
  let prevChecked = 0;
  while (prev && prevChecked < 3) {
    if (matchesHintEl(prev)) {
      const text = prev.textContent?.trim();
      if (text) return text;
    }
    prev = prev.previousElementSibling;
    prevChecked++;
  }

  // Following siblings — static hint text
  let next = el.nextElementSibling;
  let nextChecked = 0;
  while (next && nextChecked < 3) {
    if (matchesHintEl(next)) {
      const text = next.textContent?.trim();
      if (text) return text;
    }
    next = next.nextElementSibling;
    nextChecked++;
  }

  // Parent container — some frameworks inject errors inside the field wrapper
  // (e.g. Bootstrap .form-group, GOV.UK .govuk-form-group)
  const parent = el.parentElement;
  if (parent) {
    for (let child = parent.firstElementChild; child; child = child.nextElementSibling) {
      if (child === el) continue;
      if (matchesHintEl(child)) {
        const text = child.textContent?.trim();
        if (text) return text;
      }
    }
  }

  return '';
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
      .querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`)
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

  // Priority 5: preceding sibling text content — capped at 3 hops (mirrors the
  // prevChecked < 3 walk in resolveHint) so we don't grab unrelated far-away text
  let sibling = el.previousElementSibling;
  let siblingChecked = 0;
  while (sibling && siblingChecked < 3) {
    const text = sibling.textContent?.trim();
    if (text) return text;
    sibling = sibling.previousElementSibling;
    siblingChecked++;
  }

  // Priority 6: placeholder / name / id
  return (
    (el as HTMLInputElement).placeholder?.trim() ||
    el.getAttribute('name')?.trim() ||
    el.id?.trim() ||
    ''
  );
}

/**
 * The group question for a radio set, which lives in the enclosing
 * <fieldset>'s <legend> (or the fieldset's aria-labelledby) — distinct from each
 * radio's own per-option label ("Yes"/"No"). Returns '' when not in a fieldset.
 */
function resolveGroupLabel(el: HTMLElement, doc: Document): string {
  const fieldset = el.closest('fieldset');
  if (!fieldset) return '';

  const labelledBy = fieldset.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = doc.getElementById(labelledBy)?.textContent?.trim();
    if (text) return text;
  }

  return fieldset.querySelector(':scope > legend')?.textContent?.trim() ?? '';
}

/**
 * The label text for a single radio/checkbox option — the human-meaningful
 * identifier when the `value` attribute is absent or uninformative (frameworks
 * like gov-bb's render value-less radios that all report value "on"). Returns ''
 * when the option has no associated label, so callers can fall back to `value`.
 * Unlike `resolveLabel`, this deliberately omits the name/id/sibling fallbacks,
 * which are not option-specific.
 */
export function resolveOptionLabel(el: HTMLElement, doc: Document): string {
  const aria = el.getAttribute('aria-label')?.trim();
  if (aria) return aria;

  const id = el.id;
  if (id) {
    const text = doc.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim();
    if (text) return text;
  }

  const parentLabel = el.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input,select,textarea').forEach((n) => n.remove());
    const text = clone.textContent?.trim();
    if (text) return text;
  }

  return '';
}

let _uidCounter = 0;

type DatePart = 'day' | 'month' | 'year';

/**
 * Finds the nearest <label> text for an input — used only for date-triplet detection,
 * so it returns the raw label text (not the resolved label from resolveLabel).
 */
function findDatePartLabel(el: HTMLInputElement, doc: Document): DatePart | null {
  let text = '';

  // Wrapping <label>
  const parentLabel = el.closest('label');
  if (parentLabel) text = parentLabel.textContent ?? '';

  // <label for="id"> — only if id is set
  if (!text && el.id) {
    text = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent ?? '';
  }

  // Previous sibling <label>
  if (!text) {
    let s = el.previousElementSibling;
    while (s && !text) {
      if (s.tagName.toLowerCase() === 'label') text = s.textContent ?? '';
      s = s.previousElementSibling;
    }
  }

  // Sibling <label> inside the same parent (covers <div><label>Day</label><input></div>)
  if (!text && el.parentElement) {
    const lbl = el.parentElement.querySelector('label');
    if (lbl) text = lbl.textContent ?? '';
  }

  const normalized = text.trim().toLowerCase();
  if (normalized === 'day') return 'day';
  if (normalized === 'month') return 'month';
  if (normalized === 'year') return 'year';
  return null;
}

// Inputs that can hold a numeric date part. Beyond <input type="number">, split
// date fields are commonly rendered as text inputs with inputmode="numeric"
// (e.g. the GovBB alpha site). findDatePartLabel + the all-three co-location
// requirement below filter out anything that isn't an actual Day/Month/Year box,
// so casting this net wide can't produce false positives.
const DATE_PART_INPUT_SELECTOR =
  'input[type="number"], input[type="text"], input[type="tel"], input:not([type]), input[inputmode="numeric"]';

/**
 * Scans the document for Day/Month/Year input triplets and tags them with a shared
 * group id. A triplet is any ancestor (typically <fieldset data-date-field>) that
 * contains one Day, one Month, and one Year numeric input.
 */
function preprocessDateTriplets(
  doc: Document
): WeakMap<HTMLInputElement, { part: DatePart; groupId: string }> {
  const map = new WeakMap<HTMLInputElement, { part: DatePart; groupId: string }>();

  const candidateInputs = Array.from(
    doc.querySelectorAll<HTMLInputElement>(DATE_PART_INPUT_SELECTOR)
  );
  const partOf = new Map<HTMLInputElement, DatePart>();
  for (const inp of candidateInputs) {
    const part = findDatePartLabel(inp, doc);
    if (part) partOf.set(inp, part);
  }

  // For each Day input, walk up to the lowest ancestor that also contains a Month
  // and a Year input. That ancestor is the triplet's container.
  const claimed = new WeakSet<HTMLInputElement>();
  for (const [dayInp, p] of partOf) {
    if (p !== 'day' || claimed.has(dayInp)) continue;

    let container: Element | null = dayInp.parentElement;
    let monthInp: HTMLInputElement | undefined;
    let yearInp: HTMLInputElement | undefined;

    while (container) {
      const descendants = Array.from(
        container.querySelectorAll<HTMLInputElement>(DATE_PART_INPUT_SELECTOR)
      );
      monthInp = descendants.find((i) => partOf.get(i) === 'month' && !claimed.has(i));
      yearInp = descendants.find((i) => partOf.get(i) === 'year' && !claimed.has(i));
      if (monthInp && yearInp) break;
      container = container.parentElement;
    }

    if (!monthInp || !yearInp) continue;

    const groupId = `dg-${Date.now()}-${_uidCounter++}`;
    map.set(dayInp, { part: 'day', groupId });
    map.set(monthInp, { part: 'month', groupId });
    map.set(yearInp, { part: 'year', groupId });
    claimed.add(dayInp);
    claimed.add(monthInp);
    claimed.add(yearInp);
  }

  return map;
}

export function extractFields(doc: Document = document): FieldMeta[] {
  const selector =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"])' +
    ':not([type="reset"]):not([type="image"]):not([type="file"]), select, textarea';

  const elements = Array.from(
    doc.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)
  );

  const dateTriplets = preprocessDateTriplets(doc);

  const fields: FieldMeta[] = [];
  const radioGroups = new Set<string>();

  for (const el of elements) {
    const type = getFieldType(el);
    if (type === 'other') continue;

    const elementName = el.getAttribute('name') ?? '';

    // Deduplicate radio groups — only the first radio per name is extracted;
    // applyValues looks up the right radio by value at fill time.
    if (type === 'radio' && elementName) {
      if (radioGroups.has(elementName)) continue;
      radioGroups.add(elementName);
    }

    // Checkboxes are NOT deduplicated — each checkbox (even within a shared-name
    // group) is independently fillable and should be individually checked.

    const existingUid = (el as HTMLElement).dataset.ffUid;
    const uid = existingUid ?? `ff-${Date.now()}-${_uidCounter++}`;
    (el as HTMLElement).dataset.ffUid = uid;

    const meta: FieldMeta = {
      id: uid,
      elementId: el.id ?? '',
      elementName,
      label: resolveLabel(el, doc),
      type,
    };

    const pattern = el.getAttribute('pattern');
    if (pattern) meta.pattern = pattern;

    const maxLengthAttr = el.getAttribute('maxlength');
    if (maxLengthAttr !== null) {
      const n = parseInt(maxLengthAttr, 10);
      if (n > 0) meta.maxLength = n;
    }

    const minLengthAttr = el.getAttribute('minlength');
    if (minLengthAttr !== null) {
      const n = parseInt(minLengthAttr, 10);
      if (n > 0) meta.minLength = n;
    }

    const minAttr = el.getAttribute('min');
    if (minAttr !== null) meta.min = minAttr;

    const maxAttr = el.getAttribute('max');
    if (maxAttr !== null) meta.max = maxAttr;

    if (el.hasAttribute('required') || el.getAttribute('aria-required') === 'true') {
      meta.required = true;
    }

    const hint = resolveHint(el, doc);
    if (hint) meta.hint = hint;

    // Tag date-triplet members so the value generator can emit a coherent date
    if (el instanceof HTMLInputElement) {
      const datePart = dateTriplets.get(el);
      if (datePart) {
        meta.datePart = datePart.part;
        meta.dateGroupId = datePart.groupId;
      }
    }

    if (type === 'select') {
      meta.options = Array.from((el as HTMLSelectElement).options)
        .filter((o) => !o.disabled)
        .map((o) => o.value)
        .filter((v) => v !== '');
    }

    if (type === 'radio') {
      meta.groupName = elementName;
      // Prefer each option's label text over its `value`: value-less radios all
      // report "on", so the label is the only way to tell options apart (and to
      // pick the right one at fill time). Fall back to value when there's no label.
      meta.options = Array.from(
        doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(elementName)}"]`)
      ).map((r) => resolveOptionLabel(r, doc) || r.value);
      const groupLabel = resolveGroupLabel(el, doc);
      if (groupLabel) meta.groupLabel = groupLabel;
    }

    if (type === 'checkbox' && elementName) {
      meta.groupName = elementName;
    }

    fields.push(meta);
  }

  return fields;
}
