// Color-space conversion and formatting (SPEC §2, §9).
// Colors are stored as #RRGGBB hex; everything else is derived for display/export.

export interface Rgb {
  r: number; // 0-255
  g: number;
  b: number;
}

export interface Hsl {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export interface Oklch {
  l: number; // 0-1
  c: number; // chroma
  h: number; // 0-360
}

export function hexToRgb(hex: string): Rgb {
  const v = hex.replace(/^#/, "");
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

function srgbToLinear(c: number): number {
  const cn = c / 255;
  return cn <= 0.04045 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4);
}

// sRGB -> OKLCH via OKLab (Björn Ottosson).
export function hexToOklch(hex: string): Oklch {
  const { r, g, b } = hexToRgb(hex);
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const okL = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const okA = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const okB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.hypot(okA, okB);
  let h = (Math.atan2(okB, okA) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: okL, c, h };
}

const round = (n: number, d = 0): number => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

export function formatHex(hex: string): string {
  return hex.toLowerCase();
}

export function formatRgb(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b})`;
}

export function formatHsl(hex: string): string {
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  return `hsl(${round(h)} ${round(s)}% ${round(l)}%)`;
}

export function formatOklch(hex: string): string {
  const { l, c, h } = hexToOklch(hex);
  return `oklch(${round(l * 100, 1)}% ${round(c, 3)} ${round(h)})`;
}

/** Relative luminance (WCAG) — used to pick readable foreground text. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Return black or white, whichever reads better on the given background. */
export function readableText(hex: string): string {
  return luminance(hex) > 0.4 ? "#111111" : "#ffffff";
}

const toHex = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** Linear interpolation between two hex colors in sRGB (t: 0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `#${toHex(ca.r + (cb.r - ca.r) * t)}${toHex(ca.g + (cb.g - ca.g) * t)}${toHex(ca.b + (cb.b - ca.b) * t)}`;
}

export type ColorSpace = "hex" | "rgb" | "hsl" | "oklch";

export const FORMATTERS: Record<ColorSpace, (hex: string) => string> = {
  hex: formatHex,
  rgb: formatRgb,
  hsl: formatHsl,
  oklch: formatOklch,
};
