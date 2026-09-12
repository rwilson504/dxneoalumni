import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export { classYearOptions, describeError, formatPartialDate, slugify } from './content-utils';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/**
 * The anon key is meant to be public. It identifies the project, it does not grant
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
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  undergrad_chapter: string | null;
  class_year: string | null;
  officer_letter: string | null;
  is_virtual: boolean;
  role: MemberRole;
  is_active: boolean;
  directory_opt_in: boolean;
  phone_directory_opt_in: boolean;
  address_directory_opt_in: boolean;
};

export type DirectoryMember = Pick<Member,
  'id' | 'email' | 'full_name' | 'phone' | 'address_line1' | 'address_line2' | 'city' |
  'state' | 'postal_code' | 'undergrad_chapter' | 'class_year' | 'officer_letter' |
  'is_virtual' | 'phone_directory_opt_in' | 'address_directory_opt_in'
> & { is_current_user: boolean };

export type DuesMember = Pick<Member, 'id' | 'full_name' | 'is_virtual'>;

export type DuesPayment = {
  id: string;
  member_id: string;
  year: number;
  amount: number;
  method: string | null;
  paid_on: string;
};

export type DuesRate = {
  year: number;
  chapter_amount: number;
  virtual_amount: number;
};

export type AwardType = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export type ChapterAward = {
  id: string;
  award_type_id: string;
  period_start: number;
  recipient: string | null;
};

export const duesColumns = 'id, member_id, year, amount, method, paid_on';

export type ChapterEventRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  location: string | null;
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
  'id, slug, title, description, location, year, month, day, image_file, image_alt, sort_date';
export const albumColumns =
  'id, slug, title, description, event_id, year, month, day, sort_date';

/** Absolute URL for magic-link redirects, honouring the GitHub Pages base path. */
export function siteUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}${path}`;
}
