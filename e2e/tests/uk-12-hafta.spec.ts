// 45+45: program 12 hafta (2 dönem × 6 hafta). Şablon, hedefler ve puanlar her dönemde aynı;
// toplam skor iki dönemin toplamı (aktivite 100 + hedef 100).
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, enroll, q, USERS, startForWeek } from "../fixtures";

test("12 hafta: 2. dönem haftaları şablonu tekrar eder, puan dönem bazlı hesaplanır", async ({ page }) => {
  const a = await createAdvisor("On Iki Hafta");
  await enroll(a.employeeId, USERS.zeynep.id, startForWeek(8));   // bugün 8. haftada = 2. dönemin 2. haftası
  await loginAs(page, "admin");

  let d = await (await page.request.get(`/api/uk-program/${a.employeeId}`)).json();
  expect(d.currentWeek).toBe(8);
  expect(d.weeks).toHaveLength(12);
  expect(d.weeks[6].totalActivities).toBe(d.weeks[0].totalActivities);   // 7. hafta = 1. hafta şablonu
  expect(d.score.max).toBe(100);
  expect(d.targetScore.max).toBe(100);
  expect(d.periods).toHaveLength(2);
  expect(d.totals.activities).toBe(2 * d.weeks.slice(0, 6).reduce((s: number, w: any) => s + w.totalActivities, 0));

  // 1. haftanın "Müşteri Potansiyeli" kutusu (10 puanlık kalem) → 1. dönem
  expect((await page.request.put(`/api/uk-program/${a.employeeId}/checks/w1-d0-r3`, { data: { done: true } })).ok()).toBe(true);
  // 7. haftanın aynı kutusu → 2. dönem
  expect((await page.request.put(`/api/uk-program/${a.employeeId}/checks/w7-d0-r3`, { data: { done: true } })).ok()).toBe(true);
  expect((await page.request.put(`/api/uk-program/${a.employeeId}/checks/w13-d0-r3`, { data: { done: true } })).status()).toBe(400);   // 13. hafta yok
  d = await (await page.request.get(`/api/uk-program/${a.employeeId}`)).json();
  const [p1, p2] = d.periods;
  expect(p1.score.total).toBeGreaterThan(0);
  expect(p2.score.total).toBe(p1.score.total);                              // aynı şablon, aynı puan
  expect(d.score.total).toBeCloseTo(p1.score.total + p2.score.total, 1);   // toplam = iki dönem

  // 8. haftada arama gerçekleşeni → yalnız 2. dönem hedef puanı
  expect((await page.request.put(`/api/uk-program/${a.employeeId}/weeks/8`, { data: { arama: 50, randevu: 1 } })).ok()).toBe(true);
  d = await (await page.request.get(`/api/uk-program/${a.employeeId}`)).json();
  expect(d.periods[0].targetScore.total).toBe(0);
  expect(d.periods[1].targetScore.total).toBeCloseTo(20 / 6 + 8 / 6, 0);
  expect(d.targetScore.total).toBeCloseTo(d.periods[1].targetScore.total, 1);

  // Arayüz: 12 sekme + dönem kırılımı
  await page.goto(`/uk-basari-rotasi/${a.employeeId}`);
  await expect(page.getByRole("button", { name: /^12\. Hafta/ })).toBeVisible();
  await expect(page.getByTestId("uk-period-activity")).toContainText("1. dönem");
  await expect(page.getByTestId("uk-period-activity")).toContainText("2. dönem");
  await expect(page.getByTestId("uk-period-target")).toContainText("2. dönem");
});

test("12 hafta sonunda program tamamlanır; 12. hafta hâlâ aktif sayılır", async ({ page }) => {
  const done = await createAdvisor("On Iki Bitti");
  const last = await createAdvisor("On Iki Son");
  await enroll(done.employeeId, USERS.zeynep.id, startForWeek(13));
  await enroll(last.employeeId, USERS.zeynep.id, startForWeek(12));
  await loginAs(page, "admin");
  const rows = await (await page.request.get("/api/uk-program")).json();
  expect(rows.find((r: any) => r.employeeId === done.employeeId).currentWeek).toBe(13);
  expect(rows.find((r: any) => r.employeeId === last.employeeId).currentWeek).toBe(12);
  expect(rows.find((r: any) => r.employeeId === last.employeeId).total).toBeGreaterThan(0);
  await q(`SELECT 1`);
});
