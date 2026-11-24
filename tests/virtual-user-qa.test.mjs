import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("newcomers do not see the post-restoration archive early", async () => {
  const source = await read("app/components/AdventureArchive.tsx");
  assert.match(source, /if \(!isAdventureArchiveUnlocked\(archives\)\) return null/);
});

test("rest companions stay inside the visible scene", async () => {
  const source = await read("app/components/RestQuestScene.tsx");
  assert.match(source, /Phaser\.Math\.Clamp/);
  assert.match(source, /companionHalfWidth \+ horizontalMargin/);
});

test("guest camp entry asks for login before a failed connection", async () => {
  const source = await read("app/components/CampLobby.tsx");
  assert.match(source, /authenticated \? \(/);
  assert.match(source, /로그인하고 캠프 시작/);
  assert.match(source, /onClick=\{onLogin\}/);
});

test("stacked setup previews leave the controls above the fold", async () => {
  const css = await read("app/focus-quest-2026.css");
  assert.match(css, /max-width: 64rem[\s\S]*preview-panel[^}]*min-height: 360px/);
  assert.match(css, /max-width: 48rem[\s\S]*preview-panel[^}]*min-height: 300px/);
});

test("focus transitions reset scroll and companion radios support arrow keys", async () => {
  const source = await read("app/page.tsx");
  assert.match(source, /screen === "complete" \|\| screen === "focus"/);
  assert.match(source, /event\.key === "ArrowRight" \|\| event\.key === "ArrowDown"/);
  assert.match(source, /tabIndex=\{active \? 0 : -1\}/);
});
