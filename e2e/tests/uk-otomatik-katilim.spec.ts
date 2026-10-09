// 45+45 — danışmana ÜK koçu atanınca gelecek pazartesiden otomatik katılım.
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, enroll, nextMonday, startForWeek, q, USERS } from "../fixtures";

test("Danışmanlar → Düzenle → Koçluk: ÜK + koç → programa otomatik eklenir", async ({ page }) => {
  const a = await createAdvisor("Otomatik Katılım");
  await loginAs(page, "admin");
  await page.goto("/employees");
  await page.getByTestId("input-search-employees").fill(a.kwuid);
  const rowMenu = page.getByTestId(`menu-employee-${a.employeeId}`);
  await rowMenu.hover();
  await rowMenu.click({ force: true });
  await page.getByTestId(`edit-employee-${a.employeeId}`).click();

  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "ÜK", exact: true }).click();
  await dlg.getByTestId("select-uretkenlik-manager").click();
  await page.getByRole("option", { name: "Zeynep Yilmaz" }).click();
  await dlg.getByTestId("select-uretkenlik-oran").click();   // oran zorunlu
  await page.getByRole("option").first().click();
  await dlg.getByRole("button", { name: "Kaydet" }).click();
  await expect(dlg).toHaveCount(0);

  await expect.poll(async () => (await q(`SELECT source, start_date, removed_at FROM uk_program_enrollments WHERE employee_id = $1`, [a.employeeId]))[0])
    .toMatchObject({ source: "auto", start_date: nextMonday(), removed_at: null });

  // Listede görünür, başlamadı; rota sayfasında koç Zeynep
  await page.goto("/uk-basari-rotasi");
  await page.getByRole("button", { name: /^Tümü/ }).click();
  const row = page.locator("tbody tr").filter({ hasText: a.name });
  await expect(row).toContainText("Başlamadı");
  await expect(row).toContainText("Zeynep Yilmaz");
  await expect(row).not.toContainText("Manuel");
});

test("pasif danışmana koç atanınca eklenmez; programdakinin başlangıcı değişmez", async ({ page }) => {
  const pasif = await createAdvisor("Otomatik Pasif", { status: "inactive" });
  const mevcut = await createAdvisor("Otomatik Mevcut");
  await enroll(mevcut.employeeId, USERS.mehmet.id, startForWeek(3));

  await loginAs(page, "admin");
  for (const e of [pasif, mevcut]) {
    const r = await page.request.patch(`/api/employees/${e.employeeId}`, {
      data: { uretkenlikKoclugu: true, uretkenlikKocluguManagerId: USERS.zeynep.id },
    });
    expect(r.ok()).toBeTruthy();
  }
  expect(await q(`SELECT 1 FROM uk_program_enrollments WHERE employee_id = $1`, [pasif.employeeId])).toHaveLength(0);
  const [en] = await q(`SELECT source, start_date FROM uk_program_enrollments WHERE employee_id = $1`, [mevcut.employeeId]);
  expect(en).toMatchObject({ source: "manual", start_date: startForWeek(3) });
});
