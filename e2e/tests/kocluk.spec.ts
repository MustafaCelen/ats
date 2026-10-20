// Toplantı (2026-10-20) 2. grup: koçluk tekilliği (ÜK/PK/DÜA'dan yalnız biri), DÜA yalnız admin,
// PK/DÜA giriş-çıkış tarihleri + Koçluk Giriş/Çıkış raporu, tarihli takım üyeliği + paylaşım oranı,
// HM grup alt toplamlı Sorumlu Yönetici Verimliliği.
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, q, USERS, todayIst } from "../fixtures";

test("tekillik: PK açılınca ÜK kapanır, tarihler otomatik dolar; iki tip birden reddedilir", async ({ page }) => {
  const a = await createAdvisor("Kocluk Tekil");
  await loginAs(page, "admin");
  let r = await page.request.patch(`/api/employees/${a.employeeId}`, { data: { uretkenlikKoclugu: true, uretkenlikKocluguManagerId: USERS.zeynep.id, uretkenlikKocluguOran: "5%" } });
  expect(r.status()).toBe(200);
  r = await page.request.patch(`/api/employees/${a.employeeId}`, { data: { performansKariyerKoclugu: true, performansKariyerKocluguManagerId: USERS.mehmet.id } });
  expect(r.status()).toBe(200);
  const [e] = await q(`SELECT uretkenlik_koclugu uk, uretkenlik_koclugu_manager_id ukm, uk_end_date, performans_kariyer_koclugu pk, pk_start_date, pk_end_date FROM employees WHERE id = $1`, [a.employeeId]);
  expect(e).toMatchObject({ uk: false, ukm: null, uk_end_date: todayIst(), pk: true, pk_start_date: todayIst(), pk_end_date: null });

  r = await page.request.patch(`/api/employees/${a.employeeId}`, { data: { uretkenlikKoclugu: true, dua: true } });
  expect(r.status()).toBe(400);
  expect((await r.json()).message).toContain("yalnız bir koçlukta");

  // PK kapanınca çıkış tarihi bugün
  r = await page.request.patch(`/api/employees/${a.employeeId}`, { data: { performansKariyerKoclugu: false, performansKariyerKocluguManagerId: null } });
  expect(r.status()).toBe(200);
  const [e2] = await q(`SELECT pk_end_date FROM employees WHERE id = $1`, [a.employeeId]);
  expect(e2.pk_end_date).toBe(todayIst());
});

test("yetki: DÜA yalnız admin; HM ÜK ve PK atayabilir; DÜA'daki danışmanı HM başka tipe alamaz", async ({ page }) => {
  const a = await createAdvisor("Kocluk Yetki");
  await loginAs(page, "zeynep");
  let r = await page.request.patch(`/api/employees/${a.employeeId}`, { data: { dua: true, duaManagerId: USERS.zeynep.id } });
  expect(r.status()).toBe(403);
  r = await page.request.patch(`/api/employees/${a.employeeId}`, { data: { performansKariyerKoclugu: true, performansKariyerKocluguManagerId: USERS.zeynep.id } });
  expect(r.status()).toBe(200);
  r = await page.request.patch(`/api/employees/${a.employeeId}`, { data: { uretkenlikKoclugu: true, uretkenlikKocluguManagerId: USERS.zeynep.id, uretkenlikKocluguOran: "5%" } });
  expect(r.status()).toBe(200);
  const [e] = await q(`SELECT uretkenlik_koclugu uk, performans_kariyer_koclugu pk, dua FROM employees WHERE id = $1`, [a.employeeId]);
  expect(e).toMatchObject({ uk: true, pk: false, dua: false });

  // Admin DÜA'ya alır; HM ÜK'ya geri alamaz (DÜA'dan çıkarma = admin)
  await q(`UPDATE employees SET uretkenlik_koclugu = FALSE, dua = TRUE, dua_manager_id = $2, dua_start_date = $3 WHERE id = $1`, [a.employeeId, USERS.mehmet.id, todayIst()]);
  r = await page.request.patch(`/api/employees/${a.employeeId}`, { data: { uretkenlikKoclugu: true, uretkenlikKocluguManagerId: USERS.zeynep.id, uretkenlikKocluguOran: "5%" } });
  expect(r.status()).toBe(403);
  // Koçlukla ilgisiz alanı HM yine güncelleyebilir
  r = await page.request.patch(`/api/employees/${a.employeeId}`, { data: { title: "E2E Unvan" } });
  expect(r.status()).toBe(200);
});

