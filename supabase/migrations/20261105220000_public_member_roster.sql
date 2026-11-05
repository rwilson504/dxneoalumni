-- Publish only the basic profile fields already shown on the public membership page.
-- Directory consent controls the separate, signed-in contact directory.
create or replace function public.public_member_roster()
returns table (
  full_name text,
  officer_letter text,
  undergrad_chapter text,
  class_year text,
  is_virtual boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.full_name,
    m.officer_letter,
    m.undergrad_chapter,
    m.class_year,
    m.is_virtual
  from public.members m
  where m.is_active
  order by m.full_name;
$$;

revoke all on function public.public_member_roster() from public;
grant execute on function public.public_member_roster() to anon, authenticated;
