import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manifestPath = new URL("../public/manifest.webmanifest", import.meta.url);
const serviceWorkerPath = new URL("../public/service-worker.js", import.meta.url);

test("the web app manifest is installable from both root and a subpath", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  assert.equal(manifest.id, "./");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.length > 0);
  assert.ok(manifest.icons.every((icon) => !icon.src.startsWith("/")));
  assert.deepEqual(
    manifest.icons.map((icon) => icon.sizes),
    ["192x192", "512x512", "512x512"],
  );
  assert.equal(manifest.icons[0].src, "brand/focus-quest-192.png");
  assert.equal(manifest.icons[2].purpose, "maskable");
});

test("the service worker provides an offline navigation fallback", async () => {
  const serviceWorker = await readFile(serviceWorkerPath, "utf8");

  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
  assert.match(serviceWorker, /caches\.match\(OFFLINE_PAGE_KEY\)/);
  assert.match(serviceWorker, /requestUrl\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /focus-quest-v8/);
  assert.match(serviceWorker, /caches\.match\(`\$\{BASE_PATH\}\/offline\.html`\)/);
  assert.match(serviceWorker, /addEventListener\("push"/);
  assert.match(serviceWorker, /showNotification/);
  assert.match(serviceWorker, /addEventListener\("notificationclick"/);
  const core = serviceWorker.match(/const CORE_ASSETS = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.deepEqual(
    [...core.matchAll(/\$\{BASE_PATH\}(\/[^\x60]+)/g)].map(([, path]) => path),
    ["/offline.html", "/brand/focus-quest-192.png"],
  );
  assert.match(serviceWorker, /cache: "no-store"/);
  assert.match(serviceWorker, /self\.clients\.claim\(\)/);
  assert.doesNotMatch(serviceWorker, /client\.navigate\(client\.url\)/);
  assert.match(serviceWorker, /isPrivatePath\(requestUrl\)/);
  assert.match(serviceWorker, /pathname\.startsWith\(`\$\{BASE_PATH\}\/api\/`\)/);
  assert.match(serviceWorker, /responseAllowsStorage\(response\)/);
  assert.match(serviceWorker, /policy\.includes\("no-store"\)/);
  assert.match(serviceWorker, /policy\.includes\("private"\)/);
  assert.match(serviceWorker, /CACHEABLE_DESTINATIONS/);
  assert.doesNotMatch(
    serviceWorker,
    /const CORE_ASSETS = \[\s*`\$\{BASE_PATH\}\/`,/
  );
});

test("offline recovery never writes private records or attempts cloud synchronization", async () => {
  const offline = await readFile(new URL("../public/offline.html", import.meta.url), "utf8");
  assert.match(offline, /연결을 잠시 놓쳤어요/);
  assert.match(offline, /haru-focus-active-session/);
  assert.doesNotMatch(offline, /localStorage\.(setItem|removeItem)|fetch\(|innerHTML|supabase/);
});
