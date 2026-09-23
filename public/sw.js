// Minimal service worker: enables installability, handles incoming
// web-push events, and gives a graceful experience with no network. This
// deliberately does NOT cache any API route or page data — this app is
// careful everywhere else about never presenting stale data as if it were
// live (the quote `stale` flag, digest freshness gating, etc. — see
// CLAUDE.md), and caching a portfolio/quote/alert response for offline use
// would do exactly that. Only two things are cached:
// 1. Static, content-hashed build assets (/_next/static/*, icons,
//    manifest) — safe to cache forever since the filename itself changes
//    whenever the content does, so a cache hit can never go stale.
// 2. offline.html, precached at install so it's guaranteed available the
//    moment it's needed (a normal runtime cache-on-first-fetch wouldn't
//    have it yet if the very first navigation is the offline one).
const STATIC_CACHE = "crade-static-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icon") ||
      url.pathname === "/apple-icon.png" ||
      url.pathname === "/logo.svg" ||
      url.pathname === "/manifest.json")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Page navigations: always try the network first — a page is never
  // served from cache while online, only as a last resort with no
  // connection at all, since a stale cached page would show outdated data
  // as if it were current.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }

  // Everything else (API routes, etc.) is left untouched — no
  // event.respondWith() call here means the browser's normal fetch
  // happens, exactly as before this feature existed.
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title ?? "Crade";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body,
      icon: data.icon,
      data: data.url ? { url: data.url } : undefined,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(self.clients.openWindow(url));
});
