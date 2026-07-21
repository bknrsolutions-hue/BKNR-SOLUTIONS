const CACHE_NAME = "svbk-erp-v28";
const ASSETS = [
  "/static/icon-192.png",
  "/static/icon-512.png",
  "/brand-dp-3d.png",
  "/svbk-it-solutions-logo-3d-transparent.png",
  "/static/brand-dp-3d.png",
  "/static/images/svbk-it-solutions-logo-3d-transparent.png",
  "/static/screenshot.png"
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
    const isUiColorAsset = url.pathname.endsWith("/ui-color-customizer.js") ||
      url.pathname.endsWith("/ui-color-customizer.css");
    event.respondWith(
      (async () => {
        try {
          // Theme assets must reflect saved UI changes immediately. Fetch the
          // current version first instead of allowing an older cached copy to
          // keep the color controls inert after a deployment.
          if (isUiColorAsset) {
            const response = await fetch(event.request, { cache: "no-store" });
            if (response && response.ok) {
              try {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(event.request, response.clone());
              } catch (error) {
                console.warn("Service worker UI color cache write skipped.", error);
              }
            }
            return response;
          }

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
