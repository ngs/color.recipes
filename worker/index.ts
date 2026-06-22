// Cloudflare Worker entry (SPEC §4, §8): force HTTPS, route /api/*, and fall
// back to SSR / the ASSETS binding (SPA). The handlers live in sibling modules;
// this file is just the router.
import type { Env } from "./env.ts";
import { json } from "./util.ts";
import { authLogin, authCallback, authMe, authLogout } from "./auth.ts";
import { forkOwners, forkCheck, submit } from "./contribute.ts";
import { ssr } from "./ssr.ts";

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Force HTTPS. Workers Custom Domains bypass the zone's Always Use HTTPS /
    // page rules, so the redirect must happen here. `CF-Visitor` carries the
    // client's scheme and is only set by the Cloudflare edge, so local dev
    // (http://localhost) is unaffected. Requires assets.run_worker_first so the
    // Worker runs before static assets are served.
    if (request.headers.get("CF-Visitor")?.includes('"scheme":"http"')) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    const { pathname } = url;

    try {
      if (pathname === "/api/auth/login") return authLogin(request, env, url);
      if (pathname === "/api/auth/callback") return authCallback(request, env, url);
      if (pathname === "/api/auth/me") return authMe(request, env);
      if (pathname === "/api/auth/logout") return authLogout(request);
      if (pathname === "/api/fork/owners") return forkOwners(request, env);
      if (pathname === "/api/fork/check") return forkCheck(request, env, url);
      if (pathname === "/api/submit") return submit(request, env);
      if (pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }

    // Static files (anything with an extension) pass straight through; navigations
    // ("/", "/<slug>") get server-rendered <title>/description/OG meta.
    if (/\.[\w]+$/.test(pathname)) return env.ASSETS.fetch(request);
    return ssr(request, env, url);
  },
};
