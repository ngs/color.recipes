import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Single-origin dev/build: the Cloudflare plugin runs worker/index.ts in the
// Workers runtime and serves the Vite-built static assets through the same
// origin, mirroring production (SPEC §4). `/api/*` hits the Worker; everything
// else is served as a static asset.
export default defineConfig({
  plugins: [cloudflare()],
  // Preact JSX via esbuild (no Babel/preset needed) — keeps the toolchain light.
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
});
