import { describe, it, expect, vi, afterEach } from "vitest";
import { forkOwners, forkCheck, submit } from "./contribute.ts";
import { signedCookie } from "./cookies.ts";
import { AUTH_COOKIE } from "./auth.ts";
import type { Env } from "./env.ts";

const env = { COOKIE_SECRET: "s3cret", UPSTREAM_REPO: "ngs/color.recipes" } as unknown as Env;

async function authed(pathAndQuery: string, init: RequestInit = {}): Promise<Request> {
  const pair = (await signedCookie(AUTH_COOKIE, "ghtok", "s3cret", 999)).split(";")[0];
  return new Request(`https://color.recipes${pathAndQuery}`, {
    ...init,
    headers: { Cookie: pair, ...(init.headers ?? {}) },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("contribute", () => {
  it("forkOwners is 401 without a session", async () => {
    const res = await forkOwners(new Request("https://x/api/fork/owners"), env);
    expect(res.status).toBe(401);
  });

  it("forkCheck reports an available name when the repo 404s", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const u = String(input);
        if (u === "https://api.github.com/user") return new Response(JSON.stringify({ login: "me" }));
        if (u === "https://api.github.com/repos/me/color.recipes") return new Response("{}", { status: 404 });
        return new Response("unexpected", { status: 500 });
      }),
    );
    const req = await authed("/api/fork/check?name=color.recipes");
    const res = await forkCheck(req, env, new URL(req.url));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ valid: true, available: true });
  });

  it("submit rejects non-POST and unauthenticated requests", async () => {
    expect((await submit(new Request("https://x/api/submit", { method: "GET" }), env)).status).toBe(405);
    expect((await submit(new Request("https://x/api/submit", { method: "POST" }), env)).status).toBe(401);
  });
});
