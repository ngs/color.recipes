import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";

const { triggerDownload } = vi.hoisted(() => ({ triggerDownload: vi.fn() }));
vi.mock("./export.ts", async (orig) => ({
  ...(await orig<typeof import("./export.ts")>()),
  triggerDownload,
}));

import { Download } from "./Download.tsx";
import { FORMATS } from "./export.ts";
import type { IndexedScheme } from "./types.ts";

const scheme: IndexedScheme = {
  slug: "alpha",
  version: 1,
  name: "Alpha",
  tags: ["x"],
  colors: ["#000000", "#ffffff"],
  source: "ai",
  createdAt: "2026-01-01",
};

beforeEach(() => triggerDownload.mockClear());

describe("Download", () => {
  it("opens the menu, lists every format, and downloads on click", async () => {
    const { container, getByText } = render(<Download scheme={scheme} />);
    expect(container.querySelector(".dl-menu")?.className).toContain("hidden");

    await fireEvent.click(container.querySelector(".dl > .btn")!);
    expect(container.querySelector(".dl-menu")?.className).not.toContain("hidden");
    expect(container.querySelectorAll(".dl-menu li").length).toBe(FORMATS.length);

    await fireEvent.click(getByText("CSS variables"));
    expect(triggerDownload).toHaveBeenCalledOnce();
    expect(triggerDownload.mock.calls[0][0]).toBe("alpha.css");
  });
});
