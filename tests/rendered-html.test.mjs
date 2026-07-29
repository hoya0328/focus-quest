import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the adventure focus app", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Focus Quest \| 픽셀 모험 집중 타이머<\/title>/);
  assert.match(html, /오늘의 한 가지/);
  assert.match(html, /지금 끝낼 일을 적고/);
  assert.match(html, /10분 시작/);
  assert.match(html, /25분 시작/);
  assert.match(html, /45분 시작/);
  assert.match(html, /모험 친구 바꾸기/);
  assert.match(html, /이번 주의 발자국/);
  assert.match(html, /집중 모험 기록/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("removes starter preview code and dependencies", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /codex-preview|_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await Promise.all([
    assert.rejects(access(new URL("SkeletonPreview.tsx", previewRoot))),
    assert.rejects(access(new URL("preview.css", previewRoot))),
  ]);
});
