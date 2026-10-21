// Toplantı (2026-10-20) 3. grup: dolar tahsilat (günün kuru, elle override, TL karşılığı kasaya),
// tüm danışmanlar tahsil edilince işlemin otomatik kapanması.
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, q } from "../fixtures";

async function seedClosing(employeeId: number, banka: number) {
  const [c] = await q(`INSERT INTO closings (property_address, sale_value, status, closing_date) VALUES ('E2E Tahsilat Mülkü', 1000000, 'expected', NOW()) RETURNING id`);
  const [s] = await q(`INSERT INTO closing_sides (closing_id, side_type, bhb_total) VALUES ($1, 'seller', 20000) RETURNING id`, [c.id]);
  const [a] = await q(
    `INSERT INTO closing_agents (closing_side_id, employee_id, split_percentage, bhb_share, main_branch_share, market_center_due, market_center_actual, employee_net, kasa, banka, nakit, status)
     VALUES ($1, $2, 100, 20000, 0, $3, $3, 15000, $3, $3, 0, 'expected') RETURNING id`, [s.id, employeeId, banka]);
  return { closingId: c.id as number, agentId: a.id as number };
}

test("günün kuru API'si ve USD tahsilat: TL karşılığı kasaya, kur elle verilebilir", async ({ page }) => {
  const adv = await createAdvisor("Tahsilat Dolar");
  const { agentId } = await seedClosing(adv.employeeId, 10000);
  await loginAs(page, "admin");

  const rate = await (await page.request.get("/api/exchange-rates/usd")).json();
  expect(rate.usdTry).toBeGreaterThan(0);
  expect(rate.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // Elle kur: 100 $ × 40 = 4.000 ₺
  let r = await page.request.post(`/api/closing-agents/${agentId}/collections`, { data: { method: "banka", currency: "USD", originalAmount: 100, fxRate: 40 } });
  expect(r.status()).toBe(201);
  let row = await r.json();
  expect(row).toMatchObject({ currency: "USD", originalAmount: "100.00", fxRate: "40.0000", amount: "4000.00" });

  // Kur verilmezse günün kuru uygulanır
  r = await page.request.post(`/api/closing-agents/${agentId}/collections`, { data: { method: "banka", currency: "USD", originalAmount: 10 } });
  expect(r.status()).toBe(201);
  row = await r.json();
  expect(Number(row.fxRate)).toBeCloseTo(rate.usdTry, 3);
  expect(Number(row.amount)).toBeCloseTo(10 * rate.usdTry, 1);

  // Geçersiz: dolar tutarı yok
  r = await page.request.post(`/api/closing-agents/${agentId}/collections`, { data: { method: "banka", currency: "USD" } });
  expect(r.status()).toBe(400);

  const [agent] = await q(`SELECT payment_collected FROM closing_agents WHERE id = $1`, [agentId]);
  expect(agent.payment_collected).toBe(false);   // 4.000 + ~500 < 10.000
});

test("tüm danışmanların tahsilatı tamamlanınca işlem otomatik kapanır", async ({ page }) => {
  const a1 = await createAdvisor("Tahsilat Bir");
  const { closingId, agentId } = await seedClosing(a1.employeeId, 5000);
  // İkinci danışman aynı kapanışta
  const a2 = await createAdvisor("Tahsilat Iki");
  const [side] = await q(`SELECT id FROM closing_sides WHERE closing_id = $1`, [closingId]);
  const [a2row] = await q(
    `INSERT INTO closing_agents (closing_side_id, employee_id, split_percentage, bhb_share, main_branch_share, market_center_due, market_center_actual, employee_net, kasa, banka, nakit, status)
     VALUES ($1, $2, 100, 20000, 0, 3000, 3000, 15000, 3000, 3000, 0, 'expected') RETURNING id`, [side.id, a2.employeeId]);
  await loginAs(page, "admin");

  await page.request.post(`/api/closing-agents/${agentId}/collections`, { data: { method: "banka", amount: 5000 } });
  let [c] = await q(`SELECT status FROM closings WHERE id = $1`, [closingId]);
  expect(c.status).toBe("expected");   // ikinci danışman bekliyor
  let [g1] = await q(`SELECT payment_collected, status FROM closing_agents WHERE id = $1`, [agentId]);
  expect(g1).toMatchObject({ payment_collected: true, status: "expected" });

  await page.request.post(`/api/closing-agents/${a2row.id}/collections`, { data: { method: "banka", amount: 3000 } });
  [c] = await q(`SELECT status FROM closings WHERE id = $1`, [closingId]);
  expect(c.status).toBe("completed");
  const rows = await q(`SELECT status, payment_collected FROM closing_agents WHERE closing_side_id = $1`, [side.id]);
  expect(rows.every((x: any) => x.status === "completed" && x.payment_collected === true)).toBe(true);
  // Tarihler: danışman satırlarına son tahsilat tarihi (bugün), kapanışa en büyük danışman tarihi yazılır
  const dated = await q(`SELECT closing_date::date::text AS d FROM closing_agents WHERE closing_side_id = $1`, [side.id]);
  const today = new Date().toISOString().slice(0, 10);
  expect(dated.every((x: any) => x.d === today)).toBe(true);
  const [cd] = await q(`SELECT closing_date::date::text AS d FROM closings WHERE id = $1`, [closingId]);
  expect(cd.d).toBe(today);
});

test("tahsilat dialogu: USD seçilince kur alanı günün kuruyla dolar, TL karşılığı gösterilir", async ({ page }) => {
  const adv = await createAdvisor("Tahsilat Dialog");
  await seedClosing(adv.employeeId, 10000);
  await loginAs(page, "admin");
  await page.goto("/closings");
  await page.getByPlaceholder(/Ara: adres/).fill("E2E Tahsilat Mülkü");
  const row = page.locator("tbody tr").filter({ hasText: adv.name }).first();
  await expect(row).toBeVisible();
  await row.getByTitle("Tahsilat gir (danışman bazlı, banka/nakit)").click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText(`Tahsilat — ${adv.name}`)).toBeVisible();

  await dlg.getByTestId("collection-currency").click();
  await page.getByRole("option", { name: "$ USD" }).click();
  await expect(dlg.getByTestId("collection-fx-rate")).not.toHaveValue("");
  await expect(dlg.getByTestId("collection-tl-preview")).toContainText("Günün kuru");
  await dlg.getByTestId("collection-amount").fill("100");
  await dlg.getByTestId("collection-fx-rate").fill("40");
  await expect(dlg.getByTestId("collection-tl-preview")).toContainText("4.000");
  await dlg.getByRole("button", { name: "Ekle" }).click();
  await expect(dlg.getByText("$100 × 40")).toBeVisible();
  await expect(dlg.getByText("4.000,00 ₺").first()).toBeVisible();
});
