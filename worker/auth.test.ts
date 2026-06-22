import { describe, it, expect, vi, afterEach } from "vitest";
import { authLogin, authCallback, authMe, authLogout, AUTH_COOKIE } from "./auth.ts";
import { signedCookie } from "./cookies.ts";
import type { Env } from "./env.ts";

const env = {
  GITHUB_CLIENT_ID: "cid",
  GITHUB_CLIENT_SECRET: "sec",
  COOKIE_SECRET: "s3cret",
  UPSTREAM_REPO: "ngs/color.recipes",
} as unknown as Env;

const sessionCookie = async () => (await signedCookie(AUTH_COOKIE, "ghtok", "s3cret", 999)).split(";")[0];
const setCookies = (res: Response): string[] =>
  (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie();

afterEach(() => vi.unstubAllGlobals());

describe("auth", () => {
  it("login redirects to GitHub with state + cookies", async () => {
    const url = new URL("https://color.recipes/api/auth/login?return_to=/winter");
    const res = await authLogin(new Request(url), env, url);
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location")!;
    expect(loc).toContain("github.com/login/oauth/authorize");
    expect(loc).toContain("client_id=cid");
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.startsWith("cr_oauth_state="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("cr_return="))).toBe(true);
  });

  it("callback rejects a mismatched state", async () => {
    const url = new URL("https://color.recipes/api/auth/callback?code=x&state=nope");
    const res = await authCallback(new Request(url), env, url);
    expect(res.status).toBe(400);
  });

  it("me is 401 without a session", async () => {
    const res = await authMe(new Request("https://color.recipes/api/auth/me"), env);
    expect(res.status).toBe(401);
  });

  it("me returns the GitHub user for a valid session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "https://api.github.com/user") {
          return new Response(JSON.stringify({ login: "octocat", avatar_url: "a", html_url: "h" }));
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const req = new Request("https://color.recipes/api/auth/me", { headers: { Cookie: await sessionCookie() } });
    const res = await authMe(req, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ login: "octocat" });
  });

  it("logout clears the session cookie", () => {
    const res = authLogout(new Request("https://x"));
    expect(res.status).toBe(204);
    expect(setCookies(res).some((c) => c.startsWith(`${AUTH_COOKIE}=;`))).toBe(true);
  });
});
