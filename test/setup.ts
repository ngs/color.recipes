// Unit-project setup: unmount rendered components between tests.
import { cleanup } from "@testing-library/preact";
import { afterEach, vi } from "vitest";

// Only the queries the unit project actually relies on report as matching, so
// unrelated feature detection doesn't silently read as supported:
// - prefers-reduced-motion: reduce -> imperative effects (text roll, layer wipe)
//   resolve to their final value synchronously instead of animating via rAF;
// - (hover: hover) -> the gallery arms its hover/focus pause.
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: query === "(prefers-reduced-motion: reduce)" || query === "(hover: hover)",
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

afterEach(() => cleanup());
