/**
 * Downsizes images so no single web asset exceeds a byte budget (1MB by default).
 *
 * Exported for reuse: the GitHub Action that ingests officer uploads runs the same
 * function, so a photo added through the member area is treated exactly like the ones
 * salvaged from Wix.
 *
 * Run directly to shrink what is already committed:
 *   node tools/shrink-images.mjs            # report only, changes nothing
 *   node tools/shrink-images.mjs --write
 *
 * Safe to run against src/assets: archive/media holds the full-resolution originals of
 * every one of these files, and `npm run gallery` restores them.
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import sharp from 'sharp';

export const MAX_BYTES = 1024 * 1024;
const MAX_EDGE = 2400;

/**
 * Returns a buffer under `maxBytes`, or the original if it already fits.
 *
 * Resizes first, then walks quality down. Quality alone cannot rescue a 6MB 4032px
 * photo without turning it to mush, and resizing alone overshoots on noisy images.
 *
 * Output is always JPEG when it had to re-encode, so callers must honour the returned
 * `format` when naming the file — writing JPEG bytes to a .png would mislabel it.
 */
export async function shrink(input, maxBytes = MAX_BYTES) {
  if (input.length <= maxBytes) return { buffer: input, changed: false };

  const meta = await sharp(input).metadata();
  // Re-encoding an animated GIF frame by frame is a different problem; leave it alone.
  if (meta.pages > 1) return { buffer: input, changed: false };

  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  const pipeline = () =>
    longest > MAX_EDGE
      ? sharp(input).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      : sharp(input).rotate();

  for (const quality of [82, 72, 62, 52, 42]) {
    const buffer = await pipeline().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (buffer.length <= maxBytes) return { buffer, changed: true, quality, format: 'jpeg' };
  }

  // Still too big: step the dimensions down as well.
  for (const edge of [1800, 1400, 1000]) {
    const buffer = await sharp(input).rotate()
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 62, mozjpeg: true })
      .toBuffer();
    if (buffer.length <= maxBytes) return { buffer, changed: true, quality: 62, edge, format: 'jpeg' };
  }

  const buffer = await sharp(input).rotate()
    .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 45, mozjpeg: true })
    .toBuffer();
  return { buffer, changed: true, quality: 45, edge: 1000, format: 'jpeg' };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const write = process.argv.includes('--write');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dirs = ['src/assets/gallery', 'src/assets/events'];
  const mb = (b) => (b / 1048576).toFixed(1);

  let before = 0;
  let after = 0;
  let touched = 0;

  for (const dir of dirs) {
    const full = join(root, dir);
    for (const name of readdirSync(full)) {
      const path = join(full, name);
      if (!statSync(path).isFile()) continue;
      // Only JPEGs are rewritten in place; anything else would need renaming, since
      // shrink() always re-encodes to JPEG.
      if (!/\.jpe?g$/i.test(extname(name))) continue;

      const input = readFileSync(path);
      before += input.length;

      const { buffer, changed, quality, edge } = await shrink(input);
      after += buffer.length;
      if (!changed) continue;

      touched++;
      console.log(
        `  ${mb(input.length).padStart(5)} -> ${mb(buffer.length).padStart(5)} MB  q${quality}${edge ? ` @${edge}px` : ''}  ${name}`
      );
      if (write) writeFileSync(path, buffer);
    }
  }

  console.log(`\n${touched} file(s) over ${mb(MAX_BYTES)} MB`);
  console.log(`total ${mb(before)} MB -> ${mb(after)} MB  (saves ${mb(before - after)} MB)`);
  if (!write) console.log('\nreport only — pass --write to apply');
}
