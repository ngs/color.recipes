// Worker bindings + secrets (wrangler.jsonc / `wrangler secret put`).
export interface Env {
  ASSETS: Fetcher;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  COOKIE_SECRET: string;
  UPSTREAM_REPO: string; // "owner/repo"
}
