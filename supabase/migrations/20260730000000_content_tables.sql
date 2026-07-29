-- Content tables: events, albums, photos.
--
-- Phase 3 moves site content out of src/data/*.json and into the database so officers
-- can maintain it. The public site is still statically built — Astro reads these tables
-- at build time — so everything here must be readable by `anon`.
--
-- Image FILES deliberately stay in git (src/assets/…) rather than moving to Storage.
-- They total ~210MB, and Astro re-downloads remote images to optimise them, so hosting
-- them here would spend the whole 5GB/month free egress allowance in about 24 cold
-- builds while gaining nothing: the files are already committed and already optimised
-- from local disk. These tables therefore hold metadata and name a file; Storage is
-- used only as a staging inbox for new uploads (see photo_uploads below).
--
-- Dates are stored as year/month/day rather than a single `date` because the salvaged
-- Wix content is genuinely imprecise: 9 of 45 events know only the year, and 14 know no
-- day. Flattening those to a real date would invent precision the source never had.
-- `sort_date` restores a single sortable value using the same fallback the old
-- src/lib/events.ts used (undated items sort to the end of their year).

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  year integer not null,
  month integer check (month between 1 and 12),
  day integer check (day between 1 and 31),
  image_file text,
  image_alt text,
  sort_date date generated always as (
    make_date(year, coalesce(month, 12), coalesce(day, 28))
  ) stored,
  created_at timestamptz not null default now()
);

create index if not exists events_sort_date_idx on public.events (sort_date desc);

-- ---------------------------------------------------------------------------
-- Albums
--
-- An album is a set of photos. Linking to an event is optional: `event_id` is null for
-- groups that never had one (the Food Bank photos, for instance), which is what keeps
-- the gallery usable for things outside the event list.
--
-- Albums are created lazily — attaching the first photo to an event creates its album —
-- so the gallery never fills up with empty shells for events nobody photographed.
-- ---------------------------------------------------------------------------

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  event_id uuid unique references public.events (id) on delete set null,
  year integer,
  month integer check (month between 1 and 12),
  day integer check (day between 1 and 31),
  sort_date date generated always as (
    make_date(year, coalesce(month, 12), coalesce(day, 28))
  ) stored,
  created_at timestamptz not null default now()
);

-- make_date is strict, so an album with no known year gets a null sort_date and lands
-- last. Only the Food Bank set is in that position after the migration.
create index if not exists albums_sort_date_idx on public.albums (sort_date desc nulls last);
create index if not exists albums_event_id_idx on public.albums (event_id);

-- ---------------------------------------------------------------------------
-- Photos
--
-- `file` names an image committed under src/assets/gallery. A row only exists once the
-- file is actually in the repo, so the build can never reference a missing image.
--
-- `caption` holds the original Wix caption verbatim, numbering and all
-- ("Cleveland Whiskey Tour (2)"). The album supplies the display title; the caption is
-- kept because it is the only description these images have ever had, and it is what
-- archive/photo-gallery-items.json can be checked against.
-- ---------------------------------------------------------------------------

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  file text not null unique,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists photos_album_id_idx on public.photos (album_id, sort_order);

-- ---------------------------------------------------------------------------
-- Photo uploads (staging inbox)
--
-- GitHub Pages is static, so a browser cannot commit to the repo. An officer uploading
-- a photo parks the file in the `uploads` bucket and records it here. A GitHub Action
-- then downsizes it, commits it to src/assets/gallery, inserts the real `photos` row,
-- and clears both this row and the stored object. Anything still sitting here is work
-- the Action has not picked up yet.
-- ---------------------------------------------------------------------------

create table if not exists public.photo_uploads (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums (id) on delete cascade,
  storage_path text not null unique,
  caption text,
  uploaded_by uuid references public.members (id) on delete set null,
  error text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- All three tables are public to read: they are the public website. Writes are officer
-- and admin only, reusing the helper from the initial migration.
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.albums enable row level security;
alter table public.photos enable row level security;
alter table public.photo_uploads enable row level security;

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to anon, authenticated using (true);

drop policy if exists events_write on public.events;
create policy events_write on public.events
  for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

drop policy if exists albums_select on public.albums;
create policy albums_select on public.albums
  for select to anon, authenticated using (true);

drop policy if exists albums_write on public.albums;
create policy albums_write on public.albums
  for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos
  for select to anon, authenticated using (true);

drop policy if exists photos_write on public.photos;
create policy photos_write on public.photos
  for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- The inbox is officer-only in both directions; it never appears on the public site.
drop policy if exists photo_uploads_all on public.photo_uploads;
create policy photo_uploads_all on public.photo_uploads
  for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

-- RLS filters rows; it does not grant access to the table. Without these the API
-- returns "42501 permission denied" for everyone, signed in or not.
grant select on public.events, public.albums, public.photos to anon;
grant select, insert, update, delete
  on public.events, public.albums, public.photos, public.photo_uploads to authenticated;

-- ---------------------------------------------------------------------------
-- Upload staging
--
-- Private, and deliberately not where images live long-term: the GitHub Action empties
-- it as it commits each file into the repo. Nothing here is served to visitors, so it
-- stays far below the free tier's 1GB.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

drop policy if exists uploads_officer_all on storage.objects;
create policy uploads_officer_all on storage.objects
  for all to authenticated
  using (bucket_id = 'uploads' and public.is_officer())
  with check (bucket_id = 'uploads' and public.is_officer());
