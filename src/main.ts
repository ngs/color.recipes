// Gallery: random scheme -> animated auto-rotation, tag search (ANDed, URL-fragment
// encoded), a tokenized tag field with typeahead suggestions, and a zero-match
// contribution hand-off (SPEC §1, §9).
//
// Search model: `activeTags` is the source of truth (rendered as removable chips
// inside the field). The text input holds only the in-progress query. Tags are
// committed by clicking a suggestion or pressing Enter on free text — so an unknown
// tag is a valid search that yields the "No matching scheme yet" flow.
//
// Suggestions: only tags that *co-occur* with the current selection are offered
// (adding one never dead-ends), shown most-common first, and only as many as fit on
// a single row.

import type { IndexedScheme, SchemeIndex } from "./types.ts";
import {
  FORMATTERS,
  readableText,
  luminance,
  hexToOklch,
  mix,
  type ColorSpace,
} from "./color.ts";
import { mountContribution } from "./submit.ts";
import { FORMATS, triggerDownload } from "./export.ts";

const ROTATE_MS = 6000;
const SPACES: ColorSpace[] = ["hex", "rgb", "hsl", "oklch"];

const app = document.getElementById("app") as HTMLElement;
const searchForm = document.getElementById("search") as HTMLFormElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const tokens = document.getElementById("tokens") as HTMLElement;
const suggest = document.getElementById("suggest") as HTMLElement;

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let index: SchemeIndex;
let activeTags: string[] = [];
let rotateTimer: number | undefined;
let currentScheme: IndexedScheme | undefined; // the scheme on screen (for export)

interface Candidate {
  tag: string;
  count: number; // number of currently-matched schemes that also carry this tag
}

// ---------- URL: /<slug>?t=tag-a,tag-b ----------
// The path is the currently-displayed scheme; ?t is the ANDed tag filter. Manual
// changes push a history entry; auto-rotation replaces it (no history spam).
function parseLocation(): { slug: string; tags: string[] } {
  const slug = decodeURIComponent(location.pathname.replace(/^\/+/, "")).trim();
  const raw = new URLSearchParams(location.search).get("t") ?? "";
  const tags = [...new Set(raw.split(/[,+\s]+/).map(normalizeTag).filter(Boolean))];
  return { slug, tags };
}

function setUrl(slug: string, tags: string[], push: boolean): void {
  const path = `/${slug}${tags.length ? `?t=${tags.join(",")}` : ""}`;
  if (location.pathname + location.search === path) return;
  if (push) history.pushState(null, "", path);
  else history.replaceState(null, "", path);
}

function setTitle(scheme?: IndexedScheme): void {
  document.title = scheme ? `${scheme.name} — color.recipes` : "color.recipes";
}

/** Lowercase + reduce to the tag charset (mirrors the scheme tag pattern). */
function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------- filtering ----------
function matching(tags: string[]): IndexedScheme[] {
  if (!tags.length) return index.schemes;
  return index.schemes.filter((s) => tags.every((t) => s.tags.includes(t)));
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- theming ----------
// The UI chrome adopts the currently-displayed scheme's palette; on the zero-match
// flow (no scheme to show) it keeps the most-recently-applied one.
function applyTheme(scheme: IndexedScheme): void {
  currentScheme = scheme;
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
}

/** A tag that exists in the catalog (vs. a free-typed, non-matching one). */
function isKnownTag(tag: string): boolean {
  return Object.prototype.hasOwnProperty.call(index.tags, tag);
}

// ---------- tag chips ----------
function renderTokens(): void {
  tokens.querySelectorAll(".token").forEach((n) => n.remove());
  for (const tag of activeTags) {
    const chip = document.createElement("span");
    // Free-typed tags not in the catalog are visually distinguished (dashed/outline).
    chip.className = isKnownTag(tag) ? "token" : "token token--unknown";
    chip.append(tag);
    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "×";
    x.setAttribute("aria-label", `Remove tag ${tag}`);
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      removeTag(tag);
    });
    chip.appendChild(x);
    tokens.insertBefore(chip, searchInput);
  }
}

function addTag(raw: string): void {
  const tag = normalizeTag(raw);
  searchInput.value = "";
  if (tag && !activeTags.includes(tag)) {
    activeTags = [...activeTags, tag];
    renderTokens();
    render({ push: true });
  }
  searchInput.focus();
  refreshSuggest(); // still focused: show what narrows the new selection
}

function removeTag(tag: string): void {
  if (!activeTags.includes(tag)) return;
  activeTags = activeTags.filter((t) => t !== tag);
  renderTokens();
  render({ push: true });
  searchInput.focus();
  refreshSuggest();
}

