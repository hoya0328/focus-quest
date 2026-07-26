const CACHE_NAME = "focus-quest-v2";
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const OFFLINE_PAGE_KEY = `${BASE_PATH}/__focus-quest-offline`;
const CORE_ASSETS = [
  `${BASE_PATH}/manifest.webmanifest`,
  `${BASE_PATH}/characters/momo-hiking.png`,
  `${BASE_PATH}/characters/podo-swimming.png`,
  `${BASE_PATH}/characters/bori-fishing.png`
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("focus-quest-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();

      const windows = await self.clients.matchAll({ type: "window" });
      await Promise.all(
        windows.map((client) => client.navigate(client.url).catch(() => undefined))
      );
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(event.request, { cache: "no-store" }))
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(OFFLINE_PAGE_KEY, copy))
            );
          }
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(OFFLINE_PAGE_KEY)) ||
            Response.error()
          );
        })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        );
        return response;
      })
      .catch(async () => (await caches.match(event.request)) || Response.error())
  );
});
