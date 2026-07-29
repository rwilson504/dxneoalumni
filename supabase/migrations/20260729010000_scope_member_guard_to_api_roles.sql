-- Scope the member column guard to API roles only.
--
-- The guard exists to stop a signed-in member escalating their own role through
-- PostgREST. It was also firing for direct SQL sessions, where auth.uid() is null and
-- is_admin() is therefore false — which made it impossible to create the first admin
-- ("Only an admin may change role, email, or officer letter").
--
-- PostgREST runs each request with current_user set to anon or authenticated, so
-- checking that scopes the guard to browser traffic. postgres/supabase_admin and
-- service_role are already privileged and can bypass triggers regardless.

create or replace function public.guard_member_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  -- Linking an as-yet-unclaimed row is the normal first sign-in path, driven by
  -- claim_member_row. Re-pointing an already-linked row is not.
  if old.user_id is not null and new.user_id is distinct from old.user_id then
    raise exception 'Only an admin may change which account a member row belongs to';
  end if;

  if new.role is distinct from old.role
     or new.email is distinct from old.email
     or new.officer_letter is distinct from old.officer_letter then
    raise exception 'Only an admin may change role, email, or officer letter';
  end if;

  return new;
end;
$$;
