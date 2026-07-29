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

/** Absolute URL for magic-link redirects, honouring the GitHub Pages base path. */
export function siteUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}${path}`;
}
