const FONZIP_BASE = "https://fonzip.com/api/v2";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;
let manualTokenExpired = false;
let dbTableReady = false;

async function ensureConfigTable() {
  if (dbTableReady) return;
  const { pool } = await import("./db");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _fonzip_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at TIMESTAMPTZ
    )
  `);
  dbTableReady = true;
}

async function loadTokenFromDB(ignoreExpiry = false): Promise<TokenCache | null> {
  try {
    await ensureConfigTable();
    const { pool } = await import("./db");
    // DB token her zaman getir; Fonzip token'ları takip ettiğimizden uzun ömürlü,
    // expiry sadece bilgi amaçlı. Gerçek expire tespiti API 401'inde yapılır.
    const res = await pool.query(
      ignoreExpiry
        ? "SELECT value, expires_at FROM _fonzip_config WHERE key = 'token'"
        : "SELECT value, expires_at FROM _fonzip_config WHERE key = 'token'"
    );
    if (res.rows.length === 0) return null;
    return { token: res.rows[0].value, expiresAt: new Date(res.rows[0].expires_at).getTime() };
  } catch (e: any) {
    console.error("[fonzip] loadTokenFromDB hatası:", e?.message);
    return null;
  }
}

async function deleteDBToken() {
  try {
    const { pool } = await import("./db");
    await pool.query("DELETE FROM _fonzip_config WHERE key = 'token'");
  } catch { /* ignore */ }
}

async function saveTokenToDB(token: string, expiresAt: number) {
  try {
    await ensureConfigTable();
    const { pool } = await import("./db");
    await pool.query(
      `INSERT INTO _fonzip_config (key, value, expires_at) VALUES ('token', $1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $1, expires_at = $2`,
      [token, new Date(expiresAt).toISOString()]
    );
    console.log("[fonzip] Token DB'ye kaydedildi, expires:", new Date(expiresAt).toISOString());
  } catch (e: any) {
    console.error("[fonzip] Token DB'ye kaydedilemedi:", e?.message);
  }
}

async function createFreshToken(retryOn409 = true): Promise<string> {
  const clientId = process.env.FONZIP_CLIENT_ID;
  const clientSecret = process.env.FONZIP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("FONZIP_CLIENT_ID ve FONZIP_CLIENT_SECRET env değişkenleri tanımlı değil.");
  }

  const doCreate = async () => fetch(`${FONZIP_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  let res = await doCreate();

  // 409: Fonzip'te aktif token var. Beklet ve retry (max 6 kez × 5 dk = 30 dk).
  let attempt = 0;
  while (res.status === 409 && retryOn409 && attempt < 6) {
    attempt++;
    console.log(`[fonzip] 409 alındı, ${attempt}/6 - 5 dk bekleniyor...`);
    await new Promise(r => setTimeout(r, 5 * 60 * 1000));
    res = await doCreate();
  }

  if (res.status === 409) {
    throw new Error("Fonzip'te aktif bir token zaten mevcut (409). 30 dk beklendi hâlâ kilitli.");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fonzip token alınamadı: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data.access_token as string;
  // Fonzip token ömrü ~2-3 saat gözlemlendi; 6 saat cache — 401 gelene kadar kullan
  const expiresAt = Date.now() + 6 * 60 * 60 * 1000;
  tokenCache = { token, expiresAt };
  console.log("[fonzip] Yeni token alındı:", token.slice(0, 12) + "...");
  await saveTokenToDB(token, expiresAt);
  return token;
}

async function getToken(): Promise<string> {
  const manualToken = process.env.FONZIP_ACCESS_TOKEN;
  if (manualToken && !manualTokenExpired) return manualToken;

  if (tokenCache) return tokenCache.token; // expire olsa bile önce dene

  // DB'de son kaydedilen token'ı getir (expiry göz ardı — Fonzip uzun tutuyor)
  const dbToken = await loadTokenFromDB(true);
  if (dbToken) {
    tokenCache = dbToken;
    return dbToken.token;
  }

  return createFreshToken();
}

async function callFonzip(method: "GET" | "POST", path: string, opts: { params?: Record<string, string>; body?: any }): Promise<any> {
  const doRequest = async (token: string) => {
    const url = new URL(`${FONZIP_BASE}${path}`);
    if (opts.params) for (const [k, v] of Object.entries(opts.params)) url.searchParams.set(k, v);
    return fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    });
  };

  let token = await getToken();
  let res = await doRequest(token);

  // If 401: mevcut token gerçekten expired. Yeni token dene; başarılı olursa retry.
  // Yeni token oluşturulamazsa (409 kilit), DB'deki token'ı SİLME — sonraki denemede tekrar kullansın.
  if (res.status === 401) {
    if (process.env.FONZIP_ACCESS_TOKEN) manualTokenExpired = true;
    tokenCache = null;
    try {
      token = await createFreshToken(true); // retry 409 (30 dk'ya kadar)
      res = await doRequest(token);
    } catch (e: any) {
      // Yeni token alınamadı → DB'yi silme, sonraki denemede tekrar dener
      throw e;
    }
  }

  // If 429: rate limited — wait and retry up to 3 times
  let retries = 0;
  while (res.status === 429 && retries < 3) {
    retries++;
    await new Promise(r => setTimeout(r, 2000 * retries));
    res = await doRequest(token);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fonzip ${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fonzipGet(path: string, params?: Record<string, string>): Promise<any> {
  return callFonzip("GET", path, { params });
}

async function fonzipPost(path: string, body: any): Promise<any> {
  return callFonzip("POST", path, { body });
}

export function isFonzipConfigured(): boolean {
  return !!(
    process.env.FONZIP_ACCESS_TOKEN ||
    (process.env.FONZIP_CLIENT_ID && process.env.FONZIP_CLIENT_SECRET)
  );
}

export async function fetchFonzipPreview() {
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [users, debts, donations] = await Promise.allSettled([
    fonzipPost("/users", {
      search: { start_page: 1, how_many: 5, order_by: "name", filter: { condition: "and", attributes: [] } },
      values_list: ["id", "first_name", "last_name", "phone", "email", "membership_no", "total_financial"],
    }),
    fonzipGet("/debts", { per_page: "5" }),
    fonzipGet("/donations", { per_page: "5", start_date: yearAgo, end_date: today }),
  ]);

  return {
    users:     users.status     === "fulfilled" ? users.value     : { error: (users     as any).reason?.message },
    debts:     debts.status     === "fulfilled" ? debts.value     : { error: (debts     as any).reason?.message },
    donations: donations.status === "fulfilled" ? donations.value : { error: (donations as any).reason?.message },
  };
}

export async function fetchFonzipDebts(page = 1, perPage = 100): Promise<any> {
  return fonzipGet("/debts", { page: String(page), per_page: String(perPage) });
}

export async function fetchFonzipDonations(page = 1, perPage = 100, startDate?: string, endDate?: string): Promise<any> {
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return fonzipGet("/donations", {
    page: String(page),
    per_page: String(perPage),
    start_date: startDate ?? yearAgo,
    end_date: endDate ?? today,
  });
}

export async function syncFonzipDebts(createdByUserId: number): Promise<{
  total: number; upserted: number; matched: number; expensesCreated: number; errors: string[];
}> {
  const { storage } = await import("./storage");
  const { AIDAT_CATEGORY } = await import("@shared/schema").then(m => ({ AIDAT_CATEGORY: "Aidat & Yer Tahsis" }));

  // Get all employees indexed by kwuid for fast matching
  const allEmployees = await storage.getEmployees();
  const byKwuid: Record<string, number> = {};
  for (const emp of allEmployees) {
    if (emp.kwuid) byKwuid[String(emp.kwuid).trim()] = emp.id;
  }

  let page = 1;
  const perPage = 10; // Fonzip ignores per_page for debts, always returns 10
  let total = 0;
  let fetched = 0;
  let upserted = 0;
  let matched = 0;
  let expensesCreated = 0;
  const errors: string[] = [];

  while (true) {
    let data: any;
    let pageRetry = 0;
    while (true) {
      try {
        data = await fonzipGet("/debts", { page: String(page), per_page: String(perPage), start_date: "2025-01-01" });
        break;
      } catch (e: any) {
        if (e.message.includes("429") && pageRetry < 10) {
          pageRetry++;
          await new Promise(r => setTimeout(r, 60000)); // Fonzip rate limit dakikada bir resetleniyor
          continue;
        }
        errors.push(`Page ${page}: ${e.message}`);
        data = null;
        break;
      }
    }
    if (!data) break;

    if (!data.debt_list || data.debt_list.length === 0) break;
    if (page === 1) total = data.total ?? 0;
    fetched += data.debt_list.length;

    for (const debt of data.debt_list) {
      try {
        const membershipNo = debt.user__membership_no != null ? String(debt.user__membership_no) : null;
        const operationDate = debt.operation_date
          ? debt.operation_date.slice(0, 10)
          : (debt.create_date ? debt.create_date.slice(0, 10) : null);

        const row = await storage.upsertFonzipDebt({
          fonzipId: debt.id,
          fonzipUserId: debt.user_id,
          membershipNo,
          userName: debt.user__name ?? "",
          amount: String(debt.amount ?? 0),
          details: debt.details ?? null,
          period: debt.period ?? null,
          status: debt.status,
          operationDate,
          addedByName: debt.added_by__name ?? null,
        });
        upserted++;

        // Match employee by kwuid
        const empId = membershipNo ? byKwuid[membershipNo.trim()] : undefined;
        if (empId && row.employeeId !== empId) {
          await storage.setFonzipDebtEmployee(debt.id, empId);
          matched++;
        }

        // Auto-create income entry for paid debts without expense record
        if (debt.status === 1 && !row.expenseId) {
          const effectiveEmpId = empId ?? row.employeeId ?? undefined;
          const expense = await storage.createOfficeExpense({
            type: "income",
            category: "Aidat & Yer Tahsis",
            amount: String(debt.amount ?? 0),
            date: operationDate ?? new Date().toISOString().slice(0, 10),
            notes: `${debt.user__name ?? ""} — ${debt.details ?? ""} (Fonzip #${debt.id})`,
            employeeId: effectiveEmpId ?? null,
            createdByUserId,
          });
          await storage.setFonzipDebtExpense(debt.id, expense.id);
          expensesCreated++;
        }
      } catch (e: any) {
        errors.push(`Debt #${debt.id}: ${e.message}`);
      }
    }

    if (total > 0 && fetched >= total) break;
    if (data.debt_list.length === 0) break;
    page++;
    await new Promise(r => setTimeout(r, 2000));
  }

  return { total, upserted, matched, expensesCreated, errors };
}

// ── Günlük Rolling Window Sync (son N günün borçlarını çeker) ────────────────
// Fonzip API pagination bozuk olduğu için gün gün çekiyoruz.
// Her gün için start_date=end_date=aynı gün → o günün tüm borçları döner.
export async function syncFonzipRecentDebts(
  createdByUserId: number,
  daysBack: number = 3,
): Promise<{
  daysScanned: number; total: number; upserted: number; updated: number;
  matched: number; expensesCreated: number; errors: string[];
}> {
  const { storage } = await import("./storage");
  const { pool } = await import("./db");

  const allEmployees = await storage.getEmployees();
  const byKwuid: Record<string, number> = {};
  for (const emp of allEmployees) {
    if (emp.kwuid) byKwuid[String(emp.kwuid).trim()] = emp.id;
  }

  let total = 0, upserted = 0, updated = 0, matched = 0, expensesCreated = 0;
  const errors: string[] = [];

  for (let d = 0; d < daysBack; d++) {
    const day = new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let data: any;
    let retry = 0;
    while (true) {
      try {
        data = await fonzipGet("/debts", { start_date: day, end_date: day, per_page: "100" });
        break;
      } catch (e: any) {
        if (e.message.includes("429") && retry < 5) {
          retry++;
          await new Promise(r => setTimeout(r, 60000));
          continue;
        }
        errors.push(`${day}: ${e.message}`);
        data = null;
        break;
      }
    }
    if (!data || !data.debt_list) continue;
    total += data.debt_list.length;

    for (const debt of data.debt_list) {
      try {
        const membershipNo = debt.user__membership_no != null ? String(debt.user__membership_no) : null;
        const operationDate = debt.operation_date
          ? debt.operation_date.slice(0, 10)
          : (debt.create_date ? debt.create_date.slice(0, 10) : null);
        const empId = membershipNo ? byKwuid[membershipNo.trim()] : undefined;
        const category = classifyFonzipCategory(debt.details);

        const existing = await pool.query(
          "SELECT id, expense_id FROM fonzip_synced_debts WHERE fonzip_id = $1",
          [debt.id]
        );

        if (existing.rows.length > 0) {
          await pool.query(
            `UPDATE fonzip_synced_debts SET
               details = COALESCE($2, details), period = COALESCE($3, period),
               user_name = $4, membership_no = COALESCE($5, membership_no),
               amount = $6, operation_date = COALESCE($7, operation_date),
               added_by_name = COALESCE($8, added_by_name),
               employee_id = COALESCE($9, employee_id), synced_at = NOW()
             WHERE fonzip_id = $1`,
            [debt.id, debt.details, debt.period, debt.user__name ?? "", membershipNo,
             String(debt.amount ?? 0), operationDate, debt.added_by__name ?? null, empId ?? null]
          );
          if (existing.rows[0].expense_id) {
            await pool.query(
              `UPDATE office_expenses SET notes = $2, category = $3, amount = $4, date = $5, employee_id = $6 WHERE id = $1`,
              [existing.rows[0].expense_id,
               `${debt.user__name ?? ""} — ${debt.details ?? ""} (Fonzip #${debt.id})`,
               category, String(debt.amount ?? 0),
               operationDate ?? new Date().toISOString().slice(0, 10), empId ?? null]
            );
          }
          updated++;
        } else {
          await storage.upsertFonzipDebt({
            fonzipId: debt.id, fonzipUserId: debt.user_id, membershipNo,
            userName: debt.user__name ?? "", amount: String(debt.amount ?? 0),
            details: debt.details ?? null, period: debt.period ?? null,
            status: debt.status, operationDate, addedByName: debt.added_by__name ?? null,
          });
          if (empId) {
            await storage.setFonzipDebtEmployee(debt.id, empId);
            matched++;
          }
          const expense = await storage.createOfficeExpense({
            type: "income", category, amount: String(debt.amount ?? 0),
            date: operationDate ?? new Date().toISOString().slice(0, 10),
            notes: `${debt.user__name ?? ""} — ${debt.details ?? ""} (Fonzip #${debt.id})`,
            employeeId: empId ?? null, createdByUserId,
          });
          await storage.setFonzipDebtExpense(debt.id, expense.id);
          expensesCreated++;
          upserted++;
        }
      } catch (e: any) {
        errors.push(`Debt #${debt.id}: ${e.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 2000)); // günler arası bekleme
  }

  return { daysScanned: daysBack, total, upserted, updated, matched, expensesCreated, errors };
}

// ── Excel Import: Fonzip ödeme geçmişi Excel'inden toplu içe aktarım ─────────
// Borç açıklamasından otomatik gelir kategorisi çıkar
function classifyFonzipCategory(details: string | null | undefined): string {
  const s = String(details ?? "").toLowerCase();
  if (s.includes("kira")) return "Oda Kira";  // "Kira Bedeli", "Oda Kira", "Ocak 2025 Kira" vs
  if (s.includes("aidat") || s.includes("yer tahsis")) return "Aidat & Yer Tahsis";
  if (/sözleşme|giriş bedeli|giris bedeli/.test(s)) return "Giriş Bedeli";
  if (s.includes("printer")) return "Printer Geliri";
  if (s.includes("üretkenlik") || /(^|\s)ük(\s|$)/.test(s)) return "ÜK Geliri";
  if (s.includes("faiz")) return "Faiz Gelirleri";
  if (s.includes("sahibinden")) return "Sahibinden";
  if (s.includes("royalty")) return "Royalty Fee (%1,5)";
  if (s.includes("proje")) return "Proje Ek Geliri";
  if (s.includes("transfer")) return "Transfer Geliri";
  return "Diğer Gelirler (Kep Ödemesi vb)";
}

export interface FonzipExcelRow {
  fonzipId: number;              // "Aidat Kayıt No"
  fonzipUserId: number | null;    // "Kişi/Kurum Kayıt No"
  membershipNo: string | null;    // "Üye No"
  userName: string;               // "Ad Soyad" veya "Üye Adı"
  amount: string;                 // "Ödeme Miktarı"
  operationDate: string | null;   // "İşlem Tarihi" YYYY-MM-DD
  details: string | null;         // "Açıklama"
  period: string | null;          // "Dönem"
  addedByName: string | null;     // "Ekleyen Kişi"
  status?: number;                // "Durum" → 1 (Başarılı) veya 8. Yoksa "debts" modu.
}

export async function importFonzipExcel(
  rows: FonzipExcelRow[],
  createdByUserId: number,
  mode: "payments" | "debts" = "payments",
  onProgress?: (current: number, total: number) => void,
): Promise<{
  mode: string; totalRows: number; upserted: number; detailsUpdated: number;
  matched: number; expensesCreated: number; skipped: number; errors: string[];
}> {
  const { pool } = await import("./db");

  // Build employee lookup from kwuid → employee id
  const empRes = await pool.query(`SELECT id, kwuid FROM employees WHERE kwuid IS NOT NULL`);
  const byKwuid: Record<string, number> = {};
  for (const emp of empRes.rows) {
    if (emp.kwuid) byKwuid[String(emp.kwuid).trim()] = emp.id;
  }

  const validRows = rows.filter(r => r.fonzipId && r.userName);
  const skipped = rows.length - validRows.length;
  const total = validRows.length;
  onProgress?.(0, total);

  let upserted = 0, detailsUpdated = 0, matched = 0, expensesCreated = 0;
  const errors: string[] = [];

  const CHUNK = 500;

  // Step 1: Fetch ALL existing debts for these fonzip_ids in one query
  const allFonzipIds = validRows.map(r => r.fonzipId);
  const existingRes = await pool.query(
    `SELECT fonzip_id, id, expense_id, employee_id FROM fonzip_synced_debts WHERE fonzip_id = ANY($1::int[])`,
    [allFonzipIds]
  );
  const existingMap = new Map<number, { id: number; expense_id: number | null; employee_id: number | null }>();
  for (const row of existingRes.rows) {
    existingMap.set(Number(row.fonzip_id), row);
  }

  const newRows = validRows.filter(r => !existingMap.has(r.fonzipId));
  const existingRows = validRows.filter(r => existingMap.has(r.fonzipId));

  onProgress?.(Math.round(total * 0.05), total);

  if (mode === "debts") {
    // ── NEW DEBTS: batch insert in chunks ──────────────────────────────────
    for (let i = 0; i < newRows.length; i += CHUNK) {
      const chunk = newRows.slice(i, i + CHUNK);
      if (chunk.length === 0) break;

      // Build VALUES list for fonzip_synced_debts
      const debtParams: any[] = [];
      const debtPlaceholders = chunk.map((r, idx) => {
        const base = idx * 9;
        const empId = r.membershipNo ? (byKwuid[r.membershipNo.trim()] ?? null) : null;
        debtParams.push(
          r.fonzipId, r.fonzipUserId ?? 0, empId,
          r.membershipNo ?? null, r.userName, r.amount || "0",
          r.details ?? null, r.period ?? null,
          r.operationDate ?? null
        );
        return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, 8, $${base+9}, NOW())`;
      }).join(",");

      const insertedDebts = await pool.query(
        `INSERT INTO fonzip_synced_debts
           (fonzip_id, fonzip_user_id, employee_id, membership_no, user_name, amount, details, period, status, operation_date, synced_at)
         VALUES ${debtPlaceholders}
         ON CONFLICT (fonzip_id) DO NOTHING
         RETURNING fonzip_id, id, employee_id`,
        debtParams
      );

      // Batch insert office_expenses for newly inserted debts
      const insertedDebtMap = new Map<number, number>(); // fonzip_id → debt row id
      for (const row of insertedDebts.rows) {
        insertedDebtMap.set(Number(row.fonzip_id), row.id);
        if (row.employee_id) matched++;
      }
      upserted += insertedDebts.rows.length;

      // Build expenses for new debts that have amounts
      const expChunk = chunk.filter(r => r.amount && insertedDebtMap.has(r.fonzipId));
      if (expChunk.length > 0) {
        const expParams: any[] = [];
        const expPlaceholders = expChunk.map((r, idx) => {
          const base = idx * 6;
          const empId = r.membershipNo ? (byKwuid[r.membershipNo.trim()] ?? null) : null;
          const category = classifyFonzipCategory(r.details);
          expParams.push(
            "income", category, r.amount,
            r.operationDate ?? new Date().toISOString().slice(0, 10),
            `${r.userName} — ${r.details ?? ""} (Fonzip #${r.fonzipId})`,
            empId
          );
          return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, ${createdByUserId})`;
        }).join(",");

        const insertedExps = await pool.query(
          `INSERT INTO office_expenses (type, category, amount, date, notes, employee_id, created_by_user_id)
           VALUES ${expPlaceholders}
           RETURNING id`,
          expParams
        );
        expensesCreated += insertedExps.rows.length;

        // Link expense_id back to fonzip_synced_debts in batch
        for (let j = 0; j < expChunk.length && j < insertedExps.rows.length; j++) {
          const debtRowId = insertedDebtMap.get(expChunk[j].fonzipId);
          if (debtRowId) {
            await pool.query(
              `UPDATE fonzip_synced_debts SET expense_id = $1 WHERE id = $2`,
              [insertedExps.rows[j].id, debtRowId]
            );
          }
        }
      }

      onProgress?.(Math.round(total * 0.05 + (i + chunk.length) / newRows.length * 0.45 * total), total);
    }

    // ── EXISTING DEBTS: batch update in chunks ─────────────────────────────
    for (let i = 0; i < existingRows.length; i += CHUNK) {
      const chunk = existingRows.slice(i, i + CHUNK);

      // Build a single UPDATE ... FROM (VALUES ...) for debt metadata
      const valParams: any[] = [];
      const valPlaceholders = chunk.map((r, idx) => {
        const base = idx * 7;
        valParams.push(
          r.fonzipId, r.details ?? null, r.period ?? null, r.userName,
          r.membershipNo ?? null, r.addedByName ?? null,
          r.amount && r.amount !== "" ? r.amount : null
        );
        return `($${base+1}::int, $${base+2}::text, $${base+3}::text, $${base+4}::text, $${base+5}::text, $${base+6}::text, $${base+7}::text)`;
      }).join(",");

      await pool.query(
        `UPDATE fonzip_synced_debts AS t
         SET details        = COALESCE(v.details, t.details),
             period         = COALESCE(v.period, t.period),
             user_name      = v.user_name,
             membership_no  = COALESCE(v.membership_no, t.membership_no),
             added_by_name  = COALESCE(v.added_by_name, t.added_by_name),
             amount         = COALESCE(v.amount, t.amount),
             synced_at      = NOW()
         FROM (VALUES ${valPlaceholders}) AS v(fonzip_id, details, period, user_name, membership_no, added_by_name, amount)
         WHERE t.fonzip_id = v.fonzip_id`,
        valParams
      );
      detailsUpdated += chunk.length;

      // Batch update office_expenses for existing debts
      const withExpense = chunk.filter(r => {
        const ex = existingMap.get(r.fonzipId);
        return ex?.expense_id != null;
      });
      if (withExpense.length > 0) {
        const expParams: any[] = [];
        const expPlaceholders = withExpense.map((r, idx) => {
          const ex = existingMap.get(r.fonzipId)!;
          const base = idx * 6;
          const empId = r.membershipNo ? (byKwuid[r.membershipNo.trim()] ?? null) : null;
          const category = classifyFonzipCategory(r.details);
          expParams.push(
            ex.expense_id, category,
            `${r.userName} — ${r.details ?? ""} (Fonzip #${r.fonzipId})`,
            r.amount || "0",
            r.operationDate ?? new Date().toISOString().slice(0, 10),
            empId
          );
          return `($${base+1}::int, $${base+2}::text, $${base+3}::text, $${base+4}::text, $${base+5}::date, $${base+6}::int)`;
        }).join(",");

        await pool.query(
          `UPDATE office_expenses AS t
           SET category    = v.category,
               notes       = v.notes,
               amount      = v.amount,
               date        = v.date,
               employee_id = v.employee_id
           FROM (VALUES ${expPlaceholders}) AS v(id, category, notes, amount, date, employee_id)
           WHERE t.id = v.id`,
          expParams
        );
      }

      // Create missing expenses for existing debts that have no expense_id yet
      const missingExp = chunk.filter(r => {
        const ex = existingMap.get(r.fonzipId);
        return ex && !ex.expense_id && r.amount;
      });
      if (missingExp.length > 0) {
        const expParams: any[] = [];
        const expPlaceholders = missingExp.map((r, idx) => {
          const base = idx * 6;
          const empId = r.membershipNo ? (byKwuid[r.membershipNo.trim()] ?? null) : null;
          const category = classifyFonzipCategory(r.details);
          expParams.push(
            "income", category, r.amount,
            r.operationDate ?? new Date().toISOString().slice(0, 10),
            `${r.userName} — ${r.details ?? ""} (Fonzip #${r.fonzipId})`,
            empId
          );
          return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, ${createdByUserId})`;
        }).join(",");
        const insertedExps = await pool.query(
          `INSERT INTO office_expenses (type, category, amount, date, notes, employee_id, created_by_user_id)
           VALUES ${expPlaceholders}
           RETURNING id`,
          expParams
        );
        expensesCreated += insertedExps.rows.length;
        for (let j = 0; j < missingExp.length && j < insertedExps.rows.length; j++) {
          await pool.query(
            `UPDATE fonzip_synced_debts SET expense_id = $1 WHERE fonzip_id = $2`,
            [insertedExps.rows[j].id, missingExp[j].fonzipId]
          );
        }
      }

      onProgress?.(Math.round(total * 0.5 + (i + chunk.length) / existingRows.length * 0.45 * total), total);
    }

  } else {
    // ── PAYMENTS MODE: batch upsert ────────────────────────────────────────
    const payRows = validRows.filter(r => r.amount);
    const skippedPay = validRows.length - payRows.length;

    for (let i = 0; i < payRows.length; i += CHUNK) {
      const chunk = payRows.slice(i, i + CHUNK);

      const params: any[] = [];
      const placeholders = chunk.map((r, idx) => {
        const base = idx * 9;
        const empId = r.membershipNo ? (byKwuid[r.membershipNo.trim()] ?? null) : null;
        params.push(
          r.fonzipId, r.fonzipUserId ?? 0, empId,
          r.membershipNo ?? null, r.userName, r.amount,
          r.details ?? null, r.period ?? null,
          r.operationDate ?? null
        );
        return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, ${r.status ?? 1}, $${base+9}, NOW())`;
      }).join(",");

      const result = await pool.query(
        `INSERT INTO fonzip_synced_debts
           (fonzip_id, fonzip_user_id, employee_id, membership_no, user_name, amount, details, period, status, operation_date, synced_at)
         VALUES ${placeholders}
         ON CONFLICT (fonzip_id) DO UPDATE SET
           user_name      = EXCLUDED.user_name,
           amount         = EXCLUDED.amount,
           details        = COALESCE(EXCLUDED.details, fonzip_synced_debts.details),
           period         = COALESCE(EXCLUDED.period, fonzip_synced_debts.period),
           membership_no  = COALESCE(EXCLUDED.membership_no, fonzip_synced_debts.membership_no),
           employee_id    = COALESCE(EXCLUDED.employee_id, fonzip_synced_debts.employee_id),
           operation_date = COALESCE(EXCLUDED.operation_date, fonzip_synced_debts.operation_date),
           synced_at      = NOW()
         RETURNING fonzip_id, id, expense_id, employee_id, (xmax = 0) AS is_new`,
        params
      );
      upserted += result.rows.length;

      // Create expenses for newly inserted successful payments
      const needsExpense = result.rows.filter((row: any) => row.is_new && !row.expense_id);
      const sourceMap = new Map(chunk.map(r => [r.fonzipId, r]));

      if (needsExpense.length > 0) {
        const expParams: any[] = [];
        const expPH = needsExpense.map((row: any, idx: number) => {
          const r = sourceMap.get(Number(row.fonzip_id))!;
          const base = idx * 6;
          expParams.push(
            "income", "Aidat & Yer Tahsis", r.amount,
            r.operationDate ?? new Date().toISOString().slice(0, 10),
            `${r.userName} — ${r.details ?? ""} (Fonzip #${r.fonzipId})`,
            row.employee_id ?? null
          );
          return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, ${createdByUserId})`;
        }).join(",");
        const expResult = await pool.query(
          `INSERT INTO office_expenses (type, category, amount, date, notes, employee_id, created_by_user_id)
           VALUES ${expPH}
           RETURNING id`,
          expParams
        );
        expensesCreated += expResult.rows.length;
        for (let j = 0; j < needsExpense.length && j < expResult.rows.length; j++) {
          await pool.query(
            `UPDATE fonzip_synced_debts SET expense_id = $1 WHERE id = $2`,
            [expResult.rows[j].id, needsExpense[j].id]
          );
        }
      }

      onProgress?.(Math.round((i + chunk.length) / payRows.length * total), total);
    }

    // skipped already counted above
    return {
      mode, totalRows: rows.length,
      upserted,
      detailsUpdated: 0,
      matched,
      expensesCreated,
      skipped: skipped + skippedPay,
      errors,
    };
  }

  onProgress?.(total, total);
  return { mode, totalRows: rows.length, upserted, detailsUpdated, matched, expensesCreated, skipped, errors };
}

export async function fetchFonzipUsers(page = 1, perPage = 100): Promise<any> {
  return fonzipPost("/users", {
    search: { start_page: page, how_many: perPage, order_by: "name", filter: { condition: "and", attributes: [] } },
    values_list: ["id", "first_name", "last_name", "phone", "email", "membership_no", "total_financial"],
  });
}

// Hızlı sync: her Fonzip üyesinin toplam borcunu çeker (total_financial),
// danışmanla eşleştirir. Bireysel debt kayıtları çekmez — sadece toplam.
export async function syncFonzipUsersFinancials(): Promise<{
  totalUsers: number; matched: number; withDebt: number; errors: string[];
}> {
  const { storage } = await import("./storage");
  const { pool } = await import("./db");

  const allEmployees = await storage.getEmployees();
  const byKwuid: Record<string, number> = {};
  for (const emp of allEmployees) {
    if (emp.kwuid) byKwuid[String(emp.kwuid).trim()] = emp.id;
  }

  await ensureConfigTable();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fonzip_user_financials (
      fonzip_user_id INTEGER PRIMARY KEY,
      employee_id INTEGER,
      membership_no TEXT,
      user_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      total_financial NUMERIC(15,2) NOT NULL DEFAULT 0,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  let page = 1;
  const perPage = 100;
  let totalUsers = 0;
  let matched = 0;
  let withDebt = 0;
  const errors: string[] = [];

  while (true) {
    let data: any;
    let retry = 0;
    while (true) {
      try {
        data = await fetchFonzipUsers(page, perPage);
        break;
      } catch (e: any) {
        if (e.message.includes("429") && retry < 10) {
          retry++;
          await new Promise(r => setTimeout(r, 60000));
          continue;
        }
        errors.push(`Page ${page}: ${e.message}`);
        data = null;
        break;
      }
    }
    if (!data) break;
    if (!data.user_list || data.user_list.length === 0) break;
    if (page === 1) totalUsers = data.total ?? 0;

    for (const u of data.user_list) {
      try {
        const membershipNo = u.membership_no != null ? String(u.membership_no) : null;
        const empId = membershipNo ? byKwuid[membershipNo.trim()] : undefined;
        const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
        const debt = parseFloat(u.total_financial ?? 0);
        if (empId) matched++;
        if (debt > 0) withDebt++;
        await pool.query(
          `INSERT INTO fonzip_user_financials (fonzip_user_id, employee_id, membership_no, user_name, email, phone, total_financial, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (fonzip_user_id) DO UPDATE SET
             employee_id = EXCLUDED.employee_id,
             membership_no = EXCLUDED.membership_no,
             user_name = EXCLUDED.user_name,
             email = EXCLUDED.email,
             phone = EXCLUDED.phone,
             total_financial = EXCLUDED.total_financial,
             synced_at = NOW()`,
          [u.id, empId ?? null, membershipNo, name, u.email ?? null, u.phone ?? null, String(debt)]
        );
      } catch (e: any) {
        errors.push(`User #${u.id}: ${e.message}`);
      }
    }

    if (data.user_list.length < perPage) break;
    if (totalUsers > 0 && page * perPage >= totalUsers) break;
    page++;
    await new Promise(r => setTimeout(r, 2000));
  }

  return { totalUsers, matched, withDebt, errors };
}

export async function getFonzipUserFinancialsReport(): Promise<any[]> {
  const { pool } = await import("./db");
  const res = await pool.query(`
    SELECT f.fonzip_user_id, f.employee_id, f.membership_no, f.user_name, f.email, f.phone,
           f.total_financial, f.synced_at,
           c.name as employee_name, c.email as employee_email
    FROM fonzip_user_financials f
    LEFT JOIN employees e ON e.id = f.employee_id
    LEFT JOIN candidates c ON c.id = e.candidate_id
    WHERE f.total_financial > 0
    ORDER BY f.total_financial DESC
  `);
  return res.rows;
}
