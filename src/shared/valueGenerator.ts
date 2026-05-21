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

    case 'number': {
      const min = field.min !== undefined ? parseFloat(field.min) : 1;
      const max = field.max !== undefined ? parseFloat(field.max) : 100;
      return String(faker.number.int({
        min: isNaN(min) ? 1 : min,
        max: isNaN(max) ? 100 : max,
      }));
    }

    default: {
      const value = matchRule(field.label);
      if (value === null) return null;
      if (field.maxLength && value.length > field.maxLength) {
        return value.slice(0, field.maxLength);
      }
      return value;
    }
  }
}
