import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL(
  "../supabase/migrations/202607260001_focus_quest_cloud_states.sql",
  import.meta.url,
);
const envExamplePath = new URL("../.env.example", import.meta.url);
const publicWorkerPath = new URL("../wrangler.public.jsonc", import.meta.url);

test("Supabase cloud state is isolated to the authenticated owner", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(
    migration,
    /alter table public\.focus_quest_cloud_states enable row level security/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.focus_quest_cloud_states from anon/i,
  );
  assert.match(migration, /to authenticated/i);
  assert.match(migration, /auth\.uid\(\)\) = user_id/g);
  assert.match(migration, /for select/i);
  assert.match(migration, /for insert/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /for delete/i);
});

test("public browser configuration never asks for a service-role key", async () => {
  const envExample = await readFile(envExamplePath, "utf8");

  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_URL=/);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_ANON_KEY=/);
  assert.doesNotMatch(envExample, /SERVICE_ROLE=/);
});

test("public worker deployment does not bind the private Sites database", async () => {
  const workerConfig = await readFile(publicWorkerPath, "utf8");

  assert.match(workerConfig, /"main": "dist\/server\/index\.js"/);
  assert.match(workerConfig, /"directory": "dist\/client"/);
  assert.doesNotMatch(workerConfig, /d1_databases/);
});
