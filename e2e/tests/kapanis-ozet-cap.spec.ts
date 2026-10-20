// Toplantı (2026-10-20) 1. grup: Kapanışlar özeti rename/İşlem Hacmi kaldırma, danışman adı → profil
// linki, Finansal Raporlar scroll + cap bölümlerinin Cap Analizi'ne taşınması.
import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures";

test("Kapanışlar özeti: İşlem Adedi / Şirket Parası, İşlem Hacmi yok, Hedefe Kalan gerçekleşen", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/closings");
  const summary = page.locator("table").first();
  await expect(summary.locator("thead")).toContainText("İşlem Adedi");
  await expect(summary.locator("thead")).toContainText("Şirket Parası");
  await expect(summary.locator("thead")).not.toContainText("İşlem Hacmi");
  await expect(summary.locator("thead")).not.toContainText(/Kapanış(?! )/);
  await expect(summary.locator("thead th")).toHaveCount(4);
  // Her satırda 4 hücre (boş etiket + 3 metrik)
  for (const tr of await summary.locator("tbody tr").all()) await expect(tr.locator("td")).toHaveCount(4);
  await expect(summary).toContainText("Yaklaşık Projeksiyon");
  await expect(summary).toContainText("En İyi Senaryo");
  await page.screenshot({ path: "test-results/kapanis-ozet.png", fullPage: false });
});

test("Kapanış listesinde danışman adı profil linkidir", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/closings");
  const links = page.locator('a[title="Danışman profilini aç"]');
  await expect(links.first()).toBeVisible();
  const href = await links.first().getAttribute("href");
  expect(href).toMatch(/^\/candidates\/\d+$/);
  await links.first().click();
  await expect(page).toHaveURL(/\/candidates\/\d+$/);
});

test("Finansal Raporlar: cap listeleri yok, tablolar sabit yükseklikte kayar, etiketler yeni", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/financial-reports");
  await expect(page.getByRole("heading", { name: "Özet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cap Yapanlar" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Cap Yenileme Takvimi" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Yeni Capper Olanlar" })).toBeVisible();   // dönem bazlı, kalır
  await expect(page.getByText("Şirket Parası").first()).toBeVisible();
  await expect(page.getByText("BM Payı")).toHaveCount(0);
  const agentTable = page.locator("div.rounded-xl").filter({ has: page.getByRole("heading", { name: "Danışman Performans Tablosu" }) });
  // Seçili ayda kapanış yoksa tablo çizilmez: veri olan aya kadar geri git
  const prevBtn = page.locator("button").filter({ has: page.locator("svg.lucide-chevron-left") }).first();
  for (let i = 0; i < 24 && (await agentTable.locator("table").count()) === 0; i++) {
    await prevBtn.click();
    await page.waitForTimeout(400);
  }
  await expect(agentTable.locator("div.max-h-\\[520px\\]")).toHaveCount(1);
  await expect(agentTable.locator("thead.sticky")).toHaveCount(1);
  await expect(agentTable).toContainText("İşlem Adedi");
});

test("Cap Analizi: güncel cap durumu panelleri sayfanın altında", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/cap-report");
  await expect(page.getByRole("heading", { name: "Güncel Cap Durumu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cap Yenileme Takvimi" })).toBeVisible();
  for (const h of ["Cap Yapanlar", "Cap'e Yaklaşanlar", "Cap Yapabilecekler"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
  await expect(page.getByText(/\d+ danışman/).first()).toBeVisible();
  await page.getByRole("heading", { name: "Güncel Cap Durumu" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/cap-analizi-alt.png", fullPage: false });
});
