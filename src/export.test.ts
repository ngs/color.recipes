import { describe, it, expect } from "vitest";
import { FORMATS } from "./export.ts";
import type { IndexedScheme } from "./types.ts";

const scheme: IndexedScheme = {
  slug: "deep-tide",
  version: 1,
  name: "Deep Tide",
  tags: ["ocean"],
  colors: ["#04263b", "#eef9fc"],
  source: "ai",
  createdAt: "2026-01-01",
};

const byId = (id: string) => {
  const f = FORMATS.find((x) => x.id === id);
  if (!f) throw new Error(`format ${id} not found`);
  return f;
};

describe("export FORMATS", () => {
  it("offers at least the documented set", () => {
    expect(FORMATS.length).toBeGreaterThanOrEqual(8);
  });

  it("json export names by slug", () => {
    expect(byId("json").generate(scheme).filename).toBe("deep-tide.json");
  });

  it("css export embeds the hex values", async () => {
    const { filename, blob } = byId("css").generate(scheme);
    expect(filename).toBe("deep-tide.css");
    expect(await blob.text()).toContain("#04263b");
  });

  it("xcassets export is a zip", () => {
    expect(byId("xcassets").generate(scheme).filename).toMatch(/\.zip$/);
  });
});
