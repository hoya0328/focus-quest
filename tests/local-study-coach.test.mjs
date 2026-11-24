import assert from "node:assert/strict";
import test from "node:test";
import { createLocalStudyGuide } from "../lib/local-study-coach.ts";

const source = (text) => ({ kind: "focus-quiz-source-v1", pages: [{ pageNumber: 1, text }] });

test("local guide recognizes code-heavy study material without an external API", () => {
  const guide = createLocalStudyGuide(source("SELECT name FROM users WHERE id = 1; function query() { return result; } class Database {}"));
  assert.equal(guide.kind, "code");
  assert.equal(guide.focusMinutes, 40);
  assert.ok(guide.keywords.length > 0);
});

test("local guide falls back to concept recall for prose", () => {
  const guide = createLocalStudyGuide(source("운영체제의 개념과 특징을 설명하고 프로세스와 스레드의 관계를 비교한다."));
  assert.equal(guide.kind, "concept");
  assert.match(guide.method, /세 문장/);
});
