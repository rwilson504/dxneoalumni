-- Grant the content tables to service_role.
--
-- service_role bypasses Row Level Security but NOT table privileges, and the content
-- migration granted only anon and authenticated. The photo ingest job therefore failed
-- with "permission denied for table photo_uploads" despite holding the service key.
--
-- This did not surface earlier because check-supabase.mjs deliberately probes with the
-- anon key: it is written to prove that anonymous callers are blocked, so it could
-- never have caught a privilege that only CI uses.

grant select, insert, update, delete
  on public.events, public.albums, public.photos, public.photo_uploads to service_role;
