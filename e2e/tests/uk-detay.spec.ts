// 45+45 Başarı Rotası — koç/admin rota sayfası: başlangıç & hafta, kutucuklar, haftalık
// gerçekleşen + onay, skor/hedef tablosu, yetkiler, programdan çıkarma.
import { test, expect, type Page } from "@playwright/test";
import { loginAs, createAdvisor, enroll, startForWeek, nextMonday, q, USERS, type Advisor } from "../fixtures";

let a: Advisor;   // koçu Zeynep, 2. haftada
test.beforeEach(async () => {
  a = await createAdvisor("Detay Danışman");
  await enroll(a.employeeId, USERS.zeynep.id, startForWeek(2));
});

const header = (page: Page) => page.locator("div").filter({ has: page.getByText("Program başlangıcı", { exact: true }) }).first();
const startSel = (page: Page) => page.locator("select").filter({ has: page.locator("option", { hasText: "Pazartesi" }) }).first();
const weekSel = (page: Page) => page.locator("select").filter({ has: page.locator("option", { hasText: /^1\. hafta$/ }) }).first();

test("başlangıç yalnız pazartesi; 'Şu an' haftası değişince başlangıç kayar", async ({ page }) => {
  await loginAs(page, "zeynep");
  await page.goto(`/uk-basari-rotasi/${a.employeeId}`);
  await expect(startSel(page)).toHaveValue(startForWeek(2));
  await expect(weekSel(page)).toHaveValue("2");
  expect((await startSel(page).locator("option").allTextContents()).every((t) => t.includes("Pazartesi"))).toBeTruthy();

  await weekSel(page).selectOption("4");
  await expect.poll(async () => (await q(`SELECT start_date FROM uk_program_enrollments WHERE employee_id = $1`, [a.employeeId]))[0].start_date)
    .toBe(startForWeek(4));
  await expect(startSel(page)).toHaveValue(startForWeek(4));

  // Gelecek pazartesiye alınca program "Başlamadı"
  await startSel(page).selectOption(nextMonday());
  await expect(weekSel(page).locator("option:checked")).toHaveText("Başlamadı");
  await page.reload();
  await expect(startSel(page)).toHaveValue(nextMonday());
});

test("koç kutucuk işaretler/kaldırır; kalıcıdır", async ({ page }) => {
  await loginAs(page, "zeynep");
  await page.goto(`/uk-basari-rotasi/${a.employeeId}`);
  await expect(page.getByRole("button", { name: /2\. Hafta/ })).toBeVisible();
  const box = page.getByTestId("uk-grid-w2-d0-r0");
  await expect(box).toHaveAttribute("data-done", "0");
  await box.click();
  await expect(box).toHaveAttribute("data-done", "1");
  await page.reload();
  await expect(page.getByTestId("uk-grid-w2-d0-r0")).toHaveAttribute("data-done", "1");
  const [ck] = await q(`SELECT by_advisor, checked_by_user_id FROM uk_program_checks WHERE employee_id = $1 AND activity_id = 'w2-d0-r0'`, [a.employeeId]);
  expect(ck).toMatchObject({ by_advisor: false, checked_by_user_id: USERS.zeynep.id });

  // Koç geçmiş haftayı da düzenleyebilir
  await page.getByRole("button", { name: /1\. Hafta/ }).click();
  await page.getByTestId("uk-grid-w1-d1-r0").click();
  await expect(page.getByTestId("uk-grid-w1-d1-r0")).toHaveAttribute("data-done", "1");

  await page.getByRole("button", { name: /2\. Hafta/ }).click();
  await page.getByTestId("uk-grid-w2-d0-r0").click();
  await expect(page.getByTestId("uk-grid-w2-d0-r0")).toHaveAttribute("data-done", "0");
});

test("haftalık gerçekleşen kaydet, haftayı onayla, onayı kaldır", async ({ page }) => {
  await loginAs(page, "zeynep");
  await page.goto(`/uk-basari-rotasi/${a.employeeId}`);
  const summary = page.locator("div.rounded-xl").filter({ hasText: "2. hafta gerçekleşen" }).first();
  await expect(summary).toContainText("Koç onayı bekliyor");
  await expect(summary).toContainText("hedef 50");

  const inputs = summary.locator('input[type="number"]');
  await inputs.nth(0).fill("50");   // arama
  await inputs.nth(1).fill("1");    // randevu
  await inputs.nth(2).fill("1");    // tek yetki
  await summary.locator("textarea").fill("E2E koç notu");
  await summary.getByRole("button", { name: "Kaydet ve Haftayı Onayla" }).click();
  await expect(summary).toContainText("Zeynep Yilmaz onayladı");

  const [w] = await q(`SELECT arama, randevu, tek_yetki, coach_note, confirmed_at IS NOT NULL AS ok FROM uk_program_weeks WHERE employee_id = $1 AND week = 2`, [a.employeeId]);
  expect(w).toMatchObject({ arama: 50, randevu: 1, tek_yetki: 1, coach_note: "E2E koç notu", ok: true });
  await expect(page.getByRole("button", { name: /2\. Hafta/ })).toBeVisible();

  await summary.getByRole("button", { name: "Onayı Kaldır" }).click();
  await expect(summary).toContainText("Koç onayı bekliyor");
});

