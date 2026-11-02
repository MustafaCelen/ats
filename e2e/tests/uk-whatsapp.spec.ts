// 45+45 WhatsApp: hoş geldin + haftalık hatırlatma alıcı listeleri, kişisel link, gönderim batch'i.
// Yerelde Twilio ayarı yok → her gönderim "Twilio gönderim hatası" ile kaydedilir, batch 3 hatada durur.
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, enroll, q, USERS, startForWeek, nextMonday } from "../fixtures";

test("alıcılar: hatırlatma = bu hafta işaretsiz olanlar; hoş geldin = programdaki herkes; link, telefon ve 'gönderildi' bayrakları", async ({ page }) => {
  const bos = await createAdvisor("WA Bos", { phone: "0532 111 22 33" });          // 2. hafta, hiç işaret yok
  const dolu = await createAdvisor("WA Dolu", { phone: "05321112234" });           // 2. hafta, 1 işaret var
  const telsiz = await createAdvisor("WA Telsiz", { phone: null });                // telefon yok
  const gitti = await createAdvisor("WA Gitti", { phone: "+905321112235" });       // bu hafta hatırlatma gitmiş
  const baslamadi = await createAdvisor("WA Baslamadi", { phone: "05321112236" }); // gelecek hafta başlıyor
  for (const a of [bos, dolu, telsiz, gitti]) await enroll(a.employeeId, USERS.zeynep.id, startForWeek(2));
  await enroll(baslamadi.employeeId, USERS.zeynep.id, nextMonday());
  await q(`INSERT INTO uk_program_checks (employee_id, activity_id, checked_by_user_id) VALUES ($1, 'w2-d0-r0', $2)`, [dolu.employeeId, USERS.zeynep.id]);
  await q(`INSERT INTO whatsapp_bulk_sends (employee_id, employee_name, phone, template_sid, template_name, variables, status, created_at)
           VALUES ($1, $2, '+905321112235', 'HXtest', 'ÜK Haftalık Hatırlatma (WhatsApp)', '{}', 'sent', NOW())`, [gitti.employeeId, gitti.name]);
  await loginAs(page, "admin");

  const rem = await (await page.request.get("/api/uk-program/whatsapp/reminder/recipients")).json();
  expect(rem.label).toBe("ÜK Haftalık Hatırlatma (WhatsApp)");
  const remIds = rem.recipients.map((r: any) => r.employeeId);
  expect(remIds).toContain(bos.employeeId);
  expect(remIds).toContain(telsiz.employeeId);
  expect(remIds).toContain(gitti.employeeId);
  expect(remIds).not.toContain(dolu.employeeId);        // bu hafta işaretlemiş
  expect(remIds).not.toContain(baslamadi.employeeId);   // program başlamadı
  const rBos = rem.recipients.find((r: any) => r.employeeId === bos.employeeId);
  expect(rBos).toMatchObject({ hasPhone: true, currentWeek: 2, doneThisWeek: 0, sentBefore: false });
  expect(rBos.link).toMatch(new RegExp(`/a/${bos.token}\\?tab=rota$`));
  expect(rem.recipients.find((r: any) => r.employeeId === telsiz.employeeId)).toMatchObject({ hasPhone: false });
  expect(rem.recipients.find((r: any) => r.employeeId === gitti.employeeId)).toMatchObject({ sentBefore: true });

  const wel = await (await page.request.get("/api/uk-program/whatsapp/welcome/recipients")).json();
  const welIds = wel.recipients.map((r: any) => r.employeeId);
  for (const a of [bos, dolu, telsiz, gitti, baslamadi]) expect(welIds).toContain(a.employeeId);
  expect(wel.recipients.find((r: any) => r.employeeId === gitti.employeeId).sentBefore).toBe(false);   // hatırlatma gitti, hoş geldin gitmedi

  // Yetki: hiring manager göremez
  await loginAs(page, "zeynep");
  expect((await page.request.get("/api/uk-program/whatsapp/reminder/recipients")).status()).toBe(403);
});

test("gönderim: batch başlar, telefon yok → 'Telefon numarası yok', Twilio yok → hata kaydı; dialog akışı", async ({ page }) => {
  const a = await createAdvisor("WA Gonder A", { phone: "05321112240" });
  const b = await createAdvisor("WA Gonder B", { phone: null });
  for (const x of [a, b]) await enroll(x.employeeId, USERS.zeynep.id, startForWeek(3));
  await loginAs(page, "admin");

  // Şablon yok → 400; şablon verilince batch
  let r = await page.request.post("/api/uk-program/whatsapp/welcome/send", { data: { employeeIds: [a.employeeId, b.employeeId] } });
  expect(r.status()).toBe(400);
  r = await page.request.post("/api/uk-program/whatsapp/welcome/send", { data: { employeeIds: [a.employeeId, b.employeeId], templateSid: "HXe2e" } });
  expect(r.ok()).toBe(true);
  const { batchId, count } = await r.json();
  expect(count).toBe(2);
  await expect.poll(async () => (await (await page.request.get(`/api/uk-program/whatsapp/batch/${batchId}`)).json()).status, { timeout: 15000 }).not.toBe("running");
  const rows = await q(`SELECT employee_id, status, error, template_name, variables FROM whatsapp_bulk_sends WHERE batch_id = $1 ORDER BY employee_id`, [batchId]);
  expect(rows).toHaveLength(2);
  expect(rows.find((x: any) => x.employee_id === a.employeeId)).toMatchObject({ status: "failed", error: "Twilio gönderim hatası", template_name: "ÜK Hoş Geldin (WhatsApp)" });
  expect(rows.find((x: any) => x.employee_id === b.employeeId)).toMatchObject({ status: "failed", error: "Telefon numarası yok" });
  const vars = JSON.parse(rows.find((x: any) => x.employee_id === a.employeeId).variables);
  expect(vars["1"]).toBe("E2E");                       // ad (ilk kelime)
  expect(vars["2"]).toMatch(/\/a\/.+\?tab=rota$/);     // link

  // Dialog: admin butonları görünür, liste gelir, telefonu olmayan işaretli
  await page.goto("/uk-basari-rotasi");
  await page.getByTestId("uk-wa-reminder").click();
  const dlg = page.getByTestId("uk-wa-dialog-reminder");
  await expect(dlg.getByTestId(`uk-wa-row-${a.employeeId}`)).toContainText("3. hafta · 0/");
  await expect(dlg.getByTestId(`uk-wa-row-${b.employeeId}`)).toContainText("Telefon yok");
  await expect(dlg.getByTestId("uk-wa-count")).toContainText("seçili");
});

test("cron ucu: CRON_SECRET ister, şablon env yoksa 400", async ({ page }) => {
  expect((await page.request.post("/api/uk-program/whatsapp/reminder/cron")).status()).toBe(401);
  const r = await page.request.post("/api/uk-program/whatsapp/reminder/cron", { headers: { "x-cron-secret": "lokal-test-123" } });
  expect([200, 400]).toContain(r.status());   // env'de TWILIO_WA_UK_REMINDER_SID yok → 400; varsa batch
});
