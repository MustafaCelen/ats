// Konsolide Rapor (KONSOLİDE 20xx Excel'inin birebir karşılığı) — sunucu ile istemcinin
// paylaştığı satır tipi ve YTD/TOPLAM/H-G% hesapları. Veri sunucuda ay bazında toplanır,
// satır toplamları ve yüzdeler istemcide (ve Excel aktarımında) bu yardımcılarla türetilir.

export const KONSOLIDE_CATS = ["K0", "K1", "K2"] as const;
export type KonsolideCat = (typeof KONSOLIDE_CATS)[number];

/** Kategori kırılımlı sayım (randevu / brüt / net). toplam = K0+K1+K2. */
export type CatCounts = { K0: number; K1: number; K2: number; toplam: number };

/** Hedef/gerçekleşen çifti; hedefHigh = Re-Forecast (yalnızca finansal kalemlerde). */
export type HedefActual = { hedef: number; hedefHigh?: number; actual: number };

export type KonsolideMonth = {
  month: number; // 1-12
  randevu: { hedef: CatCounts; actual: CatCounts };
  brut: { hedef: CatCounts; actual: CatCounts };
  /** net.actual = brüt − çıkış (kategori bazında); net.hedef.toplam = net_target toplamı,
   *  kategori hedefleri net_target_k0/k1/k2 (eski kayıtlarda 0 olabilir). */
  net: { hedef: CatCounts; actual: CatCounts };
  bhb: HedefActual;
  bm: HedefActual;
  satilik: HedefActual;
  kiralik: HedefActual;
  masraf: HedefActual;
  digerGelir: HedefActual;
  /** kar = bm + digerGelir − masraf (hedef tarafında bm hedefi Forecast/Re-Forecast seçimine göre). */
  kar: HedefActual;
};

export type KonsolideReport = {
  year: number;
  /** false ise masraf / diğer gelir / kar sıfırlanmıştır (Kâr-Zarar verisi yalnız admin görür). */
  includesPnl: boolean;
  /** YTD'ye dahil son ay (1-12); 0 = hiçbiri (gelecek yıl). Tamamlanmış aylar: içinde bulunulan ay hariç. */
  ytdThroughMonth: number;
  months: KonsolideMonth[]; // her zaman 12 satır
};

export const emptyCatCounts = (): CatCounts => ({ K0: 0, K1: 0, K2: 0, toplam: 0 });

export const addCatCounts = (a: CatCounts, b: CatCounts): CatCounts => ({
  K0: a.K0 + b.K0, K1: a.K1 + b.K1, K2: a.K2 + b.K2, toplam: a.toplam + b.toplam,
});

/** Excel'deki YTD mantığı: raporlanan yıl bu yılsa önceki ayın sonuna kadar; geçmiş yılsa 12; gelecekse 0. */
export function ytdThroughMonthFor(year: number, today = new Date()): number {
  const y = today.getFullYear();
  if (year < y) return 12;
  if (year > y) return 0;
  return today.getMonth(); // 0-based ay = tamamlanmış ay sayısı
}

/** Aylık H/G%: (Actual − Hedef) / Hedef. Hedef yoksa null ("-"); negatif actual (net çıkış, zarar) yüzdeye yansır. */
export function monthlyHgPct(hedef: number, actual: number): number | null {
  if (!(hedef > 0)) return null;
  return Math.round(((actual - hedef) / hedef) * 100);
}

/** YTD / TOPLAM satırı H/G%: Actual / Hedef. */
export function cumulativeHgPct(hedef: number, actual: number): number | null {
  if (!(hedef > 0)) return null;
  return Math.round((actual / hedef) * 100);
}
