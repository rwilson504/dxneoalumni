---
applyTo: "**"
---

# dxneoalumni — repo rules for AI agents

**This repository is public.** Anything committed here is world-readable and is
part of the chapter's public face.

## Do not commit process artifacts

Overriding the machine-level default:

- **No `SESSION_LOG.md`** anywhere in this repo.
- **No `decisions/` records** anywhere in this repo.
- No AI-facing scratch notes, plans, review write-ups, or "what I changed"
  markdown. If a summary is wanted, put it in the chat response or the commit
  message, not in a file.

Documentation that serves a *human visitor or maintainer* is fine (`README.md`,
`archive/`, code comments).

## Where learnings go instead

Durable findings about this site — brand decisions, CSS gotchas, content-model
traps, review technique — belong in the machine-level marketplace clone
(normally `D:\rwilson504\agent-plugins-personal`, resolvable from
`(Get-Item "$HOME\.copilot\agents").Target`), under `src/skills/`:

| Learning | Skill |
|---|---|
| Site layout, tokens, content model, brand findings, build/review technique | `deltachi-neo-website` (`SKILL.md`, `references/site-map.md`) |
| HQ logo, palette, typography, voice, trademark rules | `deltachi-brand-standards` |
| Image templates, renderer, platform sizes | `deltachi-neo-graphics` |
| Chapter facts, event/newsletter/social copy | `deltachi-neo-copywriting` |

After editing a skill, run `pwsh scripts/build-plugins.ps1` then
`pwsh scripts/lint.ps1` in the clone, and commit there — not here.

## Repo-specific hard rules

- Never put `SUPABASE_SERVICE_ROLE_KEY` or any secret in a file. Anon key +
  project URL come from `.env` locally and repo vars/secrets in CI.
- Never edit an applied migration in `supabase/migrations/`; add a new one.
- Never delete or rewrite `archive/` — it is the only copy of the Wix content.
- Events, albums and photos are read from **Supabase** at build time
  (`src/lib/content.ts`). Editing `src/data/events.json` or `gallery.json` does
  **not** change the live pages.
- Don't commit or push without being asked. A push to `main` deploys the site
  and applies migrations.
