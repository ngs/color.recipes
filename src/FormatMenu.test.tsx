import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { FormatMenu } from "./FormatMenu.tsx";
import { ICONS } from "./icons.tsx";
import { FORMATS } from "./export.ts";

describe("FormatMenu", () => {
  it("opens, lists the given formats, and calls onPick with the chosen one", async () => {
    const onPick = vi.fn();
    const { container, getByText } = render(
      <FormatMenu
        icon={ICONS.download}
        title="Download"
        variant="menu--download"
        formats={FORMATS}
        onPick={onPick}
      />,
    );
    expect(container.querySelector(".menu-list")?.className).toContain("hidden");

    await fireEvent.click(container.querySelector(".ctl")!);
    expect(container.querySelector(".menu-list")?.className).not.toContain("hidden");
    expect(container.querySelectorAll(".menu-list li").length).toBe(FORMATS.length);

    await fireEvent.click(getByText("CSS variables"));
    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0][0].id).toBe("css");
  });

  it("exposes the trigger via aria-label + data-tooltip (custom tooltip)", () => {
    const { container } = render(
      <FormatMenu icon={ICONS.clipboard} title="Copy to clipboard" variant="menu--copy" formats={[]} onPick={() => {}} />,
    );
    const btn = container.querySelector(".ctl")!;
    expect(btn.getAttribute("aria-label")).toBe("Copy to clipboard");
    expect(btn.getAttribute("data-tooltip")).toBe("Copy to clipboard");
    expect(btn.getAttribute("title")).toBeNull();
  });
});
