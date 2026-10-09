// ── Üretkenlik Koçluğu Programı: 45+45 Başarı Rotası ─────────────────────────
// 6 haftalık program şablonu (KW Platin & Karma PDF'inden, yazım hataları düzeltildi)
// ve skor tablosu. Sunucu ve istemci ortak kullanır.
//
// Puanlama (onaylı karar, Ekim 2026): orantılı — her skor kaleminin puanı ×
// min(1, yapılan / planlanan). "Katkı Payı Yönlendirme" plan kutucuğundan değil,
// danışmanın referans olduğu adaylardan sayılır. Hedef puanları (Arama, Randevu…)
// sonraya bırakıldı; şimdilik yalnızca gerçekleşenler tutulur.

export const UK_PROGRAM_WEEKS = 6;

export const UK_TIME_ROWS = [
  "08:45–09:30",
  "09:30–12:00",
  "13:00–14:00",
  "14:00–15:00",
  "15:00–16:00",
  "16:00–17:00",
  "17:00–17:30",
  "17:30–17:45",
  "Z Raporu",
  "Başucu Notları",
] as const;

export const UK_DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"] as const;

export type UkScoreKey =
  | "mp" | "vt" | "grup" | "guc" | "script" | "katki" | "krb" | "atolye" | "egitim"
  | "uzmanlik" | "ilan" | "sosyal" | "drive" | "oryantasyon" | "webportal" | "deger" | "sobp";

// Skor tablosu — aktivite tarafı (toplam 50).
export const UK_SCORE_ITEMS: { key: UkScoreKey; label: string; points: number }[] = [
  { key: "mp",          label: "Müşteri Potansiyeli Yaratma",                 points: 10 },
  { key: "vt",          label: "Veritabanı Kullanımı",                        points: 7 },
  { key: "grup",        label: "Grup Toplantısına Katılım",                   points: 4 },
  { key: "guc",         label: "Güçlendirme Saati Katılımı",                  points: 4 },
  { key: "script",      label: "Script Çalışması",                            points: 4 },
  { key: "katki",       label: "Katkı Payı Yönlendirme",                      points: 3 },
  { key: "krb",         label: "KRB Hazırlama",                               points: 3 },
  { key: "atolye",      label: "Atölye Katılımı",                             points: 2 },
  { key: "egitim",      label: "Eğitimlere Katılım",                          points: 2 },
  { key: "uzmanlik",    label: "Uzmanlık Bölgesi Saha Çalışması",             points: 2 },
  { key: "ilan",        label: "İlan Girişlerini Yapmayı Öğrenme",            points: 2 },
  { key: "sosyal",      label: "Sosyal Medya Aktifliği",                      points: 2 },
  { key: "drive",       label: "Drive Dokümanlarının Okunması",               points: 1 },
  { key: "oryantasyon", label: "Oryantasyon Katılımı",                        points: 1 },
  { key: "webportal",   label: "Webportalda Görünür Olma",                    points: 1 },
  { key: "deger",       label: "Değer Bildirimi Hazırlaması",                 points: 1 },
  { key: "sobp",        label: "Satış Öncesi Bilgilendirme Paketi Kişiselleştirme", points: 1 },
];

// Katkı payı planda kutucuk değil; tam puan için beklenen yönlendirme sayısı
// (hedefle aynı: 6 hafta sonunda 2 referans aday).
export const UK_KATKI_PLANNED = 2;

