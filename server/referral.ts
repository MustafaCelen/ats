// ── Aday referansı → danışman eşleştirme ──────────────────────────────────────
// candidates.referred_by serbest metindir (dış referanslar da var); katkı payı
// (ÜK 45+45) yalnızca candidates.referred_by_employee_id'den sayılır. Bu modül:
//  • metni danışman listesiyle bulanık eşleştirir (Türkçe karakter/sıra/yazım hatası toleranslı)
//  • kesin ve tekil eşleşmede otomatik bağlar
//  • verilen kararları (bu metin = şu danışman / dış referans) normalize metin bazında
//    referral_text_decisions'ta saklar; aynı metin bir daha sorulmaz.
import type { Express, Request, Response } from "express";
import { pool } from "./db";
import { requireAuth, requireHiringManagerOrAdmin } from "./auth";

const NOISE = new Set(["bey", "hanim", "hn", "bay", "bayan", "sayin", "kw", "ref", "referans", "danisman", "dan", "sn"]);

export function normalizeReferral(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !NOISE.has(t))
    .join(" ");
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function tokenSim(a: string, b: string): number {
  if (a === b) return 1;
  // "M." / "Mehmet Ö" gibi baş harf ve kısaltmalar
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.8 : 0;
  if (a.length >= 3 && b.startsWith(a)) return 0.9;
  if (b.length >= 3 && a.startsWith(b)) return 0.9;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
}

// 0..1 — iki yönlü ortalama: yazılan her kelime isimde, isimdeki her kelime yazılanda.
export function referralScore(textNorm: string, nameNorm: string): number {
  const A = textNorm.split(" ").filter(Boolean);
  const B = nameNorm.split(" ").filter(Boolean);
  if (!A.length || !B.length) return 0;
  const best = (xs: string[], ys: string[]) => xs.reduce((s, x) => s + Math.max(...ys.map((y) => tokenSim(x, y))), 0) / xs.length;
  return Math.round(((best(A, B) + best(B, A)) / 2) * 100) / 100;
}

const sortedKey = (n: string) => n.split(" ").filter(Boolean).sort().join(" ");
// Karar/gruplama anahtarı: normalize + kelime sırasından bağımsız ("Demir Ayşe" = "Ayşe Demir").
export const referralKey = (s: string | null | undefined) => sortedKey(normalizeReferral(s));

type PoolRow = { employeeId: number; name: string; kwuid: string | null; status: string; norm: string; key: string };
let poolCache: { at: number; rows: PoolRow[] } | null = null;

async function advisorPool(): Promise<PoolRow[]> {
  if (poolCache && Date.now() - poolCache.at < 60_000) return poolCache.rows;
  const r = await pool.query(
    `SELECT e.id, c.name, e.kwuid, e.status FROM employees e JOIN candidates c ON c.id = e.candidate_id
      WHERE c.name IS NOT NULL AND trim(c.name) <> ''`,
  );
  const rows = r.rows.map((x: any) => {
    const norm = normalizeReferral(x.name);
    return { employeeId: x.id, name: x.name, kwuid: x.kwuid, status: x.status, norm, key: sortedKey(norm) };
  });
  poolCache = { at: Date.now(), rows };
  return rows;
}
export function invalidateReferralPool() { poolCache = null; }

export type ReferralSuggestion = { employeeId: number; name: string; kwuid: string | null; status: string; score: number; exact: boolean };
const SUGGEST_MIN = 0.8;   // "Emre Şahin" → "Emre Tarhan" (%75) gibi yalnız ad tutanlar önerilmez

