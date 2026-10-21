// ÜK & DÜA Raporları: "İşlem Yapan Danışman" kartı — dönem içinde kapanış payı/BHB'si olan farklı öğrenci sayısı.
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, q, USERS } from "../fixtures";

test("işlem yapan danışman kartı: işlemi olan öğrenci sayılır, olmayan sayılmaz", async ({ page }) => {
  const uretken = await createAdvisor("Rapor Uretken");
  const bos = await createAdvisor("Rapor Bos");
  for (const a of [uretken, bos]) {
    await q(`UPDATE employees SET uretkenlik_koclugu = TRUE, uretkenlik_koclugu_manager_id = $2, uretkenlik_koclugu_oran = '5%' WHERE id = $1`, [a.employeeId, USERS.zeynep.id]);
  }
  const [c] = await q(`INSERT INTO closings (property_address, sale_value, status, closing_date) VALUES ('E2E Rapor Mülkü', 1000000, 'completed', NOW()) RETURNING id`);
  const [s] = await q(`INSERT INTO closing_sides (closing_id, side_type, bhb_total) VALUES ($1, 'seller', 20000) RETURNING id`, [c.id]);
  await q(
    `INSERT INTO closing_agents (closing_side_id, employee_id, split_percentage, bhb_share, main_branch_share, market_center_due, market_center_actual, employee_net, status, closing_date)
     VALUES ($1, $2, 100, 20000, 0, 5000, 5000, 15000, 'completed', NOW())`, [s.id, uretken.employeeId]);

  await loginAs(page, "admin");
  await page.goto("/coaching");
  // Zeynep'in öğrencilerine daralt
  const coachBtn = page.getByRole("button", { name: /Zeynep Yilmaz/ }).first();
  if (await coachBtn.count()) await coachBtn.click();
  const card = page.getByTestId("coaching-producing-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("İşlem Yapan Danışman");
  const n = Number((await card.locator("p.text-xl").textContent())?.trim());
  expect(n).toBeGreaterThanOrEqual(1);
  // Öğrenci sayısı ≥ işlem yapan sayısı; "Rapor Bos" işlem yapmadığı için fark en az 1
  const total = Number((await page.getByText("Toplam Öğrenci").locator("..").locator("p.text-xl").textContent())?.trim());
  expect(total - n).toBeGreaterThanOrEqual(1);
});
