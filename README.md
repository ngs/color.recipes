# color.recipes

A searchable, curated color-scheme gallery. When nothing matches, have your own AI generate a scheme and contribute it via a PR.

- Show a saved color scheme at random → animate to the next one after an interval
- Search by tags (multiple, ANDed) to narrow down to a matching set
- On zero matches: copy an AI prompt → paste the generated JSON → preview → log in with GitHub to Fork + PR
- Data lives in `schemes/*.json` (this repo); reads are baked statically at build time

## Stack / approach

- Frontend: plain **TypeScript** (no Go). Static serving.
- Auth / writes: a **Cloudflare Worker** (OAuth Web flow + httpOnly cookie; fork/commit/PR go through the Worker).
- Hosting: **Cloudflare (one Worker with static assets, single origin `color.recipes`)**. Zero operating cost.

## Docs

- **[SPEC.md](./SPEC.md)** — source-of-truth spec (architecture, schema, Worker endpoints, AI prompt, Cloudflare/GitHub setup).
- [CLAUDE.md](./CLAUDE.md) — context and conventions for Claude Code sessions.

## Conventions

- **All docs, comments, and identifiers are in English.**