export async function matchReferral(text: string, limit = 5): Promise<{
  norm: string; exactEmployeeId: number | null; suggestions: ReferralSuggestion[];
}> {
  const norm = normalizeReferral(text);
  const key = sortedKey(norm);
  if (!norm) return { norm: key, exactEmployeeId: null, suggestions: [] };
  const rows = await advisorPool();
  const digits = text.replace(/\D/g, "");
  const scored: ReferralSuggestion[] = [];
  for (const r of rows) {
    const exact = r.key === key || (!!digits && digits.length >= 4 && r.kwuid === digits);
    const score = exact ? 1 : referralScore(norm, r.norm);
    if (exact || score >= SUGGEST_MIN) {
      scored.push({ employeeId: r.employeeId, name: r.name, kwuid: r.kwuid, status: r.status, score, exact });
    }
  }
  scored.sort((a, b) => b.score - a.score || (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1) || a.name.localeCompare(b.name, "tr"));
  // Kesin + tekil: aynı isimde birden çok kayıt varsa yalnızca biri aktifse onu al.
  const exacts = scored.filter((s) => s.exact);
  const activeExacts = exacts.filter((s) => s.status === "active");
  const exactEmployeeId = exacts.length === 1 ? exacts[0].employeeId
    : activeExacts.length === 1 ? activeExacts[0].employeeId : null;
  return { norm: key, exactEmployeeId, suggestions: scored.slice(0, limit) };
}

type Decision = { employeeId: number | null; external: boolean };
async function getDecision(norm: string): Promise<Decision | null> {
  if (!norm) return null;
  const r = await pool.query("SELECT employee_id, external FROM referral_text_decisions WHERE norm_text = $1", [norm]);
  return r.rows[0] ? { employeeId: r.rows[0].employee_id, external: r.rows[0].external } : null;
}

export async function recordReferralDecision(text: string, employeeId: number | null, userId: number | null) {
  const norm = referralKey(text);
  if (!norm) return null;
  await pool.query(
    `INSERT INTO referral_text_decisions (norm_text, sample_text, employee_id, external, decided_by_user_id, decided_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (norm_text) DO UPDATE SET sample_text = EXCLUDED.sample_text, employee_id = EXCLUDED.employee_id,
       external = EXCLUDED.external, decided_by_user_id = EXCLUDED.decided_by_user_id, decided_at = NOW()`,
    [norm, text.trim().slice(0, 200), employeeId, employeeId == null, userId],
  );
  return norm;
}

// Kayıt sırasında: danışman seçilmemişse metinden bağla (önce önceki karar, sonra kesin+tekil eşleşme).
export async function resolveReferralEmployee(referredBy: string | null | undefined): Promise<number | null> {
  const norm = referralKey(referredBy);
  if (!norm) return null;
  const d = await getDecision(norm);
  if (d) return d.external ? null : d.employeeId;
  return (await matchReferral(referredBy!)).exactEmployeeId;
}

