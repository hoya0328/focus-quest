import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, lstat, mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { BACKUP_RETENTION_DAYS, expirationDate } from "../lib/operating-policy.ts";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const uuid = /^[a-f0-9-]{36}$/;

export function encrypt(bytes, key, context) {
  if (key.length !== 32) throw new Error("A 256-bit backup key is required.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from("FQB2"), iv, cipher.getAuthTag(), body]);
}

export function decrypt(bytes, key, context) {
  if (key.length !== 32 || bytes.length < 32 || bytes.subarray(0, 4).toString() !== "FQB2") throw new Error("Invalid encrypted backup.");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(4, 16));
  decipher.setAuthTag(bytes.subarray(16, 32));
  decipher.setAAD(Buffer.from(context));
  return Buffer.concat([decipher.update(bytes.subarray(32)), decipher.final()]);
}

export async function protectDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink()) throw new Error("Backup directories must not be symbolic links.");
  if (process.platform === "win32") {
    const identity = execFileSync("whoami.exe", [], { encoding: "utf8", windowsHide: true }).trim();
    execFileSync("icacls.exe", [directory, "/inheritance:r", "/grant:r", `${identity}:(OI)(CI)F`], { stdio: "pipe", windowsHide: true });
  } else await chmod(directory, 0o700);
}

function dpapi(bytes, operation) {
  const script = `Add-Type -AssemblyName System.Security; $payload=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${operation}($payload,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  try {
    return Buffer.from(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      input: bytes.toString("base64"), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 10_000, windowsHide: true,
    }).trim(), "base64");
  } catch { throw new Error("Windows account-bound key protection failed; no unencrypted key was saved."); }
}

export async function loadBackupKey(root) {
  if (process.env.BACKUP_ENCRYPTION_KEY) {
    const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) throw new Error("Invalid backup encryption key.");
    return key;
  }
  if (process.platform !== "win32") throw new Error("Set a protected BACKUP_ENCRYPTION_KEY outside Windows. There is no plaintext fallback.");
  const keyDirectory = path.join(root, ".keys");
  await protectDirectory(keyDirectory);
  const keyFile = path.join(keyDirectory, "master.dpapi");
  let protectedKey;
  try { protectedKey = await readFile(keyFile); } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if ((await readdir(root)).some((name) => /^(daily-|legacy-)/.test(name))) {
      throw new Error("Existing encrypted backups have no protected key. Restore the original key; never replace it.");
    }
    protectedKey = dpapi(randomBytes(32), "Protect");
    await writeFile(keyFile, protectedKey, { flag: "wx", mode: 0o600 });
  }
  const key = dpapi(protectedKey, "Unprotect");
  if (key.length !== 32) throw new Error("Invalid protected backup key.");
  return key;
}

export async function writeArchive(directory, files, key, { projectRef, createdAt = new Date().toISOString(), coverage = "application-auth-pdf" }) {
  await protectDirectory(directory);
  const index = { version: 2, projectRef, createdAt, expiresAt: expirationDate(createdAt), keyId: digest(key).slice(0, 16), coverage };
  const manifest = [];
  for (const [name, body] of files) {
    const object = randomUUID();
    const bytes = Buffer.from(body);
    await writeFile(path.join(directory, `${object}.enc`), encrypt(bytes, key, object), { flag: "wx", mode: 0o600 });
    manifest.push({ name, object, bytes: bytes.length, sha256: digest(bytes) });
  }
  await writeFile(path.join(directory, "manifest.enc"), encrypt(Buffer.from(JSON.stringify({ index, files: manifest })), key, "manifest"), { flag: "wx", mode: 0o600 });
  // The completion index is written last. It never contains identities or filenames.
  await writeFile(path.join(directory, "index.json"), JSON.stringify(index), { flag: "wx", mode: 0o600 });
  await readArchive(directory, key);
  return index;
}

export async function readArchive(directory, key) {
  const index = JSON.parse(await readFile(path.join(directory, "index.json"), "utf8"));
  if (index.version !== 2 || index.keyId !== digest(key).slice(0, 16) || index.expiresAt !== expirationDate(index.createdAt)) throw new Error("Invalid backup index or key.");
  const authenticated = JSON.parse(decrypt(await readFile(path.join(directory, "manifest.enc")), key, "manifest"));
  if (JSON.stringify(authenticated.index) !== JSON.stringify(index)) throw new Error("Backup index authentication failed.");
  const manifest = authenticated.files;
  if (!Array.isArray(manifest) || manifest.length > 100_000) throw new Error("Invalid backup manifest.");
  const expectedFiles = ["index.json", "manifest.enc", ...manifest.map((file) => `${file.object}.enc`)].sort();
  if (JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(expectedFiles)) throw new Error("Backup contains missing or unlisted files.");
  const files = new Map();
  for (const file of manifest) {
    if (!uuid.test(file.object) || typeof file.name !== "string" || files.has(file.name)) throw new Error("Invalid backup object reference.");
    const body = decrypt(await readFile(path.join(directory, `${file.object}.enc`)), key, file.object);
    if (body.length !== file.bytes || digest(body) !== file.sha256) throw new Error("Backup integrity check failed.");
    files.set(file.name, body);
  }
  return { index, files };
}

export async function removeArchive(root, directory) {
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(directory);
  if (path.dirname(target) !== absoluteRoot || !/^(daily-|weekly-|legacy-|\d{4}-\d{2}-\d{2})/.test(path.basename(target))) throw new Error("Unsafe backup removal target.");
  if ((await lstat(target)).isSymbolicLink()) throw new Error("Refusing to remove a linked backup.");
  await rm(target, { recursive: true });
}

export async function pruneArchives(root, key, deletions, keepDirectory, now = Date.now()) {
  const candidates = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || !/^(daily-|weekly-|legacy-|\d{4}-\d{2}-\d{2})/.test(entry.name)) continue;
    const directory = path.join(root, entry.name);
    if (path.resolve(directory) === path.resolve(keepDirectory)) continue;
    // Verify the entire set before deleting anything. A broken or unconverted
    // backup must never be silently skipped and then acknowledged as cleaned.
    const archive = await readArchive(directory, key);
    const snapshot = archive.files.get("snapshot.json")?.toString() ?? [...archive.files.values()].map((value) => value.toString()).join("\n");
    const containsDeletedData = deletions.some((item) => snapshot.includes(item.target_id));
    if (Date.parse(archive.index.expiresAt) <= now || containsDeletedData) {
      candidates.push(directory);
    }
  }
  for (const directory of candidates) await removeArchive(root, directory);
  return candidates.length;
}

export async function withBackupLock(root, task) {
  const lockPath = path.join(root, ".backup.lock");
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); } catch (error) {
    if (error.code === "EEXIST") throw new Error("Another backup may be running. Check the exact process before clearing its lock.");
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await task();
  } finally {
    await lock.close();
    await rm(lockPath);
  }
}

export { BACKUP_RETENTION_DAYS };
