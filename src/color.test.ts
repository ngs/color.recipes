import { describe, it, expect } from "vitest";
import {
  hexToRgb,
  rgbToCmyk,
  formatRgb,
  formatHex,
  formatHsl,
  formatOklch,
  formatCmyk,
  mix,
  readableText,
  luminance,
  FORMATTERS,
} from "./color.ts";

describe("color", () => {
  it("hexToRgb parses #RRGGBB", () => {
    expect(hexToRgb("#1c2a33")).toEqual({ r: 28, g: 42, b: 51 });
  });

  it("formats rgb/hex", () => {
    expect(formatRgb("#1c2a33")).toBe("rgb(28 42 51)");
    expect(formatHex("#AABBCC")).toBe("#aabbcc");
  });

  it("rgbToCmyk derives k from the brightest channel", () => {
    expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    expect(rgbToCmyk({ r: 255, g: 255, b: 255 })).toEqual({ c: 0, m: 0, y: 0, k: 0 });
    expect(formatCmyk("#1c1610")).toBe("cmyk(0% 21% 43% 89%)");
  });

  it("hsl/oklch have the expected shape", () => {
    expect(formatHsl("#1c2a33")).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
    expect(formatOklch("#1c2a33")).toMatch(/^oklch\([\d.]+% [\d.]+ -?\d+\)$/);
  });

  it("mix interpolates in sRGB", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
  });

  it("readableText / luminance pick contrast", () => {
    expect(readableText("#ffffff")).toBe("#111111");
    expect(readableText("#000000")).toBe("#ffffff");
    expect(luminance("#ffffff")).toBeGreaterThan(luminance("#000000"));
  });

  it("FORMATTERS is keyed by color space", () => {
    expect(FORMATTERS.hex("#ABCDEF")).toBe("#abcdef");
    expect(FORMATTERS.cmyk("#000000")).toBe("cmyk(0% 0% 0% 100%)");
  });
});
