// OAuth Web flow (SPEC §8): login -> GitHub authorize -> callback exchanges the
// code for a token, which is stored in a signed, httpOnly cookie. The token
// never reaches the browser; all later GitHub calls read it back here.
import type { Env } from "./env.ts";
import { json, safeReturnTo, base64url } from "./util.ts";
import { cookie, clearCookie, signedCookie, readSignedCookie, parseCookies } from "./cookies.ts";
import { gh, UA } from "./github.ts";

export const AUTH_COOKIE = "cr_sess";
const STATE_COOKIE = "cr_oauth_state";
const RETURN_COOKIE = "cr_return";

/** The contributor's GitHub token from the signed session cookie, or null. */
export async function currentToken(request: Request, env: Env): Promise<string | null> {
  const cookies = parseCookies(request);
  return readSignedCookie(cookies[AUTH_COOKIE], env.COOKIE_SECRET);
}

export async function authLogin(request: Request, env: Env, url: URL): Promise<Response> {
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = `${url.origin}/api/auth/callback`;
  const returnTo = safeReturnTo(url.searchParams.get("return_to"));

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  // public_repo: fork + commit + PR. read:org: list orgs the user can fork into
  // and read each org's repo-creation policy (for the owner picker).
  authorize.searchParams.set("scope", "public_repo read:org");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "true");

  const headers = new Headers({ Location: authorize.toString() });
  headers.append("Set-Cookie", await signedCookie(STATE_COOKIE, state, env.COOKIE_SECRET, 600));
  headers.append("Set-Cookie", cookie(RETURN_COOKIE, returnTo, { maxAge: 600 }));
  return new Response(null, { status: 302, headers });
}

export async function authCallback(request: Request, env: Env, url: URL): Promise<Response> {
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

export async function authMe(request: Request, env: Env): Promise<Response> {
  const token = await currentToken(request, env);
  if (!token) return json({ error: "not authenticated" }, 401);
  const user = await gh(token, "GET", "/user");
  if (!user.ok) return json({ error: "not authenticated" }, 401);
  const u = (await user.json()) as { login: string; avatar_url: string; html_url: string };
  return json({ login: u.login, avatarUrl: u.avatar_url, htmlUrl: u.html_url });
}

export function authLogout(_request: Request): Response {
  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(AUTH_COOKIE));
  return new Response(null, { status: 204, headers });
}
