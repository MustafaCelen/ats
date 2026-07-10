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

async function loadTokenFromDB(): Promise<TokenCache | null> {
  try {
    await ensureConfigTable();
    const { pool } = await import("./db");
    const res = await pool.query(
      "SELECT value, expires_at FROM _fonzip_config WHERE key = 'token' AND expires_at > NOW()"
    );
    if (res.rows.length === 0) return null;
    console.log("[fonzip] Token DB'den yüklendi");
    return { token: res.rows[0].value, expiresAt: new Date(res.rows[0].expires_at).getTime() };
  } catch (e: any) {
    console.error("[fonzip] loadTokenFromDB hatası:", e?.message);
    return null;
  }
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

async function createFreshToken(): Promise<string> {
  const clientId = process.env.FONZIP_CLIENT_ID;
  const clientSecret = process.env.FONZIP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("FONZIP_CLIENT_ID ve FONZIP_CLIENT_SECRET env değişkenleri tanımlı değil.");
  }
  const res = await fetch(`${FONZIP_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  if (res.status === 409) {
    throw new Error("Fonzip'te aktif bir token zaten mevcut (409). Fonzip panelinden mevcut token'ı iptal edin ya da ~1 saat bekleyin.");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fonzip token alınamadı: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data.access_token as string;
  const expiresAt = Date.now() + 55 * 60 * 1000;
  tokenCache = { token, expiresAt };
  console.log("[fonzip] Yeni token alındı:", token);
  await saveTokenToDB(token, expiresAt);
  return token;
}

async function getToken(): Promise<string> {
  const manualToken = process.env.FONZIP_ACCESS_TOKEN;
  if (manualToken && !manualTokenExpired) return manualToken;

  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  // Try to load from DB (survives container restarts)
  const dbToken = await loadTokenFromDB();
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

  // If 401: manual token expired — fall back to fresh token
  if (res.status === 401 && process.env.FONZIP_ACCESS_TOKEN && !manualTokenExpired) {
    manualTokenExpired = true;
    tokenCache = null;
    token = await getToken();
    res = await doRequest(token);
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
