-- Allow each event to use its own secure checkout or registration payment page.

alter table public.events
  add column if not exists payment_url text;

alter table public.events
  add constraint events_payment_url_is_secure
  check (payment_url is null or payment_url ~ '^https://[^[:space:]]+$');