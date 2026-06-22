# color.recipes — Specification

> Personal product (ngs). A **searchable, curated color-scheme gallery with AI-assisted PR contributions**.
> Domain: `color.recipes` (owned). Design frozen: 2026-06-18.
> This file is the **source-of-truth spec**. A separate Claude Code session may start implementation from here.
> **Status: built and deployed at https://color.recipes.** Refinements made since the freeze (path routing, SSR + OG, fork-owner selection, fonts, SEO files) are summarized in §12.

## 1. What we are building

A curated gallery of color schemes stored as JSON in this GitHub repo, browsable by tags. When no scheme matches, the user has their own AI (e.g. Claude) generate one and contributes it via a PR.

Browse flow:
1. On first visit: show one saved scheme at random.
2. After an interval: **animate a transition** to another randomly picked scheme.
3. Each scheme has **tags**.
4. The user can **search by tags** (multiple, ANDed).
5. Show schemes matching the tag combination, then auto-rotate within that matched set like step 2.

Contribution flow (when there are zero matches):
- The app shows a **copyable AI prompt** (a template filled with the searched tags and the schema — see §7).
- The user runs the prompt in their own AI, then **pastes the returned JSON → previews** it.
- If satisfied: **GitHub login → Fork + PR** (adds `schemes/<slug>.json`).

## 2. Decisions (2026-06-18)

- **No Go.** **TypeScript** frontend built with **Preact + @preact/signals** (a deliberately lightweight component layer — ~18 kB gzip total; not React proper, to honor the lightweight constraint).
- **Auth = OAuth Web flow (authorization code) + a Cloudflare Worker** (not Device Flow). **Public — anyone can log in with GitHub.**
- **Token handling = option (i)**: the **Worker keeps the token in an httpOnly cookie and proxies fork/commit/PR** (the token never reaches the browser).
- **Hosting = Cloudflare, single origin**: **one Worker with static assets** (`/api/*` = OAuth + write proxy, everything else = static serving). Same origin enables an **httpOnly / Secure / SameSite=Lax first-party cookie** with no CORS.
- **Reads are statically baked at build time** (`schemes/*.json` → `public/index.json` + a tag index; no runtime GitHub read API).
- **Colors stored as hex**; convert to other color spaces (hex/rgb/hsl/oklch) client-side for display/export.
- **AI prompt in English, default 5 colors.**
- **Post-freeze refinements** (path routing, SSR + OG images, fork-owner selection, Pliant font, SEO files): see §12.

## 3. Hard constraints

- Zero operating cost (no always-on server; everything within Cloudflare free tier).
- Lightweight, no ads.
- Single source of truth for data = `schemes/*.json` in this repo.
- No server-side AI (the user runs the prompt in their own Claude and pastes the result; no API key).

## 4. Architecture

