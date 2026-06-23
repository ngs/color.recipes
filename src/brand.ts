// The app's logomark (from appicon.svg) and the SVG builders that share it:
// the PWA/app icon, the static favicon, and the per-scheme dynamic favicon.
// The glyph occupies the central ~62% of a 0 0 1024 viewBox (bbox 195.85,194.96
// 632.31x632.30, centred), which is also a safe size for maskable icons.
export const BRAND_PATH =
  "M195.85,688.94c0,76.44,61.87,138.32,138.32,138.32h405.07c49.15,0,88.92-39.77,88.92-88.92v-98.8c0-43.72-31.61-80.15-73.23-87.56l-57.92,57.92h42.24c16.42,0,29.64,13.21,29.64,29.64v98.8c0,16.42-13.21,29.64-29.64,29.64h-284.16l273.05-273.05c34.7-34.7,34.7-91.02,0-125.72l-74.22-74.22c-33.59-33.59-87.19-34.7-122.14-3.46v83.61l38.28-38.28c11.61-11.61,30.38-11.61,41.87,0l74.34,74.22c11.61,11.61,11.61,30.38,0,41.87l-213.77,213.89v-382.96c0-49.15-39.77-88.92-88.92-88.92h-98.8c-49.15,0-88.92,39.77-88.92,88.92v405.07ZM334.17,767.98c-43.59,0-79.04-35.44-79.04-79.04v-118.56h158.07v118.56c0,43.59-35.44,79.04-79.04,79.04ZM255.13,511.11v-98.8h158.07v98.8h-158.07ZM255.13,353.03v-69.16c0-16.42,13.21-29.64,29.64-29.64h98.8c16.42,0,29.64,13.21,29.64,29.64v69.16h-158.07ZM334.17,718.58c16.42,0,29.64-13.21,29.64-29.64s-13.21-29.64-29.64-29.64-29.64,13.21-29.64,29.64,13.21,29.64,29.64,29.64Z";

/** Default chrome colors (the dark theme), used when no scheme is applied yet. */
export const DEFAULT_BG = "#0f1115";
export const DEFAULT_FG = "#e8e8ea";

/** Full-bleed app/PWA icon: opaque tile + centred glyph (~62%, maskable-safe). */
export function appIconSvg(bg = DEFAULT_BG, fg = DEFAULT_FG): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">` +
    `<rect width="1024" height="1024" fill="${bg}"/>` +
    `<path d="${BRAND_PATH}" fill="${fg}"/></svg>`
  );
}

/** Favicon: glyph at ~68% on a rounded tile (≈16% margin per side). */
export function faviconSvg(bg = DEFAULT_BG, fg = DEFAULT_FG): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="47 46 930 930">` +
    `<rect x="47" y="46" width="930" height="930" rx="144" fill="${bg}"/>` +
    `<path d="${BRAND_PATH}" fill="${fg}"/></svg>`
  );
}

/** A data: URI of {@link faviconSvg}, for retinting the tab icon per scheme. */
export function faviconDataUri(bg: string, fg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(faviconSvg(bg, fg))}`;
}
