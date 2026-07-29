# dxneoalumni

Website for the **Northeast Ohio Alumni Chapter of The Delta Chi Fraternity**, replacing the
legacy Wix site at <https://dxneoalumni.wixsite.com/main>.

## Stack

| Layer | Choice |
|---|---|
| Framework | Astro + React islands |
| Hosting | GitHub Pages (static) |
| CI/CD | GitHub Actions |
| Auth | Supabase Auth (magic link) |
| Database | Supabase Postgres + Row Level Security |
| File storage | Supabase Storage |
| Payments | PayPal (existing hosted button) |

Chosen to run entirely on free tiers at ~50 members.

## Status

- [x] **Phase 0** — salvage all content and media from the Wix site
- [x] **Phase 1** — static public site on GitHub Pages
- [x] **Phase 2** — Supabase auth + member area
- [ ] **Phase 3** — officer/admin tooling (events, photos, newsletters, dues)
- [ ] **Phase 4** — RSVP, calendar export, reminders

## Member area setup

The site is fully static, so there is no server to check permissions. **All
authorization is enforced by Postgres Row Level Security** — see
[supabase/migrations](supabase/migrations). Hiding UI is presentation only.

Database changes are managed as migrations and applied by the **Supabase GitHub
integration**: push to `main` and pending migrations run automatically. Nothing is
pasted into the dashboard by hand.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, go to **Project Settings → Integrations → GitHub**,
   authorize GitHub, pick this repository, set **Working directory** to `.`, and enable
   **Deploy to production**.
3. Push to `main`. The migration in [supabase/migrations](supabase/migrations) is applied
   automatically.
4. Seed the roster **once**, by hand — production deploys deliberately ignore seed files:
   run [supabase/seed.sql](supabase/seed.sql) in the SQL editor, **replacing the
   placeholder emails with real addresses** and promoting one person to `admin`.
   Sign-in matches on email, so nobody can get in until theirs is correct.
5. Under **Authentication → URL Configuration**, add these redirect URLs:
   - `https://rwilson504.github.io/dxneoalumni/members`
   - `http://localhost:4321/dxneoalumni/members`
6. Copy `.env.example` to `.env` and fill in the project URL and anon key.
7. In the repo, add the same values under **Settings → Secrets and variables → Actions**:
   - Variable `PUBLIC_SUPABASE_URL`
   - Secret `PUBLIC_SUPABASE_ANON_KEY`

Until step 7 is done the member area shows a friendly "not switched on yet" message and the
rest of the site is unaffected.


### Changing the database

Never edit an applied migration. Create a new one and push:

```sh
npx supabase migration new add_something
# edit the generated file in supabase/migrations/
git commit -am "db: add something" && git push
```

Per-PR preview databases (Supabase Branching) are a paid feature — $0.01344 per branch per
hour on Pro. Deploy-from-GitHub, used here, is included on the free plan.

### Not done yet: local database testing

The Supabase CLI can run the whole stack locally (`npx supabase start`, then
`npx supabase db reset` to apply migrations and seed from scratch). That would let us prove
the RLS policies behave correctly — including the claim-on-first-sign-in trigger — before
anything reaches production.

Deliberately skipped for now because it requires Docker and pulls several GB of images.
Worth doing if the policies get more complex, or before any change that touches
`guard_member_columns` or `claim_member_row`. Until then, the migration SQL is validated by
parsing it against the real Postgres grammar, which catches syntax errors but not runtime
behaviour.

### How access works

Signing in does **not** create membership. A member row must already exist for that email
address; first sign-in simply claims it. Someone who signs up with an unknown address gets
an account with no member row and therefore no access to anything.

| Role | Can do |
|---|---|
| Anonymous | Public pages only |
| Member | Directory with contact details, own dues history, edit own profile |
| Officer | Everything above, plus all dues records and member documents |
| Admin | Everything, plus creating members and changing roles |

The anon key is public by design — it ships in the browser bundle and identifies the
project without granting access. **Never** put the `service_role` key in this repo; it
bypasses RLS entirely.

## Develop

```sh
npm install
npm run dev      # http://localhost:4321/dxneoalumni
npm run build    # static output in dist/
npm run check    # type + template diagnostics
```

Pushing to `main` builds and publishes to GitHub Pages via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). Enable it once under
**Settings → Pages → Source → GitHub Actions**.

## Content

Site content lives in [src/data](src/data) and is hand-edited:

| File | Contents |
|---|---|
| `events.json` | 45 events with dates, descriptions, and image filenames |
| `members.json` | Roster and officer letters |
| `awards.json` | Chapter awards by year |
| `newsletters.json` | Newsletter index (local PDFs and external links) |
| `site.ts` | Navigation, social links, dues amounts, PayPal URL |

Images referenced by `events.json` live in `src/assets/events` and are optimized to
WebP at build time.

## Adding an event

Add an entry to [src/data/events.json](src/data/events.json), drop its image in
`src/assets/events`, and push. Upcoming versus past is derived from the date, so
events move themselves once they have passed.

## `archive/`

A point-in-time capture of the Wix site, taken before decommissioning it. Committed
deliberately — this content does not exist anywhere else.

| Path | Contents |
|---|---|
| `raw/` | Untouched page HTML + Wix warmup JSON |
| `content/` | Readable markdown per page |
| `media/` | 93 full-resolution images and newsletter PDFs |
| `newsletters-mailchimp/` | 18 newsletters that were hosted off-site on Mailchimp |
| `manifest.json` | Source URL → local file, with titles and referencing pages |

Regenerate with:

```sh
cd tools/wix-archive
npm install
npm run scrape
```

The scraper is resumable — existing files are skipped.

[tools/extract-content](tools/extract-content) is the one-time migration that turned the
archived events page into `src/data/events.json`. It has already run; the JSON is now
hand-maintained and re-running it would discard manual edits.