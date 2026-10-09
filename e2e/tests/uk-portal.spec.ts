// 45+45 — danışman portalı (/a/:token, "Rotam"): yalnız içinde bulunulan hafta, puansız,
// kutucuk/gerçekleşen girişi, liste/takvim, kilit, başlamamış/tamamlanmış durumları.
import { test, expect, type Page } from "@playwright/test";
import { advisorLogin, createAdvisor, createCandidate, enroll, startForWeek, nextMonday, todayIst, thisMonday, fmtTr, q, USERS, type Advisor } from "../fixtures";
import { ukAddDays } from "../../shared/uk-program";

let a: Advisor;
test.beforeEach(async ({ context }) => {
  a = await createAdvisor("Portal Danışman");
  await enroll(a.employeeId, USERS.zeynep.id, startForWeek(2));
  await advisorLogin(context, a.employeeId);
});

const openRota = async (page: Page, adv: Advisor = a) => {
  await page.goto(`/a/${adv.token}?tab=rota`);
};

test("yalnız içinde bulunulan hafta görünür, puan görünmez", async ({ page }) => {
  await openRota(page);
  await expect(page.getByText("2. hafta açık")).toBeVisible();
  await expect(page.getByText(`Pazar ${fmtTr(ukAddDays(thisMonday(), 6))} 23:59`)).toBeVisible();
  await expect(page.getByText(`Pazar ${fmtTr(ukAddDays(thisMonday(), 6)).slice(0, 5)} 23:59`)).toBeVisible();   // başlık kutusu
  await expect(page.locator('[data-testid^="uk-act-w2-"]').first()).toBeVisible();
  await expect(page.locator('[data-testid^="uk-act-w1-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="uk-act-w3-"]')).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/puan/i);
  // Sunucu da diğer haftaları ve puanı göndermez
  const api = await (await page.request.get(`/api/public/advisor/${a.token}/uk-program`)).json();
  expect(api.score).toBeUndefined();
  expect(api.targetScore).toBeUndefined();
  expect(api.weeks.map((w: any) => w.week)).toEqual([2]);
});

test("kutucuk işaretle / kaldır (danışman adına kaydedilir)", async ({ page }) => {
  await openRota(page);
  const box = page.getByTestId("uk-act-w2-d0-r0");
  await expect(box).toHaveAttribute("data-done", "0");
  await box.click();
  await expect(box).toHaveAttribute("data-done", "1");
  const [ck] = await q(`SELECT by_advisor FROM uk_program_checks WHERE employee_id = $1 AND activity_id = 'w2-d0-r0'`, [a.employeeId]);
  expect(ck.by_advisor).toBe(true);
  await page.reload();
  await expect(page.getByTestId("uk-act-w2-d0-r0")).toHaveAttribute("data-done", "1");
  await page.getByTestId("uk-act-w2-d0-r0").click();
  await expect(page.getByTestId("uk-act-w2-d0-r0")).toHaveAttribute("data-done", "0");
});

test("gelecek günler kapalı, geçmiş/bugün açık", async ({ page }) => {
  await openRota(page);
  const today = todayIst();
  for (let d = 0; d < 5; d++) {
    const date = ukAddDays(thisMonday(), d);
    const btn = page.getByTestId(`uk-act-w2-d${d}-r0`);
    if (date > today) await expect(btn, `${date} gelecek`).toBeDisabled();
    else await expect(btn, `${date} geçmiş/bugün`).toBeEnabled();
  }
  // Sunucu da gelecek günü ve başka haftayı reddeder
  const otherWeek = await page.request.put(`/api/public/advisor/${a.token}/uk-program/checks/w1-d0-r0`, { data: { done: true } });
  expect(otherWeek.status()).toBeGreaterThanOrEqual(400);
});