function toggleTag(tag: string): void {
  if (activeTags.includes(normalizeTag(tag))) removeTag(normalizeTag(tag));
  else addTag(tag);
}

// ---------- suggestions ----------
function computeCandidates(selected: string[], partial: string): Candidate[] {
  const sel = new Set(selected);
  const matched = matching(selected);
  if (!matched.length) return [];

  // Tags co-occurring with the current selection (excluding already-selected).
  const counts = new Map<string, number>();
  for (const s of matched) {
    for (const t of s.tags) {
      if (sel.has(t)) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  const q = partial.toLowerCase();
  let entries = [...counts.entries()];
  if (q) entries = entries.filter(([t]) => t.includes(q));
  // Most-common first (matches the displayed counts), then alphabetical.
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.map(([tag, count]) => ({ tag, count }));
}

function refreshSuggest(): void {
  // Suggestions are visible only while the field is focused (focus -> show, blur -> hide).
  if (document.activeElement !== searchInput) {
    hideSuggest();
    return;
  }
  const partial = searchInput.value.trim().toLowerCase();
  renderSuggest(computeCandidates(activeTags, partial));
}

function renderSuggest(candidates: Candidate[]): void {
  if (!candidates.length) {
    hideSuggest();
    return;
  }
  // Single row, most-common first; the row scrolls horizontally when it overflows.
  suggest.classList.remove("hidden");
  suggest.replaceChildren(
    ...candidates.map((cand) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.className = "sg";
      li.innerHTML = `${cand.tag}<span class="count">${cand.count}</span>`;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep input focus; avoid blur before select
        addTag(cand.tag);
      });
      return li;
    }),
  );
  suggest.scrollLeft = 0;
  searchInput.setAttribute("aria-expanded", "true");
}

function hideSuggest(): void {
  suggest.classList.add("hidden");
  suggest.replaceChildren();
  searchInput.setAttribute("aria-expanded", "false");
}

// ---------- top-level state ----------
function render(opts: { startSlug?: string; push: boolean } = { push: true }): void {
  const matched = matching(activeTags);
  if (matched.length === 0) {
    stopRotation();
    currentScheme = undefined;
    setUrl("", activeTags, opts.push);
    setTitle();
    mountContribution(app, activeTags);
  } else {
    renderGallery(matched, opts.startSlug, opts.push);
  }
}

function stopRotation(): void {
  if (rotateTimer !== undefined) {
    clearInterval(rotateTimer);
    rotateTimer = undefined;
  }
}

// ---------- gallery rendering ----------
function colorSpaceTable(scheme: IndexedScheme): HTMLElement {
  const box = document.createElement("div");
  box.className = "spaces";
  const table = document.createElement("table");
  for (const hex of scheme.colors) {
    const tr = document.createElement("tr");
    const dot = document.createElement("td");
    dot.className = "dot";
    dot.innerHTML = `<span class="sw" style="background:${hex}"></span>`;
    tr.appendChild(dot);
    for (const space of SPACES) {
      const td = document.createElement("td");
      const text = FORMATTERS[space](hex);
      td.textContent = text;
      td.title = "Click to copy";
      td.addEventListener("click", () => navigator.clipboard?.writeText(text));
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  box.appendChild(table);
  return box;
}

function buildLayer(scheme: IndexedScheme): HTMLElement {
  const layer = document.createElement("div");
  layer.className = "layer";
  for (const hex of scheme.colors) {
    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = hex;
    layer.appendChild(sw);
  }
  return layer;
}

// Download dropdown: exports the currently-displayed scheme (SPEC §9 / export.ts).
function buildDownload(): HTMLElement {
  const dl = document.createElement("div");
  dl.className = "dl";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn";
  btn.textContent = "Download ▾";

  const menu = document.createElement("ul");
  menu.className = "dl-menu hidden";
  for (const format of FORMATS) {
    const li = document.createElement("li");
    li.textContent = format.label;
    li.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.add("hidden");
      if (!currentScheme) return;
      const { filename, blob } = format.generate(currentScheme);
      triggerDownload(filename, blob);
    });
    menu.appendChild(li);
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = menu.classList.contains("hidden");
    menu.classList.toggle("hidden");
    if (opening) {
      // Close on the next outside click.
      setTimeout(() => document.addEventListener("click", () => menu.classList.add("hidden"), { once: true }), 0);
    }
  });

  dl.append(btn, menu);
  return dl;
}

