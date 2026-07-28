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
- [ ] **Phase 1** — static public site on GitHub Pages
- [ ] **Phase 2** — Supabase auth + member area
- [ ] **Phase 3** — officer/admin tooling (events, photos, newsletters, dues)
- [ ] **Phase 4** — RSVP, calendar export, reminders

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