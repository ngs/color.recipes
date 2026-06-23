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
  it("renders the start scheme, its tags + pager, and Prev/Next navigate", async () => {
    const { container } = render(<Gallery schemes={[A, B]} startSlug="a" />);
    expect(container.querySelector(".caption h2")?.textContent).toBe("Alpha");
    expect(container.querySelector(".pos")?.textContent?.replace(/\s/g, "")).toBe("1/2");
    expect(container.querySelector(".counter")?.textContent).toContain("2 schemes");
    expect([...container.querySelectorAll(".meta .chip")].map((c) => c.textContent?.trim())).toEqual(["winter", "snow"]);
    expect((container.querySelector('[aria-label="Next"]') as HTMLButtonElement).disabled).toBe(false);

    await fireEvent.click(container.querySelector('[aria-label="Next"]')!);
    expect(container.querySelector(".caption h2")?.textContent).toBe("Beta");
    expect(container.querySelector(".pos")?.textContent?.replace(/\s/g, "")).toBe("2/2");

    await fireEvent.click(container.querySelector('[aria-label="Prev"]')!);
    expect(container.querySelector(".caption h2")?.textContent).toBe("Alpha");
  });

  it("clicking a caption tag chip toggles it into the filter", async () => {
    activeTags.value = [];
    const { container } = render(<Gallery schemes={[A]} startSlug="a" />);
    const chip = [...container.querySelectorAll(".meta .chip")].find((c) => c.textContent?.trim() === "snow")!;
    await fireEvent.click(chip);
    expect(activeTags.value).toContain("snow");
  });

  it("pauses auto-rotation on a real mouse hover but not on a touch tap", async () => {
    const { container } = render(<Gallery schemes={[A, B]} startSlug="a" />);
    const caption = container.querySelector(".caption") as HTMLElement;
    const playState = () => (container.querySelector(".caption-progress") as HTMLElement).style.animationPlayState;
    expect(playState()).toBe("running");

    // A touch "hover" must NOT pause — otherwise it sticks (no mouse-leave on iOS
    // when the next tap lands on a non-clickable area) and rotation never resumes.
    await fireEvent.pointerEnter(caption, { pointerType: "touch" });
    expect(playState()).toBe("running");

    // A real mouse hover pauses, and leaving resumes.
    await fireEvent.pointerEnter(caption, { pointerType: "mouse" });
    expect(playState()).toBe("paused");
    await fireEvent.pointerLeave(caption, { pointerType: "mouse" });
    expect(playState()).toBe("running");
  });

  it("never pauses on a touch-only device (no hover)", async () => {
    const prev = window.matchMedia;
    // Touch-only: report no hover capability so the pause is not armed at all.
    window.matchMedia = ((q: string) => ({
      matches: q !== "(hover: hover)",
      media: q,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      const { container } = render(<Gallery schemes={[A, B]} startSlug="a" />);
      const caption = container.querySelector(".caption") as HTMLElement;
      const playState = () => (container.querySelector(".caption-progress") as HTMLElement).style.animationPlayState;
      expect(playState()).toBe("running");
      // No pause handlers are attached, so even a mouse "hover" can't stall it.
      await fireEvent.pointerEnter(caption, { pointerType: "mouse" });
      expect(playState()).toBe("running");
    } finally {
      window.matchMedia = prev;
    }
  });

  it("disables prev/next when there is only one scheme", () => {
    activeTags.value = [];
    const { container } = render(<Gallery schemes={[A]} startSlug="a" />);
    expect((container.querySelector('[aria-label="Prev"]') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('[aria-label="Next"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
