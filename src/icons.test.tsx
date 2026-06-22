import { describe, it, expect } from "vitest";
import { render } from "@testing-library/preact";
import { Icon, ICONS } from "./icons.tsx";

describe("Icon", () => {
  it("renders an inline SVG with the icon's viewBox and path", () => {
    const { container } = render(<Icon def={ICONS.xmark} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("class")).toContain("fa-icon");
    expect(svg.getAttribute("class")).toContain("fa-xmark");
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${ICONS.xmark.icon[0]} ${ICONS.xmark.icon[1]}`);
    expect(svg.querySelector("path")?.getAttribute("fill")).toBe("currentColor");
    expect(svg.querySelector("path")?.getAttribute("d")).toBeTruthy();
  });

  it("appends an extra class when given", () => {
    const { container } = render(<Icon def={ICONS.chevronDown} class="select-chevron" />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("select-chevron");
  });
});
