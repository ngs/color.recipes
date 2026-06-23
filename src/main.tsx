// Bootstrap: mount the whole app into #app, load the index, and keep the URL and
// app state in sync on back/forward navigation.
import { render } from "preact";
import { App } from "./App.tsx";
import { index, loadError, activeTags, startSlug, navMode, parseLocation } from "./state.ts";
import type { SchemeIndex } from "./types.ts";

const root = document.getElementById("app");
if (root) render(<App />, root);

// iOS Safari ignores `user-scalable=no`. Block pinch-zoom via the gesture
// events, and double-tap zoom via a touchend guard (touch-action alone isn't
// reliable on iOS). Single taps/scrolls/clicks are unaffected.
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);

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
