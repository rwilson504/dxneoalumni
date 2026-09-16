-- ---------------------------------------------------------------------------
-- Restore the is_active guard that 20260914000000 dropped.
--
-- 20260912010000 added members.is_active and rewrote claim_member_row to skip
-- deactivated rows. 20260914000000 then fixed case-insensitive matching but was written
-- against the ORIGINAL function body, so it silently reverted that guard: claiming could
-- link a deactivated row to an account.
--
-- This keeps the case-insensitive matching and puts the guard back, on both the
-- auth.users side and the members side.
-- ---------------------------------------------------------------------------

create or replace function public.claim_member_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.members
     set user_id = new.id
   where lower(email::text) = lower(new.email::text)
     and user_id is null
     and is_active;
  return new;
end;
$$;

create or replace function public.link_member_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null and new.is_active then
    select u.id
      into new.user_id
      from auth.users u
     where lower(u.email::text) = lower(new.email::text)
     limit 1;
  end if;
  return new;
end;
$$;

-- Re-run the backfill. Idempotent: only unclaimed, active rows are touched.
do $$
declare
  claimed integer;
begin
  update public.members m
     set user_id = u.id
    from auth.users u
   where m.user_id is null
     and m.is_active
     and lower(m.email::text) = lower(u.email::text);

  get diagnostics claimed = row_count;
  raise notice 'Linked % unclaimed member row(s) to existing accounts.', claimed;
end;
$$;
