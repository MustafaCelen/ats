// Ortak test yardımcıları: giriş, test verisi (E2E önekli), danışman oturumu, temizlik.
// Tüm test kayıtlarının adı "E2E " ile başlar; temizlik bu öneke göre yapılır.
import { expect, type BrowserContext, type Page } from "@playwright/test";
import pg from "pg";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ukAddDays, ukProgramWeek1Monday, ukStartForCurrentWeek } from "../shared/uk-program";

export const DB_URL = process.env.E2E_DATABASE_URL ?? "postgresql://hireflow:hireflow_password@localhost:5432/hireflow";
const SESSION_SECRET = process.env.E2E_SESSION_SECRET ?? "local-dev-session-secret-change-in-production";
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5000";

// Veritabanı: E2E_DATABASE_URL verilirse doğrudan; verilmezse projenin docker compose
// Postgres'ine "docker compose exec psql" ile (yerelde 5432'yi başka bir Postgres tutabiliyor).
export const db = process.env.E2E_DATABASE_URL ? new pg.Pool({ connectionString: DB_URL, max: 3, allowExitOnIdle: true }) : null;
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return "'" + String(v).replace(/'/g, "''") + "'";
};
function psql<T>(sql: string, params: unknown[]): T[] {
  let text = sql;
  for (let i = params.length; i >= 1; i--) text = text.split("$" + i).join(lit(params[i - 1]));
  const returns = /^\s*(select|with)\b/i.test(text) || /\breturning\b/i.test(text);
  const wrapped = returns ? `WITH t AS (${text}) SELECT coalesce(json_agg(t), '[]'::json) FROM t` : text;
  const out = execFileSync("docker", ["compose", "exec", "-T", "postgres", "psql", "-U", "hireflow", "-d", "hireflow", "-tAq", "-v", "ON_ERROR_STOP=1", "-c", wrapped],
    { cwd: REPO_ROOT, encoding: "utf8" });
  return returns ? JSON.parse(out.trim() || "[]") : [];
}
export const q = async <T = any>(sql: string, params: unknown[] = []): Promise<T[]> =>
  db ? (await db.query(sql, params)).rows as T[] : psql<T>(sql, params);

export const USERS = {
  admin:  { id: 1, email: "admin@kw.com.tr",  password: "admin123", name: "Admin" },
  zeynep: { id: 2, email: "zeynep@kw.com.tr", password: "hm1234",   name: "Zeynep Yilmaz" },
  mehmet: { id: 3, email: "mehmet@kw.com.tr", password: "hm1234",   name: "Mehmet Ozkan" },
} as const;
export type UserKey = keyof typeof USERS;

// Sunucuyla aynı "bugün": İstanbul (UTC+3).
export const todayIst = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
export const thisMonday = () => ukProgramWeek1Monday(todayIst());
export const nextMonday = () => ukAddDays(thisMonday(), 7);
export const startForWeek = (week: number) => ukStartForCurrentWeek(todayIst(), week);
export const fmtTr = (ymd: string) => { const [y, m, d] = ymd.split("-"); return `${d}.${m}.${y}`; };

// Sayfa bağlamına personel oturumu açar (çerez context'e yazılır).
export async function loginAs(page: Page, who: UserKey) {
  await page.context().clearCookies();
  const u = USERS[who];
  const r = await page.request.post("/api/auth/login", { data: { email: u.email, password: u.password } });
  expect(r.ok(), `giriş: ${u.email}`).toBeTruthy();
}

