import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputPath = "docs/engineering/SOURCE_MAP.md";
const sourceRoots = ["app", "lib", "worker", "db", "scripts", "build", "e2e", "tests"];
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const markdown = (value) => value.replaceAll("|", "\\|").replaceAll("\n", " ");

/** Compare syntax without source positions, comments or printer layout choices. */
export function runtimeSyntaxShape(text, file) {
  const source = ts.createSourceFile(file, text.replaceAll("\r\n", "\n"), ts.ScriptTarget.Latest, true);
  const shape = (node) => {
    const children = [];
    ts.forEachChild(node, (child) => { children.push(shape(child)); });
    if (children.length) return [node.kind, children];
    if (typeof node.text === "string") return [node.kind, node.text];
    // Empty blocks and JSX comment expressions have no semantic child tokens.
    return [node.kind, ts.isToken(node) ? node.getText(source) : ""];
  };
  return JSON.stringify(shape(source));
}

async function filesUnder(directory) {
  const entries = await readdir(path.join(projectRoot, directory), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return filesUnder(relative);
    return /\.(?:ts|tsx|mjs|js|css)$/.test(entry.name) ? [relative] : [];
  }));
  return nested.flat().sort(compare);
}

function exportedNames(source) {
  const symbols = [];
  for (const node of source.statements) {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const add = (name) => symbols.push(`\`${markdown(name)}\` (L${line})`);
    if (ts.isExportAssignment(node)) {
      add("default");
    } else if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) add(element.name.text);
      } else add("export *");
    } else if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) add(declaration.name.getText(source));
      } else add(node.name?.getText(source) ?? "default");
    }
  }
  return symbols.join(", ") || "—";
}

/** Mechanical index only: never import application modules or read credentials. */
export async function createSourceMap() {
  const files = (await Promise.all(sourceRoots.map(filesUnder))).flat().sort(compare);
  const lines = [
    "# 소스·SQL 탐색 지도", "",
    "자동 생성 문서. `npm run docs:generate`로 갱신한다. 계약의 의미는 기능 명세를 따른다. 줄 번호는 현재 소스 위치이며 변경 시 다시 생성한다.", "",
    "## 모듈과 export", "",
    "| 소스 | export 이름 · 위치 |", "| --- | --- |",
  ];
  for (const file of files) {
    const text = await readFile(path.join(projectRoot, file), "utf8");
    const names = file.endsWith(".css") ? "스타일시트" : exportedNames(
      ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true),
    );
    lines.push(`| [${file}](../../${file}) | ${names} |`);
  }

  const tables = new Map();
  const functions = new Map();
  const migrationRoot = "supabase/migrations";
  for (const file of (await readdir(path.join(projectRoot, migrationRoot))).filter((name) => name.endsWith(".sql")).sort(compare)) {
    const relative = `${migrationRoot}/${file}`;
    const sql = await readFile(path.join(projectRoot, relative), "utf8");
    for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)) {
      const line = sql.slice(0, match.index).split("\n").length;
      if (!tables.has(match[1])) tables.set(match[1], { relative, line });
    }
    for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns\b/gi)) {
      functions.set(match[1], {
        relative, line: sql.slice(0, match.index).split("\n").length,
        parameters: match[2].trim().replace(/\s+/g, " "),
      });
    }
  }
  lines.push("", "## SQL 테이블 최초 정의", "", "후속 ALTER·정책 변경까지 누적해야 최종 스키마다. 이 표는 운영 DB 조회 결과가 아니다.", "", "| 테이블 | 정의 |", "| --- | --- |");
  for (const [name, entry] of [...tables].sort(([a], [b]) => compare(a, b))) {
    lines.push(`| \`${name}\` | [${entry.relative} L${entry.line}](../../${entry.relative}#L${entry.line}) |`);
  }
  lines.push("", "## SQL 함수 마지막 정의", "", "동일 이름은 마지막 정의 위치를 표시한다. 과거 overload의 revoke/drop과 grants도 함께 확인한다. trigger 함수는 클라이언트 API가 아니다.", "", "| 함수 | 선언 인자 | 마지막 정의 |", "| --- | --- | --- |");
  for (const [name, entry] of [...functions].sort(([a], [b]) => compare(a, b))) {
    lines.push(`| \`${name}\` | ${markdown(entry.parameters) || "없음"} | [${entry.relative} L${entry.line}](../../${entry.relative}#L${entry.line}) |`);
  }
  return { content: `${lines.join("\n")}\n`, modules: files.length, tables: tables.size, functions: functions.size, tableNames: [...tables.keys()].sort(compare) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await createSourceMap();
  const target = path.join(projectRoot, outputPath);
  if (process.argv.includes("--check")) {
    if ((await readFile(target, "utf8")).replaceAll("\r\n", "\n") !== result.content) {
      throw new Error("Source map is stale. Run npm run docs:generate.");
    }
  } else await writeFile(target, result.content, "utf8");
  console.log(JSON.stringify({ status: "verified", modules: result.modules, tables: result.tables, functions: result.functions }));
}
