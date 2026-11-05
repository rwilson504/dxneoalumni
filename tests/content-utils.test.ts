import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classYearOptions,
  combinedStreetAddress,
  describeError,
  escapeIcsText,
  foldIcsLine,
  formatIcsDate,
  formatPartialDate,
  formatPublicRoster,
  googleMapsDirectionsUrl,
  isEventPaymentAvailable,
  matchesPaymentStatus,
  matchesSearch,
  slugify,
} from '../src/lib/content-utils.ts';

describe('formatPublicRoster', () => {
  const member = {
    full_name: 'Test Brother',
    officer_letter: null,
    undergrad_chapter: null,
    class_year: null,
    is_virtual: false,
  };

  it('uses current database values and orders officers before alphabetical members', () => {
    const rows = [
      { ...member, full_name: 'Zed New Member' },
      { ...member, full_name: 'New Secretary', officer_letter: 'C', is_virtual: true },
      { ...member, full_name: 'Amy New Member', undergrad_chapter: 'Kent State', class_year: "'26" },
      { ...member, full_name: 'New President', officer_letter: 'A' },
    ];
    assert.deepEqual(formatPublicRoster(rows), [
      { name: 'New President', officer: 'A', chapter: null, classYear: null, virtual: false },
      { name: 'New Secretary', officer: 'C', chapter: null, classYear: null, virtual: true },
      { name: 'Amy New Member', officer: null, chapter: 'Kent State', classYear: "'26", virtual: false },
      { name: 'Zed New Member', officer: null, chapter: null, classYear: null, virtual: false },
    ]);
    assert.equal(rows[0].full_name, 'Zed New Member', 'Does not mutate the source rows');
  });

  it('never copies additional private fields into public page data', () => {
    const row = { ...member, email: 'private@example.invalid', phone: 'private', role: 'admin' };
    assert.deepEqual(Object.keys(formatPublicRoster([row])[0]).sort(),
      ['chapter', 'classYear', 'name', 'officer', 'virtual']);
  });

  it('reflects officer reassignments without retaining the previous position', () => {
    assert.equal(formatPublicRoster([{ ...member, officer_letter: 'B' }])[0].officer, 'B');
    assert.equal(formatPublicRoster([member])[0].officer, null);
    assert.deepEqual(formatPublicRoster([]), []);
  });
});

describe('slugify', () => {
  it('normalizes punctuation, whitespace, and case', () => {
    assert.equal(slugify(" Founders' Day: Kent State "), 'founders-day-kent-state');
  });

  it('removes leading and trailing separators', () => {
    assert.equal(slugify('---Delta Chi---'), 'delta-chi');
  });
});

describe('formatPartialDate', () => {
  it('does not invent missing date parts', () => {
    assert.equal(formatPartialDate(null, null, null), 'No date');
    assert.equal(formatPartialDate(2026, null, null), '2026');
    assert.equal(formatPartialDate(2026, 10, null), 'October 2026');
  });

  it('formats a complete date', () => {
    assert.equal(formatPartialDate(2026, 10, 13), 'October 13, 2026');
  });
});

describe('describeError', () => {
  it('returns no message when there is no error', () => {
    assert.equal(describeError(null), null);
  });

  it('translates known database errors', () => {
    assert.match(describeError({ code: '42P01', message: 'missing relation' })!, /content tables/);
    assert.match(describeError({ code: '42501', message: 'denied' })!, /officer or admin role/);
  });

  it('preserves an unknown error message', () => {
    assert.equal(describeError({ code: '99999', message: 'Unexpected failure' }), 'Unexpected failure');
  });
});

describe('classYearOptions', () => {
  it('shows full years and preserves apostrophe-year values', () => {
    assert.deepEqual(classYearOptions(2026, 2024), [
      { label: '2026', value: "'26" },
      { label: '2025', value: "'25" },
      { label: '2024', value: "'24" },
    ]);
  });
});

describe('iCalendar helpers', () => {
  it('formats an all-day date', () => {
    assert.equal(formatIcsDate(2026, 1, 3), '20260103');
  });

  it('escapes text delimiters and newlines', () => {
    assert.equal(escapeIcsText('One, two; three\nFour'), 'One\\, two\\; three\\nFour');
  });

  it('folds long lines within the 75-octet limit', () => {
    const folded = foldIcsLine(`DESCRIPTION:${'Brotherhood '.repeat(12)}`);
    const lines = folded.split('\r\n');
    assert.ok(lines.length > 1);
    assert.ok(lines.slice(1).every((line) => line.startsWith(' ')));
    assert.ok(lines.every((line) => Buffer.byteLength(line, 'utf8') <= 75));
  });
});

describe('googleMapsDirectionsUrl', () => {
  it('encodes a complete address as a Maps search query', () => {
    assert.equal(
      googleMapsDirectionsUrl('123 Main St, Cleveland, OH 44114'),
      'https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Cleveland%2C%20OH%2044114'
    );
  });
});

describe('isEventPaymentAvailable', () => {
  it('stays available through the day after the event', () => {
    assert.equal(isEventPaymentAvailable(2026, 9, 28, new Date('2026-09-28T12:00:00Z')), true);
    assert.equal(isEventPaymentAvailable(2026, 9, 28, new Date('2026-09-29T23:59:59Z')), true);
  });

  it('expires two calendar days after the event', () => {
    assert.equal(isEventPaymentAvailable(2026, 9, 28, new Date('2026-09-30T00:00:00Z')), false);
  });
});

describe('combinedStreetAddress', () => {
  it('keeps a single street line unchanged', () => {
    assert.equal(combinedStreetAddress('123 Main St', null), '123 Main St');
  });

  it('merges a legacy apartment line into the street address', () => {
    assert.equal(combinedStreetAddress('123 Main St', 'Apt 4B'), '123 Main St, Apt 4B');
  });
});

describe('matchesSearch', () => {
  it('matches case-insensitively across multiple values', () => {
    assert.equal(matchesSearch('kent', 'Rick Wilson', 'Kent State', 2004), true);
    assert.equal(matchesSearch('RICK', 'Rick Wilson', 'Kent State'), true);
  });

  it('matches all records for an empty query', () => {
    assert.equal(matchesSearch('   ', 'Anything'), true);
  });

  it('rejects records without the query', () => {
    assert.equal(matchesSearch('Akron', 'Rick Wilson', 'Kent State'), false);
  });
});

describe('matchesPaymentStatus', () => {
  it('shows every record for all', () => {
    assert.equal(matchesPaymentStatus('all', true), true);
    assert.equal(matchesPaymentStatus('all', false), true);
  });

  it('separates paid and unpaid records', () => {
    assert.equal(matchesPaymentStatus('paid', true), true);
    assert.equal(matchesPaymentStatus('paid', false), false);
    assert.equal(matchesPaymentStatus('unpaid', false), true);
    assert.equal(matchesPaymentStatus('unpaid', true), false);
  });
});