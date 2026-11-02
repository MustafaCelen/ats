// Tahsilat tarihi: dialogda seçilebilir; otomatik kapanışta işlem tarihi son tahsilat tarihi olur; gelecek tarih reddedilir.
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, q } from "../fixtures";

test("tahsilat tarihi: geçmiş tarih kaydedilir, otomatik kapanış işlem tarihi o gün olur, gelecek tarih reddedilir", async ({ page }) => {
  const adv = await createAdvisor("Tahsilat Tarih");
  const [c] = await q(`INSERT INTO closings (property_address, sale_value, status, closing_date) VALUES ('E2E Tarihli Mülk', 1000000, 'expected', NOW()) RETURNING id`);
  const [s] = await q(`INSERT INTO closing_sides (closing_id, side_type, bhb_total) VALUES ($1, 'seller', 20000) RETURNING id`, [c.id]);
  const [a] = await q(
    `INSERT INTO closing_agents (closing_side_id, employee_id, split_percentage, bhb_share, main_branch_share, market_center_due, market_center_actual, employee_net, kasa, banka, nakit, status)
     VALUES ($1, $2, 100, 20000, 0, 4000, 4000, 15000, 4000, 4000, 0, 'expected') RETURNING id`, [s.id, adv.employeeId]);
  await loginAs(page, "admin");

  const gelecek = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
  const bad = await page.request.post(`/api/closing-agents/${a.id}/collections`, { data: { method: "banka", amount: 1000, collectedAt: gelecek } });
  expect(bad.status()).toBe(400);
  expect((await page.request.post(`/api/closing-agents/${a.id}/collections`, { data: { method: "banka", amount: 1000, collectedAt: "bozuk" } })).status()).toBe(400);

  // UI: dialogta geçmiş tarih seç
  await page.goto("/closings");
  await page.getByPlaceholder(/Ara: adres/).fill("E2E Tarihli Mülk");
  const row = page.locator("tbody tr").filter({ hasText: adv.name }).first();
  await row.getByTitle("Tahsilat gir (danışman bazlı, banka/nakit)").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByTestId("collection-amount").fill("4000");
  await dlg.getByTestId("collection-date").fill("2026-09-15");
  await dlg.getByRole("button", { name: "Ekle" }).click();
  await expect(dlg.getByText("15.09.2026")).toBeVisible();

  const [ag] = await q(`SELECT payment_collected, status, closing_date::date::text AS d FROM closing_agents WHERE id = $1`, [a.id]);
  expect(ag).toMatchObject({ payment_collected: true, status: "completed", d: "2026-09-15" });
  const [cl] = await q(`SELECT status, closing_date::date::text AS d FROM closings WHERE id = $1`, [c.id]);
  expect(cl).toMatchObject({ status: "completed", d: "2026-09-15" });
});