// Skor tablosu — hedef tarafı (2026-10-09 onaylı hedefler ve puan dağılımı, toplam 50).
//  weekly: her hafta ayrı değerlendirilir (haftalık oran 1'de kesilir), 6 haftanın ortalaması.
//  total : 6 haftanın toplamı program hedefiyle karşılaştırılır.
// target null: tutar hedefi yok, gerçekleşen > 0 ise tam puan (BHB — 2026-10-09 onaylı).
export type UkTargetKey = "arama" | "randevu" | "tekYetki" | "kapanis" | "bhb" | "katkiPayi";
export type UkTargetItem = {
  key: UkTargetKey; label: string; points: number;
  source: "manual" | "auto"; mode: "weekly" | "total"; target: number | null; hint: string;
};
export const UK_TARGET_ITEMS: readonly UkTargetItem[] = [
  { key: "arama",     label: "Arama",               points: 10, source: "manual", mode: "weekly", target: 50, hint: "Günde 10 arama (haftada 50)" },
  { key: "randevu",   label: "Randevu",             points: 8,  source: "manual", mode: "weekly", target: 1,  hint: "Haftada 1 randevu" },
  { key: "tekYetki",  label: "Tek Yetki (Satılık)", points: 8,  source: "manual", mode: "total",  target: 1,  hint: "6 hafta sonunda 1 satılık tek yetki" },
  { key: "kapanis",   label: "Kapanış",             points: 8,  source: "auto",   mode: "total",  target: 1,  hint: "6 hafta sonunda 1 kapanış (satılık veya kiralık)" },
  { key: "bhb",       label: "BHB",                 points: 8,  source: "auto",   mode: "total",  target: null, hint: "6 hafta içinde BHB oluşursa (0 ₺ üzeri) tam puan" },
  { key: "katkiPayi", label: "Katkı Payı",          points: 8,  source: "auto",   mode: "total",  target: 2,  hint: "6 hafta sonunda 2 referans aday" },
];

export type UkActivity = {
  id: string;            // kalıcı kimlik: w{hafta}-d{gün}-r{başlangıç satırı}
  week: number;          // 1..6
  day: number;           // 0 = Pazartesi … 4 = Cuma
  from: number;          // UK_TIME_ROWS indeksi (dahil)
  to: number;            // UK_TIME_ROWS indeksi (dahil)
  label: string;
  score?: UkScoreKey;
};

// Kısa yazım: [gün, başlangıç satırı, bitiş satırı, etiket, skor?]
type Row = [number, number, number, string, UkScoreKey?];

const GUC = "Güçlendirme Saatine Katıl";
const EGT = "Eğitimlere Katıl";
const MP = "Müşteri Potansiyeli Yarat";
const ARAMA = "Haftalık Arama Listesi Hazırla";
const GRUP = "ÜK Grup Toplantısına Katıl";
const ATOLYE = "ÜK Atölye Çalışmasına Katıl";
const SOSYAL = "Sosyal Medyada Etkileşim Yap";
const NETWORK = "Ofiste Network";
const ILK = "İlk Görüşme Randevusuna Git";
const KRB = "Karşılaştırmalı Rayiç Bedel Raporu Hazırla";
const SCRIPT = "Script Çalışma ve Role Play Yap";
const ZRAPOR = "Günlük İpuçlarını Veri Tabanına İşle";
const ILAN = "Webportal ve İlan Sitesi Girişlerini Yap";
const UZM_MP = "Uzmanlık Bölgesinde Müşteri Potansiyeli Yarat";

// Her gün tekrarlanan satırlar: güçlendirme (08:45), script (17:30), Z raporu, başucu notu.
function daily(book: string): Row[] {
  const out: Row[] = [];
  for (let d = 0; d < 5; d++) {
    out.push([d, 0, 0, GUC, "guc"]);
    out.push([d, 7, 7, SCRIPT, "script"]);
    out.push([d, 8, 8, ZRAPOR, "vt"]);
    out.push([d, 9, 9, book]);
  }
  return out;
}

const MILYONER = "Milyoner Gayrimenkul Danışmanı Kitabını Oku";
const IGNITE = "Ignite 6.0 Oku";
const TEKBIRSEY = "Tek Bir Şey Kitabını Oku";

