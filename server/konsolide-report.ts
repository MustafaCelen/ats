// Konsolide Rapor — tek sorgu setiyle 12 aylık RANDEVU / BRÜT / NET / BHB / BM / Satılık /
// Kiralık / Masraf / Diğer Gelir / Kar hedef-gerçekleşen tablosu. Kapsam her zaman
// konsolide (Akatlar + Zekeriyaköy); ofis hedefleri toplanır, "" (global) hedef satırları
// Finansal Raporlar sayfasıyla tutarlı olsun diye dahil edilmez.
//
// Kaynaklar (Finansal Raporlar / Kâr-Zarar sayfalarıyla aynı tanımlar):
//  - Randevu actual: interviews.start_time ayı × candidates.category (durum filtresi yok)
//  - Randevu hedef : interview_targets (ofis bazlı, kategori bazlı) toplamı
//  - Brüt actual   : employees.start_date ayı × candidates.category; Net = brüt − passive_at ayı
//  - Brüt/Net hedef: growth_targets (HM × ofis) toplamı; net kırılımı net_target_k0/k1/k2
//  - BHB/BM/Adet   : storage.getClosingStats monthlyTrend (tamamlanan, danışman bazlı tarih)
//  - Finansal hedef: financial_targets (Forecast = *_target, Re-Forecast = *_high_target)
//  - Masraf/Gelir  : office_expenses (tarih ayı); hedef expense_targets ay toplamı
//  - Kar           : bm + digerGelir − masraf (hedef tarafı aynı formülle)
import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { OFFICES } from "@shared/schema";
import {
  emptyCatCounts, ytdThroughMonthFor,
  type CatCounts, type KonsolideMonth, type KonsolideReport,
} from "@shared/konsolide-report";

const CATS = ["K0", "K1", "K2"] as const;

function catsByMonth(): CatCounts[] {
  return Array.from({ length: 12 }, () => emptyCatCounts());
}

/** rows: { m, category, c } → 12'lik kategori dizisi (bilinmeyen kategori K0 sayılır). */
function fillCats(target: CatCounts[], rows: any[], valueKey = "c") {
  for (const r of rows) {
    const m = Number(r.m);
    if (!(m >= 1 && m <= 12)) continue;
    const cat = (CATS as readonly string[]).includes(r.category) ? (r.category as (typeof CATS)[number]) : "K0";
    const v = Number(r[valueKey] ?? 0);
    target[m - 1][cat] += v;
    target[m - 1].toplam += v;
  }
}

