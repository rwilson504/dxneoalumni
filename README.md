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
- [ ] **Phase 2** — Supabase auth + member area
- [ ] **Phase 3** — officer/admin tooling (events, photos, newsletters, dues)
- [ ] **Phase 4** — RSVP, calendar export, reminders

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