const WEEK_ROWS: Record<number, Row[]> = {
  1: [
    ...daily(MILYONER),
    [0, 1, 1, EGT, "egitim"], [0, 2, 2, ARAMA], [0, 3, 4, MP, "mp"],
    [0, 5, 5, "Google Takvimi Entegrasyonunu Yap"], [0, 6, 6, "Sosyal Medya Hesabı Aç", "sosyal"],
    [1, 1, 1, EGT, "egitim"], [1, 2, 3, MP, "mp"], [1, 4, 5, "Değer Bildirimini Hazırla", "deger"],
    [1, 6, 6, "Drive İçeriklerini Keşfet", "drive"],
    [2, 1, 1, EGT, "egitim"], [2, 2, 3, GRUP, "grup"], [2, 4, 4, MP, "mp"],
    [2, 5, 5, "Sözleşme ve Evrakları Oku"], [2, 6, 6, SOSYAL, "sosyal"],
    [3, 1, 1, EGT, "egitim"], [3, 2, 4, MP, "mp"], [3, 5, 5, "Sözleşme ve Evrakları Oku"], [3, 6, 6, SOSYAL, "sosyal"],
    [4, 1, 1, MP, "mp"], [4, 2, 4, ATOLYE, "atolye"], [4, 5, 5, NETWORK], [4, 6, 6, SOSYAL, "sosyal"],
  ],
  2: [
    ...daily(MILYONER),
    [0, 1, 1, EGT, "egitim"], [0, 2, 2, ARAMA], [0, 3, 5, MP, "mp"], [0, 6, 6, SOSYAL, "sosyal"],
    [1, 1, 2, MP, "mp"], [1, 3, 3, "Satış Öncesi Bilgilendirme Paketini Oku ve Kişiselleştir", "sobp"],
    [1, 4, 4, "Kartvizit ve Yaka Kartını İlk İzlenim Direktörü ile Görüş"],
    [1, 5, 5, "KW Portalda Profilini Güncelle", "webportal"], [1, 6, 6, "WhatsApp Gruplarını Takip Et"],
    [2, 1, 1, EGT, "egitim"], [2, 2, 3, GRUP, "grup"], [2, 4, 4, MP, "mp"], [2, 5, 6, ILK],
    [3, 1, 1, EGT, "egitim"], [3, 2, 4, MP, "mp"], [3, 5, 5, "KRB Dosyasını Oku", "krb"], [3, 6, 6, SOSYAL, "sosyal"],
    [4, 1, 1, MP, "mp"], [4, 2, 4, ATOLYE, "atolye"], [4, 5, 5, NETWORK], [4, 6, 6, SOSYAL, "sosyal"],
  ],
  3: [
    ...daily(IGNITE),
    [0, 1, 1, ARAMA], [0, 2, 2, MP, "mp"], [0, 3, 6, "Oryantasyona Katıl", "oryantasyon"],
    [1, 1, 1, EGT, "egitim"], [1, 2, 2, "Doğru Fiyat Kılavuzunu Oku"], [1, 3, 5, ILK], [1, 6, 6, SOSYAL, "sosyal"],
    [2, 1, 1, MP, "mp"], [2, 2, 3, GRUP, "grup"], [2, 4, 5, ILK], [2, 6, 6, SOSYAL, "sosyal"],
    [3, 1, 1, EGT, "egitim"], [3, 2, 3, MP, "mp"], [3, 4, 6, KRB, "krb"],
    [4, 1, 1, MP, "mp"], [4, 2, 4, ATOLYE, "atolye"], [4, 5, 5, NETWORK], [4, 6, 6, SOSYAL, "sosyal"],
  ],
  4: [
    ...daily(IGNITE),
    [0, 1, 1, ARAMA], [0, 2, 2, MP, "mp"], [0, 3, 3, "GADİ Sunumuna Katıl"],
    [0, 4, 4, "14 Aşamalı Pazarlama Planını Gözden Geçir"], [0, 5, 6, "KRB Sunum Randevusuna Git"],
    [1, 1, 1, EGT, "egitim"], [1, 2, 2, "Portföy Fotoğraf Çekimi"], [1, 3, 4, ILAN, "ilan"],
    [1, 5, 5, "Pazarlama Çalışmalarını Planla"], [1, 6, 6, "Portföy Sunumu Hazırla"],
    [2, 1, 1, MP, "mp"], [2, 2, 3, GRUP, "grup"], [2, 4, 5, ILK], [2, 6, 6, SOSYAL, "sosyal"],
    [3, 1, 1, EGT, "egitim"], [3, 2, 3, "Uzmanlık Bölgeni Keşfet", "uzmanlik"], [3, 4, 4, "Open House'a Katıl"],
    [3, 5, 6, KRB, "krb"],
    [4, 1, 1, MP, "mp"], [4, 2, 4, ATOLYE, "atolye"], [4, 5, 6, "Alıcı İpuçlarına Çalış"],
  ],
  5: [
    ...daily(TEKBIRSEY),
    [0, 1, 1, ARAMA], [0, 2, 2, MP, "mp"], [0, 3, 4, "KRB Sunumuna Git"], [0, 5, 6, "Yer Gösterme Yap"],
    [1, 1, 1, EGT, "egitim"], [1, 2, 3, MP, "mp"], [1, 4, 4, "Portföy Fotoğraf Çekimi"], [1, 5, 5, ILAN, "ilan"],
    [1, 6, 6, "WhatsApp Gruplarında Portföy Takibi"],
    [2, 1, 1, MP, "mp"], [2, 2, 3, GRUP, "grup"], [2, 4, 4, ILK], [2, 5, 6, "Yer Gösterme Randevusu"],
    [3, 1, 2, UZM_MP, "uzmanlik"], [3, 3, 4, "Müzakere ve Teklif Yönetimi"], [3, 5, 6, KRB, "krb"],
    [4, 1, 1, "Kira Kontratı"], [4, 2, 4, ATOLYE, "atolye"], [4, 5, 5, "Çalışma Raporu Hazırla"], [4, 6, 6, SOSYAL, "sosyal"],
  ],
  6: [
    ...daily(TEKBIRSEY),
    [0, 1, 1, ARAMA], [0, 2, 3, MP, "mp"], [0, 4, 5, ILK], [0, 6, 6, SOSYAL, "sosyal"],
    [1, 1, 1, EGT, "egitim"], [1, 2, 3, "Yer Gösterme Randevusuna Git"], [1, 4, 5, "Teklif Al – Teklif Ver / Müzakere Yönet"],
    [1, 6, 6, SOSYAL, "sosyal"],
    [2, 1, 1, MP, "mp"], [2, 2, 3, GRUP, "grup"], [2, 4, 4, NETWORK], [2, 5, 6, KRB, "krb"],
    [3, 1, 1, EGT, "egitim"], [3, 2, 4, UZM_MP, "uzmanlik"], [3, 5, 5, "Open House'a Katıl"], [3, 6, 6, SOSYAL, "sosyal"],
    [4, 1, 2, "Tapu / Kapanış İşlemleri"], [4, 3, 3, "Ofis ile Paylaşım"], [4, 4, 5, MP, "mp"],
    [4, 6, 6, "Çalışma Raporu Hazırla"],
  ],
};