test("Koçluk Giriş/Çıkış raporu: PK sekmesi giriş ve çıkışı listeler; menüde Raporlar altında", async ({ page }) => {
  const giren = await createAdvisor("PK Giren");
  const cikan = await createAdvisor("PK Cikan");
  await q(`UPDATE employees SET performans_kariyer_koclugu = TRUE, pk_start_date = $2 WHERE id = $1`, [giren.employeeId, todayIst()]);
  await q(`UPDATE employees SET performans_kariyer_koclugu = FALSE, pk_start_date = '2020-01-01', pk_end_date = $2 WHERE id = $1`, [cikan.employeeId, todayIst()]);
  await loginAs(page, "admin");
  await page.goto("/uk-entry-exit");
  await expect(page.getByRole("heading", { name: /Koçluk Giriş \/ Çıkış/ })).toBeVisible();
  await expect(page.getByText(giren.name)).toHaveCount(0);   // ÜK sekmesinde değil
  await page.getByTestId("coaching-type-tabs").getByRole("button", { name: "PK", exact: true }).click();
  const giris = page.locator("div.rounded-xl").filter({ hasText: "Giriş Yapanlar" }).first();
  const cikis = page.locator("div.rounded-xl").filter({ hasText: "Çıkış Yapanlar" }).first();
  await expect(giris.getByText(giren.name)).toBeVisible();
  await expect(cikis.getByText(cikan.name)).toBeVisible();
  await expect(giris.getByText(cikan.name)).toHaveCount(0);

  // Menü: Raporlar grubunda (sayfa bu grupta olduğundan grup zaten açık gelir)
  const link = page.getByRole("link", { name: "Koçluk Giriş/Çıkış" });
  if (!(await link.isVisible())) await page.getByRole("button", { name: "Raporlar" }).click();
  await expect(link).toBeVisible();
  await expect(page.getByRole("link", { name: "ÜK Giriş/Çıkış" })).toHaveCount(0);
});

test("takım: tarihli üyelik (giriş/çıkış) ve paylaşım oranı", async ({ page }) => {
  const a = await createAdvisor("Takim Uye");
  await loginAs(page, "admin");
  const team = await (await page.request.post("/api/teams", { data: { name: "E2E Takım" } })).json();
  expect(await (await page.request.post(`/api/teams/${team.id}/members`, { data: { employeeId: a.employeeId } })).json()).toEqual({ ok: true });
  let t = (await (await page.request.get("/api/teams")).json()).find((x: any) => x.id === team.id);
  expect(t.memberIds).toEqual([a.employeeId]);
  expect(t.members).toEqual([{ employeeId: a.employeeId, joinedAt: todayIst(), leftAt: null }]);

  const r = await page.request.patch(`/api/teams/${team.id}`, { data: { shareRate: "%10" } });
  expect((await r.json()).shareRate).toBe("%10");

  // UI: üye satırında giriş tarihi, oran alanı dolu
  await page.goto("/teams");
  await page.getByText("E2E Takım", { exact: true }).click();
  await expect(page.getByTestId("team-share-rate")).toHaveValue("%10");
  await expect(page.getByText(`Giriş: ${todayIst().split("-").reverse().join(".")}`).first()).toBeVisible();

  // Çıkar: satır silinmez, left_at yazılır; "Ayrılan Üyeler" bölümü görünür
  await page.getByTitle("Takımdan çıkar").first().click();
  await expect(page.getByText("Ayrılan Üyeler")).toBeVisible();
  t = (await (await page.request.get("/api/teams")).json()).find((x: any) => x.id === team.id);
  expect(t.memberIds).toEqual([]);
  expect(t.members[0]).toMatchObject({ employeeId: a.employeeId, leftAt: todayIst() });
  const [row] = await q(`SELECT left_at FROM team_members WHERE team_id = $1 AND employee_id = $2`, [team.id, a.employeeId]);
  expect(row.left_at).toBe(todayIst());

  // Yeniden ekle: aynı satır açılır
  await page.request.post(`/api/teams/${team.id}/members`, { data: { employeeId: a.employeeId } });
  t = (await (await page.request.get("/api/teams")).json()).find((x: any) => x.id === team.id);
  expect(t.members).toHaveLength(1);
  expect(t.members[0].leftAt).toBeNull();
});

test("HM grupları: Kullanıcılar'da grup alanı, Üretim Bandı raporunda grup alt toplamı", async ({ page }) => {
  await loginAs(page, "admin");
  await page.request.patch(`/api/users/${USERS.zeynep.id}`, { data: { hmGroup: "E2E Grup A" } });
  await page.request.patch(`/api/users/${USERS.mehmet.id}`, { data: { hmGroup: "E2E Grup B" } });
  await page.goto("/users");
  await expect(page.getByTestId(`hm-group-${USERS.zeynep.id}`)).toHaveValue("E2E Grup A");

  await page.goto("/reports");
  await expect(page.getByTestId("hm-group-E2E Grup A")).toBeVisible();
  await expect(page.getByTestId("hm-group-sum-E2E Grup A")).toContainText("E2E Grup A toplamı");
  await expect(page.getByTestId("hm-group-sum-E2E Grup B")).toBeVisible();
  await expect(page.getByTestId("hm-grand-total")).toContainText("Genel toplam");
  const grupA = page.getByTestId("hm-group-E2E Grup A");
  await expect(grupA.locator("xpath=following-sibling::tr[1]")).toContainText("Zeynep Yilmaz");
});
