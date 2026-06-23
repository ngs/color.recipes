// Unit-project setup: unmount rendered components between tests.
import { cleanup } from "@testing-library/preact";
import { afterEach, vi } from "vitest";

// Force prefers-reduced-motion so imperative effects (text roll, layer wipe)
// resolve to their final value synchronously instead of animating via rAF.
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: true,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

afterEach(() => cleanup());