// ── Test verisi ──────────────────────────────────────────────────────────────
export type Advisor = { employeeId: number; candidateId: number; name: string; kwuid: string; token: string; email: string };

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function createAdvisor(name: string, opts: { status?: "active" | "inactive"; email?: string | null } = {}): Promise<Advisor> {
  const full = name.startsWith("E2E ") ? name : `E2E ${name}`;
  const email = opts.email === undefined ? `e2e-${uniq()}@example.invalid` : opts.email;
  const [c] = await q(`INSERT INTO candidates (name, email, category, office) VALUES ($1, $2, 'K0', 'Akatlar') RETURNING id`, [full, email]);
  const kwuid = String(900000000 + Math.floor(Math.random() * 99_999_999));
  const token = crypto.randomBytes(20).toString("hex");
  const [e] = await q(
    `INSERT INTO employees (candidate_id, status, kwuid, advisor_token, start_date) VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
    [c.id, opts.status ?? "active", kwuid, token],
  );
  return { employeeId: e.id, candidateId: c.id, name: full, kwuid, token, email: email ?? "" };
}

export async function enroll(employeeId: number, coachId: number | null, startDate: string, source: "manual" | "auto" = "manual") {
  await q(
    `INSERT INTO uk_program_enrollments (employee_id, coach_user_id, start_date, added_at, source)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (employee_id) DO UPDATE SET coach_user_id = EXCLUDED.coach_user_id, start_date = EXCLUDED.start_date,
       removed_at = NULL, source = EXCLUDED.source`,
    [employeeId, coachId, startDate, source],
  );
}

export async function createCandidate(name: string, referredBy: string | null = null, referredByEmployeeId: number | null = null) {
  const full = name.startsWith("E2E ") ? name : `E2E ${name}`;
  const [c] = await q(
    `INSERT INTO candidates (name, category, office, referred_by, referred_by_employee_id) VALUES ($1, 'K0', 'Akatlar', $2, $3) RETURNING id`,
    [full, referredBy, referredByEmployeeId],
  );
  return { id: c.id as number, name: full };
}

// Fonzip borcu (sahte; fonzip id'leri negatif → gerçek kayıtlarla çakışmaz).
export async function seedDebt(a: Advisor, balance: number, items: { amount: number; details: string }[]) {
  const fuid = -(800000 + a.employeeId);
  await q(
    `INSERT INTO fonzip_user_financials (fonzip_user_id, employee_id, membership_no, user_name, total_financial)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (fonzip_user_id) DO UPDATE SET total_financial = EXCLUDED.total_financial`,
    [fuid, a.employeeId, a.kwuid, a.name, balance],
  );
  let i = 0;
  for (const it of items) {
    await q(
      `INSERT INTO fonzip_synced_debts (fonzip_id, fonzip_user_id, employee_id, membership_no, user_name, amount, details, period, status, operation_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9)`,
      [fuid * 100 - i++, fuid, a.employeeId, a.kwuid, a.name, it.amount, it.details, todayIst().slice(0, 7), todayIst()],
    );
  }
}

// Danışman Google girişi yerine: oturum kaydı + imzalı çerez (connect-pg-simple).
export async function advisorLogin(context: BrowserContext, employeeId: number) {
  const sid = "e2e-" + crypto.randomBytes(16).toString("hex");
  const sess = { cookie: { originalMaxAge: 86400000, httpOnly: true, path: "/" }, advisorEmployeeIds: [employeeId], e2e: true };
  await q(`INSERT INTO user_sessions (sid, sess, expire) VALUES ($1, $2::json, NOW() + INTERVAL '1 day')`, [sid, JSON.stringify(sess)]);
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(sid).digest("base64").replace(/=+$/, "");
  await context.clearCookies();
  await context.addCookies([{ name: "connect.sid", value: encodeURIComponent(`s:${sid}.${sig}`), url: BASE }]);
}

export async function cleanupE2E() {
  const emp = `SELECT e.id FROM employees e JOIN candidates c ON c.id = e.candidate_id WHERE c.name LIKE 'E2E %'`;
  await q(`DELETE FROM uk_program_checks WHERE employee_id IN (${emp})`);
  await q(`DELETE FROM uk_program_weeks WHERE employee_id IN (${emp})`);
  await q(`DELETE FROM uk_program_enrollments WHERE employee_id IN (${emp})`);
  await q(`DELETE FROM fonzip_synced_debts WHERE employee_id IN (${emp})`);
  await q(`DELETE FROM fonzip_user_financials WHERE employee_id IN (${emp})`);
  await q(`DELETE FROM referral_text_decisions WHERE norm_text LIKE '%e2e%'`);
  await q(`DELETE FROM user_sessions WHERE sid LIKE 'e2e-%'`);
  await q(`UPDATE candidates SET referred_by_employee_id = NULL WHERE referred_by_employee_id IN (${emp})`);
  await q(`DELETE FROM employees WHERE candidate_id IN (SELECT id FROM candidates WHERE name LIKE 'E2E %')`);
  await q(`DELETE FROM candidates WHERE name LIKE 'E2E %'`);
}

// Danışman seçici (EmployeePicker): aç, ara, seç.
export async function pickEmployee(page: Page, triggerText: string | RegExp, name: string, scope?: import("@playwright/test").Locator) {
  const root = scope ?? page;
  await root.getByRole("combobox").filter({ hasText: triggerText }).first().click();
  await page.getByPlaceholder("Ara: ad veya KWUID...").fill(name);
  await page.getByRole("option", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
}
