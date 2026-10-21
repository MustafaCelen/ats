// Görsel tur: toplantı değişikliklerinin ekranlarını HM/asistan/admin gözüyle açar, ekran görüntüsü alır
// ve temel görünürlük kontrollerini yapar. (Görüntüler test-results/gorsel-*.png)
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, q, USERS } from "../fixtures";

test("HM: profil dialogunda DÜA kilitli, PK tarih alanları; menüde Koçluk Giriş/Çıkış Raporlar'da", async ({ page }) => {
  const a = await createAdvisor("Gorsel PK");
  await q(`UPDATE employees SET performans_kariyer_koclugu = TRUE, performans_kariyer_koclugu_manager_id = $2, pk_start_date = '2026-10-01' WHERE id = $1`, [a.employeeId, USERS.zeynep.id]);
  await loginAs(page, "zeynep");
  await page.goto(`/candidates/${a.candidateId}`);
  await page.getByRole("button", { name: /Düzenle/ }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  await dlg.getByText("Koçluk", { exact: true }).scrollIntoViewIfNeeded();
  const duaBtn = dlg.getByRole("button", { name: "DÜA", exact: true });
  await expect(duaBtn).toBeDisabled();
  await expect(dlg.getByText("PK Giriş Tarihi")).toBeVisible();
  await expect(dlg.locator('input[type="date"]').filter({ hasNot: page.locator("x") }).nth(0)).toBeVisible();
  await page.screenshot({ path: "test-results/gorsel-dialog-hm.png" });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Raporlar" }).click();
  await expect(page.getByRole("link", { name: "Koçluk Giriş/Çıkış" })).toBeVisible();
  await page.getByRole("button", { name: "Danışmanlar" }).click();
  await expect(page.getByRole("link", { name: "ÜK Giriş/Çıkış" })).toHaveCount(0);
});

test("admin: Takımlar, Kullanıcılar, Hedef Giriş, Kapanış Analizi ekranları", async ({ page }) => {
  const a = await createAdvisor("Gorsel Takim");
  await loginAs(page, "admin");
  const team = await (await page.request.post("/api/teams", { data: { name: "E2E Görsel Takım" } })).json();
  await page.request.post(`/api/teams/${team.id}/members`, { data: { employeeId: a.employeeId } });
  await page.goto("/teams");
  await page.getByText("E2E Görsel Takım", { exact: true }).click();
  await page.getByTestId("team-share-rate").fill("%15");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Paylaşım oranı kaydedildi", { exact: true })).toBeVisible();
  await page.getByTitle("Takımdan çıkar").first().click();
  await page.getByText("Ayrılan Üyeler").click();
  await expect(page.getByText(/Çıkış: \d{2}\.\d{2}\.\d{4}/)).toBeVisible();
  await page.screenshot({ path: "test-results/gorsel-takimlar.png" });

  await page.goto("/users");
  await expect(page.getByTestId(`hm-group-${USERS.zeynep.id}`)).toBeVisible();
  await page.screenshot({ path: "test-results/gorsel-kullanicilar.png" });

  await page.goto("/hedef-giris");
  await expect(page.getByText("Şirket Parası (₺)")).toBeVisible();
  await expect(page.getByTestId("capper-hedef")).toBeVisible();
  await page.screenshot({ path: "test-results/gorsel-hedef-giris.png" });

  await page.goto("/closing-analytics");
  await expect(page.getByText("Danışman Başına Aylık Şirket Parası").first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("BM Payı")).toHaveCount(0);

  await page.goto("/financial-reports");
  await expect(page.getByText("BM Payı")).toHaveCount(0);
  await page.getByRole("heading", { name: "Dönem İçi Giriş / Çıkış" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/gorsel-finansal.png" });
});

test("asistan: menüde Koçluk Giriş/Çıkış; sayfa açılır", async ({ page }) => {
  await q(`INSERT INTO users (name, email, password_hash, role) SELECT 'E2E Asistan', 'e2e-asistan@example.invalid', password_hash, 'assistant' FROM users WHERE id = 1 ON CONFLICT (email) DO NOTHING`);
  await page.request.post("/api/auth/login", { data: { email: "e2e-asistan@example.invalid", password: USERS.admin.password } });
  await page.goto("/tasks");
  await expect(page.getByRole("link", { name: "Koçluk Giriş/Çıkış" })).toBeVisible();
  await page.getByRole("link", { name: "Koçluk Giriş/Çıkış" }).click();
  await expect(page.getByRole("heading", { name: /Koçluk Giriş \/ Çıkış/ })).toBeVisible();
  await expect(page.getByTestId("coaching-type-tabs")).toBeVisible();
});
