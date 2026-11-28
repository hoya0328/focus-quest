const CACHE_NAME = "focus-quest-v8";
const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const OFFLINE_PAGE_KEY = `${BASE_PATH}/__focus-quest-offline`;
// Keep only the recovery page and its icon on the install path.
// Adventure art and install icons are cached on use instead.
const CORE_ASSETS = [
  `${BASE_PATH}/offline.html`,
  `${BASE_PATH}/brand/focus-quest-192.png`
];
const CACHEABLE_DESTINATIONS = new Set([
  "audio",
  "font",
  "image",
  "manifest",
  "script",
  "style",
  "video",
  "worker"
]);

function isPrivatePath(url) {
  return url.pathname === `${BASE_PATH}/api` ||
    url.pathname.startsWith(`${BASE_PATH}/api/`);
}

function responseAllowsStorage(response) {
  const policy = response.headers.get("cache-control")?.toLowerCase() ?? "";
  return !policy.includes("no-store") && !policy.includes("private");
}

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

      // Do not reload running focus sessions when a new worker takes control.
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (isPrivatePath(requestUrl)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(new Request(event.request, { cache: "no-store" }))
        .then((response) => {
          if (response.ok && responseAllowsStorage(response)) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(OFFLINE_PAGE_KEY, copy))
            );
          }
          return response;
        })
        .catch(async () => {
          const fallback = (
            (await caches.match(`${BASE_PATH}/offline.html`)) ||
            (await caches.match(OFFLINE_PAGE_KEY))
          );
          // Static HTML may have a canonical redirect; navigation cannot reuse
          // its redirected response under a different URL. Rebuild a clean response.
          return fallback
            ? new Response(fallback.body, { status: 200, headers: fallback.headers })
            : Response.error();
        })
    );
    return;
  }

  if (!CACHEABLE_DESTINATIONS.has(event.request.destination)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (
          !response ||
          response.status !== 200 ||
          !responseAllowsStorage(response)
        ) {
          return response;
        }
        const copy = response.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        );
        return response;
      })
      .catch(async () => (await caches.match(event.request)) || Response.error())
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string"
    ? payload.title
    : "Focus Quest 출발 시간";
  const body = typeof payload.body === "string"
    ? payload.body
    : "오늘 끝낼 한 가지를 정하고 다시 출발해요.";
  const url = typeof payload.url === "string" ? payload.url : `${BASE_PATH}/`;
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: `${BASE_PATH}/brand/focus-quest-192.png`,
    badge: `${BASE_PATH}/brand/focus-quest-192.png`,
    data: { url },
    tag: "focus-quest-daily-reminder",
    renotify: false,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || `${BASE_PATH}/`, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
