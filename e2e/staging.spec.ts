import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

type TestUser = {
  email: string;
  id: string;
  password: string;
};

const stagingUrl = process.env.E2E_SUPABASE_URL!;
const anonKey = process.env.E2E_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(stagingUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const users: TestUser[] = [];
const uploadedObjects: string[] = [];

function userClient() {
  return createClient(stagingUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createTestUser(label: string): Promise<TestUser> {
  const suffix = randomUUID();
  const user = {
    email: `focus-quest-${label}-${suffix}@example.com`,
    password: `Fq!${suffix}Aa9`,
  };
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    email_confirm: true,
    password: user.password,
    user_metadata: { full_name: `E2E ${label.toUpperCase()}` },
  });
  if (error || !data.user) throw error ?? new Error("Test user was not created");
  const created = { ...user, id: data.user.id };
  users.push(created);
  return created;
}

async function signInClient(user: TestUser): Promise<SupabaseClient> {
  const client = userClient();
  const { error } = await client.auth.signInWithPassword(user);
  if (error) throw error;
  return client;
}

async function signInPage(page: Page, user: TestUser) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "로그인하고 클라우드에 집중 기록 저장" })
    .click();
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인하고 이어하기" }).click();
  await expect(page.locator("summary.account-chip")).toContainText(
    user.email.split("@")[0],
  );
}

function createTextPdf(): Buffer {
  const lesson = [
    "Database transactions preserve atomicity consistency isolation durability.",
    "Atomicity means every operation succeeds together or rolls back together.",
    "Isolation keeps concurrent transactions from exposing unfinished changes.",
    "SQL joins combine related rows using matching keys and explicit conditions.",
  ].join(" ");
  const stream = `BT /F1 11 Tf 48 760 Td (${lesson}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

let userA: TestUser;
let userB: TestUser;

test.describe.serial("isolated Supabase staging", () => {
  test.beforeAll(async () => {
    userA = await createTestUser("a");
    userB = await createTestUser("b");
  });

  test.afterAll(async () => {
    if (uploadedObjects.length > 0) {
      await admin.storage.from("study-materials").remove(uploadedObjects);
    }
    await Promise.all(
      users.map(async (user) => {
        const { error } = await admin.auth.admin.deleteUser(user.id);
        if (error && !/not found/i.test(error.message)) throw error;
      }),
    );
  });

  test("two accounts cannot read, write or download each other's records", async () => {
    const clientA = await signInClient(userA);
    const clientB = await signInClient(userB);
    const subjectA = await clientA
      .from("study_subjects")
      .insert({ name: "A 전용 과목", user_id: userA.id })
      .select("id,user_id")
      .single();
    const subjectB = await clientB
      .from("study_subjects")
      .insert({ name: "B 전용 과목", user_id: userB.id })
      .select("id,user_id")
      .single();
    expect(subjectA.error).toBeNull();
    expect(subjectB.error).toBeNull();

    const crossRead = await clientA
      .from("study_subjects")
      .select("id")
      .eq("id", subjectB.data!.id);
    expect(crossRead.error).toBeNull();
    expect(crossRead.data).toEqual([]);

    const forgedInsert = await clientA.from("study_subjects").insert({
      name: "위조 소유권",
      user_id: userB.id,
    });
    expect(forgedInsert.error).not.toBeNull();

    const storagePath = `${userA.id}/${randomUUID()}/source.pdf`;
    uploadedObjects.push(storagePath);
    const upload = await clientA.storage
      .from("study-materials")
      .upload(storagePath, createTextPdf(), { contentType: "application/pdf" });
    expect(upload.error).toBeNull();
    const forbiddenDownload = await clientB.storage
      .from("study-materials")
      .download(storagePath);
    expect(forbiddenDownload.error).not.toBeNull();
  });

  test("a record saved on one browser is restored on another", async ({
    browser,
  }) => {
    const firstContext = await browser.newContext();
    const firstPage = await firstContext.newPage();
    await firstPage.addInitScript(() => {
      window.localStorage.setItem(
        "haru-focus-history",
        JSON.stringify([
          {
            id: "staging-sync-record",
            completedAt: new Date().toISOString(),
            durationMinutes: 25,
            adventureId: "hike",
            focusIntent: "스테이징 동기화",
          },
        ]),
      );
    });
    await signInPage(firstPage, userA);
    await expect(firstPage.locator("summary.account-chip")).toContainText(
      /클라우드 (저장됨|기록 불러옴)/,
      { timeout: 20_000 },
    );

    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await signInPage(secondPage, userA);
    await expect(secondPage.getByText("스테이징 동기화")).toBeVisible({
      timeout: 20_000,
    });
    await firstContext.close();
    await secondContext.close();
  });

  test("a text PDF becomes a checkpoint quiz through the real UI", async ({
    page,
  }) => {
    await signInPage(page, userB);
    await page.getByRole("button", { name: "모리와 준비하기" }).click();
    await page
      .getByRole("button", { name: "자료와 퀘스트 열기" })
      .click();

    await page.getByText("+ 새 과목").click();
    await page.getByLabel("과목명").fill("데이터베이스 E2E");
    await page.getByLabel("목표").fill("트랜잭션과 조인 복습");
    await page.getByRole("button", { name: "과목 저장" }).click();
    await expect(page.getByRole("heading", { name: "데이터베이스 E2E" })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      buffer: createTextPdf(),
      mimeType: "application/pdf",
      name: "database-quiz-source.pdf",
    });
    await page.getByRole("button", { name: "퀴즈 자료로 준비" }).click();
    await expect(page.getByText("복습 퀴즈 준비됨")).toBeVisible({
      timeout: 30_000,
    });

    const editor = page.locator("form.quest-editor");
    await editor.getByLabel("할 일").fill("트랜잭션 복습");
    await editor.getByLabel("완료 기준").fill("핵심 개념을 설명한다");
    await editor.getByLabel("공부 자료").selectOption({
      label: "database-quiz-source.pdf",
    });
    await editor.getByLabel("집중(분)").fill("1");
    await editor.getByLabel("목표 세트").fill("1");
    await editor.getByRole("button", { name: "퀘스트 등록" }).click();

    const quest = page.locator("article.quest-card", {
      hasText: "트랜잭션 복습",
    });
    await expect(quest).toBeVisible();
    await page.clock.install();
    await quest
      .getByRole("button", { name: "집중 시작" })
      .dispatchEvent("click");
    await page.clock.fastForward("01:05");

    await expect(
      page.getByRole("heading", {
        name: "쉬기 전에, 방금 배운 것을 한 번 꺼내 볼까요?",
      }),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("이번 집중에서 어디까지 공부했나요?").fill("1");
    await page
      .getByRole("button", { name: /이 범위에서 한 문제 받기/ })
      .click();
    await expect(page.getByRole("group", { name: "퀴즈 선택지" })).toBeVisible();
  });

  test("account deletion removes the generated staging user", async ({
    page,
  }) => {
    const disposable = await createTestUser("delete");
    await signInPage(page, disposable);
    await page.locator("summary.account-chip").click();
    page.once("dialog", (dialog) => dialog.accept("계정 삭제"));
    await page.getByRole("button", { name: "계정과 모든 자료 삭제" }).click();

    await expect(
      page.getByRole("button", {
        name: "로그인하고 클라우드에 집중 기록 저장",
      }),
    ).toBeVisible({ timeout: 20_000 });
    const lookup = await admin.auth.admin.getUserById(disposable.id);
    expect(lookup.error).not.toBeNull();
  });
});
