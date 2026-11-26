import test from "node:test";
import assert from "node:assert/strict";
import { runtimeSyntaxShape } from "../scripts/generate-source-map.mjs";

test("comment-only comparison ignores JSDoc, empty-block comments and CRLF", () => {
  const original = 'export function View() { try {} catch {} return <div>{/* note */}Hello</div>; }\n';
  const annotated = '/** Contract. */\r\nexport function View() { try {\r\n// reason\r\n} catch {} return <div>{/* updated */}Hello</div>; }\r\n';
  assert.equal(runtimeSyntaxShape(original, "view.tsx"), runtimeSyntaxShape(annotated, "view.tsx"));
});

test("comment-only comparison detects changed literals, operators and JSX text", () => {
  const shape = (text) => runtimeSyntaxShape(text, "view.tsx");
  assert.notEqual(shape("export const minutes = 25;"), shape("export const minutes = 26;"));
  assert.notEqual(shape("export const total = a + b;"), shape("export const total = a - b;"));
  assert.notEqual(shape("export const view = <p>Hello</p>;"), shape("export const view = <p>Goodbye</p>;"));
});
