// 45+45 Başarı Rotası — liste, koç filtresi, manuel ekleme (admin + HM), hoş geldin maili.
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, enroll, startForWeek, nextMonday, q, USERS, pickEmployee, type Advisor } from "../fixtures";

let zeynepinki: Advisor;   // koçu Zeynep, 2. haftada
let mehmetinki: Advisor;   // koçu Mehmet, gelecek pazartesi başlıyor

test.beforeAll(async () => {
  zeynepinki = await createAdvisor("Liste Zeynepli");
  mehmetinki = await createAdvisor("Liste Mehmetli");
  await enroll(zeynepinki.employeeId, USERS.zeynep.id, startForWeek(2));
  await enroll(mehmetinki.employeeId, USERS.mehmet.id, nextMonday());
});

const row = (page: import("@playwright/test").Page, name: string) => page.locator("tbody tr").filter({ hasText: name });

test("liste: sekmeler, durum rozetleri ve arama", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/uk-basari-rotasi");
  await page.getByRole("button", { name: /^Tümü/ }).click();

  await expect(row(page, zeynepinki.name)).toContainText("2. hafta");
  await expect(row(page, zeynepinki.name)).toContainText("Zeynep Yilmaz");
  await expect(row(page, mehmetinki.name)).toContainText("Başlamadı");

  // Başlamamış danışman "Devam Eden"de de görünür
  await page.getByRole("button", { name: /^Devam Eden/ }).click();
  await expect(row(page, mehmetinki.name)).toBeVisible();
  await page.getByRole("button", { name: /^Tamamlanan/ }).click();
  await expect(row(page, zeynepinki.name)).toHaveCount(0);

  await page.getByRole("button", { name: /^Tümü/ }).click();
  await page.getByPlaceholder(/Danışman, KWUID veya koç ara/).fill(zeynepinki.kwuid);
  await expect(row(page, zeynepinki.name)).toBeVisible();
  await expect(row(page, mehmetinki.name)).toHaveCount(0);
});

test("liste: koç filtresi süzer ve hatırlanır", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/uk-basari-rotasi");
  await page.getByRole("button", { name: /^Tümü/ }).click();
  const coachSel = page.locator("select").filter({ has: page.locator("option", { hasText: "Tüm koçlar" }) });

  await coachSel.selectOption({ label: "Mehmet Ozkan" });
  await expect(row(page, mehmetinki.name)).toBeVisible();
  await expect(row(page, zeynepinki.name)).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: /^Tümü/ }).click();
  await expect(coachSel).toHaveValue(String(USERS.mehmet.id));
  await expect(row(page, zeynepinki.name)).toHaveCount(0);

  await coachSel.selectOption({ label: "Tüm koçlar" });
  await expect(row(page, zeynepinki.name)).toBeVisible();
});

