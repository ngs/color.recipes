import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { ValuesOverlay } from "./ValuesOverlay.tsx";
import { selectedSpace } from "./state.ts";
import { FORMATTERS } from "./color.ts";
import type { IndexedScheme } from "./types.ts";

const scheme: IndexedScheme = {
  slug: "a",
  version: 1,
  name: "Alpha",
  tags: ["x"],
  colors: ["#04263b", "#eef9fc"],
  source: "ai",
  createdAt: "2026-01-01",
};

beforeEach(() => {
  selectedSpace.value = "hex";
});

describe("ValuesOverlay", () => {
  it("shows the selected space's value per color and switches via the dropdown", async () => {
    const { container } = render(<ValuesOverlay scheme={scheme} />);
    const values = () => [...container.querySelectorAll("table td:nth-child(2)")].map((c) => c.textContent);
    expect(values()).toEqual(["#04263b", "#eef9fc"]);

    const select = container.querySelector("select.spaces-select") as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: "rgb" } });
    expect(selectedSpace.value).toBe("rgb");
    expect(values()).toEqual([FORMATTERS.rgb("#04263b"), FORMATTERS.rgb("#eef9fc")]);
  });
});
