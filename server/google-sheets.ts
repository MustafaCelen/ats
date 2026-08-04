import { google } from "googleapis";
import { storage } from "./storage";
import { getOAuth2ClientForUser } from "./google";
import type { ClosingWithDetails } from "@shared/schema";

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

// CSV import şablonuyla aynı kolonlar — bu sheet'ten export edilip tekrar import
// edilebilsin diye. Her (taraf × danışman) kombinasyonu ayrı bir satır.
export const CLOSING_SHEET_HEADERS = [
  "Closing ID", "Taraf", "KWUID", "Danışman",
  "İşlem Tarihi", "İlgili Ay", "Durum",
  "İşlem", "İşlem Tipi", "İşlem Değeri", "BHB Oranı", "Açılış Rakamı", "Süre/Gün",
  "İl", "İlçe", "Semt/Mahalle", "Adres", "Mülkle İlgili Detay Bilgiler",
  "Alıcı Adı", "Satıcı Adı", "Müşteri nereden buldu?", "Yönlendirme Bilgisi", "Notlar",
  "Sözleşme Başlangıç Tarihi", "Sözleşme Bitiş Tarihi",
  "Pay (%)", "BHB", "KWTR", "KWTR (+KDV)", "BM (PlatinKarma)", "PlatinKarma (KDV)", "ÜK Tutarı", "Danışman Net",
  "Kasa", "Nakit", "Banka",
];

const SIDE_LABEL: Record<string, string> = { buyer: "Alıcı", seller: "Satıcı", referral: "Yönlendirme" };
const ymd = (d: Date | string | null | undefined) => d ? new Date(d).toISOString().slice(0, 10) : "";

export function buildClosingSheetRows(closing: ClosingWithDetails): string[][] {
  const rows: string[][] = [];
  for (const side of closing.sides) {
    for (const agent of side.agents) {
      rows.push([
        String(closing.id),
        SIDE_LABEL[side.sideType] ?? side.sideType,
        agent.kwuid ?? "",
        agent.employeeName ?? agent.candidateName ?? "",
        ymd(agent.closingDate ?? closing.closingDate),
        agent.ilgiliAy ?? closing.ilgiliAy ?? "",
        agent.status ?? closing.status,
        closing.dealCategory,
        closing.dealType,
        closing.saleValue,
        closing.commissionRate ?? "",
        closing.openingPrice ?? "",
        closing.durationDays != null ? String(closing.durationDays) : "",
        closing.il ?? "", closing.ilce ?? "", closing.mahalle ?? "", closing.propertyAddress, closing.propertyDetails ?? "",
        closing.buyerName ?? "", closing.sellerName ?? "", closing.customerSource ?? "", closing.referralInfo ?? "", closing.notes ?? "",
        ymd(closing.contractStartDate), ymd(closing.contractEndDate),
        agent.splitPercentage, agent.bhbShare, agent.mainBranchShare, agent.kwtrKdv, agent.marketCenterActual, agent.bmKdv, agent.ukShare, agent.employeeNet,
        agent.kasa ?? "", agent.nakit ?? "", agent.banka ?? "",
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
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID!,
      range: `${SHEET_TAB}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    });
  } catch (e: any) {
    console.error("[google-sheets] append failed:", e?.message ?? e);
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
