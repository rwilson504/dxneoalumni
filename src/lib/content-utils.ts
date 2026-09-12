/** Turns a title into a URL-safe slug, matching what tools/migrate-content.mjs produced. */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Turns known Supabase errors into messages that tell an officer what to do next. */
export function describeError(error: { code?: string; message: string } | null): string | null {
  if (!error) return null;
  if (error.code === '42P01') {
    return 'The content tables do not exist yet. Push the migration to main so Supabase applies it, then run supabase/seed-content.sql once in the SQL editor.';
  }
  if (error.code === '42501') {
    return 'Permission denied. Your member row needs the officer or admin role.';
  }
  return error.message;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** Formats a partial date without inventing a missing month or day. */
export function formatPartialDate(
  year: number | null,
  month: number | null,
  day: number | null
): string {
  if (!year) return 'No date';
  if (!month) return String(year);
  return day ? `${MONTHS[month - 1]} ${day}, ${year}` : `${MONTHS[month - 1]} ${year}`;
}

export type ClassYearOption = { label: string; value: string };

/** Presents full graduation years while preserving the roster's apostrophe-year format. */
export function classYearOptions(currentYear = new Date().getFullYear(), firstYear = 1940): ClassYearOption[] {
  return Array.from({ length: currentYear - firstYear + 1 }, (_, index) => {
    const year = currentYear - index;
    return { label: String(year), value: `'${String(year).slice(-2)}` };
  });
}

export function formatIcsDate(year: number, month: number, day: number): string {
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Folds iCalendar content lines to at most 75 UTF-8 octets, including continuation space. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';

  for (const character of line) {
    if (encoder.encode(current + character).length > 75) {
      parts.push(current);
      current = ` ${character}`;
    } else {
      current += character;
    }
  }

  parts.push(current);
  return parts.join('\r\n');
}

export function googleMapsDirectionsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}