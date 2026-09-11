/**
 * Fails if an em dash appears anywhere in the site's source.
 *
 * Em dashes read as a tell that copy was machine-written, so the chapter's content
 * does not use them. En dashes are left alone: the only one in the codebase is inside
 * a regex character class that parses date ranges out of legacy event titles.
 *
 * archive/ and public/newsletters/ are historical records and are never rewritten.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['src', 'tools', '.github'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.git']);
// This file necessarily contains the thing it looks for.
const SELF = fileURLToPath(import.meta.url);
const EXTENSIONS = ['.astro', '.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.html', '.css', '.yml'];
const PATTERN = /\u2014|&mdash;|&#8212;|&#x2014;/gi;

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* files(path);
    } else if (path !== SELF && EXTENSIONS.some((e) => entry.name.endsWith(e))) {
      yield path;
    }
  }
}

let found = 0;
for (const dir of ROOTS) {
  for (const path of files(join(root, dir))) {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!PATTERN.test(line)) return;
      PATTERN.lastIndex = 0;
      found++;
      console.error(`${relative(root, path)}:${i + 1}\n    ${line.trim().slice(0, 120)}`);
    });
  }
}

if (found > 0) {
  console.error(`\n${found} em dash(es) found. Rewrite the sentence: use a comma, colon, or full stop.`);
  process.exit(1);
}
console.log(`No em dashes in ${ROOTS.join(', ')}.`);
