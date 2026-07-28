/**
 * One-time salvage of the legacy Wix site.
 *
 * Wix serves fully server-rendered HTML, so a plain fetch is enough — no browser needed.
 * Outputs into <repo>/archive:
 *   raw/       untouched HTML per page (last-resort backup)
 *   content/   readable markdown per page
 *   media/     full-resolution originals from static.wixstatic.com + docs.wixstatic.com
 *   manifest.json  original URL -> local file, and which pages referenced it
 */

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARCHIVE = path.join(ROOT, 'archive');
const DIRS = {
  raw: path.join(ARCHIVE, 'raw'),
  content: path.join(ARCHIVE, 'content'),
  media: path.join(ARCHIVE, 'media'),
  newsletters: path.join(ARCHIVE, 'newsletters-mailchimp'),
};

const BASE = 'https://dxneoalumni.wixsite.com';
const PAGES = [
  ['home', '/main'],
  ['about-us', '/main/about-us'],
  ['membership', '/main/membership'],
  ['events', '/main/events'],
  ['photo-gallery', '/main/photo-gallery'],
  ['awards', '/main/awards'],
  ['newsletters', '/main/newsletters'],
  ['by-laws', '/main/by-laws'],
];

const DOWNLOAD_CONCURRENCY = 6;
const USER_AGENT = 'Mozilla/5.0 (compatible; dxneoalumni-archive/1.0; one-time content salvage)';

// A Wix media URL is <id>.<ext> followed by transform segments (/v1/fill/...).
// Everything before the first extension is the untransformed original.
const MEDIA_RE = /static\.wixstatic\.com\/media\/([A-Za-z0-9_~%.\-]+?\.(?:jpe?g|png|gif|webp|avif))/gi;

// Galleries emit bare media IDs inside JS blobs with no host prefix.
const BARE_MEDIA_RE = /(?<![\w/.-])([0-9a-f]{6}_[0-9a-f]{32}~mv2[A-Za-z0-9_]*\.(?:jpe?g|png|gif|webp|avif))/gi;

// Uploaded documents are served from <site-guid>.filesusr.com, not docs.wixstatic.com.
const DOC_RE =
  /https?:\/\/[A-Za-z0-9.\-]*(?:filesusr\.com|docs\.wixstatic\.com)\/ugd\/[A-Za-z0-9_~%.\-]+?\.(?:pdf|docx?|xlsx?|pptx?)/gi;

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function safeFilename(name) {
  return decodeURIComponent(name).replace(/[^A-Za-z0-9._~-]/g, '_');
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/** Strip Wix chrome so the markdown is actually readable. */
function htmlToMarkdown(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, iframe').remove();
  $('[id*="WIX_ADS"], [class*="wixAds"], [data-testid="wix-ads"]').remove();
  $('a[href*="wix.com/lpviral"]').remove();

  const root = $('#SITE_CONTAINER').length ? $('#SITE_CONTAINER') : $('body');

  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
  turndown.remove(['script', 'style']);
  return turndown
    .turndown(root.html() ?? '')
    .replace(/\u200b/g, '') // Wix pads empty text nodes with zero-width spaces
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Wix embeds a structured JSON blob that often holds cleaner data than the DOM. */
function extractWarmupData(html) {
  const $ = cheerio.load(html);
  const raw = $('#wix-warmup-data').html();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function collectAssets(html, slug, registry, titles) {
  const add = (url) => {
    const id = url.split('/').pop();
    const entry = registry.get(url) ?? { url, file: safeFilename(id), referencedBy: new Set() };
    entry.referencedBy.add(slug);
    if (titles?.has(id)) entry.title = titles.get(id);
    registry.set(url, entry);
  };

  for (const m of html.matchAll(MEDIA_RE)) add(`https://static.wixstatic.com/media/${m[1]}`);
  for (const m of html.matchAll(BARE_MEDIA_RE)) add(`https://static.wixstatic.com/media/${m[1]}`);
  for (const m of html.matchAll(DOC_RE)) add(m[0]);
}

/** Link text is the only clue to what an opaque ugd/<guid>.pdf actually is. */
function collectDocumentTitles(html) {
  const $ = cheerio.load(html);
  const titles = new Map();
  $('a[href*="/ugd/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().replace(/\u200b/g, '').trim();
    const id = href.split('/').pop()?.split('?')[0];
    if (id && text) titles.set(id, text);
  });
  return titles;
}

async function downloadAsset(entry) {
  const dest = path.join(DIRS.media, entry.file);
  if (await exists(dest)) return { ...entry, status: 'cached' };

  const res = await fetch(entry.url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok || !res.body) return { ...entry, status: `failed:${res.status}` };

  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return { ...entry, status: 'downloaded' };
}

async function runPool(items, worker, concurrency) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        results.push(await worker(item));
      } catch (err) {
        results.push({ ...item, status: `error:${err.message}` });
      }
    }
  });
  await Promise.all(runners);
  return results;
}

