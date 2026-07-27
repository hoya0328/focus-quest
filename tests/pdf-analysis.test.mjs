import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createGuidedPdfAnalysis,
  parsePdfAnalysis,
} from "../lib/pdf-analysis.ts";

const pages = Array.from({ length: 36 }, (_, index) => ({
  pageNumber: index + 1,
  text:
    `${index + 1}. 운영체제 핵심 개념\n` +
    "프로세스 스케줄링 메모리 동기화 교착상태를 예시와 함께 설명합니다. ".repeat(18),
}));

test("guided PDF analysis creates an editable 3-7 quest route with page evidence", () => {
  const result = createGuidedPdfAnalysis({
    pages,
    subjectName: "운영체제",
    subjectGoal: "기말고사 핵심 개념 설명",
  });

  assert.ok(result.quests.length >= 3 && result.quests.length <= 7);
  assert.equal(result.quests[0].startPage, 1);
  assert.equal(result.quests.at(-1).endPage, 36);
  for (const quest of result.quests) {
    assert.ok(quest.sourcePages.includes("쪽"));
    assert.ok(quest.estimatedMinutesMin <= quest.estimatedMinutesMax);
    assert.ok(quest.contract.safe);
    assert.ok(quest.contract.base);
    assert.ok(quest.contract.stretch);
    assert.equal(quest.registered, false);
  }
});

test("analysis parser constrains unsafe model values and preserves review state", () => {
  const guided = createGuidedPdfAnalysis({
    pages,
    subjectName: "운영체제",
    subjectGoal: "",
  });
  guided.quests[0].focusMinutes = 999;
  guided.quests[0].registered = true;

  const parsed = parsePdfAnalysis(guided);

  assert.ok(parsed);
  assert.equal(parsed.quests[0].focusMinutes, 120);
  assert.equal(parsed.quests[0].registered, true);
  assert.equal(parsed.provider, "guided");
});

test("PDF migration creates private user-owned storage and material relations", async () => {
  const sql = await readFile(
    new URL(
      "../supabase/migrations/202607280001_study_materials.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(sql, /create table if not exists public\.study_materials/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /public,\s*\n\s*file_size_limit/s);
  assert.match(sql, /storage\.foldername\(name\)/);
  assert.match(sql, /material_id uuid references public\.study_materials/i);
});
