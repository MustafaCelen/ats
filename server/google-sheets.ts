import { google } from "googleapis";
import { storage } from "./storage";
import { getOAuth2ClientForUser } from "./google";
import type { ClosingWithDetails, ClosingAgentWithEmployee, ClosingSideWithAgents } from "@shared/schema";

// Servis hesabı KEY'i değil — organizasyon policy'si servis hesabı key oluşturmayı
// engellediği için, uygulamanın zaten Takvim için kullandığı per-user Google OAuth
// akışını (server/google.ts) reddediyoruz. Belirlenen bir admin kullanıcı uygulamada
// "Google'a bağlan" (calendar.events + spreadsheets scope) yapar, biz onun kayıtlı
// access/refresh token'ını kullanarak Sheets'e yazarız. Token süresi dolarsa
// getOAuth2ClientForUser otomatik yeniler (aynı Calendar'da kullanılan mekanizma).
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SYNC_USER_EMAIL = process.env.GOOGLE_SHEETS_SYNC_USER_EMAIL;
// Ofisi çözülemeyen (officeSnapshot + candidate.office ikisi de boş) satırların yazılacağı
// varsayılan sekme — sistemde ana ofis Akatlar olduğu için oraya düşürüyoruz.
const DEFAULT_OFFICE_TAB = process.env.GOOGLE_SHEETS_DEFAULT_TAB || "Akatlar";
// Boot'ta başlığı önden yazılacak/oluşturulacak sekmeler.
const KNOWN_OFFICE_TABS = ["Akatlar", "Zekeriyaköy"];

let warnedMissingConfig = false;
let warnedNotConnected = false;

async function getSheetsClient() {
  if (!SPREADSHEET_ID || !SYNC_USER_EMAIL) {
    if (!warnedMissingConfig) {
      console.warn("[google-sheets] GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SHEETS_SYNC_USER_EMAIL not configured — closing sync to Sheets disabled");
      warnedMissingConfig = true;
    }
    return null;
  }
  const user = await storage.getUserByEmailFull(SYNC_USER_EMAIL);
  if (!user?.googleRefreshToken) {
    if (!warnedNotConnected) {
      console.warn(`[google-sheets] ${SYNC_USER_EMAIL} henüz uygulamada Google'a bağlanmamış (refresh token yok) — closing sync to Sheets disabled`);
      warnedNotConnected = true;
    }
    return null;
  }
  const auth = await getOAuth2ClientForUser(user);
  return google.sheets({ version: "v4", auth });
}

// Kullanıcının kendi master closings şablonuyla BİREBİR aynı kolonlar (+ başa Closing ID).
// Her (taraf × danışman) kombinasyonu ayrı bir satır. Sayılar tr-TR formatında (nokta
// binlik, virgül ondalık) yazılıyor — sheet'in kendi locale'i buna göre sayı olarak
// parse ediyor (USER_ENTERED).
export const CLOSING_SHEET_HEADERS = [
  "Closing ID",
  "Danışman", "KWUID", "İlgili Ay", "İşlem", "İşlem Tipi", "Taraf",
  "İşlem Tarihi", "İşlem Değeri",
  "BHB", "KWTR", "KWTR (+KDV)", "PlatinKarma", "PlatinKarma (KDV)", "ÜK", "Danışman",
  "Kasa", "Nakit", "Banka",
  "BHB Oranı", "İşlem Hacmi", "İşlem Oranı (Taraf Sayısı)",
  "İl", "İlçe", "Semt/Mahalle", "Adres", "Mülkle İlgili Detay Bilgiler",
  "Açılış Rakamı", "Kapanış Rakamı", "İndirim Oranı", "Süre/Gün",
  "Müşteri nereden buldu?", "Yönlendirme Bilgisi",
];

const SIDE_LABEL: Record<string, string> = { buyer: "Alıcı", seller: "Satıcı", referral: "Yönlendirme" };
// Kaynak şablonda Kiralık işlemler "Kiralama" olarak yazılıyor (import tarafı da bunu
// Kiralık'a geri çeviriyor) — Satış ve Yönlendirme olduğu gibi kalıyor.
const DEAL_CATEGORY_LABEL: Record<string, string> = { "Kiralık": "Kiralama" };

const trNum = (v: string | number | null | undefined, decimals = 2): string => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "0");
  if (isNaN(n)) return "";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
