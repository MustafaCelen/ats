// Konsolide Rapor: tek uçtan 12 aylık hedef/gerçekleşen (randevu, brüt/net, finansal, masraf, kar),
// net hedefinin K0/K1/K2 kırılımı (Hedef Giriş), Forecast/Re-Forecast anahtarı, yetki, Excel düğmesi.
// Tüm hedefler 2099 yılına yazılır (gerçek verilerle çakışmaz; fixtures temizler).
import { test, expect } from "@playwright/test";
import { loginAs, createAdvisor, q, USERS } from "../fixtures";

const Y = 2099;

test("API: aylık satırlar, kategori kırılımı, net = giriş − çıkış, kar formülü, YTD sınırı", async ({ page }) => {
  // Mart 2099'da giren K0 danışman; Ocak'ta girip Mart'ta çıkan K1 danışman
  const giren = await createAdvisor("Konsolide Giren");
  await q(`UPDATE employees SET start_date = '2099-03-10' WHERE id = $1`, [giren.employeeId]);
  const cikan = await createAdvisor("Konsolide Cikan", { status: "inactive" });
  await q(`UPDATE candidates SET category = 'K1' WHERE id = $1`, [cikan.candidateId]);
  await q(`UPDATE employees SET start_date = '2099-01-05', passive_at = '2099-03-20' WHERE id = $1`, [cikan.employeeId]);
  // Mart'ta 2 randevu (K0 + K1)
  await q(`INSERT INTO interviews (application_id, job_id, candidate_id, title, start_time, end_time) VALUES (0, 0, $1, 'E2E', '2099-03-04 10:00', '2099-03-04 11:00'), (0, 0, $2, 'E2E', '2099-03-06 10:00', '2099-03-06 11:00')`, [giren.candidateId, cikan.candidateId]);
  // Masraf / diğer gelir gerçekleşen (Mart)
  await q(`INSERT INTO office_expenses (type, category, amount, date, office) VALUES ('expense', 'Kira', 4000, '2099-03-01', 'Akatlar'), ('income', 'Oda Kira', 1500, '2099-03-15', 'Akatlar')`);

  await loginAs(page, "admin");
  // Hedefler: randevu (iki ofis toplanır), büyüme (net K0/K1/K2 → toplam sunucuda), finansal, masraf
  for (const [office, cat, target] of [["Akatlar", "K0", 5], ["Zekeriyaköy", "K0", 2], ["Akatlar", "K1", 3]] as const) {
    expect((await page.request.post("/api/interview-targets", { data: { jobId: 999999, year: Y, month: 3, category: cat, office, target } })).ok()).toBe(true);
  }
  let r = await page.request.post("/api/growth/my-target", { data: { year: Y, month: 3, office: "Akatlar", userId: USERS.zeynep.id, brutTargetK0: 4, brutTargetK1: 2, brutTargetK2: 1, netTargetK0: 3, netTargetK1: 1, netTargetK2: 0 } });
  expect(r.ok()).toBe(true);
  expect((await page.request.put(`/api/financial-targets/${Y}/3`, { data: { office: "Akatlar", bhbTarget: 1000000, bhbHighTarget: 1200000, bmTarget: 100000, bmHighTarget: 120000, satilikAdetTarget: 10, kiralikAdetTarget: 20 } })).ok()).toBe(true);
  expect((await page.request.put(`/api/financial-targets/${Y}/3`, { data: { office: "Zekeriyaköy", bhbTarget: 500000, bmTarget: 50000, satilikAdetTarget: 5, kiralikAdetTarget: 5 } })).ok()).toBe(true);
  for (const [type, category, amount, office] of [["expense", "Kira", 3000, "Akatlar"], ["expense", "Zoom", 2000, "Zekeriyaköy"], ["income", "Oda Kira", 1000, "Akatlar"], ["expense", "Mutfak", 500, ""]] as const) {
    expect((await page.request.post("/api/expense-targets", { data: { year: Y, month: 3, type, category, amount, office } })).ok()).toBe(true);
  }
  expect((await page.request.post("/api/expense-targets", { data: { year: Y, month: 3, type: "expense", category: "Kira", amount: 1, office: "Bilinmeyen" } })).status()).toBe(400);
  // Ofisi boş bırakılmış gider kaydı (uyarı için)
  await q(`INSERT INTO office_expenses (type, category, amount, date, office) VALUES ('expense', 'Kira', 250, '2099-03-02', '')`);

  r = await page.request.get(`/api/reports/konsolide?year=${Y}`);
  expect(r.ok()).toBe(true);
  const d = await r.json();
  expect(d.year).toBe(Y);
  expect(d.ytdThroughMonth).toBe(0);           // gelecek yıl: YTD boş
  expect(d.months).toHaveLength(12);
  const mar = d.months[2];
  expect(mar.month).toBe(3);
  expect(mar.randevu.hedef).toEqual({ K0: 7, K1: 3, K2: 0, toplam: 10 });
  expect(mar.randevu.actual).toEqual({ K0: 1, K1: 1, K2: 0, toplam: 2 });
  expect(mar.brut.hedef).toEqual({ K0: 4, K1: 2, K2: 1, toplam: 7 });
  expect(mar.brut.actual).toEqual({ K0: 1, K1: 0, K2: 0, toplam: 1 });
  expect(mar.net.hedef).toEqual({ K0: 3, K1: 1, K2: 0, toplam: 4 });   // toplam = K0+K1+K2 (sunucu yazar)
  expect(mar.net.actual).toEqual({ K0: 1, K1: -1, K2: 0, toplam: 0 });  // giriş − çıkış
  expect(d.months[0].brut.actual).toEqual({ K0: 0, K1: 1, K2: 0, toplam: 1 });  // Ocak girişi
  expect(mar.bhb).toEqual({ hedef: 1500000, hedefHigh: 1200000, actual: 0 });   // iki ofis toplamı; high yalnız Akatlar'da
  expect(mar.bm).toMatchObject({ hedef: 150000, hedefHigh: 120000 });
  expect(mar.satilik).toMatchObject({ hedef: 15 });
  expect(mar.kiralik).toMatchObject({ hedef: 25 });
  // Konsolide: iki ofis + "" (eski şirket geneli) toplanır; ofisi boş gider kaydı da sayılır
  expect(mar.masraf).toEqual({ hedef: 5500, actual: 4250 });
  expect(mar.digerGelir).toEqual({ hedef: 1000, actual: 1500 });
  expect(mar.kar).toMatchObject({ hedef: 150000 + 1000 - 5500, hedefHigh: 120000 + 1000 - 5500, actual: mar.bm.actual + 1500 - 4250 });
  expect(d.office).toBeNull();

  // Ofis görünümü: Akatlar
  const ak = await (await page.request.get(`/api/reports/konsolide?year=${Y}&office=Akatlar`)).json();
  expect(ak.office).toBe("Akatlar");
  expect(ak.unassignedExpenseRows).toBe(1);
  const akMar = ak.months[2];
  expect(akMar.randevu.hedef).toEqual({ K0: 5, K1: 3, K2: 0, toplam: 8 });   // Zekeriyaköy K0 hedefi hariç
  expect(akMar.randevu.actual.toplam).toBe(2);                              // adaylar Akatlar
  expect(akMar.brut.hedef.toplam).toBe(7);
  expect(akMar.bhb).toMatchObject({ hedef: 1000000, hedefHigh: 1200000 });
  expect(akMar.masraf).toEqual({ hedef: 3000, actual: 4000 });              // Zekeriyaköy ve "" hariç
  expect(akMar.digerGelir).toEqual({ hedef: 1000, actual: 1500 });
  const zk = await (await page.request.get(`/api/reports/konsolide?year=${Y}&office=Zekeriyak%C3%B6y`)).json();
  expect(zk.months[2].masraf).toEqual({ hedef: 2000, actual: 0 });
  expect(zk.months[2].randevu.actual.toplam).toBe(0);
  expect(zk.months[2].brut.actual.toplam).toBe(0);
  expect((await page.request.get(`/api/reports/konsolide?year=${Y}&office=Bilinmeyen`)).status()).toBe(400);
  expect((await page.request.get("/api/reports/konsolide?year=abc")).status()).toBe(400);

  // Eski istemci (yalnız netTarget) kırılımı silmez; toplamı yazar
  r = await page.request.post("/api/growth/my-target", { data: { year: Y, month: 3, office: "Akatlar", userId: USERS.zeynep.id, brutTargetK0: 4, brutTargetK1: 2, brutTargetK2: 1, netTarget: 9 } });
  expect(r.ok()).toBe(true);
  const t = (await (await page.request.get(`/api/growth/targets-by-office?year=${Y}&month=3&office=Akatlar`)).json()).find((x: any) => x.userId === USERS.zeynep.id);
  expect(t).toMatchObject({ netTarget: 9, netTargetK0: 3, netTargetK1: 1, netTargetK2: 0 });
  expect((await (await page.request.get(`/api/growth/stats?year=${Y}&month=3`)).json()).netTargetByCategory).toEqual({ K0: 3, K1: 1, K2: 0 });
  // Kırılım hücresi girilince toplam yeniden K0+K1+K2 olur
  r = await page.request.post("/api/growth/my-target", { data: { year: Y, month: 3, office: "Akatlar", userId: USERS.zeynep.id, brutTargetK0: 4, brutTargetK1: 2, brutTargetK2: 1, netTargetK0: 3, netTargetK1: 1, netTargetK2: 2 } });
  expect((await (await page.request.get(`/api/reports/konsolide?year=${Y}`)).json()).months[2].net.hedef).toEqual({ K0: 3, K1: 1, K2: 2, toplam: 6 });

  // Finansal erişimli HM: rapor açılır ama masraf / diğer gelir / kar sıfırlanır
  await q(`UPDATE users SET can_view_financials = TRUE WHERE id = $1`, [USERS.mehmet.id]);
  try {
    await loginAs(page, "mehmet");
    const hm = await (await page.request.get(`/api/reports/konsolide?year=${Y}`)).json();
    expect(hm.includesPnl).toBe(false);
    expect(hm.months[2].masraf).toEqual({ hedef: 0, hedefHigh: 0, actual: 0 });
    expect(hm.months[2].kar.actual).toBe(0);
    expect(hm.months[2].bhb.hedef).toBe(1500000);   // finansal hedefler açık
    await page.goto(`/konsolide-rapor?year=${Y}`);
    const fin = page.getByTestId("konsolide-fin-table");
    await expect(fin).toContainText("Satılık Adet");
    await expect(fin).not.toContainText("Masraflar");
  } finally {
    await q(`UPDATE users SET can_view_financials = FALSE WHERE id = $1`, [USERS.mehmet.id]);
  }

  // Yetki: finansal erişimi olmayan HM göremez
  await loginAs(page, "zeynep");
  expect((await page.request.get(`/api/reports/konsolide?year=${Y}`)).status()).toBe(403);
});

