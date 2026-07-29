/**
 * Build-time content, read from Supabase.
 *
 * The site is static: this runs during `astro build`, never in a visitor's browser.
 * Officers edit content in the member area, a rebuild publishes it.
 *
 * Image FILES are not in the database — they live in src/assets and are optimised by
 * Astro from local disk. These rows only name them.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export type ChapterEvent = {
  slug: string;
  title: string;
  description: string | null;
  year: number;
  month: number | null;
  day: number | null;
  image_file: string | null;
  image_alt: string | null;
  sort_date: string;
};

export type GalleryAlbum = {
  slug: string;
  title: string;
  year: number | null;
  month: number | null;
  sort_date: string | null;
  photos: { file: string; caption: string | null }[];
};

/**
 * Publishing an empty gallery because the database was asleep would be worse than
 * failing the build, so an unexpectedly empty table stops the deploy.
 */
function assertNotEmpty(what: string, rows: unknown[]) {
  if (rows.length === 0) {
    throw new Error(
      `No ${what} returned from Supabase. Refusing to build a site with no ${what} — `
      + 'check the project is awake and the content seed has been run.'
    );
  }
}

async function fetchContent() {
  if (!url || !key) {
    throw new Error(
      'PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY must be set at build time; '
      + 'the public pages are generated from the database.'
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const [eventRes, albumRes, photoRes] = await Promise.all([
    supabase
      .from('events')
      .select('slug, title, description, year, month, day, image_file, image_alt, sort_date')
      .order('sort_date', { ascending: false }),
    supabase
      .from('albums')
      .select('id, slug, title, year, month, sort_date')
      .order('sort_date', { ascending: false, nullsFirst: false }),
    supabase
      .from('photos')
      .select('album_id, file, caption, sort_order')
      .order('sort_order'),
  ]);

  for (const res of [eventRes, albumRes, photoRes]) {
    if (res.error) throw new Error(`Supabase: ${res.error.message}`);
  }

  const events = (eventRes.data ?? []) as ChapterEvent[];
  const albumRows = (albumRes.data ?? []) as (Omit<GalleryAlbum, 'photos'> & { id: string })[];
  const photos = (photoRes.data ?? []) as
    { album_id: string; file: string; caption: string | null; sort_order: number }[];

  assertNotEmpty('events', events);
  assertNotEmpty('albums', albumRows);
  assertNotEmpty('photos', photos);

  const byAlbum = new Map<string, { file: string; caption: string | null }[]>();
  for (const photo of photos) {
    const bucket = byAlbum.get(photo.album_id) ?? [];
    bucket.push({ file: photo.file, caption: photo.caption });
    byAlbum.set(photo.album_id, bucket);
  }

  const albums: GalleryAlbum[] = albumRows
    .map(({ id, ...album }) => ({ ...album, photos: byAlbum.get(id) ?? [] }))
    .filter((album) => album.photos.length > 0);

  return { events, albums };
}

// One round trip per build rather than one per page that imports this.
const content = await fetchContent();

export const events = content.events;
export const albums = content.albums;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** Formats only the precision actually known — "2019", "March 2024", "October 13, 2025". */
export function formatDate(
  year: number | null,
  month: number | null,
  day: number | null = null
): string {
  if (!year) return '';
  if (!month) return String(year);
  return day ? `${MONTHS[month - 1]} ${day}, ${year}` : `${MONTHS[month - 1]} ${year}`;
}

/** Upcoming vs past is derived from the date, so events move themselves once they pass. */
export function splitByDate(list: ChapterEvent[]) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = list.filter((e) => e.sort_date >= today).sort((a, b) => a.sort_date.localeCompare(b.sort_date));
  const past = list.filter((e) => e.sort_date < today);
  return { upcoming, past };
}

export function groupByYear(list: ChapterEvent[]) {
  const byYear = new Map<number, ChapterEvent[]>();
  for (const event of list) {
    const bucket = byYear.get(event.year) ?? [];
    bucket.push(event);
    byYear.set(event.year, bucket);
  }
  return [...byYear.entries()].sort(([a], [b]) => b - a).map(([year, items]) => ({ year, events: items }));
}

const MONTH_WORD =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

// Titles carry their own date ("Oct. 13th 2025 Founders' Day Dinner"), which would
// duplicate the formatted date shown beside them.
const LEADING_DATE = new RegExp(
  `^${MONTH_WORD}\\.?\\s*\\d{1,2}(?:st|nd|rd|th)?(?:\\s*[-–]\\s*\\d{1,2}(?:st|nd|rd|th)?)?,?\\s*(?:\\d{4})?\\s*[:.\\-]?\\s*`,
  'i'
);

export function displayTitle(event: ChapterEvent): string {
  return event.title
    .replace(LEADING_DATE, '')
    .replace(/^\d{4}\s+/, '')
    .replace(/\s+\d{4}$/, '')
    .trim();
}

const eventImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/events/*.{jpg,jpeg,png,gif,JPG,JPEG}',
  { eager: true }
);

const galleryImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/gallery/*.{jpg,jpeg,png,gif,JPG,JPEG}',
  { eager: true }
);

export function eventImage(file: string | null): ImageMetadata | null {
  return file ? eventImages[`/src/assets/events/${file}`]?.default ?? null : null;
}

export function galleryImage(file: string): ImageMetadata | null {
  return galleryImages[`/src/assets/gallery/${file}`]?.default ?? null;
}
