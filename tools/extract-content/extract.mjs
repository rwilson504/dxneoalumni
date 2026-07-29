/**
 * One-time migration: turns the archived Wix events page into structured JSON.
 *
 * On the Wix page each block of thumbnails appears immediately *before* the run of
 * event headings it belongs to, in matching order, so images pair to events positionally.
 *
 * Output is a seed file. Once written it is hand-maintained — this is a migration,
 * not a build step.
 */

import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = path.join(ROOT, 'archive/content/events.md');
const MEDIA = path.join(ROOT, 'archive/media');
const OUT = path.join(ROOT, 'src/data/events.json');
const ASSETS = path.join(ROOT, 'src/assets/events');

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const IMAGE_RE = /^!\[(.*?)\]\((https:\/\/static\.wixstatic\.com\/media\/([A-Za-z0-9_~%.\-]+?\.(?:jpe?g|png|gif)))/i;
const HEADING_RE = /^#{5,6}\s+(.*\S)\s*$/;
const SECTION_RE = /^#{4}\s+(.*\S)\s*$/;

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

/** Vite's dev server rejects file paths containing `~`, which every Wix media ID has. */
function safeAssetName(file) {
  return file.replace(/~/g, '-');
}

/** Titles are inconsistent ("Oct. 15, 2022", "June 27th:", "Feb 1st 2025"). Pull what we can. */
function parseMonthDay(text) {
  if (!text) return { month: null, day: null };
  // Must match whole month words — a loose \b(mar)[a-z]* also matches "Mariners".
  const match = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?\s*(\d{1,2})(?:st|nd|rd|th)?\b/i
  ) ?? text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
  );
  if (!match) return { month: null, day: null };
  return {
    month: MONTHS[match[1].slice(0, 3).toLowerCase()],
    day: match[2] ? Number(match[2]) : null,
  };
}

function parseYear(title, imageAlt) {
  // `_` is a word character, so \b would miss the year in "Happy Hour 2026_edited.jpg".
  const YEAR_RE = /(?<!\d)(20\d{2})(?!\d)/;
  const fromTitle = title.match(YEAR_RE);
  if (fromTitle) return { year: Number(fromTitle[1]), source: 'title' };
  const fromImage = imageAlt?.match(YEAR_RE);
  if (fromImage) return { year: Number(fromImage[1]), source: 'image' };
  return { year: null, source: null };
}

function parse(markdown) {
  const lines = markdown.split(/\r?\n/);
  const events = [];

  let section = null;
  let queue = [];
  let consuming = false;
  let current = null;

  const flush = () => {
    if (!current) return;
    current.description = current.body.join(' ').replace(/\s+/g, ' ').trim();
    delete current.body;
    events.push(current);
    current = null;
  };

  for (const line of lines) {
    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      flush();
      section = sectionMatch[1];
      queue = [];
      consuming = false;
      continue;
    }

    if (!section || section === 'Event Ideas') continue;

    const imageMatch = line.match(IMAGE_RE);
    if (imageMatch) {
      // A new thumbnail block means the previous run of events is finished.
      if (consuming) {
        queue = [];
        consuming = false;
      }
      queue.push({ alt: imageMatch[1].replace(/\\/g, ''), file: decodeURIComponent(imageMatch[3]) });
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      flush();
      consuming = true;
      const title = headingMatch[1].replace(/\\/g, '').replace(/\s+/g, ' ').trim();
      const image = queue.shift() ?? null;
      current = {
        title,
        image,
        upcoming: section.toLowerCase().includes('upcoming'),
        body: [],
      };
      continue;
    }

    if (current && line.trim()) current.body.push(line.trim());
  }
  flush();

  return events;
}

