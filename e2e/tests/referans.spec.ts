// Aday referansı → danışman eşleştirme (45+45 Katkı Payı): form önerisi, kaydetme onayı,
// karar hafızası, Referans Eşleştirme ekranı.
import { test, expect, type Page } from "@playwright/test";
import { loginAs, createAdvisor, createCandidate, q, pickEmployee, type Advisor } from "../fixtures";

let kerem: Advisor;
test.beforeAll(async () => {
  kerem = await createAdvisor("Kerem Tunçalp");
  // Aynı isimde iki kayıt (mükerrer) → otomatik bağlanmamalı
  await createAdvisor("Selin Aksoy", { status: "inactive" });
  await createAdvisor("Selin Aksoy", { status: "inactive" });
});

const refInput = (page: Page) => page.getByPlaceholder("Ad Soyad veya kaynak — danışmansa listeden seçin");
const linkedTo = async (candidateId: number) =>
  (await q(`SELECT referred_by_employee_id AS id FROM candidates WHERE id = $1`, [candidateId]))[0].id as number | null;

async function openEdit(page: Page, candidateId: number) {
  await page.goto(`/candidates/${candidateId}`);
  await page.getByRole("button", { name: /Profili Düzenle/ }).click();
  await expect(refInput(page)).toBeVisible();
}
async function typeRef(page: Page, text: string) {
  await refInput(page).fill("");
  await refInput(page).pressSequentially(text, { delay: 20 });
}
const closeDropdown = (page: Page) => page.getByText("Beklenen Başlangıç Ayı").click();
const saveEdit = (page: Page) => page.getByRole("button", { name: "Kaydet", exact: true }).click();

test("yeni aday formu: yazarken danışman önerisi, seçince bağlanır", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/candidates");
  await page.getByRole("button", { name: "Aday Ekle" }).click();
  await page.getByTestId("category-option-K0").click();
  await page.getByTestId("input-candidate-name").fill("E2E Formdan Aday");
  await page.getByTestId("input-candidate-phone").fill("05" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0"));
  await page.getByRole("combobox").filter({ hasText: "Ofis seçin..." }).click();
  await page.getByRole("option", { name: "Akatlar" }).click();

  await typeRef(page, "e2e kerem tuncalp");
  const option = page.getByRole("button", { name: /E2E Kerem Tunçalp/ }).filter({ hasText: "birebir" });
  await expect(option).toBeVisible();
  await expect(page.getByText(/dış referans olarak kalsın/)).toBeVisible();
  await option.click();
  await expect(page.getByText("Danışman:").locator("..")).toContainText("E2E Kerem Tunçalp");
  await expect(page.getByText("Danışman:").locator("..")).toContainText(kerem.kwuid);

  await page.getByRole("button", { name: "Adayı Ekle" }).click();
  await expect.poll(async () => (await q(`SELECT referred_by, referred_by_employee_id AS id FROM candidates WHERE name = 'E2E Formdan Aday'`))[0])
    .toMatchObject({ referred_by: "E2E Kerem Tunçalp", id: kerem.employeeId });
});

test("düzenle: birebir isim sormadan otomatik bağlanır ve profilde rozet çıkar", async ({ page }) => {
  const c = await createCandidate("Ref Birebir");
  await loginAs(page, "admin");
  await openEdit(page, c.id);
  await typeRef(page, "KEREM TUNÇALP E2E");    // büyük harf + ters sıra
  await closeDropdown(page);
  await saveEdit(page);
  await expect(page.getByText("Bu kişi danışmanımız mı?")).toHaveCount(0);
  await expect.poll(() => linkedTo(c.id)).toBe(kerem.employeeId);
  await page.reload();
  await expect(page.locator("span", { hasText: /^Danışman$/ }).first()).toBeVisible();
});

test("düzenle: benzer isim → 'Bu kişi danışmanımız mı?' → Evet bağlar", async ({ page }) => {
  const c = await createCandidate("Ref Benzer Evet");
  await loginAs(page, "admin");
  await openEdit(page, c.id);
  await typeRef(page, "E2E Krem Tunçalp");
  await closeDropdown(page);
  await saveEdit(page);
  const dlg = page.getByRole("dialog").filter({ hasText: "Bu kişi danışmanımız mı?" });
  await expect(dlg).toContainText("E2E Krem Tunçalp");
  await dlg.getByRole("button", { name: /E2E Kerem Tunçalp/ }).click();
  await expect.poll(() => linkedTo(c.id)).toBe(kerem.employeeId);
});

