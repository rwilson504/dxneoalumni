-- Admin-managed award catalog and chapter award history.

create table if not exists public.award_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.chapter_awards (
  id uuid primary key default gen_random_uuid(),
  award_type_id uuid not null references public.award_types (id) on delete restrict,
  period_start integer not null check (period_start between 1900 and 2200),
  recipient text,
  created_at timestamptz not null default now()
);

create unique index if not exists chapter_awards_unique_idx
  on public.chapter_awards (award_type_id, period_start, coalesce(recipient, ''));
create index if not exists chapter_awards_period_idx
  on public.chapter_awards (period_start desc);

alter table public.award_types enable row level security;
alter table public.chapter_awards enable row level security;

create policy award_types_select on public.award_types
  for select to anon, authenticated using (true);
create policy award_types_admin on public.award_types
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy chapter_awards_select on public.chapter_awards
  for select to anon, authenticated using (true);
create policy chapter_awards_admin on public.chapter_awards
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.award_types, public.chapter_awards to anon;
grant select, insert, update, delete on public.award_types, public.chapter_awards to authenticated;

insert into public.award_types (name, description) values
  ('Chicago Cup', 'Recognizes an alumni chapter with excellence in programming, communication, and meeting the needs of its members.'),
  ('Outstanding Alumni Chapter Communication', 'Recognizes an alumni chapter with exceptional communication with its members.'),
  ('Outstanding Alumni Chapter Programming', 'Recognizes an alumni chapter for an exceptional programming event that creates a positive image in the community, on nearby college campuses, and among Delta Chi chapters and provisional chapters.'),
  ('Outstanding Alumni Chapter Member', 'Recognizes an outstanding member of an alumni chapter.'),
  ('Outstanding Alumni Chapter Website', 'Legacy award category retained for the chapter''s historical records.')
on conflict (name) do update set description = excluded.description;

insert into public.chapter_awards (award_type_id, period_start, recipient) values
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Programming'), 2025, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Programming'), 2024, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Communication'), 2023, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Programming'), 2023, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Member'), 2023, 'Daniel Russell'),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Website'), 2022, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Member'), 2022, 'Michael Lippy'),
  ((select id from public.award_types where name = 'Chicago Cup'), 2019, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Website'), 2019, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Communication'), 2019, null),
  ((select id from public.award_types where name = 'Chicago Cup'), 2018, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Website'), 2018, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Programming'), 2018, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Member'), 2018, 'C.J. Costas'),
  ((select id from public.award_types where name = 'Chicago Cup'), 2017, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Website'), 2017, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Communication'), 2017, null),
  ((select id from public.award_types where name = 'Outstanding Alumni Chapter Website'), 2016, null)
on conflict do nothing;