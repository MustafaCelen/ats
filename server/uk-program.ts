// ── ÜK 45+45 Başarı Rotası: API ──────────────────────────────────────────────
// Şablon ve puanlama shared/uk-program.ts'te. Burada katılımcı listesi, kutucuk
// işaretleme, haftalık gerçekleşenler ve koç onayı.
//
// Yetki: görüntüleme admin + hiring_manager; düzenleme admin veya danışmanın ÜK koçu
// (employees.uretkenlik_koclugu_manager_id).
import type { Express, Request, Response } from "express";
import { pool } from "./db";
import { requireAuth, requireHiringManagerOrAdmin } from "./auth";
import { storage } from "./storage";
import { sendEmail } from "./email";
import { buildUkWelcomeEmail } from "./uk-welcome-email";
import { publicBaseUrl } from "./whatsapp";
import {
  UK_ACTIVITIES, UK_ACTIVITY_IDS, UK_PROGRAM_WEEKS, computeUkActivityScore,
  ukProgramWeek1Monday, ukAddDays, ukCurrentWeek, type UkScoreKey,
} from "@shared/uk-program";

const scoreOfActivity = new Map(UK_ACTIVITIES.map((a) => [a.id, a.score] as const));

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
  manual: boolean;          // admin elle ekledi (koçu programa özel olabilir)
  inProgram: boolean;
  welcomeSentAt: string | null;
};

// Katılım yalnızca uk_program_enrollments'tan gelir:
//  - auto: profilde ÜK koçu atandığında, bir sonraki haftanın pazartesisinden başlar
//    (autoEnrollOnCoachAssigned). Koç profildekini izler (coach_user_id NULL).
//  - manual: admin "Danışman Ekle" ile; koç/başlangıç programa özel.
//  - backfill: eski sürümün toplu aktarımı; artık üretilmez (ÜK işaretliler toplu taşınmaz).
// employees.uretkenlik_koclugu ÜK payını etkilediği için programda kullanılmaz.
const PARTICIPANT_FROM = `
       FROM employees e
       JOIN candidates c ON c.id = e.candidate_id
       LEFT JOIN uk_program_enrollments en ON en.employee_id = e.id AND en.removed_at IS NULL
       LEFT JOIN users u ON u.id = COALESCE(en.coach_user_id, e.uretkenlik_koclugu_manager_id)`;
const PARTICIPANT_COLS = `e.id, c.name, e.kwuid, e.status, u.id AS coach_id, u.name AS coach_name,
       (en.employee_id IS NOT NULL) AS enrolled, en.source,
       en.start_date AS en_start, to_char(e.start_date, 'YYYY-MM-DD') AS start_date, en.welcome_sent_at`;

