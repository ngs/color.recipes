# color.recipes

A searchable, curated color-scheme gallery. When nothing matches, have your own AI generate a scheme and contribute it via a PR. Live at **[color.recipes](https://color.recipes)**.

- Show a saved color scheme at random → animate to the next after an interval (pauses on interaction; respects `prefers-reduced-motion`)
- Search by tags (multiple, ANDed); the UI chrome adopts the displayed scheme's palette
- Each scheme has a **permalink** `/<slug>?t=tag-a,tag-b` with a server-rendered title/description and a palette **Open Graph image**
- On zero matches: copy an AI prompt → paste the generated JSON → preview → log in with GitHub → **choose a fork owner (your account or an org)** → Fork + PR
- Export a palette as JSON, CSS, SCSS, SVG, Android, Xcode `.xcassets`, Swift, MUI, Ant Design, or Tailwind
- Data lives in `schemes/*.json` (this repo); reads are baked statically at build time

## Stack / approach

- **Frontend**: plain **TypeScript** + Vite. Path-based routing (`/<slug>?t=tags`) via the History API; hex → rgb/hsl/oklch conversion; **Pliant** (Google Fonts).
- **Worker** (`worker/index.ts`, one Cloudflare Worker with static assets, single origin):
  - `/api/*` — GitHub OAuth (web flow; token in an httpOnly cookie) + write proxy (fork → commit → PR) + fork-owner listing.
  - Per-scheme **SSR** of `<title>` / description / Open Graph / Twitter meta for navigations.
  - Forces HTTPS (Workers Custom Domains bypass the zone's "Always Use HTTPS").
- **Hosting**: Cloudflare, **zero operating cost**. The custom domain is managed by `wrangler`; the zone/email/DNS live in Terraform (`ngs/littleapps-cloudflare-terraform`). Deploys via GitHub Actions on push to `main`.
- **Build**: `scripts/build-index.ts` turns `schemes/*.json` into `public/index.json` (+ tag index), one OG PNG per scheme, `sitemap.xml`, and `llms.txt`.

## Develop

```sh
npm install
npm run dev        # build index + OG, run the Worker + assets locally
npm run build      # production build
npm run typecheck
npm run validate   # validate schemes/*.json against the JSON Schema (CI)
npm run test:ui    # headless Playwright check of the UI (CI)
npm run deploy     # build + wrangler deploy
```

Worker secrets for local dev go in `.dev.vars` (see `.dev.vars.example`).

## Docs

- **[SPEC.md](./SPEC.md)** — source-of-truth spec (architecture, schema, Worker endpoints, AI prompt, SSR/OG, Cloudflare/GitHub setup).
- [CLAUDE.md](./CLAUDE.md) — context and conventions for Claude Code sessions.

## Conventions

- **All docs, comments, and identifiers are in English.**
