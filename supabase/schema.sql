-- Northeast Ohio Alumni Chapter — database schema
--
-- The site is fully static (GitHub Pages), so there is no server to enforce
-- authorization. Every rule below is enforced by Postgres Row Level Security and
-- applies no matter what the browser sends. Hiding UI is presentation only.
--
-- Run this in the Supabase SQL editor on a new project.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

do $$ begin
  create type member_role as enum ('member', 'officer', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type doc_visibility as enum ('public', 'member', 'officer');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

-- Rows are created by officers ahead of time. Signing in does NOT create
-- membership; it only claims a row that already exists for that email address.
-- Someone who signs up with an unknown address gets an auth user with no member
-- row, and therefore no access to anything.
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email citext not null unique,
  full_name text not null,
  phone text,
  undergrad_chapter text,
  class_year text,
  officer_letter text check (officer_letter in ('A', 'B', 'C', 'D', 'E')),
  is_virtual boolean not null default false,
  role member_role not null default 'member',
  directory_opt_in boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists members_user_id_idx on public.members (user_id);

-- ---------------------------------------------------------------------------
-- Documents (meeting minutes, member-only files)
-- ---------------------------------------------------------------------------

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'general',
  storage_path text not null,
  visibility doc_visibility not null default 'member',
  published_on date not null default current_date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Dues
-- ---------------------------------------------------------------------------

create table if not exists public.dues_payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  year integer not null,
  amount numeric(8, 2) not null,
  method text,
  paid_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (member_id, year)
);

-- ---------------------------------------------------------------------------
-- Helpers
--
-- SECURITY DEFINER so these can read `members` without triggering the policies
-- that call them, which would recurse infinitely.
-- ---------------------------------------------------------------------------

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members where user_id = auth.uid();
$$;

create or replace function public.current_member_role()
returns member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.members where user_id = auth.uid();
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

create or replace function public.is_officer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_member_role() in ('officer', 'admin'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_member_role() = 'admin', false);
$$;

-- ---------------------------------------------------------------------------
-- Claim a pre-created member row on first sign-in
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
   where email = new.email
     and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.claim_member_row();

-- ---------------------------------------------------------------------------
-- Block privilege escalation
--
-- RLS grants row access, not column access. Without this a member could PATCH
-- their own row and set role = 'admin'.
-- ---------------------------------------------------------------------------

create or replace function public.guard_member_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists members_guard_columns on public.members;
create trigger members_guard_columns
  before update on public.members
  for each row execute function public.guard_member_columns();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.members enable row level security;
alter table public.documents enable row level security;
alter table public.dues_payments enable row level security;

-- Members ------------------------------------------------------------------

drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (
    public.is_officer()
    or user_id = auth.uid()
    or (public.is_member() and directory_opt_in)
  );

drop policy if exists members_update_self on public.members;
create policy members_update_self on public.members
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists members_insert_admin on public.members;
create policy members_insert_admin on public.members
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists members_delete_admin on public.members;
create policy members_delete_admin on public.members
  for delete to authenticated
  using (public.is_admin());

-- Documents ----------------------------------------------------------------

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to anon, authenticated
  using (
    visibility = 'public'
    or (visibility = 'member' and public.is_member())
    or (visibility = 'officer' and public.is_officer())
  );

drop policy if exists documents_write on public.documents;
create policy documents_write on public.documents
  for all to authenticated
  using (public.is_officer())
  with check (public.is_officer());

-- Dues ---------------------------------------------------------------------

drop policy if exists dues_select on public.dues_payments;
create policy dues_select on public.dues_payments
  for select to authenticated
  using (member_id = public.current_member_id() or public.is_officer());

drop policy if exists dues_write on public.dues_payments;
create policy dues_write on public.dues_payments
  for all to authenticated
  using (public.is_officer())
  with check (public.is_officer());

-- ---------------------------------------------------------------------------
-- Private storage for member documents
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('member-files', 'member-files', false)
on conflict (id) do nothing;

drop policy if exists member_files_read on storage.objects;
create policy member_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'member-files' and public.is_member());

drop policy if exists member_files_write on storage.objects;
create policy member_files_write on storage.objects
  for all to authenticated
  using (bucket_id = 'member-files' and public.is_officer())
  with check (bucket_id = 'member-files' and public.is_officer());

-- ---------------------------------------------------------------------------
-- Keepalive
--
-- Supabase pauses free projects after 7 days of inactivity. A scheduled job
-- reads this view so the project always looks active.
-- ---------------------------------------------------------------------------

create or replace view public.heartbeat as select now() as checked_at;
grant select on public.heartbeat to anon;
