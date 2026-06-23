// App state as signals (replaces the scattered module-level `let`s of the old
// imperative main.ts). Components read these and re-render reactively; handlers
// and effects write them. Pure color/format/validate logic stays in its own
// modules — this file is only state + the URL/theme side-effects that drive it.
import { signal, computed } from "@preact/signals";
import type { IndexedScheme, SchemeIndex } from "./types.ts";
import { readableText, luminance, hexToOklch, mix, type ColorSpace } from "./color.ts";

export const ROTATE_MS = 6000;

/** The loaded gallery index (public/index.json); null until fetched. */
export const index = signal<SchemeIndex | null>(null);

/** True if the index failed to load (drives the error panel). */
export const loadError = signal(false);

/** ANDed tag filter — the search source of truth (rendered as removable chips). */
export const activeTags = signal<string[]>([]);

/** Color space shown in the values overlay; persists across scheme rotation. */
export const selectedSpace = signal<ColorSpace>("hex");

/** Slug to start the gallery on (deep link / back-forward); cleared after use. */
export const startSlug = signal<string>("");

/** Whether the next navigation pushes a history entry (manual) or replaces it
 *  (initial load / back-forward). Consumed once when the view mounts. */
export const navMode = signal<"push" | "replace">("replace");

/** Schemes matching the active filter (all of them when no tags are selected). */
export const matched = computed<IndexedScheme[]>(() => {
  const idx = index.value;
  if (!idx) return [];
  const tags = activeTags.value;
  if (!tags.length) return idx.schemes;
  return idx.schemes.filter((s) => tags.every((t) => s.tags.includes(t)));
});

/** Lowercase + reduce to the tag charset (mirrors the scheme tag pattern). */
export function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A tag that exists in the catalog (vs. a free-typed, non-matching one). */
export function isKnownTag(tag: string): boolean {
  const idx = index.value;
  return !!idx && Object.prototype.hasOwnProperty.call(idx.tags, tag);
}

// ---------- tag actions ----------
// Every manual tag change pushes history and abandons any deep-link start slug,
// so the (remounted) gallery starts fresh on a random scheme.
export function addTag(raw: string): void {
  const tag = normalizeTag(raw);
  if (!tag || activeTags.value.includes(tag)) return;
  navMode.value = "push";
  startSlug.value = "";
  activeTags.value = [...activeTags.value, tag];
}

export function removeTag(tag: string): void {
  if (!activeTags.value.includes(tag)) return;
  navMode.value = "push";
  startSlug.value = "";
  activeTags.value = activeTags.value.filter((t) => t !== tag);
}

export function toggleTag(raw: string): void {
  const tag = normalizeTag(raw);
  if (activeTags.value.includes(tag)) removeTag(tag);
  else addTag(tag);
}

// ---------- URL: /<slug>?t=tag-a,tag-b ----------
export function parseLocation(): { slug: string; tags: string[] } {
  const slug = decodeURIComponent(location.pathname.replace(/^\/+/, "")).trim();
  const raw = new URLSearchParams(location.search).get("t") ?? "";
  const tags = [...new Set(raw.split(/[,+\s]+/).map(normalizeTag).filter(Boolean))];
  return { slug, tags };
}

export function setUrl(slug: string, tags: string[], push: boolean): void {
  const path = `/${slug}${tags.length ? `?t=${tags.join(",")}` : ""}`;
  if (location.pathname + location.search === path) return;
  if (push) history.pushState(null, "", path);
  else history.replaceState(null, "", path);
}

export function setTitle(scheme?: IndexedScheme): void {
  document.title = scheme ? `${scheme.name} — color.recipes` : "color.recipes";
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- theming ----------
// The UI chrome adopts the displayed scheme's palette: darkest -> --bg, lightest
// -> --fg, most-chromatic -> --accent.
export function applyTheme(scheme: IndexedScheme): void {
  const byLum = [...scheme.colors].sort((a, b) => luminance(a) - luminance(b));
  const bg = byLum[0];
  const fg = byLum[byLum.length - 1];
  const accent = [...scheme.colors].sort((a, b) => hexToOklch(b).c - hexToOklch(a).c)[0];
  const r = document.documentElement.style;
  r.setProperty("--bg", bg);
  r.setProperty("--fg", fg);
  r.setProperty("--accent", accent);
  r.setProperty("--accent-fg", readableText(accent));
  r.setProperty("--line", mix(bg, fg, 0.22));
  r.setProperty("--muted", mix(bg, fg, 0.6));
  // Tint the iOS status bar / browser UI with the scheme's darkest color.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}
