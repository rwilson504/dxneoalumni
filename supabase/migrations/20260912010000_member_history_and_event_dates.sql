-- Preserve historical membership and dues records, and normalize events to complete dates.

alter table public.members
  add column if not exists is_active boolean not null default true;

alter table public.members
  add constraint members_phone_sharing_requires_directory
    check (directory_opt_in or not phone_directory_opt_in),
  add constraint members_address_sharing_requires_directory
    check (directory_opt_in or not address_directory_opt_in);

update public.events
   set month = coalesce(month, 1),
       day = coalesce(day, 1)
 where month is null or day is null;

alter table public.events
  add column if not exists location text;

create or replace function public.normalize_event_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.month = coalesce(new.month, 1);
  new.day = coalesce(new.day, 1);
  return new;
end;
$$;

drop trigger if exists events_normalize_date on public.events;
create trigger events_normalize_date
  before insert or update of year, month, day on public.events
  for each row execute function public.normalize_event_date();

alter table public.events
  alter column month set not null,
  alter column day set not null;

alter table public.dues_payments
  drop constraint if exists dues_payments_member_id_fkey;

alter table public.dues_payments
  add constraint dues_payments_member_id_fkey
  foreign key (member_id) references public.members (id) on delete restrict;

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members where user_id = auth.uid() and is_active;
$$;

create or replace function public.current_member_role()
returns member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.members where user_id = auth.uid() and is_active;
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members where user_id = auth.uid() and is_active
  );
$$;

create or replace function public.claim_member_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.members
     set user_id = new.id
   where email = new.email
     and user_id is null
     and is_active;
  return new;
end;
$$;

drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (
    public.is_admin()
    or (user_id = auth.uid() and is_active)
  );

drop policy if exists members_delete_admin on public.members;

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
      when public.is_admin() or m.phone_directory_opt_in or m.user_id = auth.uid() then m.phone
      else null
    end,
    case
      when public.is_admin() or m.address_directory_opt_in or m.user_id = auth.uid() then m.address_line1
      else null
    end,
    case
      when public.is_admin() or m.address_directory_opt_in or m.user_id = auth.uid() then m.address_line2
      else null
    end,
    case
      when public.is_admin() or m.address_directory_opt_in or m.user_id = auth.uid() then m.city
      else null
    end,
    case
      when public.is_admin() or m.address_directory_opt_in or m.user_id = auth.uid() then m.state
      else null
    end,
    case
      when public.is_admin() or m.address_directory_opt_in or m.user_id = auth.uid() then m.postal_code
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
    and m.is_active
    and (m.directory_opt_in or m.user_id = auth.uid() or public.is_admin())
  order by m.full_name;
$$;

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

  if old.user_id is not null and new.user_id is distinct from old.user_id then
    raise exception 'Only an admin may change which account a member row belongs to';
  end if;

  if new.role is distinct from old.role
     or new.email is distinct from old.email
     or new.officer_letter is distinct from old.officer_letter
     or new.is_active is distinct from old.is_active then
    raise exception 'Only an admin may change role, email, officer letter, or active status';
  end if;

  return new;
end;
$$;

create or replace function public.dues_roster()
returns table (
  id uuid,
  full_name text,
  is_virtual boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.full_name, m.is_virtual
    from public.members m
   where public.is_officer()
     and m.is_active
   order by m.full_name;
$$;

revoke all on function public.dues_roster() from public, anon;
grant execute on function public.dues_roster() to authenticated;