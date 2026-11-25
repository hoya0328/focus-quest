import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PRIVACY_NOTICE_VERSION, signupPrivacyMetadata } from "../lib/privacy.ts";

test("email signup requires both explicit privacy and age confirmations", () => {
  for (const confirmation of [
    undefined,
    {},
    { ageConfirmed: false, noticeConfirmed: true, termsConfirmed: true },
    { ageConfirmed: true, noticeConfirmed: false, termsConfirmed: true },
    { ageConfirmed: "yes", noticeConfirmed: true, termsConfirmed: true },
    { ageConfirmed: true, noticeConfirmed: true, termsConfirmed: false },
  ]) assert.equal(signupPrivacyMetadata(confirmation), null);
  const metadata = signupPrivacyMetadata(
    { ageConfirmed: true, noticeConfirmed: true, termsConfirmed: true },
    new Date("2026-11-25T00:00:00Z"),
  );
  assert.deepEqual(metadata, {
    age_over_14_declared: true,
    privacy_notice_version: PRIVACY_NOTICE_VERSION,
    terms_version: "2026-11-25",
    privacy_notice_acknowledged_at: "2026-11-25T00:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(metadata), /birth|email|password|full_name/);
});

test("the public notice describes storage, deletion limits and responsible contact", async () => {
  const policy = await readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8");
  for (const content of ["ap-northeast-2", "자동 만료", "다른 기기", "외부 생성형 AI", "만 14세", "localStorage", "Supabase", "Cloudflare"]) {
    assert.ok(policy.includes(content), `Missing disclosure: ${content}`);
  }
  assert.doesNotMatch(policy, /getSupabaseBrowserClient|useCloudSync|dangerouslySetInnerHTML/);
  assert.match(policy, /canonical: PRIVACY_NOTICE_PATH/);
});

test("signup and the home footer expose safe notice links without blocking guest access", async () => {
  const [dialog, page, sync] = await Promise.all([
    readFile(new URL("../app/components/AuthDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hooks/useCloudSync.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dialog, /href=\{PRIVACY_NOTICE_PATH\} target="_blank" rel="noopener noreferrer"/);
  assert.match(page, /href="\/privacy" target="_blank" rel="noopener noreferrer"/);
  assert.match(dialog, /required=\{mode === "signup"\}/);
  assert.match(sync, /signupPrivacyMetadata\(confirmation\)/);
  assert.match(sync, /data: privacyMetadata/);
  assert.ok(sync.indexOf("if (!privacyMetadata)") < sync.indexOf("supabase.auth.signUp"));
});
