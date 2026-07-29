/**
 * Smoke test for the Supabase backend.
 *
 * Verifies the migration applied and, more importantly, that Row Level Security
 * actually blocks anonymous reads. Run with:
 *   node --env-file=.env tools/check-supabase.mjs
 */

const url = process.env.PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function rest(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

console.log(`Project: ${url}\n`);

// 1. Project reachable and the migration ran (heartbeat view exists, granted to anon).
{
  const { status, body } = await rest('heartbeat?select=checked_at');
  record(
    'project awake + migration applied',
    status === 200 && Array.isArray(body) && body.length === 1,
    status === 200 ? `heartbeat ${body?.[0]?.checked_at}` : `HTTP ${status} ${JSON.stringify(body)}`
  );
}

// 2. Tables exist. A 404 here means the migration never ran.
for (const table of ['members', 'documents', 'dues_payments']) {
  const { status, body } = await rest(`${table}?select=id&limit=1`);
  const missing = status === 404 || body?.code === '42P01';
  record(`table "${table}" exists`, !missing, `HTTP ${status}`);
}

// 3. Table grants. RLS filters rows but does not grant access to the table itself.
// Without grants every request fails with 42501 — including signed-in members.
// `documents` is the probe because its policy explicitly allows anonymous reads,
// so anything other than 200 here means the grants are missing.
{
  const { status, body } = await rest('documents?select=id&limit=1');
  const denied = body?.code === '42501';
  record(
    'table privileges granted to API roles',
    status === 200 && !denied,
    denied ? `42501 permission denied — run the grants migration` : `HTTP ${status}`
  );
}

// 4. THE IMPORTANT ONE. Anonymous callers must see no member data.
{
  const { status, body } = await rest('members?select=id,full_name,email');
  const leaked = status === 200 && Array.isArray(body) && body.length > 0;
  record(
    'RLS blocks anonymous read of members',
    !leaked,
    leaked
      ? `LEAKED ${body.length} rows — check that RLS is enabled!`
      : `HTTP ${status}${body?.code ? ` (${body.code})` : ''}`
  );
}

{
  const { status, body } = await rest('dues_payments?select=id,amount');
  const leaked = status === 200 && Array.isArray(body) && body.length > 0;
  record(
    'RLS blocks anonymous read of dues',
    !leaked,
    leaked ? `LEAKED ${body.length} rows` : `HTTP ${status}${body?.code ? ` (${body.code})` : ''}`
  );
}

// 5. Anonymous writes must be rejected outright.
{
  const res = await fetch(`${url}/rest/v1/members`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ email: 'rls-probe@example.invalid', full_name: 'RLS Probe' }),
  });
  record(
    'RLS blocks anonymous insert into members',
    res.status === 401 || res.status === 403,
    `HTTP ${res.status}`
  );
}

// 5. Auth configuration.
{
  const res = await fetch(`${url}/auth/v1/settings`, { headers });
  const settings = await res.json().catch(() => null);
  record(
    'auth reachable, email sign-in enabled',
    res.status === 200 && settings?.external?.email === true,
    res.status === 200
      ? `magic link ${settings?.external?.email ? 'on' : 'OFF'}, signups ${settings?.disable_signup ? 'disabled' : 'enabled'}`
      : `HTTP ${res.status}`
  );
}

// 6. Content tables. These fail until the content migration reaches production —
// that is the point: it is how you confirm the push actually applied.
{
  const { status, body } = await rest('events?select=id&limit=1');
  const missing = status === 404 || body?.code === '42P01';
  record('content migration applied', !missing, missing ? 'events table not found' : `HTTP ${status}`);
}

// The public site is built from these, so an anonymous reader must be able to see them.
for (const table of ['events', 'albums', 'photos']) {
  const { status, body } = await rest(`${table}?select=id&limit=1`);
  record(
    `anonymous can read "${table}"`,
    status === 200,
    status === 200 ? 'readable' : `HTTP ${status}${body?.code ? ` (${body.code})` : ''}`
  );
}

// The upload inbox is officer-only and names who uploaded what; it must not leak.
{
  const { status, body } = await rest('photo_uploads?select=id,storage_path');
  const leaked = status === 200 && Array.isArray(body) && body.length > 0;
  record(
    'RLS blocks anonymous read of photo_uploads',
    !leaked,
    leaked ? `LEAKED ${body.length} rows` : `HTTP ${status}${body?.code ? ` (${body.code})` : ''}`
  );
}

// Content is officer-maintained; an anonymous caller must not be able to add events.
{
  const res = await fetch(`${url}/rest/v1/events`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ slug: 'rls-probe', title: 'RLS Probe', year: 2026 }),
  });
  record(
    'RLS blocks anonymous insert into events',
    res.status === 401 || res.status === 403 || res.status === 404,
    `HTTP ${res.status}`
  );
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exitCode = failed.length ? 1 : 0;
