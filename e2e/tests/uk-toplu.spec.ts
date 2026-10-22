// 45+45: koçu olan danışmanları toplu ekleme + toplu hoş geldin maili.
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, enroll, q, USERS, nextMonday, startForWeek } from "../fixtures";

test("toplu ekle: adaylar koçlu/aktif/programda olmayanlar; seçilenler aynı pazartesiden eklenir", async ({ page }) => {
  const a = await createAdvisor("Toplu Bir");
  const b = await createAdvisor("Toplu Iki", { email: null });   // e-postasız
  const kocsuz = await createAdvisor("Toplu Kocsuz");
  const pasif = await createAdvisor("Toplu Pasif", { status: "inactive" });
  const zaten = await createAdvisor("Toplu Zaten");
  for (const x of [a, b, pasif, zaten]) await q(`UPDATE employees SET uretkenlik_koclugu_manager_id = $2 WHERE id = $1`, [x.employeeId, USERS.zeynep.id]);
  await enroll(zaten.employeeId, USERS.zeynep.id, startForWeek(1));

  await loginAs(page, "admin");
  const cands = await (await page.request.get("/api/uk-program/bulk-candidates")).json();
  const ids = cands.map((c: any) => c.employeeId);
  expect(ids).toContain(a.employeeId);
  expect(ids).toContain(b.employeeId);
  expect(ids).not.toContain(kocsuz.employeeId);
  expect(ids).not.toContain(pasif.employeeId);
  expect(ids).not.toContain(zaten.employeeId);
  expect(cands.find((c: any) => c.employeeId === b.employeeId).hasEmail).toBe(false);

  await page.goto("/uk-basari-rotasi");
  await page.getByTestId("uk-bulk-open").click();
  const dlg = page.getByTestId("uk-bulk-dialog");
  await expect(dlg.getByTestId(`uk-bulk-row-${a.employeeId}`)).toBeVisible();
  await expect(dlg.getByTestId(`uk-bulk-row-${b.employeeId}`)).toContainText("E-posta yok");
  await expect(dlg.getByTestId("uk-bulk-count")).toContainText(`${cands.length} / ${cands.length} seçili`);
  // Yalnız a ve b kalsın
  await dlg.getByRole("button", { name: "Seçimi kaldır" }).click();
  await dlg.getByTestId(`uk-bulk-row-${a.employeeId}`).click();
  await dlg.getByTestId(`uk-bulk-row-${b.employeeId}`).click();
  await expect(dlg.getByTestId("uk-bulk-count")).toContainText(`2 / ${cands.length} seçili`);
  await dlg.getByLabel(/Hoş geldin mailini/).uncheck();   // yerelde Gmail yok
  await dlg.getByTestId("uk-bulk-submit").click();
  await expect(dlg.getByTestId("uk-bulk-result")).toContainText("2 danışman programa eklendi");

  const rows = await q(`SELECT employee_id, start_date, source, removed_at FROM uk_program_enrollments WHERE employee_id IN ($1, $2) ORDER BY employee_id`, [a.employeeId, b.employeeId]);
  expect(rows).toHaveLength(2);
  expect(rows.every((r: any) => r.start_date === nextMonday() && r.source === "manual" && r.removed_at === null)).toBe(true);

  // API: tekrar eklemede "Zaten programda", koçsuz reddedilir
  const r = await page.request.post("/api/uk-program/bulk-enroll", { data: { employeeIds: [a.employeeId, kocsuz.employeeId], startDate: nextMonday(), sendWelcome: false } });
  const d = await r.json();
  expect(d.enrolled).toBe(0);
  expect(d.results.map((x: any) => x.error)).toEqual(["Zaten programda", "Profilde ÜK koçu yok"]);
});

test("toplu mail: listede bekleyen sayısıyla buton; e-postasız atlanır, yerelde mail ayarı yok → gönderilemedi", async ({ page }) => {
  const a = await createAdvisor("Toplu Mail");
  await enroll(a.employeeId, USERS.zeynep.id, startForWeek(1));
  await loginAs(page, "admin");
  await page.goto("/uk-basari-rotasi");
  const btn = page.getByTestId("uk-bulk-mail");
  await expect(btn).toBeVisible();
  await expect(btn).toContainText(/Toplu Mail \(\d+\)/);

  const r = await page.request.post("/api/uk-program/bulk-welcome", { data: { employeeIds: [a.employeeId, 999999] } });
  const d = await r.json();
  expect(d.results[0]).toMatchObject({ employeeId: a.employeeId, mailed: false });   // GMAIL ayarı yok
  expect(d.results[1]).toMatchObject({ mailed: false, error: "Programda değil" });
});
