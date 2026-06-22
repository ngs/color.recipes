import { describe, it, expect, beforeEach } from "vitest";
import {
  index,
  activeTags,
  navMode,
  startSlug,
  matched,
  normalizeTag,
  isKnownTag,
  parseLocation,
  addTag,
  removeTag,
  toggleTag,
  applyTheme,
} from "./state.ts";
import type { SchemeIndex } from "./types.ts";

const idx: SchemeIndex = {
  version: 1,
  schemes: [
    { slug: "a", version: 1, name: "Alpha", tags: ["winter", "snow"], colors: ["#0b1020", "#eef9fc"], source: "ai", createdAt: "2026-01-01" },
    { slug: "b", version: 1, name: "Beta", tags: ["winter", "calm"], colors: ["#102015", "#eef6ea"], source: "ai", createdAt: "2026-01-02" },
    { slug: "c", version: 1, name: "Gamma", tags: ["summer"], colors: ["#2b1a10", "#fff0e0"], source: "ai", createdAt: "2026-01-03" },
  ],
  tags: { winter: 2, snow: 1, calm: 1, summer: 1 },
};

beforeEach(() => {
  index.value = idx;
  activeTags.value = [];
  navMode.value = "replace";
  startSlug.value = "seed";
});

describe("state", () => {
  it("normalizeTag reduces to the tag charset", () => {
    expect(normalizeTag(" Hello World! ")).toBe("hello-world");
  });

  it("matched filters by ANDed tags", () => {
    expect(matched.value.length).toBe(3);
    activeTags.value = ["winter"];
    expect(matched.value.map((s) => s.slug).sort()).toEqual(["a", "b"]);
    activeTags.value = ["winter", "snow"];
    expect(matched.value.map((s) => s.slug)).toEqual(["a"]);
  });

  it("isKnownTag checks the catalog", () => {
    expect(isKnownTag("winter")).toBe(true);
    expect(isKnownTag("zzz")).toBe(false);
  });

  it("addTag normalizes, pushes history, and clears the start slug", () => {
    addTag("Snow");
    expect(activeTags.value).toEqual(["snow"]);
    expect(navMode.value).toBe("push");
    expect(startSlug.value).toBe("");
  });

  it("addTag ignores duplicates and blanks", () => {
    activeTags.value = ["snow"];
    addTag("snow");
    addTag("  ");
    expect(activeTags.value).toEqual(["snow"]);
  });

  it("removeTag / toggleTag", () => {
    activeTags.value = ["winter", "snow"];
    removeTag("winter");
    expect(activeTags.value).toEqual(["snow"]);
    toggleTag("snow");
    expect(activeTags.value).toEqual([]);
    toggleTag("snow");
    expect(activeTags.value).toEqual(["snow"]);
  });

  it("parseLocation reads the slug + ANDed tags", () => {
    history.replaceState({}, "", "/my-slug?t=a,b");
    expect(parseLocation()).toEqual({ slug: "my-slug", tags: ["a", "b"] });
  });

  it("applyTheme sets the palette CSS variables", () => {
    applyTheme(idx.schemes[0]);
    const r = document.documentElement.style;
    expect(r.getPropertyValue("--bg")).toBeTruthy();
    expect(r.getPropertyValue("--fg")).toBeTruthy();
    expect(r.getPropertyValue("--accent")).toBeTruthy();
  });
});
