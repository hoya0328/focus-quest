import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { expirationDate } from "../lib/operating-policy.ts";
import { encrypt, decrypt, writeArchive, readArchive, pruneArchives, removeArchive, withBackupLock } from "../scripts/encrypted-backup.mjs";

test("retention expiry is exactly 30 days and invalid dates fail closed", () => {
  assert.equal(expirationDate("2026-11-25T00:00:00Z"), "2026-12-25T00:00:00.000Z");
  assert.throws(() => expirationDate("invalid"));
  assert.throws(() => expirationDate("2026-11-25T00:00:00Z", 0));
});

test("cleanup verifies every archive before removing any expired candidate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fq-cleanup-test-"));
  const key = randomBytes(32);
  try {
    const files = new Map([["snapshot.json", Buffer.from("synthetic")]]);
    const expired = path.join(root, "daily-a-expired");
    const broken = path.join(root, "daily-z-broken");
    await writeArchive(expired, files, key, { projectRef: "local-supabase", createdAt: "2026-01-01T00:00:00Z" });
    await writeArchive(broken, files, key, { projectRef: "local-supabase" });
    await writeFile(path.join(broken, "unexpected.enc"), "synthetic unlisted data");
    await assert.rejects(pruneArchives(root, key, [], path.join(root, "daily-keep")), /unlisted/);
    assert.equal((await readArchive(expired, key)).files.size, 1);
    await rm(path.join(broken, "unexpected.enc"));
    await rm(path.join(broken, "manifest.enc"));
    await assert.rejects(pruneArchives(root, key, [], path.join(root, "daily-keep")), { code: "ENOENT" });
    assert.equal((await readArchive(expired, key)).files.size, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("concurrent backups are blocked and the owned lock is released on failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fq-lock-test-"));
  try {
    await withBackupLock(root, async () => {
      await assert.rejects(withBackupLock(root, async () => {}), /Another backup/);
    });
    await assert.rejects(withBackupLock(root, async () => { throw new Error("synthetic failure"); }), /synthetic/);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("authenticated encryption rejects wrong keys, object swaps and tampering", () => {
  const key = randomBytes(32);
  const body = Buffer.from("synthetic private lesson");
  const encrypted = encrypt(body, key, "test-object");
  assert.equal(decrypt(encrypted, key, "test-object").toString(), body.toString());
  assert.equal(encrypted.includes(body), false);
  assert.throws(() => decrypt(encrypted, randomBytes(32), "test-object"));
  assert.throws(() => decrypt(encrypted, key, "different-object"));
  encrypted[encrypted.length - 1] ^= 1;
  assert.throws(() => decrypt(encrypted, key, "test-object"));
});

test("archive roundtrip, expiry, deletion suppression and safe removal", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fq-encryption-test-"));
  const key = randomBytes(32);
  const now = Date.parse("2026-11-25T00:00:00Z");
  const latest = path.join(root, "daily-latest");
  try {
    const files = new Map([["snapshot.json", Buffer.from('{"synthetic":"kept"}')], ["pdf/example", Buffer.from("%PDF synthetic bytes")]]);
    await writeArchive(latest, files, key, { projectRef: "local-supabase", createdAt: new Date(now).toISOString() });
    const restored = await readArchive(latest, key);
    assert.deepEqual(restored.files, files);
    for (const name of await readdir(latest)) {
      assert.equal((await readFile(path.join(latest, name))).includes(Buffer.from("synthetic")), false);
    }
    const expired = path.join(root, "daily-expired");
    await writeArchive(expired, files, key, { projectRef: "local-supabase", createdAt: "2026-10-25T00:00:00Z" });
    const deleted = path.join(root, "daily-deleted");
    await writeArchive(deleted, new Map([["snapshot.json", Buffer.from('{"user_id":"deleted-owner"}')]]), key, { projectRef: "local-supabase", createdAt: new Date(now).toISOString() });
    assert.equal(await pruneArchives(root, key, [{ target_id: "deleted-owner" }], latest, now), 2);
    assert.deepEqual(await readdir(root), ["daily-latest"]);
    await assert.rejects(removeArchive(root, root), /Unsafe/);
    const indexPath = path.join(latest, "index.json");
    const index = JSON.parse(await readFile(indexPath, "utf8"));
    index.createdAt = "2027-01-01T00:00:00Z";
    index.expiresAt = expirationDate(index.createdAt);
    await writeFile(indexPath, JSON.stringify(index));
    await assert.rejects(readArchive(latest, key), /authentication/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
