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
  groupLabel?: string;  // group question (radio fieldset <legend>), distinct from per-option label
  pattern?: string;     // HTML pattern attribute (regex, no anchors)
  maxLength?: number;   // HTML maxlength attribute
  minLength?: number;   // HTML minlength attribute
  min?: string;         // HTML min attribute (number/date inputs)
  max?: string;         // HTML max attribute (number/date inputs)
  required?: boolean;   // required / aria-required="true"
  hint?: string;        // hint/help text near the field
  datePart?: 'day' | 'month' | 'year';  // member of a split date triplet
  dateGroupId?: string;                  // shared across the three triplet siblings
}

export interface FillInstruction {
  fieldId: string;      // matches FieldMeta.id (data-ff-uid)
  value: string | boolean;
}

export interface FillResult {
  fieldsFilled: number;
  fieldsSkipped: number;
  timestamp: number;
}

export interface StoredSettings {
  lastFillResult?: FillResult;
  // When on, fills with deliberately-invalid data to exercise form validation.
  testValidationMode?: boolean;
  // Which step the form-wide invalid-data cycle is on; incremented after each
  // invalid-mode fill so repeated fills walk the form's active violation kinds (one
  // kind per pass: format → below-min length → above-max length → below-min value →
  // above-max value → empty).
  invalidCycleStep?: number;
}

export type ToastState = 'loading' | 'success' | 'error';

// Messages sent TO content script
export type MessageToContent =
  | { type: 'EXTRACT_FIELDS' }
  | { type: 'APPLY_VALUES'; instructions: FillInstruction[]; fireValidation?: boolean }
  | { type: 'TOAST'; state: ToastState; text: string };

// Messages sent FROM content script back to background
export interface ExtractFieldsResponse {
  fields: FieldMeta[];
}

// Messages sent FROM content script to background (unsolicited)
export type MessageFromContent =
  | { type: 'VALIDATION_ERRORS_APPEARED'; fields: FieldMeta[] };

// Messages sent TO background (from popup)
export type MessageToBackground =
  | { type: 'FILL_REQUEST' }
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_TEST_MODE'; enabled: boolean };

// Messages sent FROM background to popup
export type MessageFromBackground =
  | { type: 'FILL_COMPLETE'; result: FillResult }
  | { type: 'FILL_ERROR'; error: string }
  | { type: 'SETTINGS'; settings: StoredSettings };
