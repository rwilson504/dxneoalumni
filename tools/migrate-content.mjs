/**
 * One-time migration: turns src/data/events.json + src/data/gallery.json into SQL for
 * the events / albums / photos tables, and reports what it inferred so a human can
 * check it before anything is run.
 *
 *   node tools/migrate-content.mjs
 *
 * Writes supabase/seed-content.sql. Nothing is applied automatically — production
 * deploys ignore seed files, so this is pasted into the SQL editor once, deliberately.
 *
 * Image files are NOT moved anywhere: they stay committed under src/assets, and these
 * rows just name them. Only metadata lives in the database.
 *
 * The interesting part is the gallery. Its captions carry three different numbering
 * conventions for "these photos belong together", and the shipped gallery.astro only
 * understood one of them:
 *
 *     Cleveland Whiskey Tour (2)     73 photos
 *     Founders Day 2019_2            10 photos
 *     Food Bank 7                    10 photos
 *
 * Honouring all three collapses 133 photos into 54 albums instead of 79.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const events = JSON.parse(readFileSync(join(root, 'src/data/events.json'), 'utf8'));
const gallery = JSON.parse(readFileSync(join(root, 'src/data/gallery.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Album derivation
// ---------------------------------------------------------------------------

const GROUPING = [
  /^(.*?)\s*\((\d+)\)$/,   // "Cleveland Whiskey Tour (2)"
  /^(.*?)_(\d+)$/,         // "Founders Day 2019_2"
  /^(.*?)\s+(\d{1,2})$/,   // "Food Bank 7", "Brewery Tour 2021 3"
];

function splitCaption(caption) {
  for (const re of GROUPING) {
    const m = caption.match(re);
    if (m) return { name: m[1].trim(), index: Number(m[2]) };
  }
  return { name: caption.trim(), index: null };
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];

function datePartsFrom(text) {
  // Tolerates "2019_1", where a word boundary after the year never occurs.
  const year = text.match(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/);
  const month = text.match(new RegExp(`\\b(${MONTHS.map((m) => m.slice(0, 3)).join('|')})\\w*`, 'i'));
  return {
    year: year ? Number(year[1]) : null,
    month: month ? MONTHS.findIndex((m) => m.startsWith(month[1].toLowerCase())) + 1 : null,
  };
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Group photos by album name. Case-insensitive because the source has both
// "Food Bank" and "Food bank", which are plainly the same set.
const albumsByKey = new Map();

for (const photo of gallery) {
  const { name, index } = splitCaption(photo.caption);
  const key = name.toLowerCase();
  if (!albumsByKey.has(key)) {
    albumsByKey.set(key, { title: name, photos: [] });
  }
  albumsByKey.get(key).photos.push({ ...photo, index });
}

const albums = [...albumsByKey.values()].map((album) => {
  const { year, month } = datePartsFrom(album.title);
  album.photos.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return { ...album, year, month, slug: slugify(album.title) };
});

// ---------------------------------------------------------------------------
// Event linking
//
// Two signals, in order of trust:
//   1. an event's imageAlt is exactly one of the album's captions
//   2. strong token overlap with the event title, in the same year
// Anything weaker is left unlinked rather than guessed at.
// ---------------------------------------------------------------------------

const STOP = new Set(['the', 'a', 'an', 'of', 'at', 'and', 'to', 'for', 'our', 'st', 'nd',
  'rd', 'th', 'annual', 'dinner', 'night', 'game', ...MONTHS]);

/**
 * Auto-link only when the overlap is decisive. Anything weaker is reported instead:
 * "Summer Happy Hour Sept 2023" scores 0.67 against "2023 Virtual Happy Hour" purely on
 * the words "happy hour", which is not evidence they are the same occasion.
 */
const AUTO_LINK = 0.8;
const SUGGEST = 0.5;
const suggestions = [];

