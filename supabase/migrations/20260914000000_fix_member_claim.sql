-- ---------------------------------------------------------------------------
-- Make roster claiming case-insensitive, and stop it being a one-shot.
--
-- Two faults, both found after a member with `Jddchi@gmail.com` on the roster could
-- not sign in until the address was lowercased by hand:
--
-- 1. Observed: a roster row holding `Jddchi@gmail.com` did not match, and lowercasing
--    it by hand fixed the sign-in. So the comparison was behaving case sensitively
--    despite `members.email` being citext. The likely cause is that `auth.users.email`
--    is varchar, and `citext = varchar` can resolve to a plain `text = text` comparison
--    rather than citext's own case-insensitive operator. That mechanism is inferred,
--    not proven here, but lowercasing both sides explicitly is correct either way and
--    removes the dependency on how Postgres resolves the operator.
--
-- 2. The only thing that ever set `members.user_id` was a trigger on INSERT INTO
--    auth.users, so the claim happened once and never again. Anyone who tried to sign
--    in before an officer added them, or whose address was corrected after a failed
--    attempt, could never be claimed: the second sign-in is not an insert, so nothing
--    re-fired. Membership is decided purely by `user_id = auth.uid()`, so those members
--    were permanently locked out with no error explaining why.
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
     and user_id is null;
  return new;
end;
$$;

-- The other direction: when a roster row appears or its address is corrected, link it
-- to an account that already exists. A BEFORE trigger assigns new.user_id directly,
-- so there is no recursive UPDATE on members.
create or replace function public.link_member_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    select u.id
      into new.user_id
      from auth.users u
     where lower(u.email::text) = lower(new.email::text)
     limit 1;
  end if;
  return new;
end;
$$;

-- Fires after members_guard_columns, which sorts earlier by name, so the guard still
-- sees the row exactly as the caller submitted it.
drop trigger if exists members_link_auth_user on public.members;
create trigger members_link_auth_user
  before insert or update of email on public.members
  for each row execute function public.link_member_to_auth_user();

-- Claim anyone already stuck in the broken state.
do $$
declare
  claimed integer;
begin
  update public.members m
     set user_id = u.id
    from auth.users u
   where m.user_id is null
     and lower(m.email::text) = lower(u.email::text);

  get diagnostics claimed = row_count;
  raise notice 'Linked % previously unclaimed member row(s) to existing accounts.', claimed;
end;
$$;
