-- Seed the roster carried over from the Wix site.
--
-- IMPORTANT: every email below is a placeholder on the reserved .invalid TLD, which
-- can never receive mail. Replace each one with the brother's real address BEFORE
-- anyone tries to sign in — magic-link login matches on email, and a member cannot
-- claim their row until the address is correct.
--
-- Promote at least one person to admin at the bottom of this file.

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
  ('rick.wilson@example.invalid', 'Rick Wilson', 'Kent State', '''04', null, false, 'member')
on conflict (email) do nothing;

-- Grant the first admin. Replace with a real address.
-- update public.members set role = 'admin' where email = 'you@example.com';
