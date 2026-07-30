import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/**
 * The anon key is meant to be public — it identifies the project, it does not grant
 * access. Every table is protected by Row Level Security, so what a signed-in browser
 * can read or write is decided by Postgres, not by this client.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.');
  }
  client ??= createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

export type MemberRole = 'member' | 'officer' | 'admin';

export type Member = {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  phone: string | null;
  undergrad_chapter: string | null;
  class_year: string | null;
  officer_letter: string | null;
  is_virtual: boolean;
  role: MemberRole;
  directory_opt_in: boolean;
};

export type DuesPayment = {
  id: string;
  member_id: string;
  year: number;
  amount: number;
  method: string | null;
  paid_on: string;
};

export const duesColumns = 'id, member_id, year, amount, method, paid_on';

export type ChapterEventRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  year: number;
  month: number | null;
  day: number | null;
  image_file: string | null;
  image_alt: string | null;
  sort_date: string | null;
};

export type Album = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  event_id: string | null;
  year: number | null;
  month: number | null;
  day: number | null;
  sort_date: string | null;
};

export type Photo = {
  id: string;
  album_id: string;
  file: string;
  caption: string | null;
  sort_order: number;
  removed_at: string | null;
};

export const photoColumns = 'id, album_id, file, caption, sort_order, removed_at';

export type PhotoUpload = {
  id: string;
  album_id: string | null;
  event_id: string | null;
  storage_path: string;
  caption: string | null;
  error: string | null;
  created_at: string;
};

export const eventColumns =
  'id, slug, title, description, year, month, day, image_file, image_alt, sort_date';
export const albumColumns =
  'id, slug, title, description, event_id, year, month, day, sort_date';

/** Turns a title into a URL-safe slug, matching what tools/migrate-content.mjs produced. */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Postgres 42P01 is "relation does not exist" — here it always means the content
 * migration has not been applied yet, which is worth saying plainly rather than
 * showing an officer a raw driver error.
 */
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

/** Formats a partial date honestly — "2019", "March 2024", "13 October 2025". */
export function formatPartialDate(
  year: number | null,
  month: number | null,
  day: number | null
): string {
  if (!year) return 'No date';
  if (!month) return String(year);
  return day ? `${MONTHS[month - 1]} ${day}, ${year}` : `${MONTHS[month - 1]} ${year}`;
}

/** Absolute URL for magic-link redirects, honouring the GitHub Pages base path. */
export function siteUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}${path}`;
}
