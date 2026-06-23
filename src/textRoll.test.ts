import { describe, it, expect } from "vitest";
import { charPath, rollText, EASINGS } from "./textRoll.ts";

describe("charPath", () => {
  it("returns a single state when the character is unchanged", () => {
    expect(charPath("A", "A")).toEqual(["A"]);
  });

  it("walks the latin rail forwards and backwards", () => {
    expect(charPath("A", "D")).toEqual(["A", "B", "C", "D"]);
    expect(charPath("D", "A")).toEqual(["D", "C", "B", "A"]);
  });

  it("rises from blank into a character (and falls back to blank)", () => {
    expect(charPath(" ", "C")).toEqual([" ", "A", "B", "C"]);
    const fall = charPath("C", " ");
    expect(fall[0]).toBe("C");
    expect(fall[fall.length - 1]).toBe(" ");
  });

  it("scrambles kanji within the pool, ending on the target", () => {
    const p = charPath("日", "月");
    expect(p[0]).toBe("日");
    expect(p[p.length - 1]).toBe("月");
    expect(p.length).toBeGreaterThan(2); // not a direct switch
  });

  it("switches directly across unrelated rails", () => {
    expect(charPath("A", "あ")).toEqual(["A", "あ"]);
  });
});

describe("EASINGS", () => {
  it("are pinned at the 0 and 1 endpoints", () => {
    for (const ease of Object.values(EASINGS)) {
      expect(ease(0)).toBeCloseTo(0, 6);
      expect(ease(1)).toBeCloseTo(1, 6);
    }
  });

  it("linear is the identity", () => {
    expect(EASINGS.linear(0.42)).toBeCloseTo(0.42, 6);
  });
});

describe("rollText", () => {
  // The unit project forces prefers-reduced-motion, so rollText snaps straight
  // to the target and returns a no-op canceller.
  it("snaps to the target text under reduced motion", () => {
    const el = document.createElement("span");
    el.textContent = "AB";
    const cancel = rollText(el, "AB", "CD", { duration: 500 });
    expect(el.textContent).toBe("CD");
    expect(typeof cancel).toBe("function");
    expect(() => cancel()).not.toThrow();
  });
});
