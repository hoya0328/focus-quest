import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("release telemetry measures the bounded funnel without study content", async () => {
  const [hook, migration, funnelMigration, feedbackMigration, panel] = await Promise.all([
    read("app/hooks/useProductTelemetry.ts"),
    read("supabase/migrations/202611240001_release_observability.sql"),
    read("supabase/migrations/202611250004_product_funnel_events.sql"),
    read("supabase/migrations/202611240002_quiz_quality_feedback.sql"),
    read("app/components/StudyQuizPanel.tsx"),
  ]);

  for (const event of ["app_opened", "returned_after_7d", "feedback_opened"]) {
    assert.match(hook, new RegExp(event));
    assert.match(migration, new RegExp(`'${event}'`));
  }
  assert.doesNotMatch(hook, /focusIntent|question|fileName|reflectionNote/);
  assert.match(hook, /quiz_feedback_submitted/);
  assert.match(feedbackMigration, /quiz_feedback_submitted/);
  assert.match(feedbackMigration, /'helpful', 'unclear', 'out_of_scope'/);
  for (const event of [
    "companion_selected",
    "setup_opened",
    "focus_started",
    "focus_completed",
    "focus_abandoned",
    "camp_created",
    "camp_joined",
    "push_enabled",
  ]) {
    assert.match(hook, new RegExp(event));
    assert.match(funnelMigration, new RegExp(`'${event}'`));
  }
  assert.match(panel, /문제 품질 평가/);
  assert.doesNotMatch(hook, /explanation|sourcePages|options/);
});

test("camp relationship records remain authenticated and owner-scoped", async () => {
  const migration = await read("supabase/migrations/202611250005_camp_relationships.sql");
  const privateTables = [
    "focus_quest_camp_history",
    "focus_quest_camp_contacts",
    "focus_quest_camp_invitations",
    "focus_quest_camp_reports",
  ];

  for (const table of privateTables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on table public\.focus_quest_camp_history,[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) in \(inviter_user_id, invitee_user_id\)\)/);
  assert.doesNotMatch(migration, /\b(message|chat_body|email)\b/i);

  for (const signature of [
    "record_focus_quest_camp_completion\\(uuid, integer\\)",
    "invite_focus_quest_camp_contact\\(uuid, uuid\\)",
    "accept_focus_quest_camp_invitation\\(uuid\\)",
    "report_focus_quest_camp_member\\(uuid, uuid, text\\)",
    "reopen_focus_quest_camp\\(uuid, text, text, text, integer\\)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature} from public, anon`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to authenticated`));
  }
  assert.match(migration, /requested_reason not in \('spam', 'harassment', 'privacy', 'other'\)/);
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
