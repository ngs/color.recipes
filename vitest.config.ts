import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

// Two test projects:
//  - "unit": components + pure logic in happy-dom. JSX is transformed by oxc per
//    tsconfig (jsx: react-jsx, jsxImportSource: preact).
//  - "worker": Worker modules run inside the real workerd runtime (pool-workers),
//    so crypto.subtle / Request / Response / btoa behave as in production.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "happy-dom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./test/setup.ts"],
        },
      },
      {
        plugins: [cloudflareTest({ miniflare: { compatibilityDate: "2025-06-01" } })],
        test: {
          name: "worker",
          include: ["worker/**/*.test.ts"],
        },
      },
    ],
  },
});
