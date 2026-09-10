import { google } from "googleapis";
import { storage } from "./storage";
import { getOAuth2ClientForUser } from "./google";

// Bazı reklam formları Meta'nın kendi Lead Ads formu yerine bir Google Form'a yönlendiriyor —
// bu durumda lead'ler webhook'tan hiç geçmez, formun bağlı olduğu Google Sheets yanıt
// tablosundan okunması gerekir. server/google-sheets.ts'in kullandığı aynı per-user OAuth
// mekanizmasını (Takvim/Sheets için zaten bağlı bir admin hesabı) tekrar kullanıyoruz —
// servis hesabı gerekmiyor.
const SPREADSHEET_ID = process.env.GOOGLE_FORMS_SPREADSHEET_ID;
const SHEET_GID = process.env.GOOGLE_FORMS_SHEET_GID; // opsiyonel — verilmezse ilk sekme kullanılır
const SYNC_USER_EMAIL = process.env.GOOGLE_FORMS_SYNC_USER_EMAIL || process.env.GOOGLE_SHEETS_SYNC_USER_EMAIL;

export function isGoogleFormsConfigured(): boolean {
  return !!(SPREADSHEET_ID && SYNC_USER_EMAIL);
}

let warnedMissingConfig = false;
let warnedNotConnected = false;

async function getFormsSheetsClient() {
  if (!SPREADSHEET_ID || !SYNC_USER_EMAIL) {
    if (!warnedMissingConfig) {
      console.warn("[google-forms] GOOGLE_FORMS_SPREADSHEET_ID / GOOGLE_FORMS_SYNC_USER_EMAIL yapılandırılmamış — form lead senkronu devre dışı");
      warnedMissingConfig = true;
    }
    return null;
  }
  const user = await storage.getUserByEmailFull(SYNC_USER_EMAIL);
  if (!user?.googleRefreshToken) {
    if (!warnedNotConnected) {
      console.warn(`[google-forms] ${SYNC_USER_EMAIL} henüz uygulamada Google'a bağlanmamış (refresh token yok)`);
      warnedNotConnected = true;
    }
    return null;
  }
  const auth = await getOAuth2ClientForUser(user);
  return google.sheets({ version: "v4", auth });
}

async function resolveTabName(sheets: any): Promise<string | null> {
  if (!SHEET_GID) return null;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties" });
  const match = (meta.data.sheets ?? []).find((s: any) => String(s.properties?.sheetId) === SHEET_GID);
  return match?.properties?.title ?? null;
}

// Başlık satırından Ad Soyad / Telefon / Email alanlarını (TR yaygın varyasyonlarıyla) eşler —
// Meta lead eşlemesindeki (mapLeadToCandidate) aynı "içeriyor mu" mantığı. Bilinen alanlar
// dışında kalan ilk sütun serbest metin notu olarak alınır (candidate.resumeText'e yazılır).
function mapRowToCandidate(headers: string[], row: string[]): {
  name: string; email: string | null; phone: string | null; freeText: string | null; raw: Record<string, string>;
} {
  const raw: Record<string, string> = {};
  headers.forEach((h, i) => { if (h?.trim()) raw[h.trim()] = row[i] ?? ""; });

  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const hit = Object.keys(raw).find((fk) => fk.toLowerCase().includes(k.toLowerCase()));
      if (hit && raw[hit]?.trim()) return raw[hit].trim();
    }
    return null;
  };
  const name = pick("ad soyad", "isim", "full name", "name") ?? "Google Form Lead";
  const email = pick("email", "e-posta", "eposta", "e-mail");
  const phone = pick("telefon", "phone", "gsm", "tel");

  const knownKeys = ["ad soyad", "isim", "full name", "name", "email", "e-posta", "eposta", "e-mail", "telefon", "phone", "gsm", "tel", "timestamp", "zaman damgası"];
  const freeTextKey = Object.keys(raw).find((k) => !knownKeys.some((kk) => k.toLowerCase().includes(kk)));
  const freeText = freeTextKey ? (raw[freeTextKey]?.trim() || null) : null;

  return { name, email, phone, freeText, raw };
}

// Sheet'teki TÜM yanıt satırlarını tarar; google_form_leads (row_key bazlı) ile idempotent —
// tekrar çalıştırmak güvenlidir, zaten işlenmiş satırlar mükerrer aday açmaz.
export async function syncGoogleFormLeads(): Promise<{ scanned: number; imported: number; duplicates: number; errors: string[] }> {
  const errors: string[] = [];
  let scanned = 0, imported = 0, duplicates = 0;

  const sheets = await getFormsSheetsClient();
  if (!sheets) return { scanned, imported, duplicates, errors: ["Google Forms senkronu yapılandırılmamış ya da bağlı Google hesabı yok"] };

  const tabName = await resolveTabName(sheets);
  const range = tabName ? `${tabName}!A1:Z10000` : "A1:Z10000";

  let values: string[][];
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    values = res.data.values ?? [];
  } catch (e: any) {
    return { scanned, imported, duplicates, errors: [`Sheet okunamadı: ${e?.message ?? e}`] };
  }
  if (values.length < 2) return { scanned, imported, duplicates, errors };

  const headers = values[0];
  const tabKey = tabName ?? "sheet1";
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.every((c) => !c?.trim())) continue;
    scanned++;
    const rowKey = `${SPREADSHEET_ID}:${tabKey}:${i + 1}`;
    try {
      const mapped = mapRowToCandidate(headers, row);
      const result = await storage.ingestGoogleFormLead({
        rowKey,
        name: mapped.name,
        email: mapped.email,
        phone: mapped.phone,
        freeText: mapped.freeText,
        rawFields: mapped.raw,
      });
      if (result.duplicate) duplicates++; else imported++;
    } catch (e: any) {
      errors.push(`satır ${i + 1}: ${e?.message ?? e}`);
    }
  }
  return { scanned, imported, duplicates, errors };
}
