/**
 * Rebuilds the photo gallery from the legacy Wix site.
 *
 * The item list itself cannot be fetched: the Wix gallery renders only the first
 * 15 photos server-side and reveals the rest through a "Show More" button that
 * calls back to the client-side component. The captions live nowhere but the
 * rendered DOM. So the list was lifted out of a real browser session once and
 * committed to archive/photo-gallery-items.json — see the README. This script
 * takes that list and does the rest over plain HTTP:
 *
 *   archive/media/           full-resolution originals (resumable)
 *   src/assets/gallery/      the same files, named for Astro's asset pipeline
 *   src/data/gallery.json    caption + grouping metadata for the site
 */

import { mkdir, writeFile, readFile, copyFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ITEMS = path.join(ROOT, 'archive/photo-gallery-items.json');
const MEDIA = path.join(ROOT, 'archive/media');
const ASSETS = path.join(ROOT, 'src/assets/gallery');
const DATA = path.join(ROOT, 'src/data/gallery.json');

const DOWNLOAD_CONCURRENCY = 6;
const USER_AGENT = 'Mozilla/5.0 (compatible; dxneoalumni-archive/1.0; one-time content salvage)';

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Astro resolves `~` as a path alias, so it cannot appear in an asset filename. */
function assetName(media) {
  return media.replace(/~/g, '-');
}

async function download(media) {
  const dest = path.join(MEDIA, media);
  if (await exists(dest)) return 'cached';

  const res = await fetch(`https://static.wixstatic.com/media/${media}`, {
    headers: { 'user-agent': USER_AGENT },
  });
  if (!res.ok) return `failed:${res.status}`;

  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return 'downloaded';
}

async function mapWithConcurrency(list, limit, worker) {
  const results = new Array(list.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (cursor < list.length) {
        const i = cursor++;
        results[i] = await worker(list[i]);
      }
    })
  );
  return results;
}

const items = JSON.parse(await readFile(ITEMS, 'utf8'));
await mkdir(MEDIA, { recursive: true });
await mkdir(ASSETS, { recursive: true });

const statuses = await mapWithConcurrency(items, DOWNLOAD_CONCURRENCY, (item) =>
  download(item.media)
);

const failed = [];
const gallery = [];

for (const [i, item] of items.entries()) {
  if (statuses[i].startsWith('failed')) {
    failed.push(`${item.media} (${statuses[i]})`);
    continue;
  }
  const file = assetName(item.media);
  await copyFile(path.join(MEDIA, item.media), path.join(ASSETS, file));
  gallery.push({
    file,
    caption: item.caption,
    group: item.group,
    groupIndex: item.groupIndex,
  });
}

await writeFile(DATA, JSON.stringify(gallery, null, 2) + '\n');

const tally = statuses.reduce((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});
console.log(`photos: ${gallery.length}`, tally);
if (failed.length) console.warn(`failed:\n  ${failed.join('\n  ')}`);
