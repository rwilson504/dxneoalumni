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

  it('uses the current roster year and consistent public dues rates', async () => {
    const [membership, home, about] = await Promise.all([
      html('membership/index.html'), html('index.html'), html('about/index.html'),
    ]);
    assert.ok(membership.includes(`${new Date().getFullYear()} Alumni Chapter members`));
    const rates = membership.match(/Your \$([\d]+(?:\.\d+)?) annual membership \(or \$([\d]+(?:\.\d+)?) for virtual members\)/);
    assert.ok(rates, 'Membership must show full and virtual annual dues');
    const [, fullRate, virtualRate] = rates;
    for (const [route, content] of [['index.html', home], ['about/index.html', about]]) {
      assert.ok(content.includes(`Join for $${fullRate}/year`), `${route} has a different full rate`);
    }
    assert.ok(home.includes(`or $${virtualRate} for virtual members`), 'Home has a different virtual rate');
    assert.ok(about.includes(`Virtual membership is $${virtualRate}.`), 'About has a different virtual rate');
  });

  it('keeps approved footer content', async () => {
    const home = await html('index.html');
    assert.doesNotMatch(home, />Discord</);
    assert.doesNotMatch(home, />Delta Chi Educational Foundation</);
    assert.match(home, /MyDchi: update your contact info/);
  });

  it('renders public roster profiles and officer positions', async () => {
    const membership = await html('membership/index.html');
    const officerNames = [...membership.matchAll(/class="officer__name"[^>]*>([^<]+)<\/p>/g)];
    const officerRoles = [...membership.matchAll(/class="officer__role"[^>]*>([^<]+)<\/p>/g)];
    const memberNames = [...membership.matchAll(/class="roster__name"[^>]*>([^<]+)<\/span>/g)];
    assert.ok(officerNames.length > 0, 'No officers were published');
    assert.equal(officerRoles.length, officerNames.length, 'Each officer needs a position label');
    assert.ok(memberNames.length > 0, 'No non-officer members were published');
    assert.doesNotMatch(membership, />undefined</);
    assert.doesNotMatch(membership, />null</);
  });

  it('keeps award and Chicago Cup summaries consistent with the timeline', async () => {
    const awards = await html('awards/index.html');
    const timeline = awards.match(/<ol class="timeline"[^>]*>([\s\S]*?)<\/ol>/)?.[1];
    assert.ok(timeline, 'Award timeline must be present');
    const awardCount = [...timeline.matchAll(/<li\b[^>]*>[^<]+<\/li>/g)].length;
    const cupCount = [...timeline.matchAll(/<li class="is-cup"[^>]*>/g)].length;
    const summary = awards.match(/<p class="lede"[^>]*>([\s\S]*?)<\/p>/)?.[1].replace(/\s+/g, ' ');
    assert.ok(awardCount > 0, 'No awards were published');
    assert.ok(summary, 'Award summary must be present');
    assert.ok(summary.includes(`${awardCount} ${awardCount === 1 ? 'award' : 'awards'} from`),
      'Summary total must match the published award records');
    if (cupCount > 0) {
      assert.ok(summary.includes(`${cupCount} Chicago ${cupCount === 1 ? 'Cup' : 'Cups'},`),
        'Chicago Cup summary must match the published Cup records');
    } else {
      assert.doesNotMatch(summary, /Chicago Cup/);
      assert.doesNotMatch(awards, /class="section cups"/);
    }
    assert.doesNotMatch(timeline, />undefined</);
    assert.doesNotMatch(timeline, />null</);
  });

  it('loads Google Analytics across public and member pages', async () => {
    for (const route of ['index.html', 'members/index.html']) {
      const content = await html(route);
      assert.match(content, /googletagmanager\.com\/gtag\/js\?id=G-V1B64MDWSB/);
      assert.match(content, /gtag\('config',\s*analyticsId\)/);
      assert.match(content, /analyticsId\s*=\s*"G-V1B64MDWSB"/);
    }
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