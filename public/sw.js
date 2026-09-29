/* ChargeMesh service worker: app-shell caching, never caches live /api data. */
const VERSION = "cm-v3";
const SHELL = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return; // live data: network only

  // Map tiles & static assets: stale-while-revalidate
  if (url.hostname.includes("basemaps.cartocdn.com") || url.pathname.startsWith("/tiles/") || url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons")) {
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // Pages: network-first, fall back to cache, then offline page
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => { caches.open(VERSION).then((c) => c.put(req, res.clone())); return res; })
        .catch(async () => (await caches.match(req)) || (await caches.match("/offline.html")))
    );
  }
});
