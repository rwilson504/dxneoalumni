-- Annual default dues amounts. Administrators maintain these from the member portal.

create table if not exists public.dues_rates (
  year integer primary key check (year between 2016 and 2200),
  chapter_amount numeric(8, 2) not null check (chapter_amount >= 0),
  virtual_amount numeric(8, 2) not null check (virtual_amount >= 0),
  updated_at timestamptz not null default now()
);

alter table public.dues_rates enable row level security;

create policy dues_rates_select on public.dues_rates
  for select to anon, authenticated using (true);
create policy dues_rates_admin on public.dues_rates
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.dues_rates to anon;
grant select, insert, update, delete on public.dues_rates to authenticated;

insert into public.dues_rates (year, chapter_amount, virtual_amount)
values (2026, 35.00, 15.00)
on conflict (year) do nothing;

alter table public.dues_payments
  add constraint dues_payments_amount_positive check (amount > 0);