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
    patterns: [/\bphone\b/, /\btelephone\b/, /\bmobile\b/, /\btel\b/, /\bcell\b/, /\bcontact[\s\-_]?number\b/],
    generate: () => faker.phone.number(),
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
    patterns: [/\bnational[\s\-_]?id\b/, /\bnid\b/, /\bid[\s\-_]?number\b/, /\bssn\b/, /\bsocial[\s\-_]?security\b/, /\bpassport\b/],
    generate: () => faker.string.numeric(9),
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
