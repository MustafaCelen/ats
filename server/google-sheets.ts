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
const SHEET_TAB = process.env.GOOGLE_SHEETS_TAB_NAME || "Closings";
const SYNC_USER_EMAIL = process.env.GOOGLE_SHEETS_SYNC_USER_EMAIL;

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

export function buildClosingSheetRows(closing: ClosingWithDetails): string[][] {
  const saleValue = parseFloat(closing.saleValue ?? "0");
  const openingPrice = closing.openingPrice != null ? parseFloat(closing.openingPrice) : null;
  const indirimOrani = openingPrice && openingPrice > 0 ? ((saleValue - openingPrice) / openingPrice) * 100 : null;

  const rows: string[][] = [];
  for (const side of closing.sides as ClosingSideWithAgents[]) {
    for (const agent of side.agents) {
      const oran = islemOrani(closing, agent);
      const hacim = islemHacmi(closing, oran);
      rows.push([
        String(closing.id),
        agent.employeeName ?? agent.candidateName ?? "",
        agent.kwuid ?? "",
        agent.ilgiliAy ?? closing.ilgiliAy ?? "",
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
      ]);
    }
  }
  return rows;
}

export async function appendClosingToSheet(closing: ClosingWithDetails): Promise<void> {
  const sheets = await getSheetsClient();
  if (!sheets) return;
  const rows = buildClosingSheetRows(closing);
  if (rows.length === 0) return;

  // Toplu CSV import'ta closing'ler 10'arlı paralel gruplar halinde işleniyor — Sheets API
  // rate limit'e (429) takılabiliyor. 3 denemeye kadar artan bekleme ile tekrar dener.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID!,
        range: `${SHEET_TAB}!A1`,
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
      console.error(`[google-sheets] append failed (closing ${closing.id}, attempt ${attempt}):`, e?.message ?? e);
      return;
    }
  }
}

// Sunucu boot'unda bir kez çağrılır — sheet boşsa başlık satırını yazar.
export async function ensureClosingSheetHeader(): Promise<void> {
  const sheets = await getSheetsClient();
  if (!sheets) return;
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID!, range: `${SHEET_TAB}!A1:A1` });
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID!,
        range: `${SHEET_TAB}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [CLOSING_SHEET_HEADERS] },
      });
      console.log("[google-sheets] header row written");
    }
  } catch (e: any) {
    console.error("[google-sheets] header check failed:", e?.message ?? e);
  }
}
