const CACHE_NAME = "bknr-erp-v21";
const ASSETS = [
  "/static/icon-192.png",
  "/static/icon-512.png",
  "/static/images/svbk-it-solutions-logo.jpeg",
  "/static/screenshot.png",
  "/static/css/app-splash.min.css",
  "/static/js/app-splash.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(ASSETS);
      } catch (error) {
        // CacheStorage can fail in private/corrupt browser profiles; the app must still load.
        console.warn("Service worker cache install skipped.", error);
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
      } catch (error) {
        console.warn("Service worker cache cleanup skipped.", error);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      (async () => {
        try {
          const cached = await caches.match(event.request);
          if (cached) return cached;

          const response = await fetch(event.request);
          if (response && response.ok) {
            try {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(event.request, response.clone());
            } catch (error) {
              console.warn("Service worker static cache write skipped.", error);
            }
          }
          return response;
        } catch (error) {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          throw error;
        }
      })()
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      try {
        const cached = await caches.match(event.request);
        if (cached) return cached;
      } catch (error) {
        console.warn("Service worker fallback lookup skipped.", error);
      }
      throw new Error("Network request failed and no cached response was available.");
    })
  );
});
