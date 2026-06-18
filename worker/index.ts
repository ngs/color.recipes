// Cloudflare Worker (SPEC §4, §8): OAuth Web flow + write proxy (fork -> commit -> PR).
// The GitHub token lives only in a signed, httpOnly cookie and never reaches the
// browser. Static-asset matches are served by the platform before the Worker runs;
// non-matching requests land here. `/api/*` is handled below, everything else falls
// back to the ASSETS binding (SPA).

import { validateScheme, validateRepoName, slugify } from "../src/validate.ts";

export interface Env {
  ASSETS: Fetcher;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  COOKIE_SECRET: string;
  UPSTREAM_REPO: string; // "owner/repo"
}

const AUTH_COOKIE = "cr_sess";
const STATE_COOKIE = "cr_oauth_state";
const RETURN_COOKIE = "cr_return";
const GITHUB_API = "https://api.github.com";
const UA = "color.recipes-worker";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Force HTTPS. Workers Custom Domains bypass the zone's Always Use HTTPS /
    // page rules, so the redirect must happen here. `CF-Visitor` carries the
    // client's scheme and is only set by the Cloudflare edge, so local dev
    // (http://localhost) is unaffected. Requires assets.run_worker_first so the
    // Worker runs before static assets are served.
    if (request.headers.get("CF-Visitor")?.includes('"scheme":"http"')) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    const { pathname } = url;

    try {
      if (pathname === "/api/auth/login") return authLogin(request, env, url);
      if (pathname === "/api/auth/callback") return authCallback(request, env, url);
      if (pathname === "/api/auth/me") return authMe(request, env);
      if (pathname === "/api/auth/logout") return authLogout(request);
      if (pathname === "/api/fork/owners") return forkOwners(request, env);
      if (pathname === "/api/fork/check") return forkCheck(request, env, url);
      if (pathname === "/api/submit") return submit(request, env);
      if (pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }

    // Non-API: serve static assets (SPA fallback handled by the assets binding).
    return env.ASSETS.fetch(request);
  },
};

// ---------------------------------------------------------------- OAuth

async function authLogin(request: Request, env: Env, url: URL): Promise<Response> {
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = `${url.origin}/api/auth/callback`;

  const returnTo = safeReturnTo(url.searchParams.get("return_to"));

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  // public_repo: fork + commit + PR. read:org: list the orgs the user can fork into
  // and read each org's repo-creation policy (for the owner picker).
  authorize.searchParams.set("scope", "public_repo read:org");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "true");

  const headers = new Headers({ Location: authorize.toString() });
  headers.append("Set-Cookie", await signedCookie(STATE_COOKIE, state, env.COOKIE_SECRET, 600));
  headers.append("Set-Cookie", cookie(RETURN_COOKIE, returnTo, { maxAge: 600 }));
  return new Response(null, { status: 302, headers });
}