function renderGallery(schemes: IndexedScheme[], startSlug: string | undefined, firstPush: boolean): void {
  stopRotation();
  let order = shuffle(schemes);
  if (startSlug) {
    const i = order.findIndex((s) => s.slug === startSlug);
    if (i > 0) order.unshift(order.splice(i, 1)[0]); // start on the requested scheme
  }
  let pos = 0;

  const stage = document.createElement("div");
  stage.className = "stage";

  const counter = document.createElement("div");
  counter.className = "counter";

  const caption = document.createElement("div");
  caption.className = "caption";

  let spaces = colorSpaceTable(order[0]);
  let current = buildLayer(order[0]);
  current.classList.add("is-visible");
  stage.append(current);
  applyTheme(order[0]);
  setUrl(order[0].slug, activeTags, firstPush);
  setTitle(order[0]);

  const metaChip = (tag: string): HTMLElement => {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "chip";
    c.textContent = tag;
    c.addEventListener("click", () => toggleTag(tag));
    return c;
  };

  const counterText = () =>
    `${activeTags.length ? activeTags.join(" + ") + " · " : ""}${order.length} scheme${order.length === 1 ? "" : "s"}`;

  const show = (scheme: IndexedScheme, push: boolean) => {
    applyTheme(scheme);
    setUrl(scheme.slug, activeTags, push);
    setTitle(scheme);
    const next = buildLayer(scheme);
    stage.appendChild(next);
    void next.offsetWidth; // force reflow so the opacity transition runs
    next.classList.add("is-visible");
    current.classList.remove("is-visible");
    const old = current;
    current = next;
    if (prefersReducedMotion) old.remove();
    else window.setTimeout(() => old.remove(), 1000);

    caption.querySelector("h2")!.textContent = scheme.name;
    caption.querySelector(".meta")!.replaceChildren(...scheme.tags.map(metaChip));
    const newSpaces = colorSpaceTable(scheme);
    spaces.replaceWith(newSpaces);
    spaces = newSpaces;
    counter.textContent = counterText();
  };

  caption.innerHTML = `<h2></h2><div class="meta"></div><div class="controls"></div>`;
  caption.querySelector("h2")!.textContent = order[0].name;
  caption.querySelector(".meta")!.replaceChildren(...order[0].tags.map(metaChip));

  const nextBtn = document.createElement("button");
  nextBtn.className = "btn";
  nextBtn.textContent = "Next →";
  nextBtn.addEventListener("click", () => {
    pos = (pos + 1) % order.length;
    show(order[pos], true); // manual -> push
    restartRotation();
  });
  caption.querySelector(".controls")!.append(nextBtn, buildDownload());

  counter.textContent = counterText();

  stage.append(caption, counter, spaces);
  app.replaceChildren(stage);

  const advance = () => {
    if (order.length < 2) return;
    pos += 1;
    if (pos >= order.length) {
      order = shuffle(order);
      pos = 0;
    }
    show(order[pos], false); // auto-rotate -> replace
  };

  const restartRotation = () => {
    stopRotation();
    if (order.length > 1) rotateTimer = window.setInterval(advance, ROTATE_MS);
  };
  restartRotation();

  // Pause on interaction (SPEC §9).
  stage.addEventListener("mouseenter", stopRotation);
  stage.addEventListener("mouseleave", restartRotation);
  stage.addEventListener("focusin", stopRotation);
}

// ---------- bootstrap ----------
async function main(): Promise<void> {
  const res = await fetch("/index.json", { cache: "no-cache" });
  if (!res.ok) {
    app.innerHTML = `<div class="panel"><h1>Failed to load gallery</h1><p>Could not fetch the scheme index.</p></div>`;
    return;
  }
  index = (await res.json()) as SchemeIndex;
  const initial = parseLocation();
  activeTags = initial.tags;
  renderTokens();

  searchForm.addEventListener("submit", (e) => e.preventDefault());

  searchInput.addEventListener("input", refreshSuggest);

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (searchInput.value.trim()) addTag(searchInput.value);
    } else if (e.key === "Backspace" && !searchInput.value && activeTags.length) {
      e.preventDefault();
      removeTag(activeTags[activeTags.length - 1]);
    } else if (e.key === "Escape") {
      searchInput.blur();
    }
  });

  searchInput.addEventListener("focus", refreshSuggest);
  // Hide on blur, unless focus bounced straight back (e.g. clicking a chip's ×).
  searchInput.addEventListener("blur", () =>
    window.setTimeout(() => {
      if (document.activeElement !== searchInput) hideSuggest();
    }, 120),
  );

  // Click anywhere in the field (not on a chip) focuses the input.
  tokens.addEventListener("click", (e) => {
    if (e.target === tokens) searchInput.focus();
  });

  // Back/forward navigation: re-render from the URL (no new history entry).
  window.addEventListener("popstate", () => {
    const loc = parseLocation();
    activeTags = loc.tags;
    renderTokens();
    render({ startSlug: loc.slug, push: false });
  });

  render({ startSlug: initial.slug, push: false });
}

main();
