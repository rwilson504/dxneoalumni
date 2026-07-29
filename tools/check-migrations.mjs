/**
 * Parses every migration and seed file with the real PostgreSQL grammar.
 *
 * Migrations are applied to PRODUCTION automatically when main is pushed, and there is
 * no local database to try them against (that needs Docker — see the README). Parsing
 * catches syntax errors before they reach the live project. It does NOT catch runtime
 * problems: a policy that references a missing column parses perfectly well.
 *
 *   npm run check:sql
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import initParser from 'pg-query-emscripten';

/**
 * The WASM parser aborts on large inputs (the generated seed is ~230 statements and
 * reliably crashes it), so files are parsed in batches. Splitting has to respect
 * dollar-quoted function bodies and quoted literals, or the migrations' `$$ ... $$`
 * blocks would be cut in half.
 */
function splitStatements(sql) {
  const statements = [];
  let start = 0;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (ch === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") { i++; break; }
        else i++;
      }
      continue;
    }
    // Only look for a dollar-quote tag when one can actually start here, and match
    // against a short window — slicing the rest of the file per character is O(n^2).
    if (ch === '$') {
      const tag = sql.slice(i, i + 64).match(/^\$([A-Za-z_]\w*)?\$/)?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        i = end === -1 ? sql.length : end + tag.length;
        continue;
      }
    }
    if (ch === ';') {
      statements.push(sql.slice(start, i + 1));
      i++;
      start = i;
      continue;
    }
    i++;
  }

  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);

  // A chunk that is only comments carries no statement. Checked line by line rather
  // than with a regex: the obvious /^\s*(--[^\n]*\s*)+$/ backtracks catastrophically
  // on the comment blocks in the migrations.
  const onlyComments = (chunk) =>
    chunk.split('\n').every((line) => {
      const t = line.trim();
      return t === '' || t.startsWith('--');
    });

  return statements.filter((s) => s.trim() && !onlyComments(s));
}

const BATCH_BYTES = 4000;

/**
 * The WASM parser never frees between calls, so it exhausts its heap after roughly
 * 30-40KB of cumulative input and then aborts — and an aborted instance stays poisoned,
 * failing every later file for unrelated reasons. The budget is therefore measured in
 * bytes parsed, not calls: one 60KB file dies just as readily as a hundred small ones.
 */
class Recycling {
  #pg = null;
  #bytes = 0;

  async parse(sql) {
    if (!this.#pg || this.#bytes + sql.length > 12000) await this.reset();
    this.#bytes += sql.length;
    return this.#pg.parse(sql);
  }

  async reset() {
    this.#pg = await new initParser();
    this.#bytes = 0;
  }
}

async function parseInBatches(parser, sql) {
  const statements = splitStatements(sql);
  const batches = [];
  let batch = '';

  for (const statement of statements) {
    if (batch && batch.length + statement.length > BATCH_BYTES) {
      batches.push(batch);
      batch = '';
    }
    batch += statement + '\n';
  }
  if (batch.trim()) batches.push(batch);

  let count = 0;
  for (const chunk of batches) {
    const result = await parser.parse(chunk);
    if (result.error) return { error: result.error };
    count += result.parse_tree?.stmts?.length ?? 0;
  }
  return { count };
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDir = join(root, 'supabase', 'migrations');
const seedDir = join(root, 'supabase');

const files = [
  ...readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => join(migrationDir, f)),
  ...readdirSync(seedDir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => join(seedDir, f)),
].filter((f) => existsSync(f));

const parser = new Recycling();
let failed = 0;

for (const path of files) {
  const sql = readFileSync(path, 'utf8');
  const name = relative(root, path).replace(/\\/g, '/');
  let outcome;

  try {
    outcome = await parseInBatches(parser, sql);
  } catch (e) {
    outcome = { error: { message: `parser aborted: ${e.message}` } };
    await parser.reset();
  }

  if (outcome.error) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`        ${outcome.error.message}`);
    continue;
  }
  console.log(`ok    ${name}  (${outcome.count} statements)`);
}

console.log(`\n${files.length - failed}/${files.length} SQL files parsed.`);
process.exitCode = failed ? 1 : 0;
