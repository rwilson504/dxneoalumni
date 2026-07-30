-- Let officers take a photo off the site without destroying it.
--
-- The public pages are generated from these rows, so clearing `removed_at` puts a photo
-- straight back. A hard delete would be irreversible in a way the officer cannot see:
-- the image file itself stays in the repository either way, but the caption, album, and
-- ordering only exist here.

alter table public.photos
  add column if not exists removed_at timestamptz;

-- The public gallery reads this constantly; removals are rare.
create index if not exists photos_visible_idx
  on public.photos (album_id, sort_order)
  where removed_at is null;