export const UK_ACTIVITIES: UkActivity[] = Object.entries(WEEK_ROWS).flatMap(([w, rows]) =>
  rows.map(([day, from, to, label, score]) => ({
    id: `w${w}-d${day}-r${from}`,
    week: Number(w), day, from, to, label, score,
  })),
);

export const UK_ACTIVITY_IDS = new Set(UK_ACTIVITIES.map((a) => a.id));

// Skor kalemi başına planlanan kutucuk sayısı (katkı payı hariç).
export const UK_PLANNED: Record<UkScoreKey, number> = UK_SCORE_ITEMS.reduce((acc, it) => {
  acc[it.key] = it.key === "katki"
    ? UK_KATKI_PLANNED
    : UK_ACTIVITIES.filter((a) => a.score === it.key).length;
  return acc;
}, {} as Record<UkScoreKey, number>);

// Orantılı aktivite puanı. done: skor kalemi → yapılan adet.
export function computeUkActivityScore(done: Partial<Record<UkScoreKey, number>>) {
  const rows = UK_SCORE_ITEMS.map((it) => {
    const planned = UK_PLANNED[it.key];
    const d = Math.max(0, done[it.key] ?? 0);
    const ratio = planned > 0 ? Math.min(1, d / planned) : 0;
    return { ...it, planned, done: d, earned: Math.round(it.points * ratio * 10) / 10 };
  });
  const total = Math.round(rows.reduce((s, r) => s + r.earned, 0) * 10) / 10;
  const max = UK_SCORE_ITEMS.reduce((s, r) => s + r.points, 0);
  return { rows, total, max };
}

