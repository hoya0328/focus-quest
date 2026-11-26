import { execFileSync } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { createSourceMap, projectRoot, runtimeSyntaxShape } from "./generate-source-map.mjs";

const read = (file) => readFile(path.join(projectRoot, file), "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const engineering = "docs/engineering";
const documents = (await readdir(path.join(projectRoot, engineering)))
  .filter((file) => file.endsWith(".md")).map((file) => `${engineering}/${file}`);
documents.push("README.md", "CONTRIBUTING.md", "docs/ARCHITECTURE.md", "docs/OPERATIONS_RUNBOOK.md");
let linkCount = 0;
for (const file of documents) {
  const markdown = await read(file);
  for (const match of markdown.matchAll(/\]\(([^\s)]+)\)/g)) {
    const destination = match[1];
    if (/^(?:https?:|mailto:|#)/.test(destination)) continue;
    const relative = decodeURIComponent(destination.split("#")[0]);
    const target = path.resolve(projectRoot, path.dirname(file), relative);
    const fromRoot = path.relative(projectRoot, target);
    check(fromRoot !== ".." && !fromRoot.startsWith(`..${path.sep}`) && !path.isAbsolute(fromRoot), `${file}: link escapes project`);
    try { await access(target); } catch { failures.push(`${file}: missing ${relative}`); }
    linkCount++;
  }
}

const generated = await createSourceMap();
check((await read(`${engineering}/SOURCE_MAP.md`)).replaceAll("\r\n", "\n") === generated.content, "Source map drift: run npm run docs:generate");
const dataModel = await read(`${engineering}/DATA_MODEL.md`);
for (const table of generated.tableNames) {
  check(dataModel.includes(`\`${table}\``), `Missing data ownership contract: ${table}`);
}
const features = (await Promise.all(["FEATURES_CORE.md", "FEATURES_LEARNING.md", "FEATURES_PLATFORM.md"].map((name) => read(`${engineering}/${name}`)))).join("\n");
for (let id = 1; id <= 16; id++) {
  const name = `FQ-${String(id).padStart(2, "0")}`;
  check(features.includes(`## ${name} —`), `Missing feature contract ${name}`);
}

const spec = JSON.parse(await read(`${engineering}/openapi.json`));
check(spec.openapi === "3.1.0", "Expected OpenAPI 3.1.0");
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
let apiOperations = 0;
const operationIds = new Set();
for (const [route, operations] of Object.entries(spec.paths)) {
  const file = `app${route}/route.ts`;
  const source = ts.createSourceFile(file, await read(file), ts.ScriptTarget.Latest, true);
  const exported = source.statements.filter((node) => ts.isFunctionDeclaration(node) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    .map((node) => node.name?.text).filter((name) => methods.has(name));
  const documented = Object.keys(operations).filter((name) => methods.has(name.toUpperCase())).map((name) => name.toUpperCase());
  check(JSON.stringify(exported.sort()) === JSON.stringify(documented.sort()), `HTTP method drift: ${route}`);
  for (const method of documented) {
    const operation = operations[method.toLowerCase()];
    check(!operationIds.has(operation.operationId), `Duplicate operationId: ${operation.operationId}`);
    operationIds.add(operation.operationId);
    check(Boolean(operation.responses?.["200"]), `Missing success response: ${route} ${method}`);
    apiOperations++;
  }
}
// New routes must not disappear from the contract just because they were not listed.
async function findRoutes(directory) {
  for (const entry of await readdir(path.join(projectRoot, directory), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await findRoutes(file);
    else if (entry.name === "route.ts") {
      const route = `/${directory.slice("app/".length)}`;
      check(Boolean(spec.paths[route]), `Undocumented route: ${route}`);
    }
  }
}
await findRoutes("app/api");

let commentsOnlyFiles = 0;
if (process.argv.includes("--comments-only")) {
  const changed = execFileSync("git", ["diff", "HEAD", "--name-only", "--", "app", "lib", "worker", "scripts/encrypted-backup.mjs"], { cwd: projectRoot, encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  for (const file of changed) {
    if (!/\.(?:ts|tsx|mjs|js)$/.test(file)) continue;
    const before = execFileSync("git", ["show", `HEAD:${file}`], { cwd: projectRoot, encoding: "utf8" });
    check(runtimeSyntaxShape(before, file) === runtimeSyntaxShape(await read(file), file), `Non-comment runtime change: ${file}`);
    commentsOnlyFiles++;
  }
}
if (failures.length) throw new Error(failures.join("\n"));
console.log(JSON.stringify({ status: "verified", documents: documents.length, localLinks: linkCount, features: 16, apiOperations, commentsOnlyFiles, ...{ modules: generated.modules, tables: generated.tables, sqlFunctions: generated.functions } }));