const trPercent = (n: number, decimals = 2): string => `${trNum(n, decimals)}%`;
const trDate = (d: Date | string | null | undefined): string => {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
};

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
// İlgili Ay'ı şablon formatına ("1-Ocak") çevirir. Kayıtlı ilgiliAy ("YYYY-MM" veya
// "MM/YYYY") varsa ondan, yoksa kapanış tarihinden ayı türetir.
const trIlgiliAy = (ilgiliAy: string | null | undefined, fallbackDate: Date | string | null | undefined): string => {
  let monthNum: number | null = null;
  if (ilgiliAy) {
    const ym = ilgiliAy.match(/^(\d{4})-(\d{1,2})$/);          // YYYY-MM
    const my = ilgiliAy.match(/^(\d{1,2})\/(\d{4})$/);          // MM/YYYY
    if (ym) monthNum = parseInt(ym[2], 10);
    else if (my) monthNum = parseInt(my[1], 10);
  }
  if (monthNum == null && fallbackDate) {
    const d = new Date(fallbackDate);
    if (!isNaN(d.getTime())) monthNum = d.getMonth() + 1;
  }
  if (monthNum == null || monthNum < 1 || monthNum > 12) return "";
  return `${monthNum}-${TR_MONTHS[monthNum - 1]}`;
};

// İşlem Oranı / İşlem Hacmi — Mahalle Bazlı Danışman Karnesi'ndeki ile aynı formül:
// perSide = Kiralık ? saleValue/2 : saleValue × commissionRate/100; oran = bhbShare/perSide;
// hacim = (Kiralık ? saleValue×12 : saleValue) × oran (Kiralık'ta saleValue aylık kira bedeli).
function islemOrani(closing: ClosingWithDetails, agent: ClosingAgentWithEmployee): number {
  const sale = parseFloat(closing.saleValue ?? "0");
  const rate = parseFloat(closing.commissionRate ?? "0");
  const perSide = closing.dealCategory === "Kiralık" ? sale / 2 : sale * rate / 100;
  if (perSide <= 0) return 0;
  return parseFloat(agent.bhbShare ?? "0") / perSide;
}
function islemHacmi(closing: ClosingWithDetails, oran: number): number {
  const sale = parseFloat(closing.saleValue ?? "0");
  return (closing.dealCategory === "Kiralık" ? sale * 12 : sale) * oran;
}

function buildAgentRow(closing: ClosingWithDetails, side: ClosingSideWithAgents, agent: ClosingAgentWithEmployee): string[] {
  const saleValue = parseFloat(closing.saleValue ?? "0");
  const openingPrice = closing.openingPrice != null ? parseFloat(closing.openingPrice) : null;
  const indirimOrani = openingPrice && openingPrice > 0 ? ((saleValue - openingPrice) / openingPrice) * 100 : null;
  const oran = islemOrani(closing, agent);
  const hacim = islemHacmi(closing, oran);
  return [
    String(closing.id),
    agent.employeeName ?? agent.candidateName ?? "",
    agent.kwuid ?? "",
    trIlgiliAy(agent.ilgiliAy ?? closing.ilgiliAy, agent.closingDate ?? closing.closingDate),
    DEAL_CATEGORY_LABEL[closing.dealCategory] ?? closing.dealCategory,
    closing.dealType,
    SIDE_LABEL[side.sideType] ?? side.sideType,
    trDate(agent.closingDate ?? closing.closingDate),
    trNum(closing.saleValue),
    trNum(agent.bhbShare), trNum(agent.mainBranchShare), trNum(agent.kwtrKdv), trNum(agent.marketCenterActual), trNum(agent.bmKdv), trNum(agent.ukShare), trNum(agent.employeeNet),
    trNum(agent.kasa), trNum(agent.nakit), trNum(agent.banka),
    trPercent(parseFloat(closing.commissionRate ?? "0")), trNum(hacim), trNum(oran),
    closing.il ?? "", closing.ilce ?? "", closing.mahalle ?? "", closing.propertyAddress, closing.propertyDetails ?? "",
    trNum(closing.openingPrice), trNum(closing.saleValue), indirimOrani != null ? trPercent(indirimOrani) : "",
    closing.durationDays != null ? String(closing.durationDays) : "",
    closing.customerSource ?? "", closing.referralInfo ?? "",
  ];
}

