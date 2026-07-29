// Verifies src/data/gallery.json still matches the irreplaceable browser capture
// in archive/photo-gallery-items.json. Run after `npm run gallery`.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const capture = JSON.parse(readFileSync(join(root, 'archive/photo-gallery-items.json'), 'utf8'));
const gallery = JSON.parse(readFileSync(join(root, 'src/data/gallery.json'), 'utf8'));

/** Wix media ids contain `~`, which is renamed to `-` for the asset filename. */
const assetName = (media) => media.replace(/~/g, '-');

const problems = [];
const byFile = new Map(gallery.map((p) => [p.file, p]));

for (const item of capture) {
  const photo = byFile.get(assetName(item.media));
  if (!photo) {
    problems.push(`missing from gallery.json: ${item.media} (${item.caption})`);
    continue;
  }
  if (photo.caption !== item.caption) {
    problems.push(`caption drift on ${photo.file}\n    capture: ${item.caption}\n    gallery: ${photo.caption}`);
  }
  if (photo.group !== item.group || photo.groupIndex !== item.groupIndex) {
    problems.push(`grouping drift on ${photo.file}: ${photo.group} (${photo.groupIndex})`);
  }
  if (!existsSync(join(root, 'src/assets/gallery', photo.file))) {
    problems.push(`missing image asset: ${photo.file}`);
  }
}

const captions = new Set(gallery.map((p) => p.caption));
const grouped = gallery.filter((p) => p.group);
const groups = new Set(grouped.map((p) => p.group));

if (captions.size !== gallery.length) {
  problems.push(`captions are not unique: ${captions.size} distinct across ${gallery.length} photos`);
}
if (capture.length !== gallery.length) {
  problems.push(`count mismatch: ${capture.length} captured, ${gallery.length} in gallery.json`);
}

console.log(`captured items  : ${capture.length}`);
console.log(`gallery items   : ${gallery.length}`);
console.log(`unique captions : ${captions.size}`);
console.log(`grouped photos  : ${grouped.length} across ${groups.size} groups`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nOK - gallery.json matches the capture exactly.');
