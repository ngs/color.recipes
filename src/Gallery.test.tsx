import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { Gallery } from "./Gallery.tsx";
import { activeTags, navMode } from "./state.ts";
import type { IndexedScheme } from "./types.ts";

const A: IndexedScheme = { slug: "a", version: 1, name: "Alpha", tags: ["winter", "snow"], colors: ["#0b1020", "#eef9fc"], source: "ai", createdAt: "2026-01-01" };
const B: IndexedScheme = { slug: "b", version: 1, name: "Beta", tags: ["calm"], colors: ["#102015", "#eef6ea"], source: "ai", createdAt: "2026-01-02" };

beforeEach(() => {
  activeTags.value = ["winter"];
  navMode.value = "replace";
});

describe("Gallery", () => {
  it("renders the start scheme, its tags + counter, and Next advances", async () => {
    const { container } = render(<Gallery schemes={[A, B]} startSlug="a" />);
    expect(container.querySelector(".caption h2")?.textContent).toBe("Alpha");
    expect(container.querySelector(".counter")?.textContent).toContain("2 schemes");
    expect([...container.querySelectorAll(".meta .chip")].map((c) => c.textContent)).toEqual(["winter", "snow"]);

    const next = container.querySelector(".controls .btn") as HTMLButtonElement; // first control = Next
    await fireEvent.click(next);
    expect(container.querySelector(".caption h2")?.textContent).toBe("Beta");
  });

  it("clicking a caption tag chip toggles it into the filter", async () => {
    activeTags.value = [];
    const { container } = render(<Gallery schemes={[A]} startSlug="a" />);
    const chip = [...container.querySelectorAll(".meta .chip")].find((c) => c.textContent === "snow")!;
    await fireEvent.click(chip);
    expect(activeTags.value).toContain("snow");
  });
});