// Satırları danışmanın ofisine göre (sekme adı = ofis) gruplar. Ofisi çözülemeyen
// satırlar DEFAULT_OFFICE_TAB'a düşer.
export function buildClosingSheetRowsByOffice(closing: ClosingWithDetails): Map<string, string[][]> {
  const byTab = new Map<string, string[][]>();
  for (const side of closing.sides as ClosingSideWithAgents[]) {
    for (const agent of side.agents) {
      const tab = (agent.office?.trim() || DEFAULT_OFFICE_TAB);
      if (!byTab.has(tab)) byTab.set(tab, []);
      byTab.get(tab)!.push(buildAgentRow(closing, side, agent));
    }
  }
  return byTab;
}

// Bir sekmenin var olduğundan (yoksa oluşturur) ve başlık satırının yazıldığından emin olur.
// Aynı boot/istek içinde tekrar tekrar kontrol etmemek için hangi sekmelerin hazır olduğunu
// hafızada tutar.
const readyTabs = new Set<string>();
async function ensureTab(sheets: any, tab: string): Promise<boolean> {
  if (readyTabs.has(tab)) return true;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID!, fields: "sheets.properties.title" });
    const titles: string[] = (meta.data.sheets ?? []).map((s: any) => s.properties?.title).filter(Boolean);
    if (!titles.includes(tab)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID!,
        requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
      });
      console.log(`[google-sheets] '${tab}' sekmesi oluşturuldu`);
    }
    // Başlık satırı boşsa yaz.
    const head = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID!, range: `${tab}!A1:A1` });
    if (!head.data.values || head.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID!,
        range: `${tab}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [CLOSING_SHEET_HEADERS] },
      });
      console.log(`[google-sheets] '${tab}' başlık satırı yazıldı`);
    }
    readyTabs.add(tab);
    return true;
  } catch (e: any) {
    console.error(`[google-sheets] '${tab}' sekmesi hazırlanamadı:`, e?.message ?? e);
    return false;
  }
}

async function appendRows(sheets: any, tab: string, rows: string[][], label: string | number): Promise<void> {
  // Rate limit'e (429) takılırsa 3 denemeye kadar artan bekleme ile tekrar dener.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID!,
        range: `${tab}!A1`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: rows },
      });
      return;
    } catch (e: any) {
      const status = e?.code ?? e?.response?.status;
      const retryable = status === 429 || (typeof status === "number" && status >= 500);
      if (retryable && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
        continue;
      }
      console.error(`[google-sheets] append failed (${label}, tab ${tab}, attempt ${attempt}):`, e?.message ?? e);
      return;
    }
  }
}

// Birden fazla closing'in satırlarını sekme başına TEK bir append çağrısında toplu yazar.
// CSV toplu import'ta her satır için ayrı ayrı çağrılınca (10'arlı paralel gruplar) Sheets
// API rate limit'ine (429) takılıp importu ciddi yavaşlatıyordu — artık import bitince
// tüm satırlar sekme başına tek seferde yazılıyor.
async function appendClosingsToSheet(closingsList: ClosingWithDetails[]): Promise<void> {
  if (closingsList.length === 0) return;
  const sheets = await getSheetsClient();
  if (!sheets) return;
  const byTab = new Map<string, string[][]>();
  for (const closing of closingsList) {
    const rowsByTab = buildClosingSheetRowsByOffice(closing);
    for (const [tab, rows] of Array.from(rowsByTab.entries())) {
      if (!byTab.has(tab)) byTab.set(tab, []);
      byTab.get(tab)!.push(...rows);
    }
  }
  for (const [tab, rows] of Array.from(byTab.entries())) {
    if (rows.length === 0) continue;
    const ok = await ensureTab(sheets, tab);
    if (!ok) continue;
    await appendRows(sheets, tab, rows, `bulk×${closingsList.length}`);
  }
}

export async function appendClosingToSheet(closing: ClosingWithDetails): Promise<void> {
  return appendClosingsToSheet([closing]);
}

// Sunucu boot'unda bir kez çağrılır — bilinen ofis sekmelerini (boşsa) başlıkla hazırlar.
export async function ensureClosingSheetHeader(): Promise<void> {
  const sheets = await getSheetsClient();
  if (!sheets) return;
  for (const tab of KNOWN_OFFICE_TABS) {
    await ensureTab(sheets, tab);
  }
}