// Program 1. haftasının pazartesisi (başlangıç tarihinin haftası). YYYY-MM-DD.
export function ukProgramWeek1Monday(start: string): string {
  const d = new Date(start.slice(0, 10) + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Pazartesi
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function ukAddDays(ymd: string, days: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Bugün programın kaçıncı haftası (0 = başlamadı, 7 = tamamlandı).
export function ukCurrentWeek(week1Monday: string, todayYmd: string): number {
  const diff = Math.floor((Date.parse(todayYmd) - Date.parse(week1Monday)) / 86400000);
  if (diff < 0) return 0;
  return Math.min(UK_PROGRAM_WEEKS + 1, Math.floor(diff / 7) + 1);
}

// Program başlangıcı yalnızca pazartesi olabilir.
export function ukIsMonday(ymd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && new Date(ymd + "T00:00:00Z").getUTCDay() === 1;
}

// Bugün (todayYmd) belirtilen haftada olacak şekilde 1. hafta pazartesisi.
export function ukStartForCurrentWeek(todayYmd: string, week: number): string {
  return ukAddDays(ukProgramWeek1Monday(todayYmd), -(week - 1) * 7);
}

// Seçim listesi için pazartesiler (bugünün haftasından -before … +after hafta).
export function ukMondayOptions(todayYmd: string, before = 8, after = 12): string[] {
  const thisMonday = ukProgramWeek1Monday(todayYmd);
  const out: string[] = [];
  for (let i = -before; i <= after; i++) out.push(ukAddDays(thisMonday, i * 7));
  return out;
}

export type UkWeekActuals = Partial<Record<UkTargetKey, number | null>>;

// Hedef puanı. weeks: 1..6. haftaların gerçekleşenleri (eksik hafta = 0).
export function computeUkTargetScore(weeks: UkWeekActuals[]) {
  const rows = UK_TARGET_ITEMS.map((it) => {
    const vals = weeks.slice(0, UK_PROGRAM_WEEKS).map((w) => Math.max(0, Number(w[it.key]) || 0));
    const done = vals.reduce((s, v) => s + v, 0);
    const t = it.target;
    const ratio = t == null
      ? (done > 0 ? 1 : 0)
      : it.mode === "weekly"
        ? vals.reduce((s, v) => s + Math.min(1, v / t), 0) / UK_PROGRAM_WEEKS
        : Math.min(1, done / t);
    return {
      ...it, done: Math.round(done * 100) / 100,
      targetTotal: t == null ? null : it.mode === "weekly" ? t * UK_PROGRAM_WEEKS : t,
      weeksMet: it.mode === "weekly" && t != null ? vals.filter((v) => v >= t).length : null,
      earned: Math.round(it.points * ratio * 10) / 10,
    };
  });
  const total = Math.round(rows.reduce((s, r) => s + r.earned, 0) * 10) / 10;
  const max = UK_TARGET_ITEMS.reduce((s, r) => s + r.points, 0);
  return { rows, total, max };
}
