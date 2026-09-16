import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const dist = new URL('../dist/', import.meta.url);

async function html(path) {
  return readFile(new URL(path, dist), 'utf8');
}

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = new URL(entry.name, directory);
    return entry.isDirectory()
      ? htmlFiles(new URL(`${entry.name}/`, directory))
      : entry.name.endsWith('.html') ? [path] : [];
  }));
  return files.flat();
}

describe('built site regressions', () => {
  it('generates every primary route', async () => {
    const routes = ['index.html', 'about/index.html', 'awards/index.html', 'by-laws/index.html',
      'events/index.html', 'gallery/index.html', 'members/index.html',
      'membership/index.html', 'newsletters/index.html'];

    await Promise.all(routes.map(async (route) => {
      assert.match(await html(route), /<!DOCTYPE html>/i, `${route} was not generated`);
    }));
  });

  it('keeps approved membership and footer content', async () => {
    const membership = await html('membership/index.html');
    assert.match(membership, /2026 Alumni Chapter members/);
    assert.match(membership, /\$35 annual membership/);

    const home = await html('index.html');
    assert.doesNotMatch(home, />Discord</);
    assert.doesNotMatch(home, />Delta Chi Educational Foundation</);
    assert.match(home, /MyDchi: update your contact info/);
  });

  it('renders the normalized chapter award history', async () => {
    const awards = await html('awards/index.html');
    assert.match(awards, /18 awards/);
    assert.match(awards, /Outstanding Alumni Chapter Programming/);
    assert.match(awards, /Outstanding Alumni Chapter Communication/);
    assert.match(awards, /Outstanding Alumni Chapter Member: Daniel Russell/);
  });

  it('does not publish forbidden copy tokens', async () => {
    const files = await htmlFiles(new URL('.', dist));
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      assert.doesNotMatch(content, /—|&mdash;|&#8212;|UNIQID/, file);
    }
  });

  it('generates dedicated gallery album pages', async () => {
    const entries = await readdir(new URL('gallery/', dist), { withFileTypes: true });
    assert.ok(entries.some((entry) => entry.isDirectory()), 'No gallery album routes were generated');
  });

  it('generates a subscribable iCalendar feed', async () => {
    const calendar = await readFile(new URL('events/calendar.ics', dist));
    const text = calendar.toString('utf8');
    const events = text.match(/BEGIN:VEVENT/g) ?? [];

    assert.match(text, /^BEGIN:VCALENDAR\r\n/);
    assert.match(text, /\r\nEND:VCALENDAR\r\n$/);
    assert.ok(events.length > 0, 'Calendar contains no events');
    assert.equal((text.match(/DTSTART;VALUE=DATE:\d{8}/g) ?? []).length, events.length);
    assert.equal((text.match(/DTEND;VALUE=DATE:\d{8}/g) ?? []).length, events.length);
    assert.ok(text.split('\r\n').every((line) => Buffer.byteLength(line, 'utf8') <= 75));

    const eventsPage = await html('events/index.html');
    assert.match(eventsPage, /Copy subscription link/);
    assert.match(eventsPage, /Download \.ics/);
    assert.match(eventsPage, /download="delta-chi-neo-events\.ics"/);
    assert.match(eventsPage, /events\/calendar\.ics/);
  });
});