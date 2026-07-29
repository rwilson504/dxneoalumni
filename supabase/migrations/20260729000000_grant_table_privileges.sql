-- Grant table privileges to the API roles.
--
-- Row Level Security filters rows a role may touch; it does not grant access to the
-- table in the first place. Without these grants PostgREST returns
-- "42501 permission denied for table ..." for every request, signed in or not.
--
-- Grants are deliberately narrow: anon gets nothing beyond public documents, and the
-- policies in the initial migration still decide which rows each role actually sees.

grant select, insert, update, delete on public.members to authenticated;

-- documents_select allows anonymous visitors to read rows marked 'public'.
grant select on public.documents to anon;
grant select, insert, update, delete on public.documents to authenticated;

grant select, insert, update, delete on public.dues_payments to authenticated;
