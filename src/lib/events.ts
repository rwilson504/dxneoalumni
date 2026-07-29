import rawEvents from '~/data/events.json';

export type ChapterEvent = {
  slug: string;
  title: string;
  year: number;
  month: number | null;
  day: number | null;
  description: string;
  image: string | null;
  imageAlt: string | null;
  order: number;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const events = rawEvents as ChapterEvent[];

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

/** Sortable timestamp. Undated events sort to the end of their year. */
export function timestamp(event: ChapterEvent): number {
  return Date.UTC(event.year, (event.month ?? 12) - 1, event.day ?? 28);
}

export function formatDate(event: ChapterEvent): string {
  if (!event.month) return String(event.year);
  const month = MONTH_NAMES[event.month - 1];
  return event.day ? `${month} ${event.day}, ${event.year}` : `${month} ${event.year}`;
}

/**
 * Upcoming/past is derived from the date rather than carried over from the old site,
 * where events sat under "Upcoming" long after they happened.
 */
function splitByDate(list: ChapterEvent[]) {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const upcoming: ChapterEvent[] = [];
  const past: ChapterEvent[] = [];
  for (const event of list) {
    (timestamp(event) >= todayUtc ? upcoming : past).push(event);
  }
  return { upcoming, past };
}

const split = splitByDate(events);

export const upcomingEvents = split.upcoming.sort((a, b) => timestamp(a) - timestamp(b));
export const pastEvents = split.past.sort((a, b) => timestamp(b) - timestamp(a));

export function groupByYear(list: ChapterEvent[]): { year: number; events: ChapterEvent[] }[] {
  const byYear = new Map<number, ChapterEvent[]>();
  for (const event of list) {
    const bucket = byYear.get(event.year) ?? [];
    bucket.push(event);
    byYear.set(event.year, bucket);
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, items]) => ({ year, events: items }));
}

const eventImages = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/events/*.{jpg,jpeg,png,gif,JPG,JPEG}',
  { eager: true }
);

export function eventImage(event: ChapterEvent): ImageMetadata | null {
  if (!event.image) return null;
  return eventImages[`/src/assets/events/${event.image}`]?.default ?? null;
}
