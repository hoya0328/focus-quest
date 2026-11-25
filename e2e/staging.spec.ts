import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

type TestUser = {
  displayName: string;
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
    displayName: `E2E ${label.toUpperCase()}`,
    email: `focus-quest-${label}-${suffix}@example.com`,
    password: `Fq!${suffix}Aa9`,
  };
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    email_confirm: true,
    password: user.password,
    user_metadata: { full_name: user.displayName },
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
    user.displayName,
  );
}

function createTextPdf(): Buffer {
  // Keep each sentence inside the page width so PDF.js extracts the full lesson.
  const lessonLines = [
    "Database transactions preserve atomicity consistency isolation durability.",
    "Atomicity means every operation succeeds together or rolls back together.",
    "Isolation keeps concurrent transactions from exposing unfinished changes.",
    "SQL joins combine related rows using matching keys and explicit conditions.",
  ];
  const stream = [
    "BT /F1 11 Tf 48 760 Td",
    ...lessonLines.flatMap((line, index) => [
      `(${line}) Tj`,
      ...(index < lessonLines.length - 1 ? ["0 -18 Td"] : []),
    ]),
    "ET",
  ].join("\n");
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

test.describe("isolated Supabase staging", () => {
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

  test("email signup keeps privacy confirmation separate from login and saves minimal metadata", async ({ page }) => {
    const suffix = randomUUID();
    const email = `focus-quest-signup-${suffix}@example.com`;
    const password = `Fq!${suffix}Aa9`;
    let signupRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/auth/v1/signup") signupRequests += 1;
    });
    await page.goto("/");
    await page.getByRole("button", { name: "로그인하고 클라우드에 집중 기록 저장" }).click();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /개인정보 처리방침/ }).last()).toHaveAttribute("target", "_blank");
    await page.getByRole("tab", { name: "회원가입" }).click();
    await page.getByLabel("이메일", { exact: true }).fill(email);
    await page.getByLabel("비밀번호", { exact: true }).fill(password);
    const age = page.getByRole("checkbox", { name: /만 14세 이상입니다/ });
    const notice = page.getByRole("checkbox", { name: /개인정보 처리방침의 수집 항목/ });
    await expect(age).not.toBeChecked();
    await expect(notice).not.toBeChecked();
    await page.getByRole("button", { name: "계정 만들기" }).click();
    expect(signupRequests).toBe(0);
    await age.check();
    await page.getByRole("button", { name: "계정 만들기" }).click();
    expect(signupRequests).toBe(0);
    await page.getByRole("button", { name: "로그인 창 닫기" }).click();
    await page.getByRole("button", { name: "로그인하고 클라우드에 집중 기록 저장" }).click();
    await expect(age).not.toBeChecked();
    await expect(notice).not.toBeChecked();
    await expect(page.getByLabel("이메일", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("비밀번호", { exact: true })).toHaveValue("");
    await page.getByLabel("이메일", { exact: true }).fill(email);
    await page.getByLabel("비밀번호", { exact: true }).fill(password);
    await age.check();
    await notice.check();
    const responsePromise = page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/auth/v1/signup",
    );
    await page.getByRole("button", { name: "계정 만들기" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const result = await response.json() as { user?: { id: string } };
    expect(result.user?.id).toBeTruthy();
    if (!result.user) throw new Error("Synthetic signup did not return its user ID");
    users.push({ id: result.user.id, email, password, displayName: "Synthetic signup" });
    const saved = await admin.auth.admin.getUserById(result.user.id);
    expect(saved.error).toBeNull();
    expect(saved.data.user?.user_metadata).toMatchObject({
      age_over_14_declared: true,
      privacy_notice_version: "2026-11-25",
    });
    expect(Number.isFinite(Date.parse(saved.data.user!.user_metadata.privacy_notice_acknowledged_at))).toBe(true);
    expect(saved.data.user?.user_metadata).not.toHaveProperty("birth_date");
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

  test("Plus interest is writable by its owner and hidden from another account", async () => {
    const clientA = await signInClient(userA);
    const clientB = await signInClient(userB);
    const ownerInsert = await clientA
      .from("focus_quest_plus_interest")
      .insert({
        user_id: userA.id,
        interest_level: "interested",
        price_band: 5900,
      })
      .select("user_id,interest_level,price_band")
      .single();
    expect(ownerInsert.error).toBeNull();
    expect(ownerInsert.data).toEqual({
      user_id: userA.id,
      interest_level: "interested",
      price_band: 5900,
    });

    const ownerUpdate = await clientA
      .from("focus_quest_plus_interest")
      .update({ price_band: 6900 })
      .eq("user_id", userA.id)
      .select("price_band")
      .single();
    expect(ownerUpdate.error).toBeNull();
    expect(ownerUpdate.data?.price_band).toBe(6900);

    const crossRead = await clientB
      .from("focus_quest_plus_interest")
      .select("user_id,price_band")
      .eq("user_id", userA.id);
    expect(crossRead.error).toBeNull();
    expect(crossRead.data).toEqual([]);

    const crossUpdate = await clientB
      .from("focus_quest_plus_interest")
      .update({ price_band: 4900 })
      .eq("user_id", userA.id)
      .select("user_id");
    expect(crossUpdate.error).toBeNull();
    expect(crossUpdate.data).toEqual([]);

    const forgedInsert = await clientA.from("focus_quest_plus_interest").insert({
      user_id: userB.id,
      interest_level: "interested",
      price_band: 4900,
    });
    expect(forgedInsert.error).not.toBeNull();
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
    await expect(secondPage.getByText("스테이징 동기화").first()).toBeVisible(
      { timeout: 20_000 },
    );
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
    await page
      .getByRole("textbox", { name: "목표", exact: true })
      .fill("트랜잭션과 조인 복습");
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
    await page
      .getByRole("button", { name: /모리와 집중 시작/ })
      .click();
    await expect(page.locator(".timer-card")).toBeVisible();
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
    await page
      .getByRole("group", { name: "퀴즈 선택지" })
      .getByRole("button")
      .first()
      .click();
    await page
      .getByRole("group", { name: "문제 품질 평가" })
      .getByRole("button", { name: "도움 됨" })
      .click();
    await expect(
      page.getByText("기록했어요. 다음 문제를 고르는 데 반영할게요."),
    ).toBeVisible();
  });

  test("camp history, invitations and moderation enforce member and leader boundaries", async () => {
    const clientA = await signInClient(userA);
    const clientB = await signInClient(userB);
    const outsider = await createTestUser("outsider");
    const clientC = await signInClient(outsider);
    const created = await clientA.rpc("create_focus_quest_camp", {
      requested_code: "CAMPTEST", requested_nickname: "캠프A",
      requested_adventure_id: "hike", requested_focus_minutes: 25,
    });
    expect(created.error).toBeNull();
    const room = created.data[0];
    const hidden = await clientB.from("focus_quest_camps").select("id").eq("id", room.camp_id);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
    const joined = await clientB.rpc("join_focus_quest_camp", {
      requested_code: room.code, requested_nickname: "캠프B",
      requested_adventure_id: "swim", requested_focus_minutes: 25,
    });
    expect(joined.error).toBeNull();
    const members = await clientB.from("focus_quest_camp_members").select("user_id").eq("camp_id", room.camp_id);
    expect(members.error).toBeNull();
    expect(members.data).toHaveLength(2);
    const forbiddenCompletion = await clientB.rpc("record_focus_quest_camp_completion", {
      requested_camp_id: room.camp_id, requested_duration_minutes: 25,
    });
    expect(forbiddenCompletion.error?.message).toContain("leader_required");
    const completed = await clientA.rpc("record_focus_quest_camp_completion", {
      requested_camp_id: room.camp_id, requested_duration_minutes: 25,
    });
    expect(completed.error).toBeNull();
    const ownHistory = await clientA.from("focus_quest_camp_history").select("user_id").eq("camp_id", room.camp_id);
    expect(ownHistory.error).toBeNull();
    expect(ownHistory.data).toEqual([{ user_id: userA.id }]);
    const otherHistory = await clientC.from("focus_quest_camp_history").select("user_id").eq("camp_id", room.camp_id);
    expect(otherHistory.error).toBeNull();
    expect(otherHistory.data).toEqual([]);
    const contacts = await clientA.from("focus_quest_camp_contacts").select("contact_user_id").eq("user_id", userA.id);
    expect(contacts.data).toEqual([{ contact_user_id: userB.id }]);
    const invite = await clientA.rpc("invite_focus_quest_camp_contact", {
      requested_camp_id: room.camp_id, requested_contact_user_id: userB.id,
    });
    expect(invite.error).toBeNull();
    const invitations = await clientB.from("focus_quest_camp_invitations").select("invitee_user_id").eq("camp_id", room.camp_id);
    expect(invitations.data).toEqual([{ invitee_user_id: userB.id }]);
    const unrelatedInvites = await clientC.from("focus_quest_camp_invitations").select("camp_id");
    expect(unrelatedInvites.data).toEqual([]);
    const reopened = await clientB.rpc("reopen_focus_quest_camp", {
      previous_camp_id: room.camp_id, requested_code: "NEWCAMPX",
      requested_nickname: "캠프B", requested_adventure_id: "swim", requested_focus_minutes: 25,
    });
    expect(reopened.error).toBeNull();
    const report = await clientB.rpc("report_focus_quest_camp_member", {
      requested_camp_id: room.camp_id, requested_user_id: userA.id, requested_reason: "spam",
    });
    expect(report.error).toBeNull();
    const unrelatedReport = await clientC.rpc("report_focus_quest_camp_member", {
      requested_camp_id: room.camp_id, requested_user_id: userA.id, requested_reason: "spam",
    });
    expect(unrelatedReport.error?.message).toContain("shared_camp_required");
    const forbiddenKick = await clientB.rpc("remove_focus_quest_camp_member", {
      requested_camp_id: room.camp_id, requested_user_id: userA.id, should_block: true,
    });
    expect(forbiddenKick.error?.message).toContain("leader_required");
    const blocked = await clientA.rpc("remove_focus_quest_camp_member", {
      requested_camp_id: room.camp_id, requested_user_id: userB.id, should_block: true,
    });
    expect(blocked.error).toBeNull();
    const rejoin = await clientB.rpc("join_focus_quest_camp", {
      requested_code: room.code, requested_nickname: "캠프B",
      requested_adventure_id: "swim", requested_focus_minutes: 25,
    });
    expect(rejoin.error?.message).toContain("camp_access_blocked");
    const afterRemoval = await clientB.from("focus_quest_camps").select("id").eq("id", room.camp_id);
    expect(afterRemoval.data).toEqual([]);
    await Promise.all([clientA.auth.signOut(), clientB.auth.signOut(), clientC.auth.signOut()]);
  });

  test("two browsers share camp presence, chat, timer and reconnect", async ({ browser }) => {
    test.setTimeout(120_000);
    const firstContext = await browser.newContext();
    const secondContext = await browser.newContext();
    try {
      const firstPage = await firstContext.newPage();
      const secondPage = await secondContext.newPage();
      await signInPage(firstPage, userA);
      await signInPage(secondPage, userB);
      for (const page of [firstPage, secondPage]) {
        await page.getByRole("button", { name: "캠프 로비 열기" }).click();
      }
      await firstPage.getByLabel("캠프에서 사용할 이름").fill("브라우저A");
      await firstPage.getByRole("button", { name: "새 캠프 만들기" }).click();
      await expect(firstPage.locator(".camp-room-code strong")).toBeVisible({ timeout: 20_000 });
      const code = await firstPage.locator(".camp-room-code strong").innerText();
      await secondPage.getByLabel("캠프에서 사용할 이름").fill("브라우저B");
      await secondPage.getByLabel("받은 코드").fill(code);
      await secondPage.getByRole("button", { name: "들어가기", exact: true }).click();
      await expect(firstPage.locator(".camp-member")).toHaveCount(2, { timeout: 20_000 });
      await expect(secondPage.locator(".camp-member")).toHaveCount(2);
      await firstPage.getByLabel("캠프 메시지").fill("함께 집중해요");
      await firstPage.getByRole("button", { name: "보내기", exact: true }).click();
      await expect(secondPage.locator(".camp-chat-log")).toContainText("함께 집중해요");
      await secondPage.reload();
      await expect(secondPage.getByRole("heading", { name: "친구와 함께 모험하기" })).toBeVisible();
      await expect(secondPage.locator(".camp-member")).toHaveCount(2, { timeout: 20_000 });
      await expect(secondPage.getByLabel("내 이름")).toHaveValue("브라우저B");
      await firstPage.getByRole("button", { name: /함께 집중 시작/ }).click();
      await expect(firstPage.locator(".timer-card")).toBeVisible();
      await expect(secondPage.locator(".timer-card")).toBeVisible({ timeout: 10_000 });
      const firstSession = await firstPage.evaluate(() => JSON.parse(localStorage.getItem("haru-focus-active-session")!));
      const secondSession = await secondPage.evaluate(() => JSON.parse(localStorage.getItem("haru-focus-active-session")!));
      expect(Math.abs(firstSession.endAt - secondSession.endAt)).toBeLessThan(2_000);
    } finally {
      await Promise.all([firstContext.close().catch(() => {}), secondContext.close().catch(() => {})]);
    }
  });

  test("server push API saves and removes only the authenticated owner's subscription", async ({ request }) => {
    const clientA = await signInClient(userA);
    const clientB = await signInClient(userB);
    const tokenA = (await clientA.auth.getSession()).data.session!.access_token;
    const tokenB = (await clientB.auth.getSession()).data.session!.access_token;
    const endpoint = `https://example.invalid/isolated-push/${randomUUID()}`;
    const saved = await request.post("/api/push-subscriptions", {
      headers: { authorization: `Bearer ${tokenA}` },
      data: {
        subscription: { endpoint, keys: { auth: "isolated-auth", p256dh: "isolated-key".repeat(6) } },
        reminderTime: "19:00", timezone: "Asia/Seoul",
        nextDueAt: new Date(Date.now() + 86400_000).toISOString(),
      },
    });
    expect(saved.status()).toBe(200);
    expect(saved.headers()["x-request-id"]).toBeTruthy();
    const owner = await clientA.from("focus_quest_push_subscriptions").select("user_id").eq("endpoint", endpoint);
    expect(owner.error).toBeNull();
    expect(owner.data).toEqual([{ user_id: userA.id }]);
    const other = await clientB.from("focus_quest_push_subscriptions").select("user_id").eq("endpoint", endpoint);
    expect(other.data).toEqual([]);
    await request.delete("/api/push-subscriptions", {
      headers: { authorization: `Bearer ${tokenB}` }, data: { endpoint },
    });
    const stillThere = await clientA.from("focus_quest_push_subscriptions").select("id").eq("endpoint", endpoint);
    expect(stillThere.data).toHaveLength(1);
    const deleted = await request.delete("/api/push-subscriptions", {
      headers: { authorization: `Bearer ${tokenA}` }, data: { endpoint },
    });
    expect(deleted.status()).toBe(200);
    const absent = await admin.from("focus_quest_push_subscriptions").select("id").eq("endpoint", endpoint);
    expect(absent.data).toEqual([]);
    await Promise.all([clientA.auth.signOut(), clientB.auth.signOut()]);
  });

  test("an isolated synthetic record can be exported, verified and restored", async () => {
    test.setTimeout(120_000);
    // The staging guard has already rejected the production project before this file runs.
    const created = await admin.from("study_subjects").insert({ name: "복구 훈련 합성 과목", user_id: userA.id }).select("*").single();
    expect(created.error).toBeNull();
    const backupRoot = path.resolve("backups");
    await mkdir(backupRoot, { recursive: true });
    const directory = await mkdtemp(path.join(backupRoot, "isolated-restore-"));
    try {
      const env = { ...process.env, SUPABASE_URL: stagingUrl, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey };
      execFileSync(process.execPath, ["scripts/backup-production.mjs", `--out=${directory}`], { env, timeout: 60_000, stdio: "pipe" });
      execFileSync(process.execPath, ["scripts/verify-backup.mjs", directory], { timeout: 15_000, stdio: "pipe" });
      const subjects = JSON.parse(await readFile(path.join(directory, "tables/study_subjects.json"), "utf8"));
      const exported = subjects.find((row: { id: string }) => row.id === created.data.id);
      expect(exported).toEqual(created.data);
      const removed = await admin.from("study_subjects").delete().eq("id", created.data.id);
      expect(removed.error).toBeNull();
      const restored = await admin.from("study_subjects").insert(exported);
      expect(restored.error).toBeNull();
      const owner = await signInClient(userA);
      const visible = await owner.from("study_subjects").select("*").eq("id", exported.id).single();
      expect(visible.error).toBeNull();
      expect(visible.data).toEqual(exported);
      await owner.auth.signOut();
    } finally {
      // Only the directory created by mkdtemp above is removed, never the backup root.
      await rm(directory, { recursive: true, force: true });
    }
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