test("skor tablosu: hedef dağılımı 10/8/8/8/8/8 ve hesap", async ({ page }) => {
  await q(`INSERT INTO uk_program_weeks (employee_id, week, arama, randevu, tek_yetki) VALUES ($1, 1, 50, 2, 1), ($1, 2, 25, 0, 0)`, [a.employeeId]);
  await loginAs(page, "admin");
  await page.goto(`/uk-basari-rotasi/${a.employeeId}`);
  await page.getByRole("button", { name: /Skor Tablosu/ }).click();

  const hedef = page.locator("div.rounded-xl").filter({ has: page.getByRole("heading", { name: "Hedef" }) }).first();
  const rowOf = (label: string) => hedef.locator("tbody tr").filter({ hasText: label });
  const expected: [string, string][] = [["Arama", "10"], ["Randevu", "8"], ["Tek Yetki (Satılık)", "8"], ["Kapanış", "8"], ["BHB", "8"], ["Katkı Payı", "8"]];
  for (const [label, pts] of expected) await expect(rowOf(label).locator("td").nth(2)).toHaveText(pts);

  // Arama: hafta1 50/50 + hafta2 25/50 → 10 × 1,5/6 = 2,5
  await expect(rowOf("Arama")).toContainText("75 / 300");
  await expect(rowOf("Arama")).toContainText("1/6 hafta tuttu");
  await expect(rowOf("Arama").locator("td").nth(3)).toHaveText("2,5");
  // Randevu: haftada 1, fazlası taşınmaz → 8 × 1/6 = 1,3
  await expect(rowOf("Randevu").locator("td").nth(3)).toHaveText("1,3");
  await expect(rowOf("Tek Yetki (Satılık)").locator("td").nth(3)).toHaveText("8");
  await expect(hedef.locator("tfoot")).toContainText("50");
  await expect(hedef.locator("tfoot td").last()).toHaveText("11,8");
  await expect(page.getByText("Hedef puanı")).toBeVisible();

  const akt = page.locator("div.rounded-xl").filter({ has: page.getByRole("heading", { name: "Aktivite" }) }).first();
  await expect(akt.locator("tbody tr").filter({ hasText: "Katkı Payı Yönlendirme" })).toContainText("0 / 2");
});

test("başka koçun danışmanı: görüntüleme modu, düzenleme yok", async ({ page }) => {
  await loginAs(page, "mehmet");
  await page.goto(`/uk-basari-rotasi/${a.employeeId}`);
  await expect(page.getByText(/Görüntüleme modu/)).toBeVisible();
  await expect(page.getByTestId("uk-grid-w2-d0-r0")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Kaydet ve Haftayı Onayla" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Hoş Geldin Maili/ })).toHaveCount(0);
  await expect(page.getByText("Programdan çıkar")).toHaveCount(0);
  await expect(startSel(page)).toHaveCount(0);
});

test("HM programdan çıkaramaz; admin onaylı çıkarır", async ({ page }) => {
  await loginAs(page, "zeynep");
  await page.goto(`/uk-basari-rotasi/${a.employeeId}`);
  await expect(page.getByRole("button", { name: /2\. Hafta/ })).toBeVisible();
  await expect(page.getByText("Programdan çıkar")).toHaveCount(0);

  await loginAs(page, "admin");
  await page.goto(`/uk-basari-rotasi/${a.employeeId}`);
  await page.getByText("Programdan çıkar").click();
  await page.getByRole("button", { name: "Vazgeç" }).click();
  await expect(page.getByText("Programdan çıkarılsın mı?")).toHaveCount(0);
  await page.getByText("Programdan çıkar").click();
  await page.getByRole("button", { name: "Evet, çıkar" }).click();
  await expect(page).toHaveURL(/\/uk-basari-rotasi$/);
  const [en] = await q(`SELECT removed_at IS NOT NULL AS removed FROM uk_program_enrollments WHERE employee_id = $1`, [a.employeeId]);
  expect(en.removed).toBe(true);
});

test("rota sayfası butonları: danışman gözüyle gör & link kopyala", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loginAs(page, "zeynep");
  await page.goto(`/uk-basari-rotasi/${a.employeeId}`);

  await page.getByRole("button", { name: /Danışman Linkini Kopyala/ }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`/a/${a.token}`);

  const [portal] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: /Danışman Gözüyle Gör/ }).click()]);
  await portal.waitForLoadState();
  await expect(portal.getByText(/Önizleme/).first()).toBeVisible();
  await expect(portal.getByText("2. hafta").first()).toBeVisible();
  await expect(portal.getByTestId("uk-act-w2-d0-r0")).toBeDisabled();
});
