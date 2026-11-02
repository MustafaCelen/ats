// ── ÜK 45+45 Başarı Rotası: API ──────────────────────────────────────────────
// Şablon ve puanlama shared/uk-program.ts'te. Burada katılımcı listesi, kutucuk
// işaretleme, haftalık gerçekleşenler ve koç onayı.
//
// Yetki: görüntüleme admin + hiring_manager; düzenleme admin veya danışmanın ÜK koçu
// (employees.uretkenlik_koclugu_manager_id).
import type { Express, Request, Response } from "express";
import { pool } from "./db";
import { requireAuth } from "./auth";
import { storage } from "./storage";
import { sendEmail, sendEmailDetailed } from "./email";
import { buildUkWelcomeEmail } from "./uk-welcome-email";
import { publicBaseUrl, listWhatsAppTemplates } from "./whatsapp";
import { startBulkSendBatch, getBatch, getActiveBatchForUser, type BulkSendItem } from "./whatsapp-bulk-runner";
import {
  UK_ACTIVITIES, UK_ACTIVITY_IDS, UK_PROGRAM_WEEKS, UK_PERIODS, UK_PERIOD_WEEKS, ukPeriodOfWeek,
  computeUkActivityScore, computeUkTargetScore, combineUkActivityScores, combineUkTargetScores,
  ukProgramWeek1Monday, ukAddDays, ukCurrentWeek, ukIsMonday, type UkScoreKey,
} from "@shared/uk-program";

const scoreOfActivity = new Map(UK_ACTIVITIES.map((a) => [a.id, a.score] as const));
const periodOfActivity = new Map(UK_ACTIVITIES.map((a) => [a.id, ukPeriodOfWeek(a.week)] as const));

// Etkinlik kimliklerinden dönem bazlı skor kalemi sayıları (dönem başına ayrı puanlanır).
function doneByPeriod(ids: string[]): Partial<Record<UkScoreKey, number>>[] {
  const out: Partial<Record<UkScoreKey, number>>[] = Array.from({ length: UK_PERIODS }, () => ({}));
  for (const id of ids) {
    const s = scoreOfActivity.get(id); const p = periodOfActivity.get(id);
    if (s && p != null) out[p][s] = (out[p][s] ?? 0) + 1;
  }
  return out;
}