export async function isInUkProgram(employeeId: number): Promise<boolean> {
  const r = await pool.query(
    "SELECT 1 FROM uk_program_enrollments WHERE employee_id = $1 AND removed_at IS NULL",
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
    `SELECT e.status, en.removed_at, (en.employee_id IS NOT NULL) AS has_row
       FROM employees e LEFT JOIN uk_program_enrollments en ON en.employee_id = e.id WHERE e.id = $1`,
    [employeeId],
  );
  const row = r.rows[0];
  if (!row || row.status !== "active") return false;
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

function canEdit(req: Request, p: Participant): boolean {
  const u = (req as any).user;
  return !!u && (u.role === "admin" || (p.coachId != null && u.id === p.coachId));
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

  const done: Partial<Record<UkScoreKey, number>> = {};
  for (const r of checks.rows) {
    const s = scoreOfActivity.get(r.activity_id);
    if (s) done[s] = (done[s] ?? 0) + 1;
  }
  if (auto) done.katki = Object.values(auto).reduce((s, w) => s + w.katkiPayi, 0);
  const score = computeUkActivityScore(done);

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

  return {
    participant: p,
    week1Monday,
    currentWeek: week1Monday ? ukCurrentWeek(week1Monday, todayYmd()) : 0,
    checks: Object.fromEntries(checks.rows.map((r: any) => [r.activity_id, { at: r.checked_at, by: r.checked_by }])),
    weeks: weekRows,
    score,
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
// - henüz gelmemiş günlerin aktiviteleri işaretlenemez,
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
      const checks = Object.fromEntries(Object.entries(prog.checks as Record<string, { at: string; by: string | null }>).map(([k, v]) =>
        [k, { at: v.at, by: v.by === "Danışman" ? "Siz" : "Koçunuz" }]));
      const weeks = prog.weeks.map((w) => ({ ...w, confirmedBy: w.confirmedAt ? "Koçunuz" : null }));
      const realIds: number[] = (req.session as any)?.advisorEmployeeIds ?? [];
      // Puan/skor danışmana gösterilmez (onaylı karar) — yanıttan da çıkarılır.
      const { score: _score, ...rest } = prog;
      res.json({ ...rest, checks, weeks, today: todayYmd(), preview: !realIds.includes(p.employeeId) });
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
      const date = ukAddDays(ukProgramWeek1Monday(p.programStart), (activity.week - 1) * 7 + activity.day);
      if (date > todayYmd()) return res.status(409).json({ message: "Henüz gelmemiş bir günün aktivitesi işaretlenemez." });
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

export function registerUkProgramRoutes(app: Express) {
  // Önizleme (koç/admin): alıcılar, konu, HTML, son gönderim.
  app.get("/api/uk-program/:employeeId/welcome-email", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p?.inProgram) return res.status(404).json({ error: "Bu danışman programda değil." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yalnızca danışmanın ÜK koçu veya admin." });
      const m = await welcomeEmailFor(req, p);
      res.json({ to: m.to, subject: m.subject, html: m.html, lastSentAt: p.welcomeSentAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manuel gönderim (koç/admin). Çift tıklamaya karşı 60 sn bekleme.
  app.post("/api/uk-program/:employeeId/welcome-email", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p?.inProgram) return res.status(404).json({ error: "Bu danışman programda değil." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yalnızca danışmanın ÜK koçu veya admin." });
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

  // Manuel ekleme (admin). ÜK işaretine/ÜK payına dokunmaz; yeniden eklemede önceki
  // işaretler ve haftalık kayıtlar korunur.
  app.post("/api/uk-program/enrollments", requireAuth, async (req: Request, res: Response) => {
    try {
      if ((req as any).user?.role !== "admin") return res.status(403).json({ error: "Yalnızca admin danışman ekleyebilir." });
      const employeeId = Number(req.body?.employeeId);
      const coachUserId = req.body?.coachUserId ? Number(req.body.coachUserId) : null;
      const startDate = String(req.body?.startDate ?? "");
      if (!Number.isInteger(employeeId)) return res.status(400).json({ error: "Danışman seçin." });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return res.status(400).json({ error: "Başlangıç tarihi YYYY-MM-DD olmalı." });
      const p = await loadParticipant(employeeId);
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (p.inProgram) return res.status(409).json({ error: `${p.name} zaten programda.` });
      if (coachUserId != null) {
        const c = await pool.query("SELECT 1 FROM users WHERE id = $1 AND role IN ('admin', 'hiring_manager')", [coachUserId]);
        if (!c.rows.length) return res.status(400).json({ error: "Geçersiz koç." });
      }
      await pool.query(
        `INSERT INTO uk_program_enrollments (employee_id, coach_user_id, start_date, added_by_user_id, added_at, removed_at, source)
         VALUES ($1, $2, $3, $4, NOW(), NULL, 'manual')
         ON CONFLICT (employee_id) DO UPDATE SET coach_user_id = EXCLUDED.coach_user_id, start_date = EXCLUDED.start_date,
           added_by_user_id = EXCLUDED.added_by_user_id, added_at = NOW(), removed_at = NULL, source = 'manual'`,
        [employeeId, coachUserId, startDate, (req as any).user.id],
      );
      res.json({ ok: true, employeeId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Manuel eklenen danışmanın koçunu değiştir (admin).
  app.put("/api/uk-program/:employeeId/coach", requireAuth, async (req: Request, res: Response) => {
    try {
      if ((req as any).user?.role !== "admin") return res.status(403).json({ error: "Yalnızca admin." });
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p?.manual) return res.status(409).json({ error: "Koç yalnızca manuel eklenen danışmanlarda buradan değişir; diğerlerinde danışman profilinden." });
      const coachUserId = req.body?.coachUserId ? Number(req.body.coachUserId) : null;
      await pool.query("UPDATE uk_program_enrollments SET coach_user_id = $2 WHERE employee_id = $1 AND removed_at IS NULL", [p.employeeId, coachUserId]);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Programdan çıkar (admin). Kayıtlar silinmez; yeniden eklenirse geri gelir.
  app.delete("/api/uk-program/:employeeId/enrollment", requireAuth, async (req: Request, res: Response) => {
    try {
      if ((req as any).user?.role !== "admin") return res.status(403).json({ error: "Yalnızca admin çıkarabilir." });
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
  app.get("/api/uk-program/:employeeId/preview-as-advisor", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).send("Danışman bulunamadı.");
      if (!canEdit(req, p)) return res.status(403).send("Yalnızca danışmanın ÜK koçu veya admin önizleyebilir.");
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
  app.get("/api/uk-program/:employeeId/advisor-link", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yalnızca danışmanın ÜK koçu veya admin." });
      const emp = await storage.getEmployee(p.employeeId);
      const emails = [(emp as any)?.kwMail, (emp as any)?.candidate?.email].map((m) => (m ?? "").trim()).filter(Boolean);
      const token = await storage.ensureAdvisorToken(p.employeeId);
      const base = publicBaseUrl() || `${req.protocol}://${req.get("host")}`;
      res.json({ url: `${base.replace(/\/$/, "")}/a/${token}?tab=rota`, loginEmails: emails });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Katılımcılar: ÜK bayrağı olan danışmanlar + ilerleme özeti.
  app.get("/api/uk-program", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      const includePassive = req.query.includePassive === "true";
      const r = await pool.query(
        `SELECT ${PARTICIPANT_COLS},
                (SELECT COUNT(*)::int FROM uk_program_checks k WHERE k.employee_id = e.id) AS done,
                (SELECT array_agg(k.activity_id) FROM uk_program_checks k WHERE k.employee_id = e.id) AS ids,
                (SELECT MAX(w.week) FROM uk_program_weeks w WHERE w.employee_id = e.id AND w.confirmed_at IS NOT NULL) AS last_confirmed,
                (SELECT COUNT(*)::int FROM candidates rc WHERE rc.referred_by_employee_id = e.id) AS referrals
           ${PARTICIPANT_FROM}
          WHERE en.employee_id IS NOT NULL ${includePassive ? "" : "AND e.status = 'active'"}
          ORDER BY en.start_date DESC NULLS LAST, c.name`,
      );
      const today = todayYmd();
      res.json(r.rows.map((row: any) => {
        const programStart = row.en_start || row.start_date || null;
        const week1Monday = programStart ? ukProgramWeek1Monday(programStart) : null;
        const done: Partial<Record<UkScoreKey, number>> = {};
        for (const id of (row.ids ?? []) as string[]) {
          const s = scoreOfActivity.get(id);
          if (s) done[s] = (done[s] ?? 0) + 1;
        }
        // Liste özetinde katkı payı tüm referanslardan (detayda program penceresiyle sınırlı).
        done.katki = row.referrals;
        return {
          employeeId: row.id, name: row.name, kwuid: row.kwuid, status: row.status,
          coachId: row.coach_id, coachName: row.coach_name,
          programStart, week1Monday,
          currentWeek: week1Monday ? ukCurrentWeek(week1Monday, today) : 0,
          done: row.done, total: UK_ACTIVITIES.length,
          score: computeUkActivityScore(done).total,
          lastConfirmedWeek: row.last_confirmed ?? null,
          welcomeSentAt: row.welcome_sent_at ?? null,
          manual: row.source === "manual",
          source: row.source,
          canEdit: (req as any).user?.role === "admin" || (req as any).user?.id === row.coach_id,
        };
      }));
    } catch (err: any) {
      console.error("[GET /api/uk-program]", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/uk-program/:employeeId", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!p.inProgram) return res.status(404).json({ error: "Bu danışman 45+45 programında değil." });
      res.json({ ...(await buildProgram(p)), canEdit: canEdit(req, p), isAdmin: (req as any).user?.role === "admin" });
    } catch (err: any) {
      console.error("[GET /api/uk-program/:id]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Kutucuk işaretle / kaldır.
  app.put("/api/uk-program/:employeeId/checks/:activityId", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yalnızca danışmanın ÜK koçu veya admin işaretleyebilir." });
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
  app.put("/api/uk-program/:employeeId/weeks/:week", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yalnızca danışmanın ÜK koçu veya admin güncelleyebilir." });
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
  app.put("/api/uk-program/:employeeId/start", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      const p = await loadParticipant(Number(req.params.employeeId));
      if (!p) return res.status(404).json({ error: "Danışman bulunamadı." });
      if (!canEdit(req, p)) return res.status(403).json({ error: "Yalnızca danışmanın ÜK koçu veya admin değiştirebilir." });
      const v = String(req.body?.ukStartDate ?? "");
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return res.status(400).json({ error: "Tarih YYYY-MM-DD olmalı." });
      if (!p.inProgram) return res.status(404).json({ error: "Bu danışman programda değil." });
      if (!v) return res.status(400).json({ error: "Başlangıç tarihi boş olamaz." });
      await pool.query("UPDATE uk_program_enrollments SET start_date = $2 WHERE employee_id = $1 AND removed_at IS NULL", [p.employeeId, v]);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
