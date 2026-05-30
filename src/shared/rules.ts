import { faker } from '@faker-js/faker';

export function normalizeLabel(label: string): string {
  return label
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase → spaced
    .replace(/[_\-]/g, ' ')                  // snake_case / kebab-case → spaced
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when a label reads like a "confirm/re-enter" field (e.g. "Confirm Email",
 * "Re-enter your email"). Used to reuse the value of the field being confirmed
 * instead of generating a fresh, mismatched one.
 */
export function isConfirmationLabel(label: string): boolean {
  const n = normalizeLabel(label);
  return /\b(confirm|confirmation|re ?enter|re ?type|repeat|verify)\b/.test(n);
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
    // Must precede the generic `\bname\b` rule, which would otherwise emit a full
    // name (e.g. "Bert Steuber PhD") into a middle-name field.
    patterns: [/\bmiddle[\s\-_]?name\b/],
    generate: () => faker.person.middleName(),
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
    // Barbados number: country code 1, area code 246, then a 7-digit local
    // number (NANP exchange first digit is 2-9). faker.phone.number() defaults
    // to the en_US locale, emitting US area codes and random extensions
    // (e.g. "1-689-376-3966 x59137") that fail gov-bb validation.
    patterns: [/\bphone\b/, /\btelephone\b/, /\bmobile\b/, /\btel\b/, /\bcell\b/, /\bcontact[\s\-_]?number\b/],
    generate: () =>
      `1-246-${faker.number.int({ min: 2, max: 9 })}` +
      `${faker.string.numeric(2)}-${faker.string.numeric(4)}`,
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
    // Barbados postcode: "BB" followed by 5 digits (e.g. BB17004).
    patterns: [/\bzip\b/, /\bpostal[\s\-_]?code\b/, /\bpost[\s\-_]?code\b/, /\bpostcode\b/],
    generate: () => `BB${faker.string.numeric(5)}`,
  },
  {
    patterns: [/\bcountry\b/, /\bnation\b/],
    generate: () => faker.location.country(),
  },
  {
    // "Place of birth", "Place of baptism", "Location", etc. — emit a city name.
    patterns: [/\bplace\b/, /\blocation\b/, /\bbirthplace\b/],
    generate: () => faker.location.city(),
  },
  {
    patterns: [/\bcompany\b/, /\borganisati?on\b/, /\bemployer\b/, /\bfirm\b/],
    generate: () => faker.company.name(),
  },
  {
    patterns: [/\bjob[\s\-_]?title\b/, /\bposition\b/, /\brole\b/, /\boccupation\b/, /\bdesignation\b/, /\bprofession\b/],
    generate: () => faker.person.jobTitle(),
  },
  {
    // "Title"/"Salutation" — a personal prefix (Mr, Mrs, …). Comes after the job
    // rule so "job title" still maps to a job title.
    patterns: [/\btitle\b/, /\bsalutation\b/, /\bprefix\b/],
    generate: () => faker.person.prefix(),
  },
  {
    patterns: [/\bmarital\b/, /\bmarriage[\s\-_]?status\b/],
    generate: () => faker.helpers.arrayElement(['Single', 'Married', 'Divorced', 'Widowed']),
  },
  {
    patterns: [/\brelationship\b/, /\brelation\b/, /\bnext[\s\-_]?of[\s\-_]?kin\b/],
    generate: () => faker.helpers.arrayElement(['Parent', 'Sibling', 'Spouse', 'Guardian', 'Friend']),
  },
  {
    patterns: [/\breligion\b/, /\bfaith\b/, /\bdenomination\b/],
    generate: () => faker.helpers.arrayElement(['Christianity', 'Islam', 'Hinduism', 'Judaism', 'None']),
  },
  {
    patterns: [/\bcolou?r\b/],
    generate: () => faker.color.human(),
  },
  {
    patterns: [/\b(vehicle|car)?[\s\-_]?make\b/, /\bmanufacturer\b/],
    generate: () => faker.vehicle.manufacturer(),
  },
  {
    patterns: [/\bmodel\b/],
    generate: () => faker.vehicle.model(),
  },
  {
    // "Number of dependants", "How many children" — a small count.
    patterns: [/\bnumber[\s\-_]?of\b/, /\bhow[\s\-_]?many\b/, /\bno\.?[\s\-_]?of\b/],
    generate: () => String(faker.number.int({ min: 1, max: 9 })),
  },
  {
    patterns: [/\bwebsite\b/, /\bhomepage\b/, /\bweb[\s\-_]?url\b/, /\bsite[\s\-_]?url\b/],
    generate: () => faker.internet.url(),
  },
  {
    patterns: [/\busername\b/, /\buser[\s\-_]?name\b/, /\bhandle\b/, /\bscreen[\s\-_]?name\b/],
    generate: () => faker.internet.userName(),
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
    // National Insurance number (Barbados NIS) — must come before the broader
    // national-id rule so it wins on labels containing "national insurance".
    patterns: [/\bnational[\s\-_]?insurance\b/, /\bnis\b/, /\bnational[\s\-_]?insurance[\s\-_]?number\b/],
    generate: () =>
      faker.string.alpha({ length: 2, casing: 'upper' }) +
      faker.string.numeric(6) +
      faker.string.alpha({ length: 1, casing: 'upper' }),
  },
  {
    // Barbados national ID format: 6 digits, dash, 4 digits (e.g. 850101-0001).
    patterns: [/\bnational[\s\-_]?id\b/, /\bnational[\s\-_]?identification\b/, /\bidentification\b/, /\bnid\b/, /\bid[\s\-_]?number\b/],
    generate: () => `${faker.string.numeric(6)}-${faker.string.numeric(4)}`,
  },
  {
    // Passport / SSN — generic 9-digit numeric (passport min-length 6 is satisfied).
    patterns: [/\bssn\b/, /\bsocial[\s\-_]?security\b/, /\bpassport\b/],
    generate: () => faker.string.numeric(9),
  },
  {
    // TAMIS (Barbados tax system) reference number — numeric.
    patterns: [/\btamis\b/],
    generate: () => faker.string.numeric(8),
  },
  {
    patterns: [/\bsearch\b/, /\bquery\b/, /\bkeyword\b/],
    generate: () => faker.lorem.words(2),
  },
  {
    // Generic "name(s)" — must be last to avoid shadowing specific name patterns
    // above. Matches the plural too ("other names", "given names") so name-like
    // fields get a person name rather than falling through to lorem filler.
    // first + last (not fullName) so no prefix/suffix period can sneak in, which
    // would break "letters, hyphens, apostrophes only" validators.
    patterns: [/\bnames?\b/],
    generate: () => `${faker.person.firstName()} ${faker.person.lastName()}`,
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
