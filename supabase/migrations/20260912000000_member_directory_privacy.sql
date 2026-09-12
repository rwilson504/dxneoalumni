-- Add member-managed mailing details and protect them behind explicit directory consent.
-- Ordinary members read the directory through member_directory(), which masks phone and
-- address fields unless their owner opted in. Officers retain direct roster access.

alter table public.members
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists phone_directory_opt_in boolean not null default false,
  add column if not exists address_directory_opt_in boolean not null default false;

drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (
    public.is_officer()
    or user_id = auth.uid()
  );

create or replace function public.member_directory()
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  undergrad_chapter text,
  class_year text,
  officer_letter text,
  is_virtual boolean,
  phone_directory_opt_in boolean,
  address_directory_opt_in boolean,
  is_current_user boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.email::text,
    m.full_name,
    case
      when m.phone_directory_opt_in or m.user_id = auth.uid() then m.phone
      else null
    end,
    case
      when m.address_directory_opt_in or m.user_id = auth.uid() then m.address_line1
      else null
    end,
    case
      when m.address_directory_opt_in or m.user_id = auth.uid() then m.address_line2
      else null
    end,
    case
      when m.address_directory_opt_in or m.user_id = auth.uid() then m.city
      else null
    end,
    case
      when m.address_directory_opt_in or m.user_id = auth.uid() then m.state
      else null
    end,
    case
      when m.address_directory_opt_in or m.user_id = auth.uid() then m.postal_code
      else null
    end,
    m.undergrad_chapter,
    m.class_year,
    m.officer_letter,
    m.is_virtual,
    m.phone_directory_opt_in,
    m.address_directory_opt_in,
    m.user_id = auth.uid()
  from public.members m
  where public.is_member()
    and (m.directory_opt_in or m.user_id = auth.uid())
  order by m.full_name;
$$;

revoke all on function public.member_directory() from public, anon;
grant execute on function public.member_directory() to authenticated;