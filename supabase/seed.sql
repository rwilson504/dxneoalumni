-- Roster seed, carried over from the Wix site.
--
-- Safe to re-run: rows are matched on email and updated in place, so correcting a
-- name or role here and re-running fixes the database. Existing sign-ins are kept.
--
-- Sign-in matches on email, so a member cannot claim their row until their address
-- is correct. Addresses still on the reserved .invalid TLD are placeholders that can
-- never receive mail — replace them before inviting anyone.
--
-- FULL RESET: to discard every member row and start over (this also deletes their
-- dues history), uncomment the delete below. Sign-ins are re-linked further down, so
-- anyone who has already logged in keeps working.
--
-- delete from public.members;

insert into public.members
  (email, full_name, undergrad_chapter, class_year, officer_letter, is_virtual, role)
values
  ('brian.cain@example.invalid', 'Brian Cain', 'Kent State', '''01', 'A', false, 'officer'),
  ('dan.russell@example.invalid', 'Dan Russell', 'Kent State', '''03', 'B', false, 'officer'),
  ('kenny.strait@example.invalid', 'Kenny Strait', 'Kent State', '''24', 'C', true, 'officer'),
  ('justin.donnelly@example.invalid', 'Justin (J.D.) Donnelly', 'Kent State', '''02', 'D', false, 'officer'),
  ('geoff.westerfield@example.invalid', 'Geoff Westerfield', 'Kent State / Ohio State', '''01', 'E', false, 'officer'),
  ('chris.adams@example.invalid', 'Chris Adams', 'Kent State', '''00', null, false, 'member'),
  ('chuck.bonacci@example.invalid', 'Chuck Bonacci', 'Kent State', '''96', null, false, 'member'),
  ('steve.bossart@example.invalid', 'Steve Bossart', 'Kent State', '''90', null, false, 'member'),
  ('cj.costas@example.invalid', 'C.J. Costas', 'Iowa', '''05', null, true, 'member'),
  ('christofer.gutekunst@example.invalid', 'Christofer Gutekunst', 'Kent State', '''05', null, true, 'member'),
  ('michael.hilgert@example.invalid', 'Michael Hilgert', 'Kent State', '''95', null, false, 'member'),
  ('nick.hohenberger@example.invalid', 'Nick Hohenberger', 'Kent State', '''00', null, false, 'member'),
  ('benjamin.klein@example.invalid', 'Benjamin Klein', 'Kent State', null, null, false, 'member'),
  ('michael.lippy@example.invalid', 'Michael Lippy', 'Kent State', '''04', null, false, 'member'),
  ('keith.marunski@example.invalid', 'Keith Marunski', 'Kent State', '''03', null, false, 'member'),
  ('mickey.nemergut@example.invalid', 'Mickey Nemergut', 'Kent State', '''06', null, false, 'member'),
  ('pat.rabideau@example.invalid', 'Pat Rabideau', 'Kent State', '''01', null, false, 'member'),
  ('jae.snow@example.invalid', 'Jae Snow', 'Kennesaw State', '''14', null, false, 'member'),
  ('rwilson504@gmail.com', 'Rick Wilson', 'Kent State', '''04', null, false, 'admin')
on conflict (email) do update set
  full_name         = excluded.full_name,
  undergrad_chapter = excluded.undergrad_chapter,
  class_year        = excluded.class_year,
  officer_letter    = excluded.officer_letter,
  is_virtual        = excluded.is_virtual,
  role              = excluded.role;

-- Re-link anyone who has already signed in. claim_member_row only fires when an auth
-- user is first created, so a member row replaced after that point would otherwise be
-- orphaned from its account.
update public.members m
   set user_id = u.id
  from auth.users u
 where lower(m.email) = lower(u.email)
   and m.user_id is distinct from u.id;

select role, count(*) as members, count(user_id) as signed_in
  from public.members
 group by role
 order by role;
