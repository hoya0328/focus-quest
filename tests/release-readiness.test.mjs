import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("release telemetry measures the bounded funnel without study content", async () => {
  const [hook, migration] = await Promise.all([
    read("app/hooks/useProductTelemetry.ts"),
    read("supabase/migrations/202611240001_release_observability.sql"),
  ]);

  for (const event of ["app_opened", "returned_after_7d", "feedback_opened"]) {
    assert.match(hook, new RegExp(event));
    assert.match(migration, new RegExp(`'${event}'`));
  }
  assert.doesNotMatch(hook, /focusIntent|question|fileName|reflectionNote/);
});

test("server failures are structured and omit identity and payload fields", async () => {
  const source = await read("lib/server-observability.ts");

  for (const field of ["code", "requestId", "route", "service", "status", "timestamp"]) {
    assert.match(source, new RegExp(field));
  }
  assert.doesNotMatch(source, /email|userId|token|payload|requestBody/);
});

test("isolated Supabase E2E never targets production or repository secrets", async () => {
  const [guard, workflow, config] = await Promise.all([
    read("scripts/verify-staging-env.mjs"),
    read(".github/workflows/staging-e2e.yml"),
    read("supabase/config.toml"),
  ]);

  assert.match(guard, /stagingOrigin === productionOrigin/);
  assert.match(guard, /Local E2E may only target a loopback Supabase stack/);
  assert.match(workflow, /supabase@3\.3\.0 start/);
  assert.match(workflow, /supabase@3\.3\.0 stop --no-backup/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.match(config, /project_id = "focus-quest-e2e"/);
  assert.match(config, /enable_confirmations = false/);
});
