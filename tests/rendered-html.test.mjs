import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const previewRoot = new URL("../app/_sites-preview/", import.meta.url);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function availablePort() {
  const server = createServer();
  await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClosed) => server.close(resolveClosed));
  return port;
}

async function startWorker() {
  const port = await availablePort();
  const wrangler = resolve(projectRoot, "node_modules/wrangler/bin/wrangler.js");
  const child = spawn(
    process.execPath,
    [wrangler, "dev", "--local", "--port", String(port), "--config", "wrangler.public.jsonc"],
    { cwd: projectRoot, env: { ...process.env, NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  const ready = new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => rejectReady(new Error(`Worker did not start:\n${output}`)), 15_000);
    const collect = (chunk) => {
      output += chunk.toString();
      if (/Ready on|localhost:\d+/i.test(output)) {
        clearTimeout(timeout);
        resolveReady();
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      rejectReady(new Error(`Worker exited with ${code}:\n${output}`));
    });
  });
  await ready;
  return { child, url: `http://127.0.0.1:${port}/` };
}

async function stopWorker(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
  ]);
}

test("server-renders the adventure focus app", async (context) => {
  const worker = await startWorker();
  context.after(() => stopWorker(worker.child));
  const response = await fetch(worker.url, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const normalizedHtml = html.replaceAll("<!-- -->", "");
  assert.match(normalizedHtml, /<title>Focus Quest \| 픽셀 모험 집중 타이머<\/title>/);
  assert.match(normalizedHtml, /오늘의 한 가지/);
  assert.match(normalizedHtml, /지금 끝낼 일을 적고/);
  assert.match(normalizedHtml, /10분 시작/);
  assert.match(normalizedHtml, /25분 시작/);
  assert.match(normalizedHtml, /45분 시작/);
  assert.match(normalizedHtml, /모험 지도/);
  assert.match(normalizedHtml, /해오름 봉우리/);
  assert.match(normalizedHtml, /유리산호 유적/);
  assert.match(normalizedHtml, /달비늘 호수/);
  assert.match(normalizedHtml, /이번 주의 발자국/);
  assert.match(normalizedHtml, /집중 모험 기록/);
  assert.doesNotMatch(normalizedHtml, /codex-preview|react-loading-skeleton/);
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
