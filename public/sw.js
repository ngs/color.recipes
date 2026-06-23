// Minimal service worker: makes the app installable and gives a basic offline
// shell. Navigations and the rebuilt-each-deploy index.json/manifest use
// network-first so content stays fresh; hashed build assets (and icons) are
// cache-first since their bytes are stable. Cross-origin requests (fonts, the
// GitHub API via /api is same-origin but POST-only) are left untouched.
const CACHE = "color-recipes-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave fonts/CDNs to the network
  if (url.pathname.startsWith("/api/")) return; // never cache the write/auth proxy

  const freshFirst =
    req.mode === "navigate" || url.pathname === "/index.json" || url.pathname.endsWith(".webmanifest");

  if (freshFirst) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          (await caches.open(CACHE)).put(req, res.clone());
          return res;
        } catch {
          return (await caches.match(req)) ?? (await caches.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed assets / icons: cache-first, fill on miss.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })(),
  );
});