- **Data**: `schemes/*.json` (this repo). At build time, `scripts/build-index.ts` aggregates them into `public/index.json` (all schemes) plus a tag index, and also generates one **OG image** per scheme, `sitemap.xml`, and `llms.txt`. All served statically.
- **Frontend (static, TS)**: gallery display, auto-rotation, animation, tag search, color-space conversion + multi-format export, prompt generation, JSON paste/preview. **Path-based routing** `/<slug>?t=tags` via the History API (manual change = pushState, auto-rotation = replaceState).
- **Worker**: `/api/*` = OAuth (login/callback/me/logout) + write proxy (fork → commit → PR) + fork-owner listing; the token stays in the httpOnly cookie and never reaches the browser. The Worker also **SSRs per-scheme meta** (title/description/Open Graph/Twitter) for navigations and **forces HTTPS** (Workers Custom Domains bypass the zone's Always Use HTTPS). `assets.run_worker_first` covers navigations + `/api/*`; hashed bundles and OG images stay assets-first.
- **AI**: none server-side. The user copies the prompt and runs it themselves.

### Cost (effectively free indefinitely for this shape)
- Static asset serving is unmetered/free (traffic growth is not billed).
- Workers free tier is 100k requests/day (OAuth/submit only run on login/contribution, so it never gets close).
- No D1/KV/R2 or other paid features. GitHub API rate limits (5000/h authenticated, per user) are GitHub's caps, not a cost.

## 5. Directory layout

```
color.recipes/
├─ schemes/                    # Curated data. Contribution PRs add one file here.
│  └─ sunset-retro.json
├─ schema/scheme.schema.json   # JSON Schema (canonical; CI validates with ajv)
├─ src/                        # TS/TSX frontend (Preact + signals, static)
│  ├─ main.tsx                 # Bootstrap: mount roots, load index, popstate/URL sync
│  ├─ state.ts                 # Signals (index/activeTags/selectedSpace/…), URL + theme helpers
│  ├─ App.tsx                  # #app content: Gallery | Contribution | error panel
│  ├─ Search.tsx               # Tokenized tag field + typeahead suggestions
│  ├─ Gallery.tsx              # Crossfading rotation, caption, controls, values overlay
│  ├─ ValuesOverlay.tsx        # Per-color values; dropdown picks the color space
│  ├─ Download.tsx             # Export dropdown
│  ├─ Contribution.tsx         # Prompt copy, JSON paste/preview, fork-owner picker, /api/submit
│  ├─ icons.tsx                # Font Awesome Pro icons as inline-SVG Preact component
│  ├─ color.ts                 # hex -> rgb/hsl/oklch/cmyk, mixing, formatting
│  ├─ export.ts                # Palette export (JSON/CSS/SCSS/SVG/Android/Xcode/Swift/MUI/AntD/Tailwind)
│  ├─ validate.ts              # Shared validation (scheme + repo name); eval-free for client + Worker
│  └─ types.ts / style.css
│  └─ *.test.ts(x)             # Vitest unit tests (happy-dom + @testing-library/preact)
├─ worker/                     # Cloudflare Worker, split by concern
│  ├─ index.ts                 # Router: HTTPS redirect + /api/* dispatch + SSR/ASSETS fallback
│  ├─ env.ts                   # Env bindings/secrets interface
│  ├─ auth.ts                  # OAuth login/callback/me/logout + currentToken
│  ├─ contribute.ts            # fork owners/check + fork->branch->commit->PR
│  ├─ github.ts / cookies.ts / ssr.ts / util.ts
│  └─ *.test.ts                # Vitest unit tests (workerd via @cloudflare/vitest-pool-workers)
├─ scripts/
│  ├─ build-index.ts           # schemes/*.json -> index.json + tag index + OG PNGs + sitemap.xml + llms.txt
│  ├─ validate-schemes.ts      # CI: validate schemes against the JSON Schema (ajv)
│  └─ ui-check.ts              # CI: headless Playwright UI test
├─ public/robots.txt           # static (index.json / og / sitemap.xml / llms.txt are generated)
├─ index.html
├─ wrangler.jsonc              # Worker + assets config; custom domain color.recipes
├─ vitest.config.ts            # Two projects: "unit" (happy-dom) + "worker" (pool-workers)
├─ package.json / tsconfig*.json / vite.config.ts
└─ .github/workflows/
   ├─ validate.yml             # Validate schemes against the JSON Schema on PR
   ├─ test.yml                 # typecheck + Vitest (npm test) + test:ui (Playwright)
   └─ deploy.yml               # build -> deploy to Cloudflare on push to main
```
- The Cloudflare **zone, email (Google Workspace), and www redirect** are managed via Terraform in `ngs/littleapps-cloudflare-terraform`. The **Worker custom domain + its DNS** are managed by `wrangler` (the app owns its routing).

## 6. Scheme JSON schema (MVP, frozen)

```json
{
  "version": 1,
  "name": "Sunset Retro",
  "tags": ["warm", "retro", "sunset"],
  "colors": ["#2b2118", "#c0392b", "#e67e22", "#f1c40f", "#ecf0f1"],
  "source": "ai",
  "createdAt": "2026-06-18"
}
```
- `colors` = an ordered array of hex strings (MVP; default 5). `role` (bg/fg/accent) may later be added as `colors:[{hex,role}]`, but MVP keeps a plain array.
- `source` = `"ai" | "manual"`. `tags` = one or more lowercase ASCII tags. Filename = slug of `name` (with a suffix on collision).
- Validate with the JSON Schema (`schema/scheme.schema.json`) on **both CI and the client**.

## 7. AI contribution prompt (template, frozen)

Design rule: **the AI returns only `name`/`tags`/`colors` as JSON; the app fills in `version`/`source`/`createdAt`** (never let the AI invent the date; avoids format drift). Fill `{{tags}}` with the searched tags and `{{count}}` with the color count (default **5**). **Language: English.**

```
You are a color palette curator. Create ONE color scheme that fits these tags.

Tags: {{tags}}

Requirements:
- {{count}} harmonious colors forming a usable palette: include at least one light
  and one dark color (so it works for background/foreground), plus 1-2 accents.
- Keep the colors perceptually balanced: vary lightness deliberately, avoid muddy
  or clashing combinations.
- Each color as #RRGGBB hex.
- "name": a short, evocative English name for the palette.
- "tags": lowercase English tags (include the given tags, add 2-5 more for
  mood / hue / use-case), 5-8 total.
- Output ONLY the JSON below. No prose, no markdown code fences, no comments.

{"name":"...","tags":["..."],"colors":["#......","#......","#......","#......","#......"]}
```

### App-side normalization (paste → preview)
1. **Strip code fences** (even if the model wraps it in ```json) and trim, then `JSON.parse`.
2. Keep only `name`/`tags`/`colors`; the app adds **`version:1` / `source:"ai"` / `createdAt:<today>`**.
3. **Validate against the JSON Schema** (shared client + Worker): non-empty `name`; `tags` = one or more lowercase ASCII; `colors` = valid `#RRGGBB`, length 2-12.
4. Preview (swatches + name + tags + multi-color-space output) → on OK, `POST /api/submit` (filename = slug of `name`).

## 8. Worker endpoints

- `GET /api/auth/login` → issue `state` → redirect to GitHub authorize (`scope=public_repo read:org`).
- `GET /api/auth/callback?code&state` → exchange `code` + client_secret for an access token → store in an **httpOnly cookie** → redirect back to the app.
- `GET /api/auth/me` → return the current user via the cookie token (401 if not logged in).
- `POST /api/auth/logout` → clear the cookie.
- `GET /api/fork/owners` → accounts the user can fork into (themselves + their orgs), each with a `canCreate` flag (admins / org public-repo policy) so the UI can grey out owners without permission.
- `GET /api/fork/check?owner=&name=` → whether `<owner>/<name>` is `available` / `isOurFork` / `isUpstream`, so the client can pick a target and validate the name.
- `POST /api/submit` (body `{ scheme, forkOwner, forkName }`) → validate the scheme server-side against the JSON Schema → fork into the chosen owner (`organization` for orgs; commit directly when the owner is the upstream owner, since you cannot fork your own repo) → commit `schemes/<slug>.json` → open a PR to upstream (head=`forkOwner:branch`) → **return the PR URL**. The fork's real owner/name are read back from the API so a name collision never targets the wrong repo.
- Navigations (`/`, `/<slug>`) → **SSR'd HTML** (per-scheme meta); everything else → static assets; `http` → `301` `https`.

### Cloudflare / GitHub setup
- Create a **GitHub OAuth App** (callback = `https://color.recipes/api/auth/callback`, scopes requested at login = `public_repo read:org`). `client_id` is public; `client_secret` is a Worker secret.
- **Worker secrets**: `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `COOKIE_SECRET` (cookie signing) — set via `wrangler secret put`. `UPSTREAM_REPO` (e.g. `ngs/color.recipes`) is a public `var` in `wrangler.jsonc`.
- **wrangler**: static assets bound to the Worker; production route is a **custom domain** (`{ pattern: "color.recipes", custom_domain: true }`), which wrangler creates with its DNS on deploy.
- **CI deploy** (`deploy.yml`): needs only `CLOUDFLARE_API_TOKEN` (Workers Scripts/Routes + the zone's DNS/Zone read). The account is inferred from the token.
- Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`, value signed with `COOKIE_SECRET` (HMAC).

## 9. Functional requirements (MVP)

- Gallery display (random one → auto-rotate → animated transition; respect `prefers-reduced-motion`; pause on interaction; the UI chrome adopts the displayed scheme's palette).
- Tag search (multiple, ANDed). State lives in the **URL path + query**: `/<slug>?t=tag-a,tag-b` (path = displayed scheme). Manual changes `pushState`, auto-rotation `replaceState`, `popstate` restores.
- Per-scheme **SSR meta** (title / description / Open Graph / Twitter) and a build-time **palette OG image**; `robots.txt` + `sitemap.xml` + `llms.txt` expose every scheme URL.
- Zero-match contribution flow (generate/copy prompt → paste/preview JSON → login → **choose fork owner + name** → fork + PR).
- Keep each color as hex; convert to multiple color spaces (hex/rgb/hsl/oklch) and **export in 10 developer formats**.

## 10. Non-goals

- Server / DB / billing / ads / custom accounts (auth is GitHub only).
- The original generator idea (HSL/OKLCH harmony, lock/shuffle) is **dropped**.

## 11. Open / to decide later

- Whether to carry `role` in the schema for MVP (currently no; plain array).
- Duplicate/similar-scheme detection (warn on near-identical palettes at submit time).
- Transition presentation (full-background vs swatches) and rotation interval.
- OG image variant with the scheme name rendered (currently palette bands only).

## 12. Implementation notes (post-freeze)

Built and deployed; these refine the 2026-06-18 design:

- **Routing**: path + query `/<slug>?t=tags` via the History API (manual = pushState, auto-rotate = replaceState, popstate restores) — replaces the planned URL fragment.
- **SSR + OG**: the Worker injects per-scheme `<title>` / description / Open Graph / Twitter meta for navigations; `build-index.ts` generates one palette PNG per scheme (`/og/<slug>.png`, 1200×630, palette bands) via `pngjs`.
- **SEO**: `public/robots.txt` (static) + generated `sitemap.xml` and `llms.txt` listing every scheme URL.
- **Hosting**: served on the apex via a **wrangler-managed Workers Custom Domain** (not a zone route). Custom Domains bypass the zone's Always Use HTTPS / page rules, so the Worker forces `http → https` (and `assets.run_worker_first` is scoped so static bundles stay assets-first). The account is inferred from the API token (no `CLOUDFLARE_ACCOUNT_ID`).
- **Contribution**: the user picks a **fork owner** (their account or an org with create permission) and the repo name — both checked for validity and availability before submit. OAuth scope is `public_repo read:org`.
- **Fonts**: **Pliant** (Google Fonts), weights 400/500/600/700.
- **Validation**: `schema/scheme.schema.json` is canonical (enforced in CI with ajv); `src/validate.ts` mirrors it (dependency-free, eval-free) for the client and Worker.
- **CI**: `validate.yml` (schemas), `test.yml` (typecheck + Playwright `test:ui`), `deploy.yml` (deploy on push to `main`).
