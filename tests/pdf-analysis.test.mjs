import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createStudyMaterialStoragePath, materialFromRow } from "../lib/pdf-analysis.ts";
import {
  createStudyQuiz,
  createStudyQuizSource,
  parseStudyPageRange,
  parseStudyQuizSource,
} from "../lib/study-quiz.ts";

const pages = Array.from({ length: 12 }, (_, index) => ({
  pageNumber: index + 1,
  text:
    `SQL 데이터베이스 ${index + 1}장. ` +
    "SELECT 문은 테이블에서 조건에 맞는 데이터를 조회합니다. " +
    "JOIN 연산은 공통 열을 기준으로 여러 테이블의 행을 결합합니다. " +
    "트랜잭션은 원자성 일관성 고립성 지속성의 성질을 가집니다.",
}));

test("PDF text becomes a bounded page-aware quiz source", () => {
  const source = createStudyQuizSource(pages);
  assert.equal(source.pages.length, 12);
  assert.equal(source.kind, "focus-quiz-source-v1");
  assert.ok(parseStudyQuizSource(source));
  assert.equal(parseStudyQuizSource({ kind: "legacy", pages }), null);
});

test("study range parsing accepts one page or a start-end range", () => {
  assert.deepEqual(parseStudyPageRange("10~27쪽", 80), { startPage: 10, endPage: 27 });
  assert.deepEqual(parseStudyPageRange("27페이지", 80), { startPage: 27, endPage: 27 });
  assert.deepEqual(parseStudyPageRange("", 12), { startPage: 1, endPage: 12 });
});

test("checkpoint and recall quizzes stay inside the studied page range", () => {
  const source = createStudyQuizSource(pages);
  const checkpoint = createStudyQuiz(source, 3, 7, 0);
  const recall = createStudyQuiz(source, 3, 7, 1);
  assert.ok(checkpoint);
  assert.ok(recall);
  assert.equal(checkpoint.options.length, 4);
  assert.ok(checkpoint.correctIndex >= 0 && checkpoint.correctIndex < 4);
  assert.match(checkpoint.sourcePages, /3~7쪽/);
  assert.match(checkpoint.explanation, /쪽 원문/);
  assert.notEqual(checkpoint.id, recall.id);
});

test("short or unreadable ranges skip quiz generation safely", () => {
  const source = createStudyQuizSource([{ pageNumber: 1, text: "짧은 글" }]);
  assert.equal(createStudyQuiz(source, 1, 1), null);
});

test("PDF storage path never includes the original Unicode file name", () => {
  const userId = "123e4567-e89b-12d3-a456-426614174000";
  const materialId = "123e4567-e89b-42d3-a456-426614174001";
  assert.equal(createStudyMaterialStoragePath(userId, materialId), `${userId}/${materialId}/source.pdf`);
  assert.throws(() => createStudyMaterialStoragePath("../user", materialId));
});

test("material rows expose quiz sources and ignore legacy analysis shapes", () => {
  const quizSource = createStudyQuizSource(pages);
  const material = materialFromRow({
    id: "123e4567-e89b-42d3-a456-426614174001",
    user_id: "123e4567-e89b-12d3-a456-426614174000",
    subject_id: "123e4567-e89b-42d3-a456-426614174002",
    file_name: "database.pdf",
    storage_path: "user/material/source.pdf",
    file_size_bytes: 1024,
    page_count: 12,
    status: "ready",
    summary: "퀴즈 준비됨",
    analysis: quizSource,
    analysis_provider: "guided",
    error_message: "",
    created_at: "2026-11-12T00:00:00.000Z",
    updated_at: "2026-11-12T00:00:00.000Z",
    analyzed_at: "2026-11-12T00:00:00.000Z",
  });
  assert.equal(material.quizSource?.pages.length, 12);
});

test("PDF migration keeps private user-owned storage and material relations", async () => {
  const sql = await readFile(new URL("../supabase/migrations/202607280001_study_materials.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.study_materials/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /public,\s*\n\s*file_size_limit/s);
  assert.match(sql, /storage\.foldername\(name\)/);
  assert.match(sql, /material_id uuid references public\.study_materials/i);
});