test("admin: Danışman Ekle → pazartesi seçimi, koç, rota sayfasına gider", async ({ page }) => {
  const yeni = await createAdvisor("Admin Ekler");
  await loginAs(page, "admin");
  await page.goto("/uk-basari-rotasi");
  await page.getByRole("button", { name: "Danışman Ekle" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText("45+45 Başarı Rotası'na Danışman Ekle")).toBeVisible();

  await pickEmployee(page, "Aktif danışman seçin", yeni.name, dlg);
  const [coachSel, mondaySel] = [dlg.locator("select").nth(0), dlg.locator("select").nth(1)];
  await expect(coachSel.locator("option", { hasText: "Koç atanmasın" })).toHaveCount(1);   // yalnız admin
  await coachSel.selectOption({ label: "Zeynep Yilmaz" });

  // Başlangıç yalnızca pazartesi; varsayılan gelecek pazartesi
  await expect(mondaySel).toHaveValue(nextMonday());
  const labels = await mondaySel.locator("option").allTextContents();
  expect(labels.every((l) => l.includes("Pazartesi"))).toBeTruthy();
  await expect(mondaySel.locator("option:checked")).toContainText("gelecek hafta");

  await dlg.getByLabel(/Hoş geldin mailini/).uncheck();   // yerelde Gmail yok
  await dlg.getByRole("button", { name: "Programa Ekle" }).click();

  await expect(page).toHaveURL(new RegExp(`/uk-basari-rotasi/${yeni.employeeId}$`));
  await expect(page.getByText(yeni.name).first()).toBeVisible();
  const [en] = await q(`SELECT source, start_date, coach_user_id FROM uk_program_enrollments WHERE employee_id = $1`, [yeni.employeeId]);
  expect(en).toMatchObject({ source: "manual", start_date: nextMonday(), coach_user_id: USERS.zeynep.id });
});

test("HM: Danışman Ekle → varsayılan koç kendisi, koçsuz seçenek yok, başka koçta mail kapalı", async ({ page }) => {
  const yeni = await createAdvisor("HM Ekler");
  await loginAs(page, "zeynep");
  await page.goto("/uk-basari-rotasi");
  await page.getByRole("button", { name: "Danışman Ekle" }).click();
  const dlg = page.getByRole("dialog");
  const coachSel = dlg.locator("select").nth(0);
  const mail = dlg.getByLabel(/Hoş geldin mailini/);

  await expect(coachSel).toHaveValue(String(USERS.zeynep.id));
  await expect(coachSel.locator("option:checked")).toContainText("(ben)");
  await expect(coachSel.locator("option", { hasText: "Koç atanmasın" })).toHaveCount(0);

  await coachSel.selectOption({ label: "Mehmet Ozkan" });
  await expect(mail).toBeDisabled();
  await expect(dlg.getByText("hoş geldin mailini o koç gönderir")).toBeVisible();
  await coachSel.selectOption(String(USERS.zeynep.id));
  await expect(mail).toBeEnabled();

  await pickEmployee(page, "Aktif danışman seçin", yeni.name, dlg);
  await mail.uncheck();
  await dlg.getByRole("button", { name: "Programa Ekle" }).click();
  await expect(page).toHaveURL(new RegExp(`/uk-basari-rotasi/${yeni.employeeId}$`));
  const [en] = await q(`SELECT source, coach_user_id, added_by_user_id FROM uk_program_enrollments WHERE employee_id = $1`, [yeni.employeeId]);
  expect(en).toMatchObject({ source: "manual", coach_user_id: USERS.zeynep.id, added_by_user_id: USERS.zeynep.id });
});

test("hoş geldin maili: yalnız koçu olduğu satırda buton, önizleme açılır", async ({ page }) => {
  await loginAs(page, "zeynep");
  await page.goto("/uk-basari-rotasi");
  await page.getByRole("button", { name: /^Tümü/ }).click();

  await expect(row(page, mehmetinki.name).getByTitle("Hoş geldin mailini önizle ve gönder")).toHaveCount(0);
  const r = row(page, zeynepinki.name);
  await expect(r).toContainText("Gönderilmedi");
  await r.getByTitle("Hoş geldin mailini önizle ve gönder").click();

  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText("Hoş Geldin Maili")).toBeVisible();
  await expect(dlg).toContainText(zeynepinki.email);
  await expect(dlg).toContainText("45+45 Başarı Rotası'na hoş geldiniz");
  const mail = page.frameLocator('iframe[title="Mail önizleme"]');
  await expect(mail.getByText(`Merhaba ${zeynepinki.name.split(" ")[0]}`)).toBeVisible();
  await expect(mail.getByText("Rotama Git →")).toBeVisible();
  await expect(mail.getByText("pazar 23:59")).toBeVisible();
  await expect(mail.locator("a", { hasText: "Rotama Git" })).toHaveAttribute("href", new RegExp(`/a/${zeynepinki.token}`));
  await dlg.getByRole("button", { name: "Kapat" }).click();
  await expect(dlg).toHaveCount(0);
});

test("hoş geldin maili: e-postası olmayan danışmanda gönder kapalı", async ({ page }) => {
  const mailsiz = await createAdvisor("Mailsiz", { email: null });
  await enroll(mailsiz.employeeId, USERS.zeynep.id, startForWeek(1));
  await loginAs(page, "zeynep");
  await page.goto("/uk-basari-rotasi");
  await page.getByRole("button", { name: /^Tümü/ }).click();
  await row(page, mailsiz.name).getByTitle("Hoş geldin mailini önizle ve gönder").click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText("kayıtlı e-posta yok")).toBeVisible();
  await expect(dlg.getByRole("button", { name: /^Gönder$/ })).toBeDisabled();
});
