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
  pattern?: string;     // HTML pattern attribute (regex, no anchors)
  maxLength?: number;   // HTML maxlength attribute
  min?: string;         // HTML min attribute (number/date inputs)
  max?: string;         // HTML max attribute (number/date inputs)
  hint?: string;        // hint/help text near the field
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
