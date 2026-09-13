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
  googleMapsDirectionsUrl,
  matchesPaymentStatus,
  matchesSearch,
  slugify,
} from '../src/lib/content-utils.ts';

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