function enrich(events) {
  let inheritedYear = null;
  const warnings = [];
  const currentYear = new Date().getFullYear();

  const enriched = events.map((event, index) => {
    // Upcoming events routinely reuse an older year's flyer, so only trust the title for them.
    const { year, source } = event.upcoming
      ? { year: parseYear(event.title, null).year, source: 'title' }
      : parseYear(event.title, event.image?.alt);
    const resolvedYear = year ?? (event.upcoming ? currentYear : inheritedYear);
    if (year && !event.upcoming) inheritedYear = year;

    // The date is often only stated in the body ("On Nov. 9th nine chapter members...").
    let { month, day } = parseMonthDay(event.title);
    let monthSource = month ? 'title' : null;
    if (!month) {
      ({ month, day } = parseMonthDay(event.description));
      monthSource = month ? 'description' : null;
    }

    if (!resolvedYear) warnings.push(`no year: "${event.title}"`);
    if (!month) warnings.push(`no month: "${event.title}"`);

    return {
      slug: slugify(`${resolvedYear ?? ''} ${event.title}`),
      title: event.title,
      year: resolvedYear,
      month,
      day,
      description: event.description,
      image: event.image ? safeAssetName(event.image.file) : null,
      imageAlt: event.image?.alt.replace(/\.(jpe?g|png|gif)$/i, '') ?? null,
      order: index,
    };
  });

  return { enriched, warnings };
}

const markdown = await readFile(SOURCE, 'utf8');
const { enriched, warnings } = enrich(parse(markdown));

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(enriched, null, 2)}\n`, 'utf8');

// Copy only the images the events actually use, so Astro can optimize them from src/.
await mkdir(ASSETS, { recursive: true });
const sourceBySafeName = new Map(
  (await readdir(MEDIA)).map((file) => [safeAssetName(file), file])
);
const copied = new Set();
for (const event of enriched) {
  if (!event.image || copied.has(event.image)) continue;
  const source = sourceBySafeName.get(event.image);
  if (!source) throw new Error(`Missing archived image for ${event.image}`);
  await copyFile(path.join(MEDIA, source), path.join(ASSETS, event.image));
  copied.add(event.image);
}

console.log(`Parsed ${enriched.length} events -> ${path.relative(ROOT, OUT)}`);
console.log(`  with year:  ${enriched.filter((e) => e.year).length}`);
console.log(`  with month: ${enriched.filter((e) => e.month).length}`);
console.log(`  images copied: ${copied.size} -> ${path.relative(ROOT, ASSETS)}`);

// --- Newsletters -----------------------------------------------------------
// Entries are "###### [October 2019](url)". Older ones are PDFs we archived locally;
// newer ones live on Mailchimp and are linked out.
const newsletterMd = await readFile(path.join(ROOT, 'archive/content/newsletters.md'), 'utf8');
const manifest = JSON.parse(await readFile(path.join(ROOT, 'archive/manifest.json'), 'utf8'));
const pdfTitleByFile = new Map(
  manifest.assets.filter((a) => a.file.endsWith('.pdf')).map((a) => [a.file.split('/').pop(), a.title])
);

const newsletters = [];
for (const match of newsletterMd.matchAll(/^#{5,6}\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gm)) {
  const [, label, url] = match;
  const monthYear = label.replace(/\\/g, '').trim();
  const pdfId = url.match(/\/ugd\/([A-Za-z0-9_~.\-]+\.pdf)/)?.[1];
  const { month } = parseMonthDay(monthYear);
  const year = parseYear(monthYear, null).year;

  newsletters.push({
    label: monthYear,
    year,
    month,
    href: pdfId
      ? `newsletters/${(pdfTitleByFile.get(pdfId) ?? pdfId).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`
      : url,
    external: !pdfId,
  });
}

newsletters.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.month ?? 0) - (a.month ?? 0));
const NEWSLETTERS_OUT = path.join(ROOT, 'src/data/newsletters.json');
await writeFile(NEWSLETTERS_OUT, `${JSON.stringify(newsletters, null, 2)}\n`, 'utf8');
console.log(`\nParsed ${newsletters.length} newsletters -> ${path.relative(ROOT, NEWSLETTERS_OUT)}`);
console.log(`  local PDFs: ${newsletters.filter((n) => !n.external).length}, external: ${newsletters.filter((n) => n.external).length}`);

if (warnings.length) {
  console.log(`\n${warnings.length} field(s) need manual review:`);
  for (const w of warnings) console.log(`  ${w}`);
}
