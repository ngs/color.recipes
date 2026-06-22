import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { Search } from "./Search.tsx";
import { index, activeTags } from "./state.ts";
import type { SchemeIndex } from "./types.ts";

const idx: SchemeIndex = {
  version: 1,
  schemes: [
    { slug: "a", version: 1, name: "Alpha", tags: ["winter", "snow", "cold"], colors: ["#0b1020", "#eef9fc"], source: "ai", createdAt: "2026-01-01" },
    { slug: "b", version: 1, name: "Beta", tags: ["winter", "calm"], colors: ["#102015", "#eef6ea"], source: "ai", createdAt: "2026-01-02" },
    { slug: "c", version: 1, name: "Gamma", tags: ["summer"], colors: ["#2b1a10", "#fff0e0"], source: "ai", createdAt: "2026-01-03" },
  ],
  tags: { winter: 2, snow: 1, cold: 1, calm: 1, summer: 1 },
};

beforeEach(() => {
  index.value = idx;
  activeTags.value = [];
});

describe("Search", () => {
  it("hides suggestions until focus, then lists co-occurring tags", async () => {
    const { container } = render(<Search />);
    expect(container.querySelector("#suggest")?.className).toContain("hidden");
    const input = container.querySelector("#search-input") as HTMLInputElement;
    await fireEvent.focus(input);
    const ul = container.querySelector("#suggest")!;
    expect(ul.className).not.toContain("hidden");
    expect(ul.querySelectorAll("li.sg").length).toBeGreaterThan(0);
  });

  it("filters by query, then a click adds a chip and clears the input", async () => {
    const { container } = render(<Search />);
    const input = container.querySelector("#search-input") as HTMLInputElement;
    await fireEvent.focus(input);
    await fireEvent.input(input, { target: { value: "win" } });
    const li = [...container.querySelectorAll("li.sg")].find((l) => l.textContent?.startsWith("winter"));
    expect(li).toBeTruthy();
    await fireEvent.mouseDown(li!);
    expect(activeTags.value).toEqual(["winter"]);
    expect(input.value).toBe("");
    expect(container.querySelector(".token")?.textContent).toContain("winter");
  });

  it("Enter adds an unknown tag (dashed); its button removes it", async () => {
    const { container } = render(<Search />);
    const input = container.querySelector("#search-input") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "zzz" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(activeTags.value).toEqual(["zzz"]);
    const chip = container.querySelector(".token")!;
    expect(chip.className).toContain("token--unknown");
    await fireEvent.click(chip.querySelector("button")!);
    expect(activeTags.value).toEqual([]);
  });
});
