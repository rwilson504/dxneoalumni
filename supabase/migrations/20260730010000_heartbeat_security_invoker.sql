-- Make the heartbeat view run as the caller rather than its owner.
--
-- Postgres executes a view with the privileges of the view's OWNER unless
-- security_invoker is set (Postgres 15+). Supabase's linter rates that critical,
-- because such a view can return rows that Row Level Security would otherwise have
-- withheld from the caller.
--
-- public.heartbeat only selects now(), so nothing is actually exposed today. It is
-- fixed anyway: the risk is that it stands as the in-repo example of how to add a
-- view, and the next one copied from it might select from members or dues_payments.
--
-- The SECURITY DEFINER *functions* in the initial migration are deliberate and stay as
-- they are — is_officer() and friends have to read members without re-triggering the
-- policies that call them, and each pins `search_path` to avoid the usual hijack.

alter view public.heartbeat set (security_invoker = true);