async function authCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request);

  const expectedState = await readSignedCookie(cookies[STATE_COOKIE], env.COOKIE_SECRET);
  if (!code || !state || !expectedState || state !== expectedState) {
    return json({ error: "invalid OAuth state" }, 400);
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/auth/callback`,
    }),
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenData.access_token) {
    return json({ error: tokenData.error_description || "token exchange failed" }, 502);
  }

  const returnTo = safeReturnTo(cookies[RETURN_COOKIE]);
  const headers = new Headers({ Location: returnTo });
  headers.append(
    "Set-Cookie",
    await signedCookie(AUTH_COOKIE, tokenData.access_token, env.COOKIE_SECRET, 60 * 60 * 24 * 7),
  );
  headers.append("Set-Cookie", clearCookie(STATE_COOKIE));
  headers.append("Set-Cookie", clearCookie(RETURN_COOKIE));
  return new Response(null, { status: 302, headers });
}

async function authMe(request: Request, env: Env): Promise<Response> {
  const token = await currentToken(request, env);
  if (!token) return json({ error: "not authenticated" }, 401);
  const user = await gh(token, "GET", "/user");
  if (!user.ok) return json({ error: "not authenticated" }, 401);
  const u = (await user.json()) as { login: string; avatar_url: string; html_url: string };
  return json({ login: u.login, avatarUrl: u.avatar_url, htmlUrl: u.html_url });
}

function authLogout(_request: Request): Response {
  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(AUTH_COOKIE));
  return new Response(null, { status: 204, headers });
}

// ---------------------------------------------------------------- submit

interface SubmitBody {
  scheme?: unknown;
  forkName?: unknown;
  forkOwner?: unknown;
}

// GET /api/fork/owners — accounts the contributor can fork into: themselves plus
// the organizations they belong to (mirrors GitHub's "Create a new fork" owner list).
async function forkOwners(request: Request, env: Env): Promise<Response> {
  const token = await currentToken(request, env);
  if (!token) return json({ error: "not authenticated" }, 401);

  const meRes = await gh(token, "GET", "/user");
  if (!meRes.ok) return json({ error: "not authenticated" }, 401);
  const me = (await meRes.json()) as { login: string; avatar_url: string };

  const owners: Array<{ login: string; type: string; avatarUrl: string; canCreate: boolean }> = [
    { login: me.login, type: "User", avatarUrl: me.avatar_url, canCreate: true },
  ];

  // Orgs the user belongs to, with their role (needs read:org for full coverage).
  const memRes = await gh(token, "GET", "/user/memberships/orgs?state=active&per_page=100");
  if (memRes.ok) {
    const memberships = (await memRes.json()) as Array<{
      role: string;
      organization: { login: string; avatar_url: string };
    }>;
    const orgOwners = await Promise.all(
      memberships.map(async (m) => {
        // Admins can always create; for members, a fork of a public repo is public,
        // so the org's public-repo creation policy decides.
        let canCreate = m.role === "admin";
        if (!canCreate) {
          const orgRes = await gh(token, "GET", `/orgs/${m.organization.login}`);
          if (orgRes.ok) {
            const org = (await orgRes.json()) as {
              members_can_create_public_repositories?: boolean;
              members_can_create_repositories?: boolean;
            };
            canCreate =
              org.members_can_create_public_repositories ?? org.members_can_create_repositories ?? true;
          } else {
            canCreate = true; // policy not readable — stay optimistic
          }
        }
        return {
          login: m.organization.login,
          type: "Organization",
          avatarUrl: m.organization.avatar_url,
          canCreate,
        };
      }),
    );
    owners.push(...orgOwners);
  }

  return json({ login: me.login, owners });
}

// GET /api/fork/check?owner=<owner>&name=<name> — is <owner>/<name> usable as a fork
// target? Returns { valid, exists, available, isOurFork, isUpstream } (owner defaults
// to the logged-in user). isUpstream/isOurFork mean it can be reused as-is.
async function forkCheck(request: Request, env: Env, url: URL): Promise<Response> {
  const token = await currentToken(request, env);
  if (!token) return json({ error: "not authenticated" }, 401);

  const nameResult = validateRepoName(url.searchParams.get("name") ?? "");
  if (!nameResult.ok) return json({ valid: false, errors: nameResult.errors }, 400);
  const name = nameResult.value;

  const meRes = await gh(token, "GET", "/user");
  if (!meRes.ok) return json({ error: "not authenticated" }, 401);
  const me = (await meRes.json()) as { login: string };
  const owner = url.searchParams.get("owner") || me.login;

  const repoRes = await gh(token, "GET", `/repos/${owner}/${name}`);
  if (repoRes.status === 404) {
    return json({ valid: true, exists: false, available: true, isOurFork: false, isUpstream: false });
  }
  if (!repoRes.ok) return json({ error: `could not check repository (${repoRes.status})` }, 502);
  const repo = (await repoRes.json()) as { fork?: boolean; parent?: { full_name?: string } };
  const upstream = env.UPSTREAM_REPO.toLowerCase();
  const isUpstream = `${owner}/${name}`.toLowerCase() === upstream;
  const isOurFork = !!repo.fork && repo.parent?.full_name?.toLowerCase() === upstream;
  return json({ valid: true, exists: true, available: false, isOurFork, isUpstream });
}

async function submit(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  const token = await currentToken(request, env);
  if (!token) return json({ error: "not authenticated" }, 401);

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const result = validateScheme(body.scheme);
  if (!result.ok) return json({ error: result.errors.join("; ") }, 400);
  const scheme = result.value;

  const [upstreamOwner, upstreamRepo] = env.UPSTREAM_REPO.split("/");
  const slug = slugify(scheme.name);
  const path = `schemes/${slug}.json`;
  const content = JSON.stringify(scheme, null, 2) + "\n";

  // 1. Who am I.
  const meRes = await gh(token, "GET", "/user");
  if (!meRes.ok) return json({ error: "could not read GitHub user" }, 502);
  const me = (await meRes.json()) as { login: string };

  // 2. Upstream default branch.
  const upstreamRes = await gh(token, "GET", `/repos/${upstreamOwner}/${upstreamRepo}`);
  const upstream = (await upstreamRes.json()) as { default_branch: string };
  const baseBranch = upstream.default_branch;

  // 3. Resolve where the branch lives. The contributor chooses the target owner
  //    (themselves or an org) and name. The upstream repo itself can't be forked,
  //    so when the target IS the upstream we commit a branch there directly; for an
  //    org target we fork into the org; otherwise a personal fork. We read the
  //    actual owner/name back from the API so a collision never hits the wrong repo.
  let forkName = upstreamRepo;
  if (body.forkName != null) {
    const nameResult = validateRepoName(body.forkName);
    if (!nameResult.ok) return json({ error: nameResult.errors.join("; ") }, 400);
    forkName = nameResult.value;
  }
  const targetOwner = typeof body.forkOwner === "string" && body.forkOwner ? body.forkOwner : me.login;

  let forkOwner = upstreamOwner;
  let forkRepo = upstreamRepo;
  const targetIsUpstream =
    targetOwner.toLowerCase() === upstreamOwner.toLowerCase() &&
    forkName.toLowerCase() === upstreamRepo.toLowerCase();
  if (!targetIsUpstream) {
    const forkBody: Record<string, unknown> = { name: forkName, default_branch_only: true };
    if (targetOwner.toLowerCase() !== me.login.toLowerCase()) forkBody.organization = targetOwner;
    const forkRes = await gh(token, "POST", `/repos/${upstreamOwner}/${upstreamRepo}/forks`, forkBody);
    if (!forkRes.ok) return json({ error: await ghError(forkRes, "create fork") }, 502);
    const fork = (await forkRes.json()) as { name: string; owner: { login: string } };
    forkOwner = fork.owner.login;
    forkRepo = fork.name;
  }

  // 4. Base SHA from the fork (retry: a freshly created fork may not be ready yet).
  const baseSha = await forkBaseSha(token, forkOwner, forkRepo, baseBranch);
  if (!baseSha) return json({ error: "fork not ready yet — please retry in a moment" }, 503);

  // 5. New branch.
  const branch = `add-${slug}-${Date.now().toString(36)}`;
  const refRes = await gh(token, "POST", `/repos/${forkOwner}/${forkRepo}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });
  if (!refRes.ok) return json({ error: await ghError(refRes, "create branch") }, 502);

  // 6. Commit the scheme file to the branch.
  const putRes = await gh(token, "PUT", `/repos/${forkOwner}/${forkRepo}/contents/${path}`, {
    message: `Add scheme: ${scheme.name}`,
    content: toBase64(content),
    branch,
  });
  if (!putRes.ok) return json({ error: await ghError(putRes, "commit file") }, 502);

  // 7. Open the PR against upstream.
  const prRes = await gh(token, "POST", `/repos/${upstreamOwner}/${upstreamRepo}/pulls`, {
    title: `Add scheme: ${scheme.name}`,
    head: `${forkOwner}:${branch}`,
    base: baseBranch,
    body: `Adds \`${path}\` via color.recipes.\n\nTags: ${scheme.tags.join(", ")}`,
    maintainer_can_modify: true,
  });
  if (!prRes.ok) return json({ error: await ghError(prRes, "open PR") }, 502);
  const pr = (await prRes.json()) as { html_url: string };
  return json({ url: pr.html_url });
}

