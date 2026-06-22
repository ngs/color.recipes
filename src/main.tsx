// Bootstrap: mount the two Preact roots (search field in the header, main content
// in #app — they share state via signals), load the index, and keep the URL and
// app state in sync on back/forward navigation.
import { render } from "preact";
import { Search } from "./Search.tsx";
import { MainView } from "./App.tsx";
import { index, loadError, activeTags, startSlug, navMode, parseLocation } from "./state.ts";
import type { SchemeIndex } from "./types.ts";

const searchRoot = document.getElementById("search-root");
const appRoot = document.getElementById("app");
if (searchRoot) render(<Search />, searchRoot);
if (appRoot) render(<MainView />, appRoot);

// Back/forward: re-derive the filter + start slug from the URL (no new entry).
window.addEventListener("popstate", () => {
  const loc = parseLocation();
  navMode.value = "replace";
  startSlug.value = loc.slug;
  activeTags.value = loc.tags;
});

async function boot(): Promise<void> {
  const initial = parseLocation();
  navMode.value = "replace";
  startSlug.value = initial.slug;
  activeTags.value = initial.tags;

  try {
    const res = await fetch("/index.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    index.value = (await res.json()) as SchemeIndex;
  } catch {
    loadError.value = true;
  }
}

void boot();
