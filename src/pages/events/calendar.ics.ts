import type { APIRoute } from 'astro';
import { displayTitle, events } from '~/lib/content';
import { escapeIcsText, foldIcsLine, formatIcsDate } from '~/lib/content-utils';

export const prerender = true;

function nextDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return formatIcsDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const eventsUrl = new URL(`${base}/events`, site).href;
  const generated = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Delta Chi NEO Alumni Chapter//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Delta Chi Northeast Ohio Alumni Chapter',
    'X-WR-CALDESC:Events hosted by the Delta Chi Northeast Ohio Alumni Chapter',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ];

  for (const event of events) {
    const month = event.month ?? 1;
    const day = event.day ?? 1;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@dxneoalumni`,
      `DTSTAMP:${generated}`,
      `DTSTART;VALUE=DATE:${formatIcsDate(event.year, month, day)}`,
      `DTEND;VALUE=DATE:${nextDate(event.year, month, day)}`,
      `SUMMARY:${escapeIcsText(displayTitle(event))}`,
      ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
      `DESCRIPTION:${escapeIcsText(event.description ?? '')}`,
      `URL:${eventsUrl}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return new Response(`${lines.map(foldIcsLine).join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="delta-chi-neo-events.ics"',
    },
  });
};