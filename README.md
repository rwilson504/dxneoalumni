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
[supabase/schema.sql](supabase/schema.sql). Hiding UI is presentation only.

1. Create a free project at [supabase.com](https://supabase.com).
2. Run [supabase/schema.sql](supabase/schema.sql) in the SQL editor, then
   [supabase/seed.sql](supabase/seed.sql).
3. **Replace the placeholder emails in the seed** with real addresses, and promote one
   person to `admin`. Sign-in matches on email; nobody can get in until theirs is correct.
4. Under **Authentication → URL Configuration**, add these redirect URLs:
   - `https://rwilson504.github.io/dxneoalumni/members`
   - `http://localhost:4321/dxneoalumni/members`
5. Copy `.env.example` to `.env` and fill in the project URL and anon key.
6. In the repo, add the same values under **Settings → Secrets and variables → Actions**:
   - Variable `PUBLIC_SUPABASE_URL`
   - Secret `PUBLIC_SUPABASE_ANON_KEY`

Until step 6 is done the member area shows a friendly "not switched on yet" message and the
rest of the site is unaffected.

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