async function forkBaseSha(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await gh(token, "GET", `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    if (res.ok) {
      const ref = (await res.json()) as { object: { sha: string } };
      return ref.object.sha;
    }
    // Fork still propagating; brief backoff.
    await sleep(700 * (attempt + 1));
  }
  return null;
}

// ---------------------------------------------------------------- GitHub helpers

function gh(token: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": UA,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function ghError(res: Response, action: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return `${action} failed (${res.status}): ${data.message ?? res.statusText}`;
}

// ---------------------------------------------------------------- cookies + signing

async function currentToken(request: Request, env: Env): Promise<string | null> {
  const cookies = parseCookies(request);
  return readSignedCookie(cookies[AUTH_COOKIE], env.COOKIE_SECRET);
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("Cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

interface CookieOpts {
  maxAge?: number;
  httpOnly?: boolean;
}

function cookie(name: string, value: string, opts: CookieOpts = {}): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "Secure",
    "SameSite=Lax",
  ];
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}

function clearCookie(name: string): string {
  return `${name}=; Path=/; Secure; SameSite=Lax; HttpOnly; Max-Age=0`;
}

async function signedCookie(
  name: string,
  value: string,
  secret: string,
  maxAge: number,
): Promise<string> {
  const sig = await hmac(secret, value);
  return cookie(name, `${value}.${sig}`, { maxAge });
}

async function readSignedCookie(raw: string | undefined, secret: string): Promise<string | null> {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const value = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = await hmac(secret, value);
  return timingSafeEqual(sig, expected) ? value : null;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------- misc

function safeReturnTo(value: string | null | undefined): string {
  // Only same-origin paths are allowed (avoid open redirects).
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