test("Liste / Takvim geçişi ve hatırlanması", async ({ page }) => {
  await openRota(page);
  await expect(page.getByTestId("uk-act-w2-d0-r0")).toBeVisible();
  await page.getByRole("button", { name: "Takvim", exact: true }).click();
  await expect(page.getByTestId("uk-grid-w2-d0-r0")).toBeVisible();
  await expect(page.getByTestId("uk-act-w2-d0-r0")).toHaveCount(0);
  await page.getByTestId("uk-grid-w2-d0-r0").click();
  await expect(page.getByTestId("uk-grid-w2-d0-r0")).toHaveAttribute("data-done", "1");
  await page.reload();
  await expect(page.getByTestId("uk-grid-w2-d0-r0")).toBeVisible();
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.getByTestId("uk-act-w2-d0-r0")).toHaveAttribute("data-done", "1");
});

test("haftalık gerçekleşen kaydı, hedef ipuçları ve 6 hafta sonu hedefleri", async ({ page }) => {
  await q(`INSERT INTO uk_program_weeks (employee_id, week, tek_yetki) VALUES ($1, 1, 1)`, [a.employeeId]);
  await createCandidate("Portal Referans Aday", a.name, a.employeeId);   // katkı payı 1
  await openRota(page);

  const card = page.locator("div").filter({ has: page.getByRole("heading", { name: "2. hafta gerçekleşen" }) }).last();
  await expect(card).toContainText("Hedef: 50 (günde 10)");
  await expect(card).toContainText("Hedef: 1");
  await card.getByLabel(/Arama/).fill("30");
  await card.getByLabel(/Randevu/).fill("1");
  await card.getByRole("button", { name: "Kaydet" }).click();
  await expect(card.getByText("Kaydedildi")).toBeVisible();
  const [w] = await q(`SELECT arama, randevu FROM uk_program_weeks WHERE employee_id = $1 AND week = 2`, [a.employeeId]);
  expect(w).toMatchObject({ arama: 30, randevu: 1 });

  const targets = page.locator("div").filter({ has: page.getByRole("heading", { name: "6 hafta sonu hedeflerin" }) }).last();
  await expect(targets.locator("div").filter({ hasText: /^Tek Yetki \(Satılık\)/ }).first()).toContainText("1 / 1");
  await expect(targets.locator("div").filter({ hasText: /^Kapanış/ }).first()).toContainText("0 / 1");
  await expect(targets.locator("div").filter({ hasText: /^Katkı Payı/ }).first()).toContainText("1 / 2");
  await expect(page.locator("body")).not.toContainText(/puan/i);
});

test("koç onayladıysa hafta kilitli", async ({ page }) => {
  await q(`INSERT INTO uk_program_weeks (employee_id, week, confirmed_at, confirmed_by_user_id) VALUES ($1, 2, NOW(), $2)`, [a.employeeId, USERS.zeynep.id]);
  await openRota(page);
  await expect(page.getByText(/Koçunuz bu haftayı onayladı/)).toBeVisible();
  await expect(page.getByTestId("uk-act-w2-d0-r0")).toBeDisabled();
  const r = await page.request.put(`/api/public/advisor/${a.token}/uk-program/checks/w2-d0-r0`, { data: { done: true } });
  expect(r.status()).toBeGreaterThanOrEqual(400);
});

test("başlamamış ve tamamlanmış program kartları", async ({ page, context }) => {
  await enroll(a.employeeId, USERS.zeynep.id, nextMonday());
  await openRota(page);
  await expect(page.getByText(`Programınız ${fmtTr(nextMonday())} Pazartesi başlıyor.`)).toBeVisible();
  await expect(page.locator('[data-testid^="uk-act-"]')).toHaveCount(0);

  await enroll(a.employeeId, USERS.zeynep.id, startForWeek(8));
  await page.reload();
  await expect(page.getByText(/Tebrikler, 6 haftalık programı tamamladınız/)).toBeVisible();
});

test("programda olmayan danışmanda Rotam sekmesi yok; başkasının rotası açılmaz", async ({ page, context }) => {
  const disarida = await createAdvisor("Portal Programsız");
  await advisorLogin(context, disarida.employeeId);
  await page.goto(`/a/${disarida.token}`);
  await expect(page.getByRole("button", { name: /Durum/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rotam/ })).toHaveCount(0);

  // Kendi oturumuyla başka danışmanın rota verisi alınamaz
  const r = await page.request.get(`/api/public/advisor/${a.token}/uk-program`);
  expect(r.status()).toBeGreaterThanOrEqual(400);
});