function todayYmd(): string {
  // İstanbul günü (UTC+3) — hafta sınırları yerel güne göre.
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

type Participant = {
  employeeId: number; name: string; kwuid: string | null; status: string;
  coachId: number | null; coachName: string | null;
  programStart: string | null;
  // Detay sayfasındaki düzenlenebilir başlangıç (uk_program_enrollments.start_date).
  ukStartDate: string | null;
  source: "manual" | "auto" | "backfill" | null;
  manual: boolean;          // elle eklendi
  profileCoach: boolean;    // koç danışman profilinden geliyor (programda değiştirilemez)
  ukActive: boolean;        // ÜK işareti açık + koç var + çıkış tarihi yok/ileride
  inProgram: boolean;
  welcomeSentAt: string | null;
};

// Katılım yalnızca uk_program_enrollments'tan gelir:
//  - auto: profilde ÜK koçu atandığında, bir sonraki haftanın pazartesisinden başlar
//    (autoEnrollOnCoachAssigned). Koç profildekini izler (coach_user_id NULL).
//  - manual: "Danışman Ekle" ile; koç yine profildeki ÜK koçu (profilde koç yoksa eklenemez).
//  - backfill: eski sürümün toplu aktarımı; artık üretilmez (ÜK işaretliler toplu taşınmaz).
// employees.uretkenlik_koclugu ÜK payını etkilediği için programda kullanılmaz.
const PARTICIPANT_FROM = `
       FROM employees e
       JOIN candidates c ON c.id = e.candidate_id
       LEFT JOIN uk_program_enrollments en ON en.employee_id = e.id AND en.removed_at IS NULL
       LEFT JOIN users u ON u.id = e.uretkenlik_koclugu_manager_id`;
// "ÜK alıyor" şartı (2026-11-02): ÜK işareti açık, profilde koç var, çıkış tarihi boş ya da ileride.
// Daha önce yalnız koç alanına bakılıyordu; ÜK'dan çıkmış (çıkış tarihi dolu) danışmanlar da
// programa alınabiliyordu.
const UK_ACTIVE_SQL = `(e.uretkenlik_koclugu = TRUE AND e.uretkenlik_koclugu_manager_id IS NOT NULL
       AND (e.uk_end_date IS NULL OR e.uk_end_date = '' OR e.uk_end_date > to_char((now() AT TIME ZONE 'Europe/Istanbul')::date, 'YYYY-MM-DD')))`;
// Koç yalnızca danışman profilindeki ÜK koçudur (programda koç seçimi/değişimi yok).
// Profilde koç yoksa danışman programda sayılmaz: listede görünmez, portalda Rotam açılmaz.
const PARTICIPANT_COLS = `e.id, c.name, e.kwuid, e.status, u.id AS coach_id, u.name AS coach_name,
       (en.employee_id IS NOT NULL AND ${UK_ACTIVE_SQL}) AS enrolled, en.source, ${UK_ACTIVE_SQL} AS uk_active,
       en.start_date AS en_start, to_char(e.start_date, 'YYYY-MM-DD') AS start_date, en.welcome_sent_at,
       e.uretkenlik_koclugu_manager_id AS profile_coach_id`;

export async function isInUkProgram(employeeId: number): Promise<boolean> {
  // Koçu olmayan veya pasife alınmış danışman programa giremez (profildeki ÜK koçu ve aktif durum şart).
  const r = await pool.query(
    `SELECT 1 FROM uk_program_enrollments en JOIN employees e ON e.id = en.employee_id
      WHERE en.employee_id = $1 AND en.removed_at IS NULL AND ${UK_ACTIVE_SQL} AND e.status = 'active'`,
    [employeeId],
  );
  return r.rows.length > 0;
}

async function loadParticipant(employeeId: number): Promise<Participant | null> {
  const r = await pool.query(`SELECT ${PARTICIPANT_COLS} ${PARTICIPANT_FROM} WHERE e.id = $1`, [employeeId]);
  const row = r.rows[0];
  if (!row) return null;
  return {
    employeeId: row.id, name: row.name, kwuid: row.kwuid, status: row.status,
    coachId: row.coach_id, coachName: row.coach_name,
    ukStartDate: row.en_start ?? null,
    programStart: row.en_start || row.start_date || null,
    source: row.enrolled ? row.source : null,
    manual: !!row.enrolled && row.source === "manual",
    profileCoach: row.profile_coach_id != null,
    ukActive: !!row.uk_active,
    inProgram: !!row.enrolled,
    welcomeSentAt: row.welcome_sent_at ?? null,
  };
}

function nextMondayYmd(): string {
  return ukAddDays(ukProgramWeek1Monday(todayYmd()), 7);
}

// Profilde ÜK koçu atandığında (boş → koç veya koç değişimi) aktif danışmanı programa
// alır; başlangıç bir sonraki haftanın pazartesisi. Zaten programdaysa dokunmaz.
// Çağıranlar: PATCH /api/employees/:id ve danışman CSV içe aktarımı (yalnız değişende).
export async function autoEnrollOnCoachAssigned(
  employeeId: number, prevCoachId: number | null | undefined, newCoachId: number | null | undefined,
): Promise<boolean> {
  if (!newCoachId || newCoachId === prevCoachId) return false;
  const r = await pool.query(
    `SELECT e.status, en.removed_at, (en.employee_id IS NOT NULL) AS has_row, ${UK_ACTIVE_SQL} AS uk_active
       FROM employees e LEFT JOIN uk_program_enrollments en ON en.employee_id = e.id WHERE e.id = $1`,
    [employeeId],
  );
  const row = r.rows[0];
  if (!row || row.status !== "active" || !row.uk_active) return false;
  if (row.has_row && !row.removed_at) return false; // zaten programda
  await pool.query(
    `INSERT INTO uk_program_enrollments (employee_id, coach_user_id, start_date, source, added_at, removed_at)
     VALUES ($1, NULL, $2, 'auto', NOW(), NULL)
     ON CONFLICT (employee_id) DO UPDATE SET coach_user_id = NULL, start_date = EXCLUDED.start_date,
       source = 'auto', added_at = NOW(), removed_at = NULL, added_by_user_id = NULL`,
    [employeeId, nextMondayYmd()],
  );
  return true;
}

// Tüm personel (admin, hiring manager, asistan) programda tam yetkili (onaylı karar, 2026-10-12).
function canEdit(req: Request, _p: Participant): boolean {
  return !!(req as any).user;
}

// Program penceresindeki otomatik gerçekleşenler: hafta → { kapanis, bhb, katkiPayi }.
async function loadAutoWeekly(employeeId: number, week1Monday: string) {
  const end = ukAddDays(week1Monday, UK_PROGRAM_WEEKS * 7);
  const [closings, referrals] = await Promise.all([
    pool.query(
      `SELECT to_char(COALESCE(ca.closing_date, c.closing_date, c.created_at), 'YYYY-MM-DD') AS d,
              ca.bhb_share::float AS bhb
         FROM closing_agents ca
         JOIN closing_sides cs ON cs.id = ca.closing_side_id
         JOIN closings c ON c.id = cs.closing_id
        WHERE ca.employee_id = $1
          AND COALESCE(ca.status, c.status) = 'completed'
          AND COALESCE(ca.closing_date, c.closing_date, c.created_at) >= $2::date
          AND COALESCE(ca.closing_date, c.closing_date, c.created_at) < $3::date`,
      [employeeId, week1Monday, end],
    ),
    pool.query(
      `SELECT to_char(created_at, 'YYYY-MM-DD') AS d FROM candidates
        WHERE referred_by_employee_id = $1 AND created_at >= $2::date AND created_at < $3::date`,
      [employeeId, week1Monday, end],
    ),
  ]);
  const weekOf = (d: string) => Math.floor((Date.parse(d) - Date.parse(week1Monday)) / (7 * 86400000)) + 1;
  const out: Record<number, { kapanis: number; bhb: number; katkiPayi: number }> = {};
  for (let w = 1; w <= UK_PROGRAM_WEEKS; w++) out[w] = { kapanis: 0, bhb: 0, katkiPayi: 0 };
  for (const r of closings.rows) { const w = weekOf(r.d); if (out[w]) { out[w].kapanis++; out[w].bhb += r.bhb ?? 0; } }
  for (const r of referrals.rows) { const w = weekOf(r.d); if (out[w]) out[w].katkiPayi++; }
  return out;
}

async function buildProgram(p: Participant) {
  const week1Monday = p.programStart ? ukProgramWeek1Monday(p.programStart) : null;
  const [checks, weeks] = await Promise.all([
    pool.query(
      `SELECT k.activity_id, k.checked_at, CASE WHEN k.by_advisor THEN 'Danışman' ELSE u.name END AS checked_by
         FROM uk_program_checks k LEFT JOIN users u ON u.id = k.checked_by_user_id
        WHERE k.employee_id = $1`,
      [p.employeeId],
    ),
    pool.query(
      `SELECT w.*, u.name AS confirmed_by_name FROM uk_program_weeks w
         LEFT JOIN users u ON u.id = w.confirmed_by_user_id
        WHERE w.employee_id = $1`,
      [p.employeeId],
    ),
  ]);
  const auto = week1Monday ? await loadAutoWeekly(p.employeeId, week1Monday) : null;

  const doneP = doneByPeriod(checks.rows.map((r: any) => r.activity_id));
  for (let pi = 0; pi < UK_PERIODS; pi++) {
    doneP[pi].katki = auto
      ? Array.from({ length: UK_PERIOD_WEEKS }, (_, i) => auto[pi * UK_PERIOD_WEEKS + i + 1]?.katkiPayi ?? 0).reduce((s, v) => s + v, 0)
      : 0;
  }
  const activityParts = doneP.map((d) => computeUkActivityScore(d));
  const score = combineUkActivityScores(activityParts);

  const weekRows = Array.from({ length: UK_PROGRAM_WEEKS }, (_, i) => {
    const w = i + 1;
    const m = weeks.rows.find((r: any) => r.week === w);
    const a = auto?.[w] ?? { kapanis: 0, bhb: 0, katkiPayi: 0 };
    const total = UK_ACTIVITIES.filter((x) => x.week === w).length;
    const doneCount = checks.rows.filter((r: any) => r.activity_id.startsWith(`w${w}-`)).length;
    return {
      week: w,
      monday: week1Monday ? ukAddDays(week1Monday, i * 7) : null,
      totalActivities: total, doneActivities: doneCount,
      arama: m?.arama ?? null, randevu: m?.randevu ?? null, tekYetki: m?.tek_yetki ?? null,
      kapanis: a.kapanis, bhb: Math.round(a.bhb * 100) / 100, katkiPayi: a.katkiPayi,
      coachNote: m?.coach_note ?? null,
      confirmedAt: m?.confirmed_at ?? null, confirmedBy: m?.confirmed_by_name ?? null,
    };
  });

  const targetParts = Array.from({ length: UK_PERIODS }, (_, pi) =>
    computeUkTargetScore(weekRows.slice(pi * UK_PERIOD_WEEKS, (pi + 1) * UK_PERIOD_WEEKS)));
  const targetScore = combineUkTargetScores(targetParts);
  // Dönem kırılımı: 1. ve 2. dönem (45 gün + 45 gün) ayrı ayrı.
  const periods = activityParts.map((a, pi) => ({
    period: pi + 1, score: a, targetScore: targetParts[pi],
    startWeek: pi * UK_PERIOD_WEEKS + 1, endWeek: (pi + 1) * UK_PERIOD_WEEKS,
  }));

  return {
    participant: p,
    week1Monday,
    currentWeek: week1Monday ? ukCurrentWeek(week1Monday, todayYmd()) : 0,
    checks: Object.fromEntries(checks.rows.map((r: any) => [r.activity_id, { at: r.checked_at, by: r.checked_by }])),
    weeks: weekRows,
    score,
    targetScore,
    periods,
    totals: {
      activities: UK_ACTIVITIES.length,
      done: checks.rows.length,
    },
  };
}

// ── Danışman portalı (/a/:token) ─────────────────────────────────────────────
// Danışman kendi linkinden Google ile giriş yapar (session.advisorEmployeeIds, bkz.
// routes.ts authedAdvisor). Yalnızca kendi rotasını görür/doldurur:
// - koçun onayladığı hafta kilitlidir,
// - içinde bulunulan haftanın tüm günleri (gelecek günler dahil) işaretlenebilir (2026-10-19),
// - koç notu / onay / program başlangıcı danışmana kapalıdır.
// write=true: personel önizlemesi (advisorPreviewIds) salt okunurdur → 403.
async function advisorParticipant(req: Request, res: Response, write = false): Promise<Participant | null> {
  const emp = await storage.getAdvisorByToken(String(req.params.token));
  if (!emp) { res.status(404).json({ message: "Bağlantı geçersiz" }); return null; }
  const ids: number[] = (req.session as any)?.advisorEmployeeIds ?? [];
  const previewIds: number[] = (req.session as any)?.advisorPreviewIds ?? [];
  if (!ids.includes(emp.id)) {
    if (previewIds.includes(emp.id)) {
      if (write) { res.status(403).json({ message: "Önizleme modu: değişiklik yapılamaz." }); return null; }
    } else {
      res.status(401).json({ message: "Giriş gerekli", needAuth: true }); return null;
    }
  }
  if (!(await isInUkProgram(emp.id))) { res.status(404).json({ message: "Üretkenlik Koçluğu programında değilsiniz." }); return null; }
  return loadParticipant(emp.id);
}

// Danışman yalnızca içinde bulunduğu haftayı düzenleyebilir; geçmiş/gelecek haftalar
// salt okunur (koç ve admin tüm haftaları düzenleyebilir).
function advisorWeekError(programStart: string, week: number): string | null {
  const current = ukCurrentWeek(ukProgramWeek1Monday(programStart), todayYmd());
  if (week === current) return null;
  if (current === 0 || week > current) return "Bu hafta henüz başlamadı.";
  return "Bu hafta kapandı; yalnızca içinde bulunduğunuz hafta düzenlenebilir. Değişiklik için koçunuzla görüşün.";
}

async function isWeekConfirmed(employeeId: number, week: number): Promise<boolean> {
  const r = await pool.query(
    "SELECT 1 FROM uk_program_weeks WHERE employee_id = $1 AND week = $2 AND confirmed_at IS NOT NULL",
    [employeeId, week],
  );
  return r.rows.length > 0;
}

function registerAdvisorUkRoutes(app: Express) {
  app.get("/api/public/advisor/:token/uk-program", async (req: Request, res: Response) => {
    try {
      const p = await advisorParticipant(req, res);
      if (!p) return;
      const prog = await buildProgram(p);
      // Danışmana iç bilgi gösterme: işaretleyen personel adı yerine yalnızca rol.
      // Danışman yalnızca içinde bulunduğu haftayı görür (onaylı karar): diğer haftaların
      // işaretleri ve gerçekleşenleri yanıta hiç konmaz. Hafta pazartesi 00:00 – pazar 23:59
      // (İstanbul); koç onayı beklenmeden pazartesi bir sonraki haftaya geçilir.
      const cw = prog.currentWeek;
      const prefix = `w${cw}-`;
      const checks = Object.fromEntries(
        Object.entries(prog.checks as Record<string, { at: string; by: string | null }>)
          .filter(([k]) => cw >= 1 && cw <= UK_PROGRAM_WEEKS && k.startsWith(prefix))
          .map(([k, v]) => [k, { at: v.at, by: v.by === "Danışman" ? "Siz" : "Koçunuz" }]));
      const weeks = prog.weeks
        .filter((w) => w.week === cw)
        .map((w) => ({ ...w, confirmedBy: w.confirmedAt ? "Koçunuz" : null }));
      const weekEnd = prog.week1Monday && cw >= 1 && cw <= UK_PROGRAM_WEEKS
        ? ukAddDays(prog.week1Monday, (cw - 1) * 7 + 6) : null;
      const realIds: number[] = (req.session as any)?.advisorEmployeeIds ?? [];
      // Puan/skor danışmana gösterilmez (onaylı karar) — yanıttan da çıkarılır.
      const { score: _score, targetScore: _ts, periods, totals: _totals, ...rest } = prog;
      // Hedefler danışmana puansız gösterilir: içinde bulunduğu dönemin (6 hafta) hedeflerinde ilerleme.
      const periodTarget = periods[Math.min(UK_PERIODS - 1, Math.max(0, ukPeriodOfWeek(Math.max(1, cw))))].targetScore;
      const programTargets = periodTarget.rows
        .filter((r) => r.mode === "total" && r.target != null)
        .map((r) => ({ key: r.key, label: r.label, target: r.target as number, done: r.done, hint: r.hint }));
      res.json({ ...rest, checks, weeks, weekEnd, programTargets, today: todayYmd(), preview: !realIds.includes(p.employeeId) });
    } catch (err: any) {
      console.error("[GET advisor uk-program]", err);
      res.status(500).json({ message: "Veriler yüklenemedi." });
    }
  });

  app.put("/api/public/advisor/:token/uk-program/checks/:activityId", async (req: Request, res: Response) => {
    try {
      const p = await advisorParticipant(req, res, true);
      if (!p) return;
      const activity = UK_ACTIVITIES.find((a) => a.id === String(req.params.activityId));
      if (!activity) return res.status(400).json({ message: "Geçersiz aktivite." });
      if (!p.programStart) return res.status(409).json({ message: "Program başlangıç tarihi tanımlı değil, koçunuzla görüşün." });
      const weekErr = advisorWeekError(p.programStart, activity.week);
      if (weekErr) return res.status(409).json({ message: weekErr });
      if (await isWeekConfirmed(p.employeeId, activity.week)) {
        return res.status(409).json({ message: "Bu hafta koçunuz tarafından onaylandı; değişiklik için koçunuzla görüşün." });
      }
      if (req.body?.done) {
        await pool.query(
          `INSERT INTO uk_program_checks (employee_id, activity_id, checked_by_user_id, by_advisor)
           VALUES ($1, $2, NULL, true) ON CONFLICT (employee_id, activity_id) DO NOTHING`,
          [p.employeeId, activity.id],
        );
      } else {
        await pool.query("DELETE FROM uk_program_checks WHERE employee_id = $1 AND activity_id = $2", [p.employeeId, activity.id]);
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[PUT advisor uk checks]", err);
      res.status(500).json({ message: "Kaydedilemedi." });
    }
  });

  // Danışman yalnızca Arama / Randevu / Tek Yetki girer; koç notu ve onay korunur.
  app.put("/api/public/advisor/:token/uk-program/weeks/:week", async (req: Request, res: Response) => {
    try {
      const p = await advisorParticipant(req, res, true);
      if (!p) return;
      const week = Number(req.params.week);
      if (!Number.isInteger(week) || week < 1 || week > UK_PROGRAM_WEEKS) return res.status(400).json({ message: "Geçersiz hafta." });
      if (!p.programStart) return res.status(409).json({ message: "Program başlangıç tarihi tanımlı değil, koçunuzla görüşün." });
      const weekErr = advisorWeekError(p.programStart, week);
      if (weekErr) return res.status(409).json({ message: weekErr });
      if (await isWeekConfirmed(p.employeeId, week)) {
        return res.status(409).json({ message: "Bu hafta koçunuz tarafından onaylandı; değişiklik için koçunuzla görüşün." });
      }
      const num = (v: any) => (v === null || v === undefined || v === "" ? null : Math.max(0, Math.floor(Number(v))) || 0);
      const b = req.body ?? {};
      await pool.query(
        `INSERT INTO uk_program_weeks (employee_id, week, arama, randevu, tek_yetki, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (employee_id, week) DO UPDATE SET
           arama = EXCLUDED.arama, randevu = EXCLUDED.randevu, tek_yetki = EXCLUDED.tek_yetki, updated_at = NOW()`,
        [p.employeeId, week, num(b.arama), num(b.randevu), num(b.tekYetki)],
      );
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[PUT advisor uk weeks]", err);
      res.status(500).json({ message: "Kaydedilemedi." });
    }
  });
}

// Hoş geldin maili: alıcılar = giriş yapabildiği e-postalar (KW + kişisel), link = portal Rotam.
async function welcomeEmailFor(req: Request, p: Participant) {
  const emp = await storage.getEmployee(p.employeeId);
  const loginEmails = Array.from(new Set(
    [(emp as any)?.kwMail, (emp as any)?.candidate?.email].map((m) => (m ?? "").trim().toLowerCase()).filter(Boolean),
  ));
  const token = await storage.ensureAdvisorToken(p.employeeId);
  const base = (publicBaseUrl() || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  const link = `${base}/a/${token}?tab=rota`;
  const week1Monday = p.programStart ? ukProgramWeek1Monday(p.programStart) : null;
  const { subject, html } = buildUkWelcomeEmail({ name: p.name, coachName: p.coachName, week1Monday, link, loginEmails });
  return { to: loginEmails, subject, html, link };
}

// ── WhatsApp alıcıları ────────────────────────────────────────────────────────
export const UK_WA_KINDS = {
  welcome: {
    label: "ÜK Hoş Geldin (WhatsApp)", envSid: "TWILIO_WA_UK_WELCOME_SID",
    variablesHint: "{{1}} ad, {{2}} rota linki",
  },
  reminder: {
    label: "ÜK Haftalık Hatırlatma (WhatsApp)", envSid: "TWILIO_WA_UK_REMINDER_SID",
    variablesHint: "{{1}} ad, {{2}} hafta no, {{3}} rota linki",
  },
} as const;
export type UkWaKind = keyof typeof UK_WA_KINDS;

export type UkWaRecipient = {
  employeeId: number; name: string; phone: string | null; hasPhone: boolean; coachName: string | null;
  currentWeek: number; doneThisWeek: number; totalThisWeek: number; actualsEntered: boolean;
  sentBefore: boolean;        // welcome: daha önce WA hoş geldin gitti; reminder: bu hafta hatırlatma gitti
  sentAt: string | null;
  link: string;
};

function ukBaseUrl(req: Request): string {
  return (publicBaseUrl() || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

// kind=welcome: programdaki herkes (başlamamışlar dahil, 12 haftayı bitirmişler hariç). kind=reminder: içinde bulunduğu
// haftada hiç aktivite işaretlememiş olanlar (haftalık gerçekleşen girmiş olsa da).
export async function ukWaRecipients(req: Request, kind: UkWaKind): Promise<UkWaRecipient[]> {
  const today = todayYmd();
  const thisMonday = ukProgramWeek1Monday(today);
  const label = UK_WA_KINDS[kind].label;
  const r = await pool.query(
    `SELECT ${PARTICIPANT_COLS}, c.phone,
            (SELECT array_agg(k.activity_id) FROM uk_program_checks k WHERE k.employee_id = e.id) AS ids,
            (SELECT array_agg(w.week) FROM uk_program_weeks w WHERE w.employee_id = e.id
              AND (w.arama IS NOT NULL OR w.randevu IS NOT NULL OR w.tek_yetki IS NOT NULL)) AS actual_weeks,
            (SELECT MAX(s.created_at) FROM whatsapp_bulk_sends s
              WHERE s.employee_id = e.id AND s.status = 'sent' AND s.template_name = $1
                ${kind === "reminder" ? "AND s.created_at >= ($2::date - interval '3 hours')" : ""}) AS sent_at
       ${PARTICIPANT_FROM}
      WHERE en.employee_id IS NOT NULL AND ${UK_ACTIVE_SQL} AND e.status = 'active'
      ORDER BY u.name, c.name`,
    kind === "reminder" ? [label, thisMonday] : [label],
  );
  const base = ukBaseUrl(req);
  const out: UkWaRecipient[] = [];
  for (const row of r.rows) {
    const programStart = row.en_start || row.start_date || null;
    const week1Monday = programStart ? ukProgramWeek1Monday(programStart) : null;
    const cw = week1Monday ? ukCurrentWeek(week1Monday, today) : 0;
    const inWeek = cw >= 1 && cw <= UK_PROGRAM_WEEKS;
    const ids: string[] = row.ids ?? [];
    const doneThisWeek = inWeek ? ids.filter((id) => id.startsWith(`w${cw}-`)).length : 0;
    const totalThisWeek = inWeek ? UK_ACTIVITIES.filter((a) => a.week === cw).length : 0;
    const actualsEntered = inWeek && ((row.actual_weeks ?? []) as number[]).includes(cw);
    if (kind === "reminder" && !(inWeek && doneThisWeek === 0)) continue;
    if (kind === "welcome" && cw > UK_PROGRAM_WEEKS) continue;
    const token = await storage.ensureAdvisorToken(row.id);
    const phone = (row.phone ?? "").trim() || null;
    out.push({
      employeeId: row.id, name: row.name, phone, hasPhone: !!phone, coachName: row.coach_name ?? null,
      currentWeek: cw, doneThisWeek, totalThisWeek, actualsEntered,
      sentBefore: !!row.sent_at, sentAt: row.sent_at ?? null,
      link: `${base}/a/${token}?tab=rota`,
    });
  }
  return out;
}

export async function ukWaStartBatch(req: Request, kind: UkWaKind, templateSid: string, employeeIds: number[], userId: number) {
  if (kind === "reminder") {
    // Hafta sınırına (Pzt 00:00 İstanbul) çok yakın başlatma: batch alıcı başına 1,5 sn sürer, sınırı
    // aşan kayıtlar yeni haftaya yazılır ve o danışmanlar gelecek haftanın hatırlatmasını almaz.
    const ist = new Date(Date.now() + 3 * 3600 * 1000);
    const dow = ist.getUTCDay(), min = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if ((dow === 0 && min >= 23 * 60 + 30) || (dow === 1 && min < 10)) {
      throw new Error("Hafta sınırına çok yakın (Pazartesi 00:00). Birkaç dakika sonra tekrar deneyin.");
    }
  }
  const all = await ukWaRecipients(req, kind);
  const byId = new Map(all.map((x) => [x.employeeId, x]));
  // Şablonun tanımladığı değişkenler dışındakiler gönderilmez (Twilio fazla değişkeni reddeder).
  const tpl = (await listWhatsAppTemplates().catch(() => [])).find((t) => t.sid === templateSid) ?? null;
  const items: BulkSendItem[] = [];
  for (const id of employeeIds) {
    const x = byId.get(id);
    if (!x) continue;
    const first = (x.name.trim().split(/\s+/)[0] || x.name.trim()) || "Danışman";   // WhatsApp boş değişkeni reddeder
    const vars: Record<string, string> = kind === "reminder"
      ? { "1": first, "2": String(x.currentWeek), "3": x.link }
      : { "1": first, "2": x.link };
    const filtered = tpl && tpl.variables.length > 0 ? Object.fromEntries(Object.entries(vars).filter(([k]) => tpl.variables.includes(k))) : vars;
    items.push({ employeeId: x.employeeId, name: x.name, phone: x.phone, variables: filtered });
  }
  if (items.length === 0) throw new Error("Seçilen danışmanlar listede yok.");
  const batchId = startBulkSendBatch({ createdByUserId: userId, templateSid, templateName: UK_WA_KINDS[kind].label, items });
  return { batchId, count: items.length };
}

export function registerUkProgramRoutes(app: Express) {
  // Önizleme (koç/admin): alıcılar, konu, HTML, son gönderim.
  app.get("/api/uk-program/:employeeId/welcome-email", requireAuth, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p?.inProgram) return res.status(404).json({ error: "Bu danışman programda değil." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yetkisiz." });
      const m = await welcomeEmailFor(req, p);
      res.json({ to: m.to, subject: m.subject, html: m.html, lastSentAt: p.welcomeSentAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manuel gönderim (koç/admin). Çift tıklamaya karşı 60 sn bekleme.
  app.post("/api/uk-program/:employeeId/welcome-email", requireAuth, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p?.inProgram) return res.status(404).json({ error: "Bu danışman programda değil." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yetkisiz." });
      if (p.welcomeSentAt && Date.now() - new Date(p.welcomeSentAt).getTime() < 60_000) {
        return res.status(429).json({ error: "Mail az önce gönderildi; tekrar göndermek için biraz bekleyin." });
      }
      const m = await welcomeEmailFor(req, p);
      if (m.to.length === 0) {
        return res.status(400).json({ error: "Danışmanın kayıtlı e-postası yok (KW e-posta veya kişisel e-posta girin)." });
      }
      const sent = await sendEmail(m.to.join(", "), m.subject, m.html);
      if (!sent) return res.status(502).json({ error: "Mail gönderilemedi (mail ayarlarını veya adresi kontrol edin)." });
      await pool.query(
        "UPDATE uk_program_enrollments SET welcome_sent_at = NOW(), welcome_sent_by_user_id = $2 WHERE employee_id = $1 AND removed_at IS NULL",
        [p.employeeId, (req as any).user.id],
      );
      res.json({ ok: true, to: m.to });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  registerAdvisorUkRoutes(app);

  // ── Toplu ekleme / toplu hoş geldin maili ──
  // Adaylar: aktif, profilinde ÜK koçu olan ve programda olmayan danışmanlar.
  app.get("/api/uk-program/bulk-candidates", requireAuth, async (_req: Request, res: Response) => {
    try {
      const r = await pool.query(
        `SELECT e.id, c.name, e.kwuid, u.name AS coach_name,
                (coalesce(e.kw_mail, '') <> '' OR coalesce(c.email, '') <> '') AS has_email,
                (en.employee_id IS NOT NULL) AS was_removed
           FROM employees e
           JOIN candidates c ON c.id = e.candidate_id
           JOIN users u ON u.id = e.uretkenlik_koclugu_manager_id
           LEFT JOIN uk_program_enrollments en ON en.employee_id = e.id
          WHERE e.status = 'active' AND ${UK_ACTIVE_SQL} AND (en.employee_id IS NULL OR en.removed_at IS NOT NULL)
          ORDER BY u.name, c.name`,
      );
      res.json(r.rows.map((x) => ({
        employeeId: x.id, name: x.name, kwuid: x.kwuid, coachName: x.coach_name,
        hasEmail: !!x.has_email, wasRemoved: !!x.was_removed,
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Seçilen danışmanları aynı pazartesiden programa alır; istenirse e-postası olanlara hoş geldin
  // maili gönderir. Danışman başına sonuç döner (eklendi / zaten programda / koç yok / mail durumu).
  app.post("/api/uk-program/bulk-enroll", requireAuth, async (req: Request, res: Response) => {
    try {
      const ids = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds.map(Number).filter(Number.isInteger) : [];
      const startDate = String(req.body?.startDate ?? "");
      const sendWelcome = !!req.body?.sendWelcome;
      if (ids.length === 0) return res.status(400).json({ error: "Danışman seçin." });
      if (!ukIsMonday(startDate)) return res.status(400).json({ error: "Program başlangıcı pazartesi olmalı." });
      const results: { employeeId: number; name: string; enrolled: boolean; mailed: boolean | null; error: string | null }[] = [];
      for (const employeeId of ids) {
        const p = await loadParticipant(employeeId);
        if (!p) { results.push({ employeeId, name: `#${employeeId}`, enrolled: false, mailed: null, error: "Danışman bulunamadı" }); continue; }
        if (p.status !== "active") { results.push({ employeeId, name: p.name, enrolled: false, mailed: null, error: "Pasif danışman" }); continue; }
        if (!p.profileCoach) { results.push({ employeeId, name: p.name, enrolled: false, mailed: null, error: "Profilde ÜK koçu yok" }); continue; }
        if (!p.ukActive) { results.push({ employeeId, name: p.name, enrolled: false, mailed: null, error: "ÜK'da değil (işaret kapalı veya çıkış tarihi dolu)" }); continue; }
        if (p.inProgram) { results.push({ employeeId, name: p.name, enrolled: false, mailed: null, error: "Zaten programda" }); continue; }
        await pool.query(
          `INSERT INTO uk_program_enrollments (employee_id, coach_user_id, start_date, added_by_user_id, added_at, removed_at, source)
           VALUES ($1, NULL, $2, $3, NOW(), NULL, 'manual')
           ON CONFLICT (employee_id) DO UPDATE SET coach_user_id = NULL, start_date = EXCLUDED.start_date,
             added_by_user_id = EXCLUDED.added_by_user_id, added_at = NOW(), removed_at = NULL, source = 'manual'`,
          [employeeId, startDate, (req as any).user.id],
        );
        let mailed: boolean | null = null, error: string | null = null;
        if (sendWelcome) {
          const fresh = await loadParticipant(employeeId);
          const m = fresh ? await welcomeEmailFor(req, fresh) : null;
          if (!m || m.to.length === 0) { mailed = false; error = "E-posta yok, mail gönderilmedi"; }
          else {
            const r = await sendEmailDetailed(m.to.join(", "), m.subject, m.html);
            mailed = r.ok;
            if (r.ok) { await pool.query("UPDATE uk_program_enrollments SET welcome_sent_at = NOW(), welcome_sent_by_user_id = $2 WHERE employee_id = $1 AND removed_at IS NULL", [employeeId, (req as any).user.id]); await new Promise((rs) => setTimeout(rs, 250)); }
            else error = `Mail gönderilemedi: ${r.error}`;
          }
        }
        results.push({ employeeId, name: p.name, enrolled: true, mailed, error });
      }
      res.json({ results, enrolled: results.filter((r) => r.enrolled).length, mailed: results.filter((r) => r.mailed).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Programdaki danışmanlara toplu hoş geldin maili (verilen id'ler; e-postası olmayan atlanır).
  app.post("/api/uk-program/bulk-welcome", requireAuth, async (req: Request, res: Response) => {
    try {
      const ids = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds.map(Number).filter(Number.isInteger) : [];
      if (ids.length === 0) return res.status(400).json({ error: "Danışman seçin." });
      const results: { employeeId: number; name: string; mailed: boolean; error: string | null }[] = [];
      let stopReason: string | null = null;
      for (const employeeId of ids) {
        const p = await loadParticipant(employeeId);
        if (!p?.inProgram) { results.push({ employeeId, name: p?.name ?? `#${employeeId}`, mailed: false, error: "Programda değil" }); continue; }
        const m = await welcomeEmailFor(req, p);
        if (m.to.length === 0) { results.push({ employeeId, name: p.name, mailed: false, error: "E-posta yok" }); continue; }
        if (stopReason) { results.push({ employeeId, name: p.name, mailed: false, error: stopReason }); continue; }
        const r = await sendEmailDetailed(m.to.join(", "), m.subject, m.html);
        if (r.ok) {
          await pool.query("UPDATE uk_program_enrollments SET welcome_sent_at = NOW(), welcome_sent_by_user_id = $2 WHERE employee_id = $1 AND removed_at IS NULL", [employeeId, (req as any).user.id]);
          results.push({ employeeId, name: p.name, mailed: true, error: null });
          await new Promise((rs) => setTimeout(rs, 250));   // Gmail dakika başı sınırına takılmamak için
        } else {
          results.push({ employeeId, name: p.name, mailed: false, error: `Mail gönderilemedi: ${r.error}` });
          // Kota aşıldıysa kalanları denemek anlamsız: hepsi "gönderilmedi" kalır, yarın Toplu Mail (N) ile devam edilir.
          if (r.quota) stopReason = "Gmail gönderim sınırı aşıldı; kalanlar gönderilmedi, daha sonra Toplu Mail ile tekrar deneyin.";
        }
      }
      res.json({ results, mailed: results.filter((r) => r.mailed).length, stopped: stopReason });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manuel ekleme (tüm personel). Koç her zaman danışman profilindeki ÜK koçudur; profilde
  // koç yoksa eklenemez. ÜK işaretine/ÜK payına dokunmaz; yeniden eklemede önceki
  // işaretler ve haftalık kayıtlar korunur.
  app.post("/api/uk-program/enrollments", requireAuth, async (req: Request, res: Response) => {
    try {
      const employeeId = Number(req.body?.employeeId);
      const startDate = String(req.body?.startDate ?? "");
      if (!Number.isInteger(employeeId)) return res.status(400).json({ error: "Danışman seçin." });
      if (!ukIsMonday(startDate)) return res.status(400).json({ error: "Program başlangıcı pazartesi olmalı." });
      const p = await loadParticipant(employeeId);
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!p.profileCoach) return res.status(400).json({ error: "Danışmanın profilinde ÜK koçu yok. Önce danışman profilinden koç atayın." });
      if (!p.ukActive) return res.status(400).json({ error: "Danışman ÜK'da değil (işaret kapalı veya ÜK çıkış tarihi dolu)." });
      if (p.inProgram) return res.status(409).json({ error: `${p.name} zaten programda.` });
      await pool.query(
        `INSERT INTO uk_program_enrollments (employee_id, coach_user_id, start_date, added_by_user_id, added_at, removed_at, source)
         VALUES ($1, NULL, $2, $3, NOW(), NULL, 'manual')
         ON CONFLICT (employee_id) DO UPDATE SET coach_user_id = NULL, start_date = EXCLUDED.start_date,
           added_by_user_id = EXCLUDED.added_by_user_id, added_at = NOW(), removed_at = NULL, source = 'manual'`,
        [employeeId, startDate, (req as any).user.id],
      );
      res.json({ ok: true, employeeId, coachUserId: p.coachId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Programdan çıkar (tüm personel). Kayıtlar silinmez; yeniden eklenirse geri gelir.
  app.delete("/api/uk-program/:employeeId/enrollment", requireAuth, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!p.inProgram) return res.status(404).json({ error: "Bu danışman programda değil." });
      await pool.query("UPDATE uk_program_enrollments SET removed_at = NOW() WHERE employee_id = $1 AND removed_at IS NULL", [p.employeeId]);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // "Danışman Gözüyle Gör": personel oturumuna bu danışman için salt okunur önizleme
  // izni ekler ve portala yönlendirir (Google girişi gerekmez, değişiklik yapılamaz).
  app.get("/api/uk-program/:employeeId/preview-as-advisor", requireAuth, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).send("Danışman bulunamadı.");
      if (!canEdit(req, p)) return res.status(403).send("Yetkisiz.");
      const token = await storage.ensureAdvisorToken(p.employeeId);
      const ids = new Set<number>((req.session as any).advisorPreviewIds ?? []);
      ids.add(p.employeeId);
      (req.session as any).advisorPreviewIds = Array.from(ids);
      await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
      res.redirect(`/a/${token}?tab=rota`);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // Danışmanın portal linki (rotasını doldurması için). Giriş, kayıtlı KW / kişisel
  // e-postası ile Google üzerinden yapılır; e-posta yoksa giriş mümkün değildir.
  app.get("/api/uk-program/:employeeId/advisor-link", requireAuth, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yetkisiz." });
      const emp = await storage.getEmployee(p.employeeId);
      const emails = [(emp as any)?.kwMail, (emp as any)?.candidate?.email].map((m) => (m ?? "").trim()).filter(Boolean);
      const token = await storage.ensureAdvisorToken(p.employeeId);
      const base = publicBaseUrl() || `${req.protocol}://${req.get("host")}`;
      res.json({ url: `${base.replace(/\/$/, "")}/a/${token}?tab=rota`, loginEmails: emails });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── WhatsApp: hoş geldin + haftalık hatırlatma (Twilio onaylı şablonlarla) ───────────
  // Şablon metni Twilio Console'da onaylatılır; burada yalnız alıcı listesi, kişisel link ve
  // değişkenler hazırlanır, gönderim whatsapp-bulk-runner ile (1,5 sn aralık, art arda 3 hata → dur).
  // Değişkenler: {{1}} ad, {{2}} hafta no (hatırlatmada) / link (hoş geldinde), {{3}} link.
  // Yalnız şablonun tanımladığı değişkenler gönderilir.
  const isAdmin = (req: Request) => (req as any).user?.role === "admin";
  const isUkWaKind = (k: string): k is UkWaKind => Object.prototype.hasOwnProperty.call(UK_WA_KINDS, k);
  app.get("/api/uk-program/whatsapp/:kind/recipients", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: "Yalnız admin." });
      const kind = String(req.params.kind);
      if (!isUkWaKind(kind)) return res.status(404).json({ error: "Bilinmeyen tür." });
      const [recipients, templates] = await Promise.all([ukWaRecipients(req, kind), listWhatsAppTemplates().catch(() => [])]);
      res.json({
        kind, label: UK_WA_KINDS[kind].label,
        defaultTemplateSid: process.env[UK_WA_KINDS[kind].envSid] ?? null,
        variablesHint: UK_WA_KINDS[kind].variablesHint,
        templates, recipients,
      });
    } catch (err: any) {
      console.error("[GET uk whatsapp recipients]", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/uk-program/whatsapp/:kind/send", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!isAdmin(req)) return res.status(403).json({ error: "Yalnız admin." });
      const kind = String(req.params.kind);
      if (!isUkWaKind(kind)) return res.status(404).json({ error: "Bilinmeyen tür." });
      const ids = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds.map(Number).filter(Number.isInteger) : [];
      const templateSid = String(req.body?.templateSid ?? process.env[UK_WA_KINDS[kind].envSid] ?? "");
      if (ids.length === 0) return res.status(400).json({ error: "Danışman seçin." });
      if (!templateSid) return res.status(400).json({ error: "Twilio şablonu seçin." });
      const { batchId, count } = await ukWaStartBatch(req, kind, templateSid, ids, (req as any).user.id);
      res.json({ batchId, count });
    } catch (err: any) {
      console.error("[POST uk whatsapp send]", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/uk-program/whatsapp/batch/:batchId", requireAuth, async (req: Request, res: Response) => {
    if (!isAdmin(req)) return res.status(403).json({ error: "Yalnız admin." });
    const b = getBatch(String(req.params.batchId));
    if (!b) return res.status(404).json({ error: "Gönderim bulunamadı." });
    res.json(b);
  });

  // Harici zamanlayıcı (Replit Scheduled Deployment / cron-job.org): CRON_SECRET ile korunur.
  // Bu hafta aktivite girmemiş ve bu hafta henüz hatırlatma almamış herkese gönderir.
  // Şablon: TWILIO_WA_UK_REMINDER_SID. Örn. her cuma 17:00: POST /api/uk-program/whatsapp/reminder/cron
  app.all("/api/uk-program/whatsapp/reminder/cron", async (req: Request, res: Response) => {
    try {
      const secret = process.env.CRON_SECRET;
      const given = req.get("x-cron-secret") ?? String(req.query.secret ?? "");
      if (!secret || given !== secret) return res.status(401).json({ error: "Yetkisiz." });
      const templateSid = process.env.TWILIO_WA_UK_REMINDER_SID;
      if (!templateSid) return res.status(400).json({ error: "TWILIO_WA_UK_REMINDER_SID tanımlı değil." });
      // Tekrar tetiklenmeye karşı: cron batch'i (userId 0) hâlâ çalışıyorsa yenisini açma.
      const running = getActiveBatchForUser(0);
      if (running) return res.json({ batchId: running.batchId, count: running.total, alreadyRunning: true });
      const recips = (await ukWaRecipients(req, "reminder")).filter((r) => r.hasPhone && !r.sentBefore);
      if (recips.length === 0) return res.json({ batchId: null, count: 0 });
      const { batchId, count } = await ukWaStartBatch(req, "reminder", templateSid, recips.map((r) => r.employeeId), 0);
      // Autoscale: yanıt dönünce instance uyuyabilir; gönderim bitene kadar isteği açık tut (en çok 10 dk).
      const deadline = Date.now() + 10 * 60_000;
      let b = getBatch(batchId);
      while (b && b.status === "running" && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 1000)); b = getBatch(batchId); }
      res.json({ batchId, count, status: b?.status ?? "unknown", sent: b?.sent ?? 0, failed: b?.failed ?? 0 });
    } catch (err: any) {
      console.error("[uk whatsapp reminder cron]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Katılımcılar: ÜK bayrağı olan danışmanlar + ilerleme özeti.
  app.get("/api/uk-program", requireAuth, async (req: Request, res: Response) => {
    try {
      const includePassive = req.query.includePassive === "true";
      const r = await pool.query(
        `SELECT ${PARTICIPANT_COLS},
                (SELECT COUNT(*)::int FROM uk_program_checks k WHERE k.employee_id = e.id) AS done,
                (SELECT array_agg(k.activity_id) FROM uk_program_checks k WHERE k.employee_id = e.id) AS ids,
                (SELECT MAX(w.week) FROM uk_program_weeks w WHERE w.employee_id = e.id AND w.confirmed_at IS NOT NULL) AS last_confirmed,
                (SELECT COUNT(*)::int FROM candidates rc WHERE rc.referred_by_employee_id = e.id) AS referrals,
                (coalesce(e.kw_mail, '') <> '' OR coalesce(c.email, '') <> '') AS has_email
           ${PARTICIPANT_FROM}
          WHERE en.employee_id IS NOT NULL AND ${includePassive ? "e.uretkenlik_koclugu_manager_id IS NOT NULL" : `${UK_ACTIVE_SQL} AND e.status = 'active'`}
          ORDER BY en.start_date DESC NULLS LAST, c.name`,
      );
      const today = todayYmd();
      const ids = r.rows.map((row: any) => row.id);
      const manualWeeks = ids.length
        ? (await pool.query(
            `SELECT employee_id, week, arama, randevu, tek_yetki FROM uk_program_weeks WHERE employee_id = ANY($1::int[])`, [ids])).rows
        : [];
      const autoBy = new Map<number, Awaited<ReturnType<typeof loadAutoWeekly>>>();
      await Promise.all(r.rows.map(async (row: any) => {
        const ps = row.en_start || row.start_date || null;
        if (ps) autoBy.set(row.id, await loadAutoWeekly(row.id, ukProgramWeek1Monday(ps)));
      }));
      res.json(r.rows.map((row: any) => {
        const programStart = row.en_start || row.start_date || null;
        const week1Monday = programStart ? ukProgramWeek1Monday(programStart) : null;
        const auto = autoBy.get(row.id);
        const weekActuals = Array.from({ length: UK_PROGRAM_WEEKS }, (_, i) => {
          const m = manualWeeks.find((x: any) => x.employee_id === row.id && x.week === i + 1);
          const a = auto?.[i + 1];
          return { arama: m?.arama, randevu: m?.randevu, tekYetki: m?.tek_yetki, kapanis: a?.kapanis ?? 0, bhb: a?.bhb ?? 0, katkiPayi: a?.katkiPayi ?? 0 };
        });
        const targetScore = combineUkTargetScores(Array.from({ length: UK_PERIODS }, (_, pi) =>
          computeUkTargetScore(weekActuals.slice(pi * UK_PERIOD_WEEKS, (pi + 1) * UK_PERIOD_WEEKS)))).total;
        const doneP = doneByPeriod((row.ids ?? []) as string[]);
        // Katkı payı program penceresindeki referanslardan (detayla aynı).
        for (let pi = 0; pi < UK_PERIODS; pi++) {
          doneP[pi].katki = weekActuals.slice(pi * UK_PERIOD_WEEKS, (pi + 1) * UK_PERIOD_WEEKS).reduce((s, w) => s + w.katkiPayi, 0);
        }
        const done = doneP;
        return {
          employeeId: row.id, name: row.name, kwuid: row.kwuid, status: row.status,
          coachId: row.coach_id, coachName: row.coach_name,
          programStart, week1Monday,
          currentWeek: week1Monday ? ukCurrentWeek(week1Monday, today) : 0,
          done: row.done, total: UK_ACTIVITIES.length,
          score: combineUkActivityScores(done.map((d) => computeUkActivityScore(d))).total,
          targetScore,
          lastConfirmedWeek: row.last_confirmed ?? null,
          welcomeSentAt: row.welcome_sent_at ?? null,
          hasEmail: !!row.has_email,   // yoksa danışman portala giremez (Google girişi e-postayla eşleşir)
          manual: row.source === "manual",
          source: row.source,
          canEdit: true,
        };
      }));
    } catch (err: any) {
      console.error("[GET /api/uk-program]", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/uk-program/:employeeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!p.inProgram) return res.status(404).json({ error: "Bu danışman 45+45 programında değil." });
      res.json({ ...(await buildProgram(p)), canEdit: canEdit(req, p), isAdmin: true });
    } catch (err: any) {
      console.error("[GET /api/uk-program/:id]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Kutucuk işaretle / kaldır.
  app.put("/api/uk-program/:employeeId/checks/:activityId", requireAuth, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yetkisiz." });
      const activityId = String(req.params.activityId);
      if (!UK_ACTIVITY_IDS.has(activityId)) return res.status(400).json({ error: "Geçersiz aktivite." });
      if (req.body?.done) {
        await pool.query(
          `INSERT INTO uk_program_checks (employee_id, activity_id, checked_by_user_id)
           VALUES ($1, $2, $3) ON CONFLICT (employee_id, activity_id) DO NOTHING`,
          [p.employeeId, activityId, (req as any).user.id],
        );
      } else {
        await pool.query("DELETE FROM uk_program_checks WHERE employee_id = $1 AND activity_id = $2", [p.employeeId, activityId]);
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[PUT /api/uk-program checks]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Haftalık gerçekleşenler (manuel: arama, randevu, tek yetki) + koç notu + onay.
  app.put("/api/uk-program/:employeeId/weeks/:week", requireAuth, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yetkisiz." });
      const week = Number(req.params.week);
      if (!Number.isInteger(week) || week < 1 || week > UK_PROGRAM_WEEKS) return res.status(400).json({ error: "Geçersiz hafta." });
      const num = (v: any) => (v === null || v === undefined || v === "" ? null : Math.max(0, Math.floor(Number(v))) || 0);
      const b = req.body ?? {};
      const confirm = b.confirm === true ? "confirm" : b.confirm === false ? "unconfirm" : "keep";
      await pool.query(
        `INSERT INTO uk_program_weeks (employee_id, week, arama, randevu, tek_yetki, coach_note, confirmed_at, confirmed_by_user_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6,
                 CASE WHEN $7 = 'confirm' THEN NOW() ELSE NULL END,
                 CASE WHEN $7 = 'confirm' THEN $8::int ELSE NULL END, NOW())
         ON CONFLICT (employee_id, week) DO UPDATE SET
           arama = EXCLUDED.arama, randevu = EXCLUDED.randevu, tek_yetki = EXCLUDED.tek_yetki,
           coach_note = EXCLUDED.coach_note,
           confirmed_at = CASE WHEN $7 = 'confirm' THEN NOW() WHEN $7 = 'unconfirm' THEN NULL ELSE uk_program_weeks.confirmed_at END,
           confirmed_by_user_id = CASE WHEN $7 = 'confirm' THEN $8::int WHEN $7 = 'unconfirm' THEN NULL ELSE uk_program_weeks.confirmed_by_user_id END,
           updated_at = NOW()`,
        [p.employeeId, week, num(b.arama), num(b.randevu), num(b.tekYetki), b.coachNote ? String(b.coachNote).slice(0, 2000) : null,
         confirm, (req as any).user.id],
      );
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[PUT /api/uk-program weeks]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Program başlangıç tarihi (uk_program_enrollments.start_date).
  app.put("/api/uk-program/:employeeId/start", requireAuth, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yetkisiz." });
      const v = String(req.body?.ukStartDate ?? "");
      if (v && !ukIsMonday(v)) return res.status(400).json({ error: "Program başlangıcı pazartesi olmalı." });
      if (!p.inProgram) return res.status(404).json({ error: "Bu danışman programda değil." });
      if (!v) return res.status(400).json({ error: "Başlangıç tarihi boş olamaz." });
      await pool.query("UPDATE uk_program_enrollments SET start_date = $2 WHERE employee_id = $1 AND removed_at IS NULL", [p.employeeId, v]);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
