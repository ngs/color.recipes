# CLAUDE.md — color.recipes

> Personal product. Context and conventions for continuing this project in a Claude Code session.

## What this is

`color.recipes` = a searchable, curated color-scheme gallery with AI-assisted PR contributions. The **source-of-truth spec is [SPEC.md](./SPEC.md)**; implement against it. A design-history mirror exists in the separate `ngs/think` repo at `companies/ngs/projects/color.recipes/design.md` (reference only).

## Conventions

- **English only**: all documentation, code comments, identifiers, and commit messages are in English (this is a public OSS repo).

## Frozen decisions (update SPEC.md too if you change them)

- **No Go.** Plain **TypeScript** frontend.
- **Cloudflare single origin**: one Worker with static assets. `/api/*` = OAuth + write proxy; everything else is static.
- **Auth = OAuth Web flow + Worker** (not Device Flow). Token in an **httpOnly cookie** (never reaches the browser). fork/commit/PR also go through the Worker (token = option (i)).
- **Reads are statically baked at build time** (`schemes/*.json` → `dist/index.json`). No runtime GitHub read API.
- **Colors stored as hex**; convert to other color spaces for output. Schema: SPEC.md §6.
- **AI prompt in English, default 5 colors.** The AI returns only name/tags/colors; the app fills version/source/createdAt (SPEC.md §7).
- Zero operating cost, lightweight, no ads.

## How to proceed (if not started)

1. Read SPEC.md.
2. Scaffold: `package.json`/`tsconfig`/`vite`, `src/`, `worker/`, `schema/scheme.schema.json`, `scripts/build-index.ts`, a few seed files in `schemes/`, `.github/workflows/`, `wrangler.jsonc`.
3. First get "gallery display → tag search → copy prompt → paste/preview JSON" working locally (GitHub writes come later).
4. Then the Worker's OAuth and `/api/submit` (fork → commit → PR). GitHub OAuth App and Worker secrets: SPEC.md §8.
5. Add Cloudflare resources (DNS / route / Worker) via Terraform in the separate repo `ngs/littleapps-cloudflare-terraform`.

## Git

- Public OSS repo (to be published). **Do not commit/push automatically — wait for the owner's explicit instruction** (no standing authorization like the `think` repo).
- Never commit secrets (client_secret, etc.). Use Worker secrets / `.dev.vars` and `.gitignore` them.

## Language

- Repo content (docs/comments/commits) is in English per the conventions above.