export async function getKonsolideReport(
  year: number, today = new Date(), opts: { includePnl?: boolean; office?: string | null } = {},
): Promise<KonsolideReport> {
  const includePnl = opts.includePnl ?? true;
  const office = opts.office && (OFFICES as readonly string[]).includes(opts.office) ? opts.office : null;
  const offices = office ? [office] : [...OFFICES];
  const officeList = sql.join(offices.map((o) => sql`${o}`), sql`, `);
  // Danışman/aday ofisi (randevu, brüt/net): Finansal Raporlar ile aynı — adayın ŞU ANKİ ofisi
  const candOffice = office ? sql` AND c.office = ${office}` : sql``;
  // Gider kayıtları: ofis görünümünde yalnız o ofis; Konsolide'de tümü ("" eski satırlar dahil)
  const expOffice = office ? sql` AND office = ${office}` : sql``;

  // ── Randevu ────────────────────────────────────────────────────────────────
  const randevuActual = catsByMonth();
  fillCats(randevuActual, (await db.execute(sql`
    SELECT EXTRACT(MONTH FROM i.start_time)::int AS m, COALESCE(c.category, 'K0') AS category, COUNT(*)::int AS c
    FROM interviews i LEFT JOIN candidates c ON c.id = i.candidate_id
    WHERE EXTRACT(YEAR FROM i.start_time) = ${year}${candOffice}
    GROUP BY 1, 2`)).rows as any[]);

  const randevuHedef = catsByMonth();
  fillCats(randevuHedef, (await db.execute(sql`
    SELECT month AS m, category, SUM(target)::int AS c
    FROM interview_targets
    WHERE year = ${year} AND office IN (${officeList})
    GROUP BY 1, 2`)).rows as any[]);

  // ── Brüt / Net (danışman giriş–çıkış) ──────────────────────────────────────
  const brutActual = catsByMonth();
  fillCats(brutActual, (await db.execute(sql`
    SELECT EXTRACT(MONTH FROM e.start_date)::int AS m, COALESCE(c.category, 'K0') AS category, COUNT(*)::int AS c
    FROM employees e JOIN candidates c ON c.id = e.candidate_id
    WHERE e.start_date IS NOT NULL AND EXTRACT(YEAR FROM e.start_date) = ${year}${candOffice}
    GROUP BY 1, 2`)).rows as any[]);

  const leftActual = catsByMonth();
  fillCats(leftActual, (await db.execute(sql`
    SELECT EXTRACT(MONTH FROM e.passive_at)::int AS m, COALESCE(c.category, 'K0') AS category, COUNT(*)::int AS c
    FROM employees e JOIN candidates c ON c.id = e.candidate_id
    WHERE e.passive_at IS NOT NULL AND EXTRACT(YEAR FROM e.passive_at) = ${year}${candOffice}
    GROUP BY 1, 2`)).rows as any[]);

  const growthRows = (await db.execute(sql`
    SELECT month AS m,
      SUM(brut_target_k0) AS bk0, SUM(brut_target_k1) AS bk1, SUM(brut_target_k2) AS bk2,
      SUM(net_target) AS net, SUM(net_target_k0) AS nk0, SUM(net_target_k1) AS nk1, SUM(net_target_k2) AS nk2
    FROM growth_targets
    WHERE year = ${year} AND month BETWEEN 1 AND 12${expOffice}
    GROUP BY month`)).rows as any[];
  const brutHedef = catsByMonth();
  const netHedef = catsByMonth();
  for (const r of growthRows) {
    const i = Number(r.m) - 1;
    if (i < 0 || i > 11) continue;
    brutHedef[i] = { K0: Number(r.bk0 ?? 0), K1: Number(r.bk1 ?? 0), K2: Number(r.bk2 ?? 0), toplam: 0 };
    brutHedef[i].toplam = brutHedef[i].K0 + brutHedef[i].K1 + brutHedef[i].K2;
    // Toplam net = net_target (kırılım girildiyse sunucu bunu K0+K1+K2 olarak yazar; eski kayıtlarda tek sayı)
    netHedef[i] = { K0: Number(r.nk0 ?? 0), K1: Number(r.nk1 ?? 0), K2: Number(r.nk2 ?? 0), toplam: Number(r.net ?? 0) };
  }

  // ── Kapanışlar: BHB / BM / Satılık / Kiralık adet ───────────────────────────
  const closing = await storage.getClosingStats(new Date(year, 0, 1), new Date(year, 11, 31), office ?? undefined);
  const trend = new Map<number, { bhb: number; bm: number; satilikCount: number; kiralikCount: number }>();
  for (const t of closing.monthlyTrend as any[]) {
    const m = parseInt(String(t.month).slice(5, 7), 10);
    if (m >= 1 && m <= 12) trend.set(m, t);
  }

  // ── Finansal hedefler (ofis toplamı) ───────────────────────────────────────
  const finRows = (await db.execute(sql`
    SELECT month AS m,
      SUM(bhb_target) AS bhb, SUM(bhb_high_target) AS bhb_high,
      SUM(bm_target) AS bm, SUM(bm_high_target) AS bm_high,
      SUM(satilik_adet_target) AS satilik, SUM(satilik_adet_high_target) AS satilik_high,
      SUM(kiralik_adet_target) AS kiralik, SUM(kiralik_adet_high_target) AS kiralik_high
    FROM financial_targets
    WHERE year = ${year} AND office IN (${officeList})
    GROUP BY month`)).rows as any[];
  const fin = new Map<number, any>();
  for (const r of finRows) fin.set(Number(r.m), r);

  // ── Masraf / Diğer gelir (manuel kayıtlar) ─────────────────────────────────
  const expRows = (await db.execute(sql`
    SELECT CAST(SUBSTRING(date FROM 6 FOR 2) AS int) AS m, type, SUM(amount) AS total
    FROM office_expenses
    WHERE date >= ${`${year}-01-01`} AND date <= ${`${year}-12-31`}${expOffice}
    GROUP BY 1, 2`)).rows as any[];
  // Ofisi boş bırakılmış kayıtlar: ofis görünümünde hiçbir ofiste sayılmaz — kullanıcıya uyarı
  const [unassigned] = (await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM office_expenses
    WHERE date >= ${`${year}-01-01`} AND date <= ${`${year}-12-31`} AND office = ''`)).rows as any[];
  const masrafActual = Array(12).fill(0) as number[];
  const gelirActual = Array(12).fill(0) as number[];
  for (const r of expRows) {
    const i = Number(r.m) - 1;
    if (i < 0 || i > 11) continue;
    if (r.type === "expense") masrafActual[i] += Number(r.total ?? 0);
    else if (r.type === "income") gelirActual[i] += Number(r.total ?? 0);
  }

  const expTargetRows = (await db.execute(sql`
    SELECT month AS m, type, SUM(amount) AS total
    FROM expense_targets
    WHERE year = ${year}${expOffice}
    GROUP BY 1, 2`)).rows as any[];
  const masrafHedef = Array(12).fill(0) as number[];
  const gelirHedef = Array(12).fill(0) as number[];
  for (const r of expTargetRows) {
    const i = Number(r.m) - 1;
    if (i < 0 || i > 11) continue;
    if (r.type === "expense") masrafHedef[i] += Number(r.total ?? 0);
    else if (r.type === "income") gelirHedef[i] += Number(r.total ?? 0);
  }

  // ── Satırlar ───────────────────────────────────────────────────────────────
  const num = (v: unknown) => Number(v ?? 0) || 0;
  const months: KonsolideMonth[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const t = trend.get(m);
    const f = fin.get(m);
    const bhbActual = num(t?.bhb);
    const bmActual = num(t?.bm);
    const bmHedef = num(f?.bm);
    const bmHedefHigh = num(f?.bm_high);
    const netActual: CatCounts = {
      K0: brutActual[i].K0 - leftActual[i].K0,
      K1: brutActual[i].K1 - leftActual[i].K1,
      K2: brutActual[i].K2 - leftActual[i].K2,
      toplam: brutActual[i].toplam - leftActual[i].toplam,
    };
    return {
      month: m,
      randevu: { hedef: randevuHedef[i], actual: randevuActual[i] },
      brut: { hedef: brutHedef[i], actual: brutActual[i] },
      net: { hedef: netHedef[i], actual: netActual },
      bhb: { hedef: num(f?.bhb), hedefHigh: num(f?.bhb_high), actual: bhbActual },
      bm: { hedef: bmHedef, hedefHigh: bmHedefHigh, actual: bmActual },
      satilik: { hedef: num(f?.satilik), hedefHigh: num(f?.satilik_high), actual: num(t?.satilikCount) },
      kiralik: { hedef: num(f?.kiralik), hedefHigh: num(f?.kiralik_high), actual: num(t?.kiralikCount) },
      masraf: { hedef: masrafHedef[i], actual: masrafActual[i] },
      digerGelir: { hedef: gelirHedef[i], actual: gelirActual[i] },
      kar: {
        hedef: bmHedef + gelirHedef[i] - masrafHedef[i],
        hedefHigh: bmHedefHigh + gelirHedef[i] - masrafHedef[i],
        actual: bmActual + gelirActual[i] - masrafActual[i],
      },
    };
  });

  // Kâr/Zarar verisi (masraf, diğer gelir, kar) uygulamanın diğer yerlerinde yalnız admin'e açık;
  // finansal erişimli HM'ler için bu kolonlar sıfırlanır ve istemci gizler.
  if (!includePnl) {
    const z = { hedef: 0, hedefHigh: 0, actual: 0 };
    for (const m of months) { m.masraf = { ...z }; m.digerGelir = { ...z }; m.kar = { ...z }; }
  }
  return {
    year, office, includesPnl: includePnl,
    unassignedExpenseRows: Number(unassigned?.c ?? 0),
    ytdThroughMonth: ytdThroughMonthFor(year, today), months,
  };
}
