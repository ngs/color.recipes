import { describe, it, expect } from "vitest";
import { ssr } from "./ssr.ts";
import type { Env } from "./env.ts";

const HTML =
  `<!doctype html><html><head><title>color.recipes</title>` +
  `<meta name="description" content="x"></head><body></body></html>`;

function mockEnv(idx?: unknown): Env {
  return {
    ASSETS: {
      async fetch(input: RequestInfo | URL) {
        const u = String(input);
        if (u.endsWith("/index.html")) return new Response(HTML, { headers: { "Content-Type": "text/html" } });
        if (u.endsWith("/index.json")) return new Response(JSON.stringify(idx ?? { schemes: [] }));
        return new Response("not found", { status: 404 });
      },
    },
  } as unknown as Env;
}

describe("ssr", () => {
  it("injects scheme title + OG meta for a known slug", async () => {
    const env = mockEnv({ schemes: [{ name: "Deep Tide", tags: ["ocean", "blue"], slug: "deep-tide" }] });
    const url = new URL("https://color.recipes/deep-tide");
    const html = await (await ssr(new Request(url), env, url)).text();
    expect(html).toContain("<title>Deep Tide — color.recipes</title>");
    expect(html).toContain('og:title" content="Deep Tide"');
    expect(html).toContain('og:image" content="https://color.recipes/og/deep-tide.png"');
  });

  it("uses the default title + no OG image at the root", async () => {
    const env = mockEnv();
    const url = new URL("https://color.recipes/");
    const html = await (await ssr(new Request(url), env, url)).text();
    expect(html).toContain("<title>color.recipes</title>");
    expect(html).not.toContain("og:image");
  });
});
