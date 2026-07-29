/**
 * Parses every file in supabase/migrations with the real PostgreSQL grammar.
 *
 * Migrations are applied to PRODUCTION automatically when main is pushed, and there is
 * no local database to try them against (that needs Docker — see the README). Parsing
 * catches syntax errors before they reach the live project. It does NOT catch runtime
 * problems: a policy that references a missing column parses perfectly well.
 *
 *   npm run check:sql
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import initParser from 'pg-query-emscripten';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');

const pg = await new initParser();
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

let failed = 0;

for (const file of files) {
  const sql = readFileSync(join(dir, file), 'utf8');
  const result = pg.parse(sql);

  if (result.error) {
    failed++;
    const { message, cursorpos } = result.error;
    // cursorpos is a byte offset; turn it into something a human can act on.
    const upto = sql.slice(0, cursorpos ?? 0);
    const line = upto.split('\n').length;
    console.log(`FAIL  ${file}`);
    console.log(`        ${message} (line ${line})`);
    continue;
  }

  const statements = result.parse_tree?.stmts?.length ?? 0;
  console.log(`ok    ${file}  (${statements} statements)`);
}

console.log(`\n${files.length - failed}/${files.length} migrations parsed.`);
process.exitCode = failed ? 1 : 0;
