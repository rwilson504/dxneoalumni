/**
 * Ingests officer photo uploads into the repository.
 *
 * GitHub Pages is static, so a browser cannot commit. The member area parks an upload
 * in the private `uploads` bucket and records it in public.photo_uploads; this script
 * runs in CI, downsizes each file, writes it into src/assets/gallery, creates the real
 * `photos` row, and clears the staging record.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY: it must read a private bucket and write rows on
 * behalf of an officer, neither of which the anon key can do. That key bypasses RLS
 * entirely, so it lives only as a GitHub Actions secret and is never written to .env.
 *
 * Failures are reported back into photo_uploads.error rather than thrown away, so the
 * officer who uploaded sees why their photo never appeared.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shrink, MAX_BYTES } from './shrink-images.mjs';

/** `::set-output` was removed from Actions; results go through the GITHUB_OUTPUT file. */
function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

const url = process.env.PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const galleryDir = join(root, 'src', 'assets', 'gallery');
mkdirSync(galleryDir, { recursive: true });

const { data: uploads, error } = await supabase
  .from('photo_uploads')
  .select('id, album_id, event_id, storage_path, caption')
  .is('error', null)
  .order('created_at');

if (error) {
  console.error(`Could not read photo_uploads: ${error.message}`);
  process.exit(1);
}

if (!uploads.length) {
  console.log('Nothing to ingest.');
  setOutput('changed', 'false');
  process.exit(0);
}

console.log(`${uploads.length} upload(s) pending.`);

/** Records why an upload could not be processed so it shows up in the member area. */
async function fail(upload, message) {
  console.log(`  FAILED ${upload.storage_path}: ${message}`);
  await supabase.from('photo_uploads').update({ error: message }).eq('id', upload.id);
}

let committed = 0;

for (const upload of uploads) {
  console.log(`- ${upload.storage_path}`);

  const { data: blob, error: downloadError } = await supabase.storage
    .from('uploads')
    .download(upload.storage_path);

  if (downloadError) {
    await fail(upload, `download failed: ${downloadError.message}`);
    continue;
  }

  const original = Buffer.from(await blob.arrayBuffer());

  let output;
  try {
    output = await shrink(original, MAX_BYTES);
  } catch (e) {
    await fail(upload, `not a readable image: ${e.message}`);
    continue;
  }

  // shrink() re-encodes to JPEG, so an untouched file keeps its own extension while a
  // resized one must become .jpg or the bytes and the name disagree.
  const extension = output.changed ? 'jpg' : (upload.storage_path.split('.').pop() ?? 'jpg');
  const file = `${upload.id}.${extension}`;

  writeFileSync(join(galleryDir, file), output.buffer);
  console.log(
    `  ${(original.length / 1048576).toFixed(2)} -> ${(output.buffer.length / 1048576).toFixed(2)} MB  ${file}`
  );

  // Append to the end of the album.
  const { data: last } = await supabase
    .from('photos')
    .select('sort_order')
    .eq('album_id', upload.album_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: insertError } = await supabase.from('photos').insert({
    album_id: upload.album_id,
    file,
    caption: upload.caption,
    sort_order: (last?.sort_order ?? -1) + 1,
  });

  if (insertError) {
    await fail(upload, `could not record photo: ${insertError.message}`);
    continue;
  }

  // Only clear the staging rows once the photo row exists, so a crash leaves the
  // upload to be retried rather than losing it.
  await supabase.storage.from('uploads').remove([upload.storage_path]);
  await supabase.from('photo_uploads').delete().eq('id', upload.id);
  committed++;
}

console.log(`\n${committed} of ${uploads.length} ingested.`);
setOutput('changed', String(committed > 0));