test("düzenle: Vazgeç kaydetmez; 'Hayır, dış referans' hatırlanır", async ({ page }) => {
  const c1 = await createCandidate("Ref Dis 1");
  const c2 = await createCandidate("Ref Dis 2");
  await loginAs(page, "admin");
  await openEdit(page, c1.id);
  await typeRef(page, "E2E Kerem Tunçal");
  await closeDropdown(page);
  await saveEdit(page);
  const dlg = page.getByRole("dialog").filter({ hasText: "Bu kişi danışmanımız mı?" });
  await dlg.getByRole("button", { name: "Vazgeç" }).click();
  await expect(page.getByText(/Profili Düzenle —/)).toBeVisible();   // düzenleme açık kaldı
  expect((await q(`SELECT referred_by FROM candidates WHERE id = $1`, [c1.id]))[0].referred_by).toBeNull();

  await saveEdit(page);
  await dlg.getByRole("button", { name: "Hayır, dış referans" }).click();
  await expect.poll(async () => (await q(`SELECT referred_by FROM candidates WHERE id = $1`, [c1.id]))[0].referred_by).toBe("E2E Kerem Tunçal");
  expect(await linkedTo(c1.id)).toBeNull();

  // Aynı metin başka adayda: soru gelmez, bağlanmaz
  await openEdit(page, c2.id);
  await typeRef(page, "E2E Kerem Tunçal");
  await closeDropdown(page);
  await saveEdit(page);
  await expect(page.getByText("Bu kişi danışmanımız mı?")).toHaveCount(0);
  await expect.poll(async () => (await q(`SELECT referred_by FROM candidates WHERE id = $1`, [c2.id]))[0].referred_by).toBe("E2E Kerem Tunçal");
  expect(await linkedTo(c2.id)).toBeNull();
});

test("düzenle: aynı isimde birden çok danışman → otomatik bağlamaz, sorar", async ({ page }) => {
  const c = await createCandidate("Ref Mukerrer");
  await loginAs(page, "admin");
  await openEdit(page, c.id);
  await typeRef(page, "E2E Selin Aksoy");
  await closeDropdown(page);
  await saveEdit(page);
  const dlg = page.getByRole("dialog").filter({ hasText: "Bu kişi danışmanımız mı?" });
  await expect(dlg.getByRole("button", { name: /E2E Selin Aksoy/ })).toHaveCount(2);
  await dlg.getByRole("button", { name: "Hayır, dış referans" }).click();
  await expect.poll(async () => (await q(`SELECT referred_by FROM candidates WHERE id = $1`, [c.id]))[0].referred_by).toBe("E2E Selin Aksoy");
  expect(await linkedTo(c.id)).toBeNull();
});

test("bağlı referansı X ile kaldırınca yalnız o aday dış referans olur", async ({ page }) => {
  const c = await createCandidate("Ref Kaldir", "E2E Kerem Tunçalp", kerem.employeeId);
  await loginAs(page, "admin");
  await openEdit(page, c.id);
  await page.getByTitle("Danışman bağlantısını kaldır (dış referans)").click();
  await expect(page.getByText("Dış referans", { exact: true })).toBeVisible();
  await saveEdit(page);
  await expect.poll(() => linkedTo(c.id)).toBeNull();
  expect((await q(`SELECT referral_external FROM candidates WHERE id = $1`, [c.id]))[0].referral_external).toBe(true);

  // Tekrar açınca karar korunur; başka bir şey değiştirip kaydetmek yeniden bağlamaz
  await openEdit(page, c.id);
  await expect(page.getByText("Dış referans", { exact: true })).toBeVisible();
  await saveEdit(page);
  await expect.poll(() => linkedTo(c.id)).toBeNull();

  // Danışmanın birebir adı genel olarak kara listeye girmez: başka aday yine otomatik bağlanır
  const baska = await createCandidate("Ref Kaldir Baska");
  await openEdit(page, baska.id);
  await typeRef(page, "E2E Kerem Tunçalp");
  await closeDropdown(page);
  await saveEdit(page);
  await expect.poll(() => linkedTo(baska.id)).toBe(kerem.employeeId);
});

