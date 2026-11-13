import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL(
  "../supabase/migrations/202607260001_focus_quest_cloud_states.sql",
  import.meta.url,
);
const questsMigrationPath = new URL(
  "../supabase/migrations/202607260002_study_quests.sql",
  import.meta.url,
);
const materialsMigrationPath = new URL(
  "../supabase/migrations/202607280001_study_materials.sql",
  import.meta.url,
);
const productReadinessMigrationPath = new URL(
  "../supabase/migrations/202611130001_product_readiness.sql",
  import.meta.url,
);
const envExamplePath = new URL("../.env.example", import.meta.url);
const publicWorkerPath = new URL("../wrangler.public.jsonc", import.meta.url);
const cloudStateRoutePath = new URL("../app/api/cloud-state/route.ts", import.meta.url);
const workerPath = new URL("../worker/index.ts", import.meta.url);
const accountRoutePath = new URL("../app/api/account/route.ts", import.meta.url);

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

test("service-role configuration stays server-only", async () => {
  const envExample = await readFile(envExamplePath, "utf8");

  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_URL=/);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_ANON_KEY=/);
  assert.match(envExample, /^SUPABASE_SERVICE_ROLE_KEY=$/m);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_.*SERVICE_ROLE/i);
});

test("quiz progress, attempts and telemetry are owner-isolated", async () => {
  const migration = await readFile(productReadinessMigrationPath, "utf8");

  for (const table of [
    "study_quest_progress",
    "study_quiz_attempts",
    "focus_quest_product_events",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    );
  }
  assert.match(migration, /revoke all on table[\s\S]*from anon/i);
  assert.match(migration, /foreign key \(quest_id, user_id\)[\s\S]*references public\.study_quests\(id, user_id\)/i);
  assert.match(migration, /foreign key \(material_id, user_id\)[\s\S]*references public\.study_materials\(id, user_id\)/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /auth\.uid\(\)\) = user_id/g);
  assert.doesNotMatch(migration, /goal|file_name|question|explanation/i);
});

test("the RLS event trigger cannot be called through the public Data API", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202611130002_harden_rls_event_trigger.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /revoke all on function public\.rls_auto_enable\(\) from public, anon, authenticated/i,
  );
});

test("account deletion verifies the user and removes private storage before Auth", async () => {
  const route = await readFile(accountRoutePath, "utf8");

  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_.*SERVICE_ROLE/i);
  assert.match(route, /admin\.auth\.getUser\(token\)/);
  assert.match(route, /\.from\("study-materials"\)[\s\S]*\.remove\(/);
  assert.ok(route.indexOf('.remove(') < route.indexOf('admin.auth.admin.deleteUser'));
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(route, /Cache-Control["'], "no-store"/i);
});

test("subjects, quests, sessions and completion RPC stay inside the authenticated owner", async () => {
  const migration = await readFile(questsMigrationPath, "utf8");

  for (const table of ["study_subjects", "study_quests", "study_quest_focus_sessions"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /foreign key \(subject_id, user_id\)[\s\S]*references public\.study_subjects\(id, user_id\)/i);
  assert.match(migration, /foreign key \(quest_id, user_id\)[\s\S]*references public\.study_quests\(id, user_id\)/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /where id = p_quest_id[\s\S]*user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /revoke all on function public\.complete_study_quest_set[\s\S]*from public, anon/i);
  assert.match(migration, /grant execute on function public\.complete_study_quest_set[\s\S]*to authenticated/i);
});

test("study PDFs remain private and paths are scoped to the authenticated owner", async () => {
  const migration = await readFile(materialsMigrationPath, "utf8");

  assert.match(migration, /alter table public\.study_materials enable row level security/i);
  assert.match(migration, /public,\s*file_size_limit,\s*allowed_mime_types[\s\S]*false,\s*15728640,\s*array\['application\/pdf'\]/i);
  assert.match(migration, /bucket_id = 'study-materials'[\s\S]*storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g);
  assert.match(migration, /for select[\s\S]*to authenticated/i);
  assert.match(migration, /for insert[\s\S]*to authenticated/i);
  assert.match(migration, /for delete[\s\S]*to authenticated/i);
  assert.match(migration, /study_materials\.user_id = \(select auth\.uid\(\)\)/i);
});

test("public worker deployment does not bind the private Sites database", async () => {
  const workerConfig = await readFile(publicWorkerPath, "utf8");

  assert.match(workerConfig, /"main": "dist\/server\/index\.js"/);
  assert.match(workerConfig, /"directory": "dist\/client"/);
  assert.doesNotMatch(workerConfig, /d1_databases/);
});

test("public deployment rejects the private cloud route before trusting auth headers", async () => {
  const route = await readFile(cloudStateRoutePath, "utf8");
  const availabilityGuard = route.indexOf(
    "const unavailable = rejectWhenCloudStorageIsUnavailable()",
  );
  const identityLookup = route.indexOf("const identity = await requireApiUser()", availabilityGuard);

  assert.ok(availabilityGuard >= 0);
  assert.ok(identityLookup > availabilityGuard);
  assert.match(route, /Cache-Control["'],\s*["']no-store/i);
});

test("public worker adds browser security and private-response cache headers", async () => {
  const worker = await readFile(workerPath, "utf8");

  assert.match(worker, /Content-Security-Policy/);
  assert.match(worker, /frame-ancestors 'none'/);
  assert.match(worker, /X-Content-Type-Options["'],\s*["']nosniff/i);
  assert.match(worker, /X-Frame-Options["'],\s*["']DENY/i);
  assert.match(worker, /pathname\.startsWith\(["']\/api\//);
  assert.match(worker, /Cache-Control["'],\s*["']no-store/i);
});
