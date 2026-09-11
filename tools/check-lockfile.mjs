/**
 * Keeps package-lock.json resolvable from GitHub Actions.
 *
 * Installing behind an internal mirror (Azure Artifacts, the CFS proxy) writes that
 * mirror's hostname into every "resolved" URL. Those hosts are not dependable from a
 * GitHub-hosted runner, so the lockfile has to be normalised back to registry.npmjs.org
 * before it is committed. Tarball contents are identical, so "integrity" still matches.
 *
 * Locally npm rewrites registry.npmjs.org back to the configured registry on the fly
 * (see `npm config get replace-registry-host`), so a normalised lockfile installs fine
 * on a machine that cannot reach npmjs.org directly.
 *
 *   node tools/check-lockfile.mjs         verify only, non-zero exit if work is needed
 *   node tools/check-lockfile.mjs --fix   rewrite in place
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PUBLIC_REGISTRY = 'https://registry.npmjs.org';
const LOCKFILE = 'package-lock.json';

/** Mirrors keep the npmjs path intact after a prefix; strip the prefix to get back. */
const MIRROR_PATTERNS = [
  // https://<host>.pkgs.visualstudio.com/<org>/_packaging/<feed>/npm/registry/<path>
  // https://pkgs.dev.azure.com/<org>/<project>/_packaging/<feed>/npm/registry/<path>
  /^https?:\/\/[^/]*\b(?:pkgs\.visualstudio\.com|pkgs\.dev\.azure\.com)\/.*?\/_packaging\/[^/]+\/npm\/registry\//,
  // https://packagefeedproxy.microsoft.io/npm/<path>
  /^https?:\/\/packagefeedproxy\.microsoft\.io\/npm\//,
];

function normalise(url) {
  if (url.startsWith(`${PUBLIC_REGISTRY}/`)) return { url, changed: false };
  for (const pattern of MIRROR_PATTERNS) {
    if (pattern.test(url)) {
      return { url: url.replace(pattern, `${PUBLIC_REGISTRY}/`), changed: true };
    }
  }
  return { url, changed: false, unknown: true };
}

const fix = process.argv.includes('--fix');
const original = readFileSync(LOCKFILE, 'utf8');

let rewritten = 0;
const unknownHosts = new Map();

const updated = original.replace(/"resolved":\s*"([^"]+)"/g, (match, url) => {
  // Local file:, git+ and workspace links are legitimate and must be left alone.
  if (!/^https?:\/\//.test(url)) return match;
  const result = normalise(url);
  if (result.unknown) {
    const host = new URL(url).host;
    unknownHosts.set(host, (unknownHosts.get(host) ?? 0) + 1);
    return match;
  }
  if (!result.changed) return match;
  rewritten += 1;
  return match.replace(url, result.url);
});

if (unknownHosts.size > 0) {
  console.error(`${LOCKFILE} has "resolved" URLs on unrecognised hosts:`);
  for (const [host, count] of unknownHosts) console.error(`  ${host} (${count})`);
  console.error('Add the host to MIRROR_PATTERNS if it is a known mirror, or investigate it.');
  process.exit(2);
}

if (rewritten === 0) {
  console.log(`${LOCKFILE}: all "resolved" URLs already point at ${PUBLIC_REGISTRY}.`);
  process.exit(0);
}

if (!fix) {
  console.error(`${LOCKFILE}: ${rewritten} "resolved" URL(s) point at an internal mirror.`);
  console.error('Run `npm run lockfile:fix` before committing, or CI will not install.');
  process.exit(1);
}

JSON.parse(updated); // fail loudly rather than write a corrupted lockfile
writeFileSync(LOCKFILE, updated);
console.log(`${LOCKFILE}: rewrote ${rewritten} "resolved" URL(s) to ${PUBLIC_REGISTRY}.`);
