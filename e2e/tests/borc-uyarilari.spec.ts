// Fonzip borcu: profilde Borç sekmesi + mutabakat, pasife alırken onay, işlem kapanışında uyarı.
// Borç verisi sahte Fonzip kayıtlarıyla (negatif fonzip id) oluşturulur.
import { test, expect, type Page } from "@playwright/test";
import { loginAs, createAdvisor, seedDebt, q, type Advisor } from "../fixtures";

let borclu: Advisor;
let temiz: Advisor;
test.beforeEach(async () => {
  borclu = await createAdvisor("Borclu Danisman");
  temiz = await createAdvisor("Borcsuz Danisman");
  // 2 açık kalem (1.500 + 1.000 = 2.500), Fonzip bakiyesi 1.800 → 700 kaleme bağlanmamış tahsilat
  await seedDebt(borclu, 1800, [{ amount: 1500, details: "E2E Ekim aidatı" }, { amount: 1000, details: "E2E Masa ücreti" }]);
});

async function openEmployeeMenu(page: Page, a: Advisor) {
  await page.goto("/employees");
  await page.getByTestId("input-search-employees").fill(a.kwuid);
  const menu = page.getByTestId(`menu-employee-${a.employeeId}`);
  await menu.hover();
  await menu.click({ force: true });
}

test("aday profili: borç özeti → Borç sekmesi, mutabakat rakamları", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto(`/candidates/${borclu.candidateId}`);
  const ozet = page.getByRole("button", { name: /Fonzip borcu/ });
  await expect(ozet).toContainText("1.800");
  await expect(ozet).toContainText("2 ödenmemiş kalem");
  await ozet.click();

  await expect(page.getByText("Fonzip Borç Durumu")).toBeVisible();
  await expect(page.getByText("Açık Kalemler (2)").locator("..")).toContainText("2.500");
  await expect(page.getByText("Kaleme Bağlanmamış Tahsilat").locator("..")).toContainText("700");
  await expect(page.getByText("Fonzip Bakiyesi (net borç)").locator("..")).toContainText("1.800");
  await expect(page.getByText("E2E Ekim aidatı")).toBeVisible();
  await expect(page.getByText("E2E Masa ücreti")).toBeVisible();
});

test("borcu olmayan danışmanda borç özeti çıkmaz", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto(`/candidates/${temiz.candidateId}`);
  await expect(page.getByRole("heading", { name: temiz.name }).or(page.getByText(temiz.name).first())).toBeVisible();
  await expect(page.getByRole("button", { name: /Fonzip borcu/ })).toHaveCount(0);
});

test("Danışmanlar → Detaylar: Borç sekmesi", async ({ page }) => {
  await loginAs(page, "admin");
  await openEmployeeMenu(page, borclu);
  await page.getByTestId(`view-employee-${borclu.employeeId}`).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: /Borç/ }).first().click();
  await expect(dlg.getByText("Fonzip Bakiyesi (net borç)")).toBeVisible();
  await expect(dlg.getByText("E2E Ekim aidatı")).toBeVisible();
});

test("pasife alırken borç uyarısı: onay kutusu işaretlenmeden buton kapalı", async ({ page }) => {
  await loginAs(page, "admin");
  await openEmployeeMenu(page, borclu);
  await page.getByTestId(`toggle-status-${borclu.employeeId}`).click();

  const dlg = page.getByRole("dialog").filter({ hasText: "Pasife Al —" });
  await expect(dlg).toContainText("borcu var");
  await expect(dlg).toContainText("E2E Ekim aidatı");
  const btn = dlg.getByRole("button", { name: "Pasife Al", exact: true });
  await expect(btn).toBeDisabled();
  await dlg.getByLabel("Borcu gördüm, yine de pasife al").check();
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect.poll(async () => (await q(`SELECT status FROM employees WHERE id = $1`, [borclu.employeeId]))[0].status).toBe("inactive");
});

test("borcu olmayan danışman uyarısız pasife alınır", async ({ page }) => {
  await loginAs(page, "admin");
  await openEmployeeMenu(page, temiz);
  await page.getByTestId(`toggle-status-${temiz.employeeId}`).click();
  const dlg = page.getByRole("dialog").filter({ hasText: "Pasife Al —" });
  await expect(dlg).not.toContainText("borcu var");
  await expect(dlg.getByRole("button", { name: "Pasife Al", exact: true })).toBeEnabled();
  await dlg.getByRole("button", { name: "İptal" }).click();
  expect((await q(`SELECT status FROM employees WHERE id = $1`, [temiz.employeeId]))[0].status).toBe("active");
});

test("işlem kapanışı: borçlu danışman seçilince uyarı, kaydederken onay; Vazgeç kaydetmez", async ({ page }) => {
  const before = (await q(`SELECT count(*)::int AS n FROM closings`))[0].n;
  await loginAs(page, "admin");
  await page.goto("/closings");
  await page.getByRole("button", { name: "Yeni Kapanış" }).click();
  const dlg = page.getByRole("dialog").filter({ hasText: "Yeni Kapanış" });

  await dlg.getByText(/Satış Bedeli \(₺\)/).locator("..").locator("input").fill("5000000");
  await dlg.getByRole("button", { name: "Alıcı Tarafı", exact: true }).click();
  await dlg.getByRole("combobox").filter({ hasText: "Danışman seç" }).first().click();
  await page.getByPlaceholder("Ara: ad veya KWUID...").fill(borclu.kwuid);
  await page.getByRole("option").filter({ hasText: borclu.name }).first().click();

  await expect(dlg.getByText("Borçlu danışman:").locator("..")).toContainText("1.800");
  await dlg.getByRole("button", { name: "Kaydet", exact: true }).click();

  const alert = page.getByRole("alertdialog");
  await expect(alert.getByText("Borçlu danışman uyarısı")).toBeVisible();
  await expect(alert).toContainText(borclu.name);
  await expect(alert).toContainText("2 açık kalem");
  await expect(alert.getByRole("button", { name: "Borcu gördüm, kaydet" })).toBeVisible();
  await alert.getByRole("button", { name: "Vazgeç" }).click();
  await expect(alert).toHaveCount(0);
  await expect(dlg).toBeVisible();   // form açık kalır
  expect((await q(`SELECT count(*)::int AS n FROM closings`))[0].n).toBe(before);
});