test.describe("Referans Eşleştirme ekranı", () => {
  test("öneriyle bağla, birebir eşleşenleri bağla, başka danışman seç, dış referans + geri al", async ({ page }) => {
    const f1 = await createCandidate("Ekran Fuzzy 1", "E2E Krem Tunçalp");
    const f2 = await createCandidate("Ekran Fuzzy 2", "e2e  krem  TUNÇALP");
    const ex = await createCandidate("Ekran Birebir", "e2e kerem tuncalp");
    const el = await createCandidate("Ekran Elle", "E2E Kuzenim Ayşe");
    await createCandidate("Ekran Dis", "E2E Bakkal Hasan");

    await loginAs(page, "zeynep");   // hiring manager erişebilir
    await page.goto("/referans-eslestirme");
    await expect(page.getByRole("heading", { name: /Referans Eşleştirme/ })).toBeVisible();
    await page.getByPlaceholder("Referans veya aday ara…").fill("E2E");
    const row = (text: string) => page.locator("tbody tr").filter({ hasText: text });

    // Aynı metnin farklı yazımları tek satırda
    const fuzzy = row("E2E Krem Tunçalp");
    await expect(fuzzy).toContainText("2 aday");
    await expect(fuzzy).toContainText("E2E Kerem Tunçalp");
    await expect(row("e2e kerem tuncalp")).toContainText("birebir");

    // Birebir eşleşenleri bağla (yalnızca bekleyen tek birebir bizimkiyse — gerçek veriye dokunmamak için)
    const bulk = page.getByRole("button", { name: /Birebir eşleşenleri bağla/ });
    if ((await bulk.textContent())?.includes("(1 aday)")) await bulk.click();
    else await row("e2e kerem tuncalp").getByRole("button", { name: "Bağla" }).first().click();
    await expect.poll(() => linkedTo(ex.id)).toBe(kerem.employeeId);

    await fuzzy.getByRole("button", { name: "Bağla" }).first().click();
    await expect(page.getByText("2 aday danışmana bağlandı").first()).toBeVisible();
    await expect.poll(async () => [await linkedTo(f1.id), await linkedTo(f2.id)]).toEqual([kerem.employeeId, kerem.employeeId]);
    await expect(row("E2E Krem Tunçalp")).toHaveCount(0);

    // Öneri yok → Tümü'de görünür; listeden başka danışman seçip bağla
    await page.getByRole("button", { name: "Tümü", exact: true }).click();
    await pickEmployee(page, "Danışman seç…", "E2E Kerem Tunçalp", row("E2E Kuzenim Ayşe"));
    await row("E2E Kuzenim Ayşe").getByRole("button", { name: "Bağla" }).last().click();
    await expect.poll(() => linkedTo(el.id)).toBe(kerem.employeeId);

    // Dış referans → listeden çıkar → geri al → geri gelir
    await row("E2E Bakkal Hasan").getByRole("button", { name: /Dış referans/ }).click();
    await expect(row("E2E Bakkal Hasan")).toHaveCount(0);
    await page.getByText(/Dış referans olarak işaretlenenler/).click();
    const ext = page.locator("details div").filter({ hasText: "E2E Bakkal Hasan" }).last();
    await ext.getByRole("button", { name: "Geri al" }).click();
    await expect(row("E2E Bakkal Hasan")).toBeVisible();
  });

  test("öğrenilen yazım: ekranda bağlanan metin yeni kayıtta otomatik bağlanır", async ({ page }) => {
    await createCandidate("Ogren Eski", "E2E Kerm Tunçalpp");
    await loginAs(page, "admin");
    await page.goto("/referans-eslestirme");
    await page.getByPlaceholder("Referans veya aday ara…").fill("Kerm");
    await page.locator("tbody tr").filter({ hasText: "E2E Kerm Tunçalpp" }).getByRole("button", { name: "Bağla" }).first().click();
    await expect(page.getByText(/aday danışmana bağlandı/).first()).toBeVisible();

    const yeni = await createCandidate("Ogren Yeni");
    await openEdit(page, yeni.id);
    await typeRef(page, "E2E Kerm Tunçalpp");
    await closeDropdown(page);
    await saveEdit(page);
    await expect(page.getByText("Bu kişi danışmanımız mı?")).toHaveCount(0);
    await expect.poll(() => linkedTo(yeni.id)).toBe(kerem.employeeId);
  });
});