const tokens = (text) => new Set(
  text.toLowerCase()
    .replace(/\(\d+\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^(19|20)\d{2}$/.test(t))
);

const captionIndex = new Map();
for (const album of albums) {
  for (const photo of album.photos) captionIndex.set(photo.caption, album);
}

const linked = new Set();
for (const event of events) {
  if (!event.imageAlt) continue;
  const album = captionIndex.get(event.imageAlt);
  if (album && !album.eventSlug) {
    album.eventSlug = event.slug;
    album.linkBy = 'caption';
    linked.add(event.slug);
  }
}

for (const album of albums) {
  if (album.eventSlug) continue;
  const albumTokens = tokens(album.title);
  if (!albumTokens.size) continue;

  let best = null;
  for (const event of events) {
    if (linked.has(event.slug)) continue;
    if (album.year && event.year !== album.year) continue;
    const eventTokens = tokens(event.title);
    const shared = [...albumTokens].filter((t) => eventTokens.has(t)).length;
    if (!shared) continue;
    const score = shared / Math.min(albumTokens.size, eventTokens.size);
    if (!best || score > best.score) best = { score, event };
  }

  if (best && best.score >= AUTO_LINK) {
    album.eventSlug = best.event.slug;
    album.linkBy = `title ${best.score.toFixed(2)}`;
    linked.add(best.event.slug);
    // An album with no year of its own can borrow the event's.
    if (!album.year) {
      album.year = best.event.year;
      album.month = album.month ?? best.event.month;
      album.borrowedDate = true;
    }
  } else if (best && best.score >= SUGGEST) {
    suggestions.push({ album, event: best.event, score: best.score });
  }
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

const q = (value) =>
  value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`;
const n = (value) => (value === null || value === undefined ? 'null' : String(value));

const lines = [
  '-- Generated by tools/migrate-content.mjs — do not edit by hand.',
  '-- Seeds events, albums, and photos from the salvaged Wix content.',
  '-- Safe to re-run: every insert is keyed on a natural unique column.',
  '',
  'begin;',
  '',
  '-- Events ------------------------------------------------------------------',
];

for (const event of events) {
  lines.push(
    `insert into public.events (slug, title, description, year, month, day, image_file, image_alt) values (`
    + `${q(event.slug)}, ${q(event.title)}, ${q(event.description)}, ${n(event.year)}, `
    + `${n(event.month)}, ${n(event.day)}, ${q(event.image)}, `
    + `${q(event.imageAlt)})`
    + `\non conflict (slug) do update set title = excluded.title, description = excluded.description,`
    + ` year = excluded.year, month = excluded.month, day = excluded.day,`
    + ` image_file = excluded.image_file, image_alt = excluded.image_alt;`
  );
}

lines.push('', '-- Albums ------------------------------------------------------------------');

for (const album of albums) {
  const event = album.eventSlug ? `(select id from public.events where slug = ${q(album.eventSlug)})` : 'null';
  lines.push(
    `insert into public.albums (slug, title, event_id, year, month) values (`
    + `${q(album.slug)}, ${q(album.title)}, ${event}, ${n(album.year)}, ${n(album.month)})`
    + `\non conflict (slug) do update set title = excluded.title, event_id = excluded.event_id,`
    + ` year = excluded.year, month = excluded.month;`
  );
}

lines.push('', '-- Photos ------------------------------------------------------------------');

for (const album of albums) {
  album.photos.forEach((photo, i) => {
    lines.push(
      `insert into public.photos (album_id, file, caption, sort_order) values (`
      + `(select id from public.albums where slug = ${q(album.slug)}), `
      + `${q(photo.file)}, ${q(photo.caption)}, ${i})`
      + `\non conflict (file) do update set caption = excluded.caption,`
      + ` sort_order = excluded.sort_order;`
    );
  });
}

lines.push('', 'commit;', '');

const outPath = join(root, 'supabase', 'seed-content.sql');
writeFileSync(outPath, lines.join('\n'), 'utf8');

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const multi = albums.filter((a) => a.photos.length > 1);
const withEvent = albums.filter((a) => a.eventSlug);
const undated = albums.filter((a) => !a.year);

console.log(`events               : ${events.length}`);
console.log(`photos               : ${gallery.length}`);
console.log(`albums               : ${albums.length}  (${multi.length} with more than one photo)`);
console.log(`albums linked to event: ${withEvent.length}`);
console.log(`albums with no date  : ${undated.length}`);
console.log(`\nwrote ${outPath.replace(root, '.')}`);

if (undated.length) {
  console.log(`\nNo date could be inferred — these need one set by hand:`);
  for (const a of undated) console.log(`  ${a.title}  [${a.photos.length} photos]`);
}

console.log(`\nEvent links inferred from the title rather than an exact caption match`);
console.log(`(worth eyeballing — these are the guesses):`);
for (const a of withEvent.filter((x) => x.linkBy?.startsWith('title'))) {
  const ev = events.find((e) => e.slug === a.eventSlug);
  console.log(`  ${a.linkBy}  ${a.title}  ->  ${ev.title}${a.borrowedDate ? '  [took event date]' : ''}`);
}
if (suggestions.length) {
  console.log(`\nToo weak to link automatically \u2014 left unlinked, confirm or reject by hand:`);
  for (const s of suggestions) {
    console.log(`  ${s.score.toFixed(2)}  ${s.album.title}  ->  ${s.event.title}`);
  }
}