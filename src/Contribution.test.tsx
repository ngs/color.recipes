import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { Contribution } from "./Contribution.tsx";

describe("Contribution", () => {
  it("renders the zero-match panel with the tag-filled prompt", () => {
    const { container, getByText } = render(<Contribution tags={["ocean"]} />);
    expect(getByText("No matching scheme yet")).toBeTruthy();
    expect(container.querySelector("pre.prompt-box")?.textContent).toContain("Tags: ocean");
  });

  it("previews valid pasted JSON and rejects invalid", async () => {
    const { container, getByText } = render(<Contribution tags={["ocean"]} />);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    const json = JSON.stringify({
      name: "Deep Tide",
      tags: ["ocean", "blue", "calm"],
      colors: ["#04263b", "#0a6c8a", "#2aa7c4", "#9fd8e6", "#eef9fc"],
    });
    await fireEvent.input(ta, { target: { value: json } });
    await fireEvent.click(getByText("Preview"));
    expect(container.querySelectorAll(".preview-swatches > div").length).toBe(5);
    expect(container.querySelector(".notice")?.className).toContain("ok");

    await fireEvent.input(ta, { target: { value: "{ not json" } });
    expect(container.querySelector(".notice")?.className).toContain("error");
  });
});
