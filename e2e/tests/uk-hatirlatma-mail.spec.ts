// 45+45 haftalık hatırlatma MAİLİ: alıcı listesi e-posta bayrakları, önizleme, gönderim (yerelde
// GMAIL_* yok → "Mail ayarları ... tanımlı değil" hatası, log satırı yazılmaz), cron ucu channel=mail.
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, enroll, q, USERS, startForWeek } from "../fixtures";

test("alıcılar: e-posta bayrakları, bu hafta mail gidenler işaretli; önizleme ad/hafta/link içerir", async ({ page }) => {
  const var1 = await createAdvisor("Mail Var", { email: "e2e-mailvar@example.invalid" });
  const yok = await createAdvisor("Mail Yok", { email: null });
  const gitti = await createAdvisor("Mail Gitti", { email: "e2e-mailgitti@example.invalid" });
  for (const a of [var1, yok, gitti]) await enroll(a.employeeId, USERS.zeynep.id, startForWeek(4));
  await q(`INSERT INTO uk_program_reminder_mails (employee_id, week, to_emails, sent_by_user_id, created_at) VALUES ($1, 4, 'x@y', 0, NOW())`, [gitti.employeeId]);
  await loginAs(page, "admin");

  const d = await (await page.request.get("/api/uk-program/reminder-mail/recipients")).json();
  const rVar = d.recipients.find((r: any) => r.employeeId === var1.employeeId);
  expect(rVar).toMatchObject({ hasEmail: true, emails: ["e2e-mailvar@example.invalid"], mailSentBefore: false, currentWeek: 4 });
  expect(d.recipients.find((r: any) => r.employeeId === yok.employeeId)).toMatchObject({ hasEmail: false, emails: [] });
  expect(d.recipients.find((r: any) => r.employeeId === gitti.employeeId)).toMatchObject({ mailSentBefore: true });
  // WhatsApp bayrağı maille karışmaz
  expect(d.recipients.find((r: any) => r.employeeId === gitti.employeeId).sentBefore).toBe(false);

  const p = await (await page.request.get(`/api/uk-program/reminder-mail/preview/${var1.employeeId}`)).json();
  expect(p.to).toEqual(["e2e-mailvar@example.invalid"]);
  expect(p.subject).toContain("4. hafta");
  expect(p.html).toContain('Merhaba <b style="color:#0f172a;">E2E</b>');   // ilk ad
  expect(p.html).toContain(`/a/${var1.token}?tab=rota`);                  // kişisel link
  expect(p.html).toContain("4. haftasındayız");
  expect(p.html).toContain("Zeynep Yilmaz");                               // koç
  expect(p.html).toMatch(/Son giriş günü<br><b[^>]*>\d+ [^\s<]+ Pazar 23:59/);  // bu haftanın pazarı

  // Yetki
  await loginAs(page, "zeynep");
  expect((await page.request.get("/api/uk-program/reminder-mail/recipients")).status()).toBe(403);
});

