import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const maxFileBytes = 5 * 1024 * 1024;
const textExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const credentialPatterns = [
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{20,}\b/g],
  ["private key block", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];
const jwtPattern = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

function decodeJwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return payload.role;
  } catch {
    return null;
  }
}

function scanText(source, location, findings) {
  for (const [kind, pattern] of credentialPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) findings.push({ kind, location });
  }

  jwtPattern.lastIndex = 0;
  for (const token of source.match(jwtPattern) ?? []) {
    if (decodeJwtRole(token) === "service_role") {
      findings.push({ kind: "Supabase service-role JWT", location });
      break;
    }
  }
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function scanTracked(findings) {
  for (const file of trackedFiles()) {
    const path = join(root, file);
    const stats = statSafe(path);
    if (!stats) continue;
    if (stats.size > maxFileBytes || !textExtensions.has(extname(file).toLowerCase())) continue;
    const source = readFileSync(path, "utf8");
    if (!source.includes("\0")) scanText(source, `tracked:${file}`, findings);
  }
}

function walkTextFiles(directory) {
  if (!statSafe(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkTextFiles(path));
    else if (
      entry.isFile() &&
      statSync(path).size <= maxFileBytes &&
      textExtensions.has(extname(entry.name).toLowerCase())
    ) {
      files.push(path);
    }
  }
  return files;
}

function statSafe(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function scanBuild(findings) {
  for (const path of walkTextFiles(join(root, "dist"))) {
    const source = readFileSync(path, "utf8");
    if (!source.includes("\0")) {
      scanText(source, `build:${relative(root, path)}`, findings);
    }
  }
}

function scanReachableHistory(findings) {
  const history = execFileSync(
    "git",
    ["log", "--all", "-p", "--no-color", "--format="],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  scanText(history, "reachable-git-history", findings);
}

const findings = [];
scanTracked(findings);
scanBuild(findings);
scanReachableHistory(findings);

const uniqueFindings = [
  ...new Map(findings.map((finding) => [`${finding.kind}:${finding.location}`, finding])).values(),
];

console.log(
  JSON.stringify(
    {
      findings: uniqueFindings,
      scanned: ["tracked source", "dist build", "reachable Git history"],
    },
    null,
    2,
  ),
);
if (uniqueFindings.length > 0) process.exitCode = 1;
