import { describe, it, expect } from "vitest";
import worker from "./index.ts";
import type { Env } from "./env.ts";

const env = {
  ASSETS: {
    async fetch(input: RequestInfo | URL) {
      const path = new URL(typeof input === "string" ? input : (input as Request).url).pathname;
      return new Response(`ASSET:${path}`);
    },
  },
  COOKIE_SECRET: "s",
  GITHUB_CLIENT_ID: "",
  GITHUB_CLIENT_SECRET: "",
  UPSTREAM_REPO: "ngs/color.recipes",
} as unknown as Env;

describe("router", () => {
  it("redirects to https when the edge reports http", async () => {
    const res = await worker.fetch(
      new Request("https://color.recipes/x", { headers: { "CF-Visitor": '{"scheme":"http"}' } }),
      env,
    );
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://color.recipes/x");
  });

  it("returns 404 JSON for an unknown /api route", async () => {
    const res = await worker.fetch(new Request("https://color.recipes/api/nope"), env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("passes static files (with an extension) through to ASSETS", async () => {
    const res = await worker.fetch(new Request("https://color.recipes/assets/app.js"), env);
    expect(await res.text()).toBe("ASSET:/assets/app.js");
  });

  it("routes /api/auth/me and answers 401 without a session", async () => {
    const res = await worker.fetch(new Request("https://color.recipes/api/auth/me"), env);
    expect(res.status).toBe(401);
  });
});