/** Older newsletters are hosted on Mailchimp, outside Wix, and will rot once links break. */
async function archiveMailchimpNewsletters(html) {
  const $ = cheerio.load(html);
  const seen = new Map();

  $('a[href*="mailchi.mp"]').each((_, el) => {
    const href = $(el).attr('href')?.split('?')[0];
    const label = $(el).text().replace(/\u200b/g, '').trim();
    if (href && !seen.has(href)) seen.set(href, label || href.split('/').pop());
  });

  const items = [...seen.entries()].map(([url, label]) => ({ url, label }));
  if (!items.length) return [];

  console.log(`\nArchiving ${items.length} Mailchimp newsletters...`);

  return runPool(
    items,
    async ({ url, label }) => {
      const file = `${safeFilename(label)}.html`;
      const dest = path.join(DIRS.newsletters, file);
      if (await exists(dest)) return { url, label, file, status: 'cached' };

      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
      if (!res.ok) return { url, label, file, status: `failed:${res.status}` };

      await writeFile(dest, `<!-- Archived from ${url} -->\n${await res.text()}`, 'utf8');
      return { url, label, file, status: 'downloaded' };
    },
    DOWNLOAD_CONCURRENCY
  );
}

async function main() {
  await Promise.all(Object.values(DIRS).map((d) => mkdir(d, { recursive: true })));

  const registry = new Map();
  const pageSummary = [];
  let newsletterArchive = [];

  for (const [slug, route] of PAGES) {
    const url = `${BASE}${route}`;
    process.stdout.write(`page  ${slug.padEnd(14)} `);

    let html;
    try {
      html = await fetchText(url);
    } catch (err) {
      console.log(`SKIPPED (${err.message})`);
      pageSummary.push({ slug, url, status: `failed: ${err.message}` });
      continue;
    }

    await writeFile(path.join(DIRS.raw, `${slug}.html`), html, 'utf8');

    const markdown = htmlToMarkdown(html);
    await writeFile(
      path.join(DIRS.content, `${slug}.md`),
      `<!-- Archived from ${url} on ${new Date().toISOString()} -->\n\n${markdown}\n`,
      'utf8'
    );

    const warmup = extractWarmupData(html);
    if (warmup) {
      await writeFile(
        path.join(DIRS.raw, `${slug}.warmup.json`),
        JSON.stringify(warmup, null, 2),
        'utf8'
      );
    }

    const before = registry.size;
    collectAssets(html, slug, registry, collectDocumentTitles(html));
    console.log(`ok  ${html.length} bytes, +${registry.size - before} new assets`);
    pageSummary.push({ slug, url, status: 'ok', bytes: html.length, markdownChars: markdown.length });

    if (slug === 'newsletters') newsletterArchive = await archiveMailchimpNewsletters(html);
  }

  const assets = [...registry.values()];
  console.log(`\nDownloading ${assets.length} unique assets...`);
  const downloaded = await runPool(assets, downloadAsset, DOWNLOAD_CONCURRENCY);

  const tally = downloaded.reduce((acc, d) => {
    const key = d.status.split(':')[0];
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  await writeFile(
    path.join(ARCHIVE, 'manifest.json'),
    JSON.stringify(
      {
        archivedAt: new Date().toISOString(),
        source: BASE,
        pages: pageSummary,
        mailchimpNewsletters: newsletterArchive
          .map((n) => ({
            label: n.label,
            url: n.url,
            file: `newsletters-mailchimp/${n.file}`,
            status: n.status,
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
        assets: downloaded
          .map((d) => ({
            url: d.url,
            file: `media/${d.file}`,
            title: d.title ?? null,
            status: d.status,
            referencedBy: [...d.referencedBy].sort(),
          }))
          .sort((a, b) => a.file.localeCompare(b.file)),
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`\nDone. ${JSON.stringify(tally)}`);
  console.log(`Archive written to ${ARCHIVE}`);

  const failures = downloaded.filter((d) => !['downloaded', 'cached'].includes(d.status));
  if (failures.length) {
    console.log(`\n${failures.length} asset(s) failed:`);
    for (const f of failures.slice(0, 20)) console.log(`  ${f.status}  ${f.url}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
