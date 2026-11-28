import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GOOGLE_SITE_VERIFICATION, PUBLIC_SERVICE_DESCRIPTION, PUBLIC_SERVICE_TITLE, PUBLIC_SERVICE_URL } from "../lib/service-config.ts";

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
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");

  const html = await response.text();
  const normalizedHtml = html.replaceAll("<!-- -->", "");
  assert.ok(normalizedHtml.includes(`<title>${PUBLIC_SERVICE_TITLE}</title>`));
  for (const name of ["description", "og:description", "twitter:description"]) {
    assert.ok(normalizedHtml.includes(`name="${name}" content="${PUBLIC_SERVICE_DESCRIPTION}"`)
      || normalizedHtml.includes(`property="${name}" content="${PUBLIC_SERVICE_DESCRIPTION}"`), name);
  }
  for (const name of ["og:title", "twitter:title"]) {
    assert.ok(normalizedHtml.includes(`name="${name}" content="${PUBLIC_SERVICE_TITLE}"`)
      || normalizedHtml.includes(`property="${name}" content="${PUBLIC_SERVICE_TITLE}"`), name);
  }
  assert.ok(normalizedHtml.includes(`name="google-site-verification" content="${GOOGLE_SITE_VERIFICATION}"`));
  const canonical = normalizedHtml.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  assert.ok(canonical, "home canonical URL is present");
  assert.equal(new URL(canonical).href, new URL("/", PUBLIC_SERVICE_URL).href);
  assert.doesNotMatch(normalizedHtml, /픽셀 모험 집중 타이머/);
  const websiteScripts = [...normalizedHtml.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
  assert.equal(websiteScripts.length, 1);
  const website = JSON.parse(websiteScripts[0][1]);
  assert.equal(website.name, "Focus Quest");
  assert.equal(website.alternateName, "포커스 퀘스트");
  assert.equal(website.url, PUBLIC_SERVICE_URL);
  assert.match(normalizedHtml, /previews\/wordmark\.webp/);
  assert.match(normalizedHtml, /누구와 집중할까요/);
  assert.match(normalizedHtml, /모리와 25분 시작/);
  assert.match(normalizedHtml, /25분 집중 · 5분 휴식/);
  assert.match(normalizedHtml, /시간·음악 설정/);
  assert.match(normalizedHtml, /해오름 봉우리/);
  assert.match(normalizedHtml, /유리산호 유적/);
  assert.match(normalizedHtml, /달비늘 호수/);
  assert.match(normalizedHtml, /모험은 오늘의 집중을 기억해요/);
  assert.match(normalizedHtml, /각 세계 최대 5단계/);
  assert.match(normalizedHtml, /집중할수록 잠든 풍경이 깨어나요/);
  assert.match(normalizedHtml, /집중을 세 번 완주하면 나에게 맞는 리듬을 제안해요/);
  assert.match(normalizedHtml, /이번 주 원정 지도/);
  assert.match(normalizedHtml, /최근에 걸은 길/);
  assert.match(normalizedHtml, /companion-evolution-hike/);
  assert.match(normalizedHtml, /href="\/privacy"/);
  assert.doesNotMatch(normalizedHtml, /codex-preview|react-loading-skeleton/);

  const anonymousCloud = await fetch(new URL("api/cloud-state", worker.url));
  assert.equal(anonymousCloud.status, 404);
  assert.equal(anonymousCloud.headers.get("cache-control"), "no-store");

  const forgedCloud = await fetch(new URL("api/cloud-state", worker.url), {
    headers: { "oai-authenticated-user-email": "security-probe@example.invalid" },
  });
  assert.equal(forgedCloud.status, 404);
  assert.equal(forgedCloud.headers.get("cache-control"), "no-store");

  const anonymousInbox = await fetch(new URL("api/support", worker.url));
  assert.equal(anonymousInbox.status, 401);
  assert.equal(anonymousInbox.headers.get("cache-control"), "private, no-store");
  const inboxShell = await fetch(new URL("operations/support", worker.url));
  assert.equal(inboxShell.status, 200);
  assert.equal(inboxShell.headers.get("cache-control"), "private, no-store");
  assert.match(inboxShell.headers.get("x-robots-tag") ?? "", /noindex/);

  const privacy = await fetch(new URL("privacy", worker.url));
  assert.equal(privacy.status, 200);
  const notice = (await privacy.text()).replaceAll("<!-- -->", "");
  assert.match(notice, /<title>개인정보 처리방침 \| Focus Quest<\/title>/);
  assert.match(notice, /조병호/);
  assert.match(notice, /만 14세/);
  assert.match(notice, /백업의 자동 만료 기준/);
  const terms = await fetch(new URL("terms", worker.url));
  assert.equal(terms.status, 200);
  assert.match(await terms.text(), /이용약관/);
  assert.match(notice, /rel="canonical" href="https:\/\/focus-quest\.hoya0328\.workers\.dev\/privacy"/);
});

test("removes starter preview code and dependencies", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /codex-preview|_sites-preview|SkeletonPreview/);
  assert.match(page, /<CompanionGate/);
  assert.match(page, /같은 리듬으로 시작/);
  assert.match(page, /className="complete-hero"/);
  assert.doesNotMatch(page, /className="complete-halo"|className="badge"/);
  assert.doesNotMatch(page, /className="focus-status"|와 집중 중/);
  assert.match(page, /lazy\([\s\S]*AdventureQuestScene/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await Promise.all([
    assert.rejects(access(new URL("SkeletonPreview.tsx", previewRoot))),
    assert.rejects(access(new URL("preview.css", previewRoot))),
  ]);
});
