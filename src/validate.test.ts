import { describe, it, expect } from "vitest";
import { validateAiInput, validateScheme, validateRepoName, slugify } from "./validate.ts";

describe("validate", () => {
  it("validateAiInput accepts a good payload and lowercases colors", () => {
    const r = validateAiInput({ name: " Deep Tide ", tags: ["ocean", "blue"], colors: ["#04263B", "#EEF9FC"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("Deep Tide");
      expect(r.value.colors).toEqual(["#04263b", "#eef9fc"]);
    }
  });

  it("validateAiInput reports each invalid field", () => {
    const r = validateAiInput({ name: "", tags: [], colors: ["nope"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("validateScheme requires the full shape and rejects extra keys", () => {
    const base = {
      version: 1,
      name: "X",
      tags: ["a"],
      colors: ["#000000", "#ffffff"],
      source: "ai",
      createdAt: "2026-01-01",
    };
    expect(validateScheme(base).ok).toBe(true);
    expect(validateScheme({ ...base, extra: 1 }).ok).toBe(false);
    expect(validateScheme({ ...base, createdAt: "01-01-2026" }).ok).toBe(false);
  });

  it("validateRepoName enforces GitHub name rules", () => {
    expect(validateRepoName("color.recipes").ok).toBe(true);
    expect(validateRepoName("bad name!").ok).toBe(false);
    expect(validateRepoName("..").ok).toBe(false);
    expect(validateRepoName("").ok).toBe(false);
  });

  it("slugify is filename-safe", () => {
    expect(slugify("Deep Tide!")).toBe("deep-tide");
    expect(slugify("  ---  ")).toBe("scheme");
  });
});