test("ekran: 12 ay + YTD + TOPLAM, başlıklar, Forecast/Re-Forecast anahtarı, Excel düğmesi; Hedef Giriş net kırılımı", async ({ page }) => {
  await loginAs(page, "admin");
  await page.request.put(`/api/financial-targets/${Y}/5`, { data: { office: "Akatlar", bhbTarget: 2000000, bhbHighTarget: 2500000 } });
  await page.request.post("/api/growth/my-target", { data: { year: Y, month: 5, office: "Akatlar", userId: USERS.zeynep.id, brutTargetK0: 1, brutTargetK1: 0, brutTargetK2: 0, netTargetK0: 2, netTargetK1: 1, netTargetK2: 0 } });

  await page.goto(`/konsolide-rapor?year=${Y}`);   // derin bağlantı: yıl URL'den
  await expect(page.getByTestId("konsolide-page")).toBeVisible();
  await expect(page.getByTestId("konsolide-year")).toContainText(String(Y));

  const table = page.getByTestId("konsolide-table");
  await expect(table).toContainText(`KONSOLİDE ${Y}`);
  for (const h of ["RANDEVU", "BRÜT", "NET", "Toplam", "Yeni", "K1", "K2", "Hedef", "Actual", "H/G %"]) await expect(table).toContainText(h);
  await expect(table.locator("tbody tr[data-testid^='konsolide-row-m']")).toHaveCount(12);
  await expect(page.getByTestId("konsolide-row-ytd")).toContainText("YTD (—)");   // gelecek yıl
  await expect(page.getByTestId("konsolide-row-total")).toContainText("TOPLAM");
  // Mayıs net hedef: Toplam 3 · Yeni 2 · K1 1
  const may = page.getByTestId("konsolide-row-m5");
  await expect(may.locator("td").nth(19)).toHaveText("3");
  await expect(may.locator("td").nth(21)).toHaveText("-100%");   // actual 0 → (0−3)/3
  await expect(may.locator("td").nth(22)).toHaveText("2");
  await expect(may.locator("td").nth(24)).toHaveText("1");

  const fin = page.getByTestId("konsolide-fin-table");
  for (const h of [`${Y} BHB Forecast`, "BM'ye Kalan Hizmet Bedeli", "Masraflar", "Diğer Gelirler", "Kar", "Satılık Adet", "Kiralık Adet"]) await expect(fin).toContainText(h);
  const mayFin = page.getByTestId("konsolide-fin-row-m5");
  await expect(mayFin.locator("td").nth(1)).toHaveText("2.000.000");
  await page.getByTestId("konsolide-reforecast").click();
  await expect(mayFin.locator("td").nth(1)).toHaveText("2.500.000");
  await expect(fin).toContainText(`${Y} BHB Re-Forecast`);
  await expect(page.getByTestId("konsolide-export")).toBeEnabled();
  const dl = page.waitForEvent("download");
  await page.getByTestId("konsolide-export").click();
  expect((await dl).suggestedFilename()).toBe(`konsolide-${Y}.xlsx`);

  // Ofis seçici: Akatlar → başlık ve veri değişir, boş ofisli kayıt uyarısı
  await q(`INSERT INTO office_expenses (type, category, amount, date, office) VALUES ('expense', 'Kira', 10, '2099-05-02', '')`);
  await page.getByTestId("konsolide-office-Akatlar").click();
  await expect(table).toContainText(`AKATLAR ${Y}`);
  await expect(page.getByTestId("konsolide-unassigned")).toContainText(/ofisi boş bırakılmış \d+ gider\/gelir kaydı/);
  await expect(mayFin.locator("td").nth(1)).toHaveText("2.500.000");   // Re-Forecast hâlâ seçili, Akatlar hedefi
  await page.getByTestId("konsolide-office-konsolide").click();
  await expect(table).toContainText(`KONSOLİDE ${Y}`);
  await expect(page.getByTestId("konsolide-unassigned")).toHaveCount(0);

  // Menü bağlantısı
  await expect(page.getByRole("link", { name: "Konsolide Rapor" })).toBeVisible();

  // Hedef Giriş: masraf hedefleri ofis seçimli, eski şirket geneli uyarısı
  await page.request.post("/api/expense-targets", { data: { year: Y, month: 1, type: "expense", category: "Kira", amount: 700, office: "" } });
  await page.request.post("/api/expense-targets", { data: { year: Y, month: 1, type: "expense", category: "Kira", amount: 300, office: "Zekeriyaköy" } });
  const rows = await (await page.request.get(`/api/expense-targets?year=${Y}&month=1&office=Zekeriyak%C3%B6y`)).json();
  expect(rows.map((r: any) => [r.category, Number(r.amount)])).toEqual([["Kira", 300]]);
});
