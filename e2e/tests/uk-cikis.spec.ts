// ÜK'dan çıkmış danışman (işaret kapalı veya çıkış tarihi dolu) programa alınmaz, listede görünmez.
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, enroll, q, USERS, nextMonday, startForWeek } from "../fixtures";

const ERR = "ÜK'da değil (işaret kapalı veya çıkış tarihi dolu)";

test("ÜK çıkış tarihi dolu / işaret kapalı: aday listesinde yok, toplu ve tekil ekleme reddedilir, otomatik ekleme olmaz", async ({ page }) => {
  const cikmis = await createAdvisor("Cikis Tarihli");
  const kapali = await createAdvisor("Isaret Kapali");
  const ileri = await createAdvisor("Cikis Ileride");
  await q(`UPDATE employees SET uretkenlik_koclugu = TRUE, uretkenlik_koclugu_manager_id = $2, uk_end_date = '2026-10-15' WHERE id = $1`, [cikmis.employeeId, USERS.zeynep.id]);
  await q(`UPDATE employees SET uretkenlik_koclugu = FALSE, uretkenlik_koclugu_manager_id = $2 WHERE id = $1`, [kapali.employeeId, USERS.zeynep.id]);
  await q(`UPDATE employees SET uretkenlik_koclugu = TRUE, uretkenlik_koclugu_manager_id = $2, uk_end_date = '2099-01-01' WHERE id = $1`, [ileri.employeeId, USERS.zeynep.id]);
  await loginAs(page, "admin");

  const ids = (await (await page.request.get("/api/uk-program/bulk-candidates")).json()).map((c: any) => c.employeeId);
  expect(ids).not.toContain(cikmis.employeeId);
  expect(ids).not.toContain(kapali.employeeId);
  expect(ids).toContain(ileri.employeeId);

  const r = await page.request.post("/api/uk-program/bulk-enroll", { data: { employeeIds: [cikmis.employeeId, kapali.employeeId, ileri.employeeId], startDate: nextMonday(), sendWelcome: false } });
  const d = await r.json();
  expect(d.enrolled).toBe(1);
  expect(d.results.filter((x: any) => !x.enrolled).map((x: any) => x.error)).toEqual([ERR, ERR]);
  expect((await page.request.post("/api/uk-program/enrollments", { data: { employeeId: cikmis.employeeId, startDate: nextMonday() } })).status()).toBe(400);

  // Profilden koç atanması da ÜK'da olmayanı otomatik eklemez
  await page.request.patch(`/api/employees/${kapali.employeeId}`, { data: { uretkenlikKocluguManagerId: USERS.mehmet.id } });
  expect(await q(`SELECT 1 FROM uk_program_enrollments WHERE employee_id = $1 AND removed_at IS NULL`, [kapali.employeeId])).toHaveLength(0);
});

test("programdayken ÜK çıkışı yapılan danışman listeden düşer, detay 404, pasiflerle görünür", async ({ page }) => {
  const a = await createAdvisor("Sonradan Cikti");
  await enroll(a.employeeId, USERS.zeynep.id, startForWeek(2));
  await loginAs(page, "admin");
  let rows = await (await page.request.get("/api/uk-program")).json();
  expect(rows.some((r: any) => r.employeeId === a.employeeId)).toBe(true);

  await q(`UPDATE employees SET uretkenlik_koclugu = FALSE, uk_end_date = '2026-10-30' WHERE id = $1`, [a.employeeId]);
  rows = await (await page.request.get("/api/uk-program")).json();
  expect(rows.some((r: any) => r.employeeId === a.employeeId)).toBe(false);
  expect((await page.request.get(`/api/uk-program/${a.employeeId}`)).status()).toBe(404);
  rows = await (await page.request.get("/api/uk-program?includePassive=true")).json();
  expect(rows.some((r: any) => r.employeeId === a.employeeId)).toBe(true);
});