test("gönderim: e-posta yok → 'E-posta yok'; mail ayarı yok → hata, log yazılmaz; dialog akışı", async ({ page }) => {
  const a = await createAdvisor("Mail Gonder A", { email: "e2e-mga@example.invalid" });
  const b = await createAdvisor("Mail Gonder B", { email: null });
  for (const x of [a, b]) await enroll(x.employeeId, USERS.zeynep.id, startForWeek(2));
  await loginAs(page, "admin");

  let r = await page.request.post("/api/uk-program/reminder-mail/send", { data: { employeeIds: [] } });
  expect(r.status()).toBe(400);
  const gitti = await createAdvisor("Mail Gonder Gitti", { email: "e2e-mgg@example.invalid" });
  await enroll(gitti.employeeId, USERS.zeynep.id, startForWeek(2));
  await q(`INSERT INTO uk_program_reminder_mails (employee_id, week, to_emails, sent_by_user_id, created_at) VALUES ($1, 2, 'x@y', 0, NOW())`, [gitti.employeeId]);
  r = await page.request.post("/api/uk-program/reminder-mail/send", { data: { employeeIds: [a.employeeId, b.employeeId, gitti.employeeId, 999999999] } });
  expect(r.ok()).toBe(true);
  const d = await r.json();
  expect(d.mailed).toBe(0);
  expect(d.results.find((x: any) => x.employeeId === a.employeeId).error).toMatch(/Mail gönderilemedi: Mail ayarları/);
  expect(d.results.find((x: any) => x.employeeId === b.employeeId).error).toBe("E-posta yok");
  expect(d.results.find((x: any) => x.employeeId === gitti.employeeId).error).toBe("Bu hafta zaten mail gitti");   // sunucu tarafı çift gönderim koruması
  expect(d.results.find((x: any) => x.employeeId === 999999999).error).toMatch(/Listede değil/);
  expect(d.stopped).toMatch(/Mail ayarları/);   // ayar yoksa ilk hatada durur
  expect(await q(`SELECT 1 FROM uk_program_reminder_mails WHERE employee_id IN ($1, $2)`, [a.employeeId, b.employeeId])).toHaveLength(0);
  // allowResend ile bilerek yineleme kabul edilir (mail ayarı olmadığı için yine gönderilemez ama engel kalkar)
  r = await page.request.post("/api/uk-program/reminder-mail/send", { data: { employeeIds: [gitti.employeeId], allowResend: true } });
  expect((await r.json()).results[0].error).toMatch(/Mail gönderilemedi/);
  // Çalıştırma logu yazıldı
  const runs = await q(`SELECT trigger, candidates, mailed, failed, error FROM uk_program_reminder_runs ORDER BY id DESC LIMIT 2`);
  expect(runs[1]).toMatchObject({ trigger: "admin:1", candidates: 4, mailed: 0, failed: 4 });
  expect(runs[1].error).toMatch(/Mail ayarları/);

  await page.goto("/uk-basari-rotasi");
  await page.getByTestId("uk-mail-reminder").click();
  const dlg = page.getByTestId("uk-wa-dialog-reminder-mail");
  await expect(dlg.getByTestId(`uk-wa-row-${a.employeeId}`)).toContainText("e2e-mga@example.invalid");
  await expect(dlg.getByTestId(`uk-wa-row-${b.employeeId}`)).toContainText("E-posta yok");
  await expect(dlg.getByTestId("uk-mail-preview")).toBeVisible();
  await expect(dlg.getByTestId("uk-mail-lastrun")).toContainText("elle");   // önceki API gönderimi
  page.once("dialog", (dd) => dd.accept());
  await dlg.getByTestId("uk-wa-send").click();
  await expect(dlg.getByTestId("uk-mail-result")).toContainText("Gönderim başarısız");
  await expect(dlg.getByTestId("uk-mail-result")).toContainText("Mail ayarları");
});

// CRON_SECRET=lokal-test-123 ile ayağa kaldırılmış konteyner gerekir (e2e/README.md).
test("cron ucu channel=mail / both: CRON_SECRET ister, alıcıları dener, özet döner; both'ta WA şablonu yoksa mail özeti kaybolmaz", async ({ page }) => {
  const a = await createAdvisor("Mail Cron A", { email: "e2e-mca@example.invalid" });
  await enroll(a.employeeId, USERS.zeynep.id, startForWeek(5));
  expect((await page.request.post("/api/uk-program/whatsapp/reminder/cron?channel=mail")).status()).toBe(401);
  let r = await page.request.post("/api/uk-program/whatsapp/reminder/cron?channel=mail", { headers: { "x-cron-secret": "lokal-test-123" } });
  expect(r.status()).toBe(200);
  let d = await r.json();
  expect(d.channel).toBe("mail");
  expect(d.mail.count).toBeGreaterThanOrEqual(1);
  expect(d.mail).toMatchObject({ mailed: 0 });   // yerelde GMAIL yok
  const run = (await q(`SELECT trigger, error FROM uk_program_reminder_runs ORDER BY id DESC LIMIT 1`))[0];
  expect(run.trigger).toBe("harici-cron");
  // both: TWILIO_WA_UK_REMINDER_SID yerelde yok → 200 + whatsappError, mail özeti yine döner
  r = await page.request.post("/api/uk-program/whatsapp/reminder/cron?channel=both", { headers: { "x-cron-secret": "lokal-test-123" } });
  d = await r.json();
  if (!process.env.TWILIO_WA_UK_REMINDER_SID) { expect(r.status()).toBe(200); expect(d.whatsappError).toContain("TWILIO_WA_UK_REMINDER_SID"); }
  expect(d.mail).toBeTruthy();
});
