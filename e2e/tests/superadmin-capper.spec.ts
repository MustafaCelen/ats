// Toplantı (2026-10-20) 4. grup: Super admin rolü (Kullanıcılar, Danışman Birleştir, Duplike Kapanışlar,
// Fonzip, WhatsApp Toplu yalnız super admin) ve yıllık capper hedefi.
import { test, expect, type Page } from "@playwright/test";
import { loginAs, q, USERS } from "../fixtures";

async function loginPlainAdmin(page: Page) {
  await q(`INSERT INTO users (name, email, password_hash, role) SELECT 'E2E Admin', 'e2e-admin@example.invalid', password_hash, 'admin' FROM users WHERE id = 1 ON CONFLICT (email) DO NOTHING`);
  const [u] = await q(`SELECT id FROM users WHERE email = 'e2e-admin@example.invalid'`);
  const r = await page.request.post("/api/auth/login", { data: { email: "e2e-admin@example.invalid", password: USERS.admin.password } });
  expect(r.status()).toBe(200);
  return u.id as number;
}

test("super admin: Kullanıcılar ve Fonzip erişimi; menüde görünür", async ({ page }) => {
  await loginAs(page, "admin");
  expect((await page.request.get("/api/fonzip/status")).status()).toBe(200);
  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Kullanıcı Yönetimi" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kullanıcılar" })).toBeVisible();
  await expect(page.getByText("Super Admin", { exact: true }).first()).toBeVisible();
});

test("sıradan admin: super admin modüllerine giremez, menüde görmez; super admin yetki verebilir", async ({ page }) => {
  const id = await loginPlainAdmin(page);
  expect((await page.request.get("/api/fonzip/status")).status()).toBe(403);
  expect((await page.request.get("/api/candidates/duplicates")).status()).toBe(403);
  expect((await page.request.get("/api/closings/duplicates")).status()).toBe(403);
  expect((await page.request.get("/api/whatsapp/templates")).status()).toBe(403);
  expect((await page.request.patch(`/api/users/${USERS.zeynep.id}`, { data: { hmGroup: "E2E X" } })).status()).toBe(403);
  expect((await page.request.get("/api/users")).status()).toBe(200);   // HM listeleri için okuma kalır
  // Admin işleri çalışmaya devam eder
  expect((await page.request.get("/api/employees/cap-statuses")).status()).toBe(200);

  await page.goto("/users");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Kullanıcılar" })).toHaveCount(0);
  await page.getByRole("button", { name: "İşlemler & Finans" }).click();
  await expect(page.getByRole("link", { name: "İşlem Kapanış" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fonzip" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Duplike Kapanışlar" })).toHaveCount(0);

  // Super admin yetki verir → erişim açılır
  await page.request.post("/api/auth/logout").catch(() => {});
  await loginAs(page, "admin");
  expect((await page.request.patch(`/api/users/${USERS.admin.id}`, { data: { isSuperAdmin: false } })).status()).toBe(400);   // kendi yetkisini kaldıramaz
  expect((await page.request.patch(`/api/users/${USERS.zeynep.id}`, { data: { isSuperAdmin: true } })).status()).toBe(400);   // HM super admin olamaz
  await page.goto("/users");
  await page.getByTestId(`btn-super-admin-${id}`).click();
  await expect(page.getByTestId(`btn-super-admin-${id}`)).toContainText("Super ✓");
  const [u] = await q(`SELECT is_super_admin FROM users WHERE id = $1`, [id]);
  expect(u.is_super_admin).toBe(true);

  await page.request.post("/api/auth/logout").catch(() => {});
  await page.request.post("/api/auth/login", { data: { email: "e2e-admin@example.invalid", password: USERS.admin.password } });
  expect((await page.request.get("/api/fonzip/status")).status()).toBe(200);
});

test("capper hedefi: Hedef Giriş'te ofis bazlı giriş, Cap Analizi'nde gerçekleşen / hedef", async ({ page }) => {
  await loginAs(page, "admin");
  const year = new Date().getFullYear();
  const before = await (await page.request.get(`/api/capper-targets?year=${year}`)).json();
  try {
    expect((await page.request.put("/api/capper-targets", { data: { year: 2099, office: "Akatlar", target: 7 } })).status()).toBe(200);
    expect((await (await page.request.get("/api/capper-targets?year=2099")).json())).toMatchObject({ total: 7, byOffice: { Akatlar: 7 } });
    expect((await page.request.put("/api/capper-targets", { data: { year: 2099, office: "Akatlar", target: -1 } })).status()).toBe(400);

    await page.goto("/hedef-giris");
    const card = page.getByTestId("capper-hedef");
    await expect(card).toBeVisible();
    await card.getByTestId("capper-hedef-Akatlar").fill("5");
    await card.getByTestId("capper-hedef-Akatlar").press("Enter");
    await card.getByTestId("capper-hedef-Zekeriyaköy").fill("3");
    await card.getByTestId("capper-hedef-Zekeriyaköy").press("Enter");
    await expect(card).toContainText("Toplam: 8");
    await expect.poll(async () => (await (await page.request.get(`/api/capper-targets?year=${year}`)).json()).total).toBe(8);

    await page.goto("/cap-report");
    await expect(page.getByTestId("capper-target-chip")).toContainText(`${year} capper hedefi: 8`);
    await expect(page.getByTestId("capper-target-chip")).toContainText("Akatlar 5");
    await expect(page.getByTestId("cappers-vs-target")).toContainText("/ hedef 8");
  } finally {
    for (const o of ["Akatlar", "Zekeriyaköy"]) {
      await page.request.put("/api/capper-targets", { data: { year, office: o, target: before?.byOffice?.[o] ?? 0 } });
    }
  }
});