// Bağlanmamış referansları normalize metne göre gruplar (eşleştirme ekranı).
async function unmatchedGroups() {
  const [cands, decisions] = await Promise.all([
    pool.query(
      `SELECT id, name, referred_by, created_at FROM candidates
        WHERE referred_by_employee_id IS NULL AND trim(coalesce(referred_by, '')) <> ''
        ORDER BY created_at DESC`,
    ),
    pool.query("SELECT norm_text, external FROM referral_text_decisions"),
  ]);
  const decided = new Map<string, boolean>(decisions.rows.map((r: any) => [r.norm_text, r.external]));
  type G = { norm: string; texts: Map<string, number>; candidates: { id: number; name: string }[] };
  const groups = new Map<string, G>();
  for (const c of cands.rows) {
    const norm = referralKey(c.referred_by);
    if (!norm || decided.get(norm) === true) continue;
    const g: G = groups.get(norm) ?? { norm, texts: new Map<string, number>(), candidates: [] };
    g.texts.set(c.referred_by.trim(), (g.texts.get(c.referred_by.trim()) ?? 0) + 1);
    g.candidates.push({ id: c.id, name: c.name });
    groups.set(norm, g);
  }
  const out = [];
  for (const g of Array.from(groups.values())) {
    const text = Array.from(g.texts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    const m = await matchReferral(text, 3);
    out.push({
      norm: g.norm, text, variants: Array.from(g.texts.keys()), count: g.candidates.length,
      candidates: g.candidates.slice(0, 8), suggestions: m.suggestions, exactEmployeeId: m.exactEmployeeId,
    });
  }
  out.sort((a, b) => (b.suggestions.length ? 1 : 0) - (a.suggestions.length ? 1 : 0) || b.count - a.count);
  return out;
}

async function linkNorm(norm: string, employeeId: number): Promise<number> {
  const r = await pool.query(
    `SELECT id, referred_by FROM candidates WHERE referred_by_employee_id IS NULL AND trim(coalesce(referred_by, '')) <> ''`,
  );
  const ids = r.rows.filter((c: any) => referralKey(c.referred_by) === norm).map((c: any) => c.id);
  if (!ids.length) return 0;
  await pool.query("UPDATE candidates SET referred_by_employee_id = $1 WHERE id = ANY($2::int[]) AND referred_by_employee_id IS NULL", [employeeId, ids]);
  return ids.length;
}

export function registerReferralRoutes(app: Express) {
  // Yazarken öneri + kaydetmeden önce kontrol.
  app.get("/api/referrals/match", requireAuth, async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q ?? "").slice(0, 200);
      const m = await matchReferral(q, 6);
      const d = await getDecision(m.norm);
      res.json({ ...m, decision: d });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/referrals/unmatched", requireAuth, requireHiringManagerOrAdmin, async (_req: Request, res: Response) => {
    try {
      const groups = await unmatchedGroups();
      const ext = await pool.query(
        `SELECT d.norm_text, d.sample_text, d.decided_at, u.name AS decided_by
           FROM referral_text_decisions d LEFT JOIN users u ON u.id = d.decided_by_user_id
          WHERE d.external ORDER BY d.decided_at DESC LIMIT 200`,
      );
      res.json({
        groups,
        exactCount: groups.filter((g) => g.exactEmployeeId != null).reduce((s, g) => s + g.count, 0),
        external: ext.rows.map((r: any) => ({ norm: r.norm_text, text: r.sample_text, decidedAt: r.decided_at, decidedBy: r.decided_by })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bir metin grubu için karar: employeeId → o metne sahip tüm bağlanmamış adaylar bağlanır;
  // null → dış referans (bir daha önerilmez).
  app.post("/api/referrals/decide", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      const text = String(req.body?.text ?? "");
      const employeeId = req.body?.employeeId == null ? null : Number(req.body.employeeId);
      if (!referralKey(text)) return res.status(400).json({ error: "Referans metni boş." });
      if (employeeId != null) {
        const e = await pool.query("SELECT 1 FROM employees WHERE id = $1", [employeeId]);
        if (!e.rows.length) return res.status(400).json({ error: "Danışman bulunamadı." });
      }
      const norm = (await recordReferralDecision(text, employeeId, (req as any).user?.id ?? null))!;
      const linked = employeeId != null ? await linkNorm(norm, employeeId) : 0;
      res.json({ ok: true, linked });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dış referans kararını geri al (metin tekrar eşleştirme listesine döner).
  app.delete("/api/referrals/decisions/:norm", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      await pool.query("DELETE FROM referral_text_decisions WHERE norm_text = $1 AND external", [String(req.params.norm)]);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Eski kayıtlar: kesin ve tekil eşleşmelerin hepsini bağla.
  app.post("/api/referrals/link-exact", requireAuth, requireHiringManagerOrAdmin, async (req: Request, res: Response) => {
    try {
      const groups = await unmatchedGroups();
      let linked = 0, texts = 0;
      for (const g of groups) {
        if (g.exactEmployeeId == null) continue;
        await recordReferralDecision(g.text, g.exactEmployeeId, (req as any).user?.id ?? null);
        linked += await linkNorm(g.norm, g.exactEmployeeId);
        texts++;
      }
      res.json({ ok: true, linked, texts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
