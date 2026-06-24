import { useState, useMemo, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell,
  ComposedChart, Line,
} from "recharts";
import {
  TrendingUp, DollarSign, Users, Handshake,
  ChevronLeft, ChevronRight, Calendar, BarChart2,
  ChevronUp, ChevronDown, Sparkles, Trophy, Target, Save, Maximize2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " ₺";
}
function fmtShort(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(Math.round(n));
}
function formatYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#f97316","#84cc16","#ec4899","#14b8a6"];

// ── Sub-components ────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, sub, color, yoy }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string; yoy?: number | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4 shadow-sm">
      <div className={`rounded-lg p-2.5 ${color} shrink-0`}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold text-foreground truncate">{value}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          {yoy != null && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${yoy >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              {yoy >= 0 ? "↑" : "↓"}{Math.abs(yoy)}% YoY
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TRYTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-xs space-y-0.5">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmtTRY(p.value)}</p>
      ))}
    </div>
  );
}

function CountTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-xs space-y-0.5">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

function Skeleton({ h = "h-64" }: { h?: string }) {
  return <div className={`${h} rounded bg-muted/40 animate-pulse`} />;
}

function Empty() {
  return <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">Bu dönem için veri yok</div>;
}

type GeoDuration = { il?: string; ilce?: string; mahalle?: string; avg: number; count: number };

function AvgDurationCard({
  label, avg, byIl, byIlce, byMahalle, color, loading,
}: {
  label: string;
  avg: number | null;
  byIl: GeoDuration[];
  byIlce: GeoDuration[];
  byMahalle: GeoDuration[];
  color: string;
  loading: boolean;
}) {
  const [tab, setTab] = useState<"il" | "ilce" | "mahalle">("ilce");
  const rows = tab === "il" ? byIl : tab === "mahalle" ? byMahalle : byIlce;
  const totalClosings = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">{label}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Yalnızca süre bilgisi olan kapanışlar · min. 3 kapanış</p>
        </div>
        {avg !== null && (
          <div className="ml-auto text-right shrink-0">
            <div className="text-2xl font-bold">{avg} <span className="text-sm font-normal text-muted-foreground">gün</span></div>
            <div className="text-xs text-muted-foreground">{totalClosings} kapanış</div>
          </div>
        )}
      </div>
      <div className="px-5 py-2 border-b border-border bg-muted/20 flex gap-1">
        {([
          { key: "il", label: "İl" },
          { key: "ilce", label: "İlçe" },
          { key: "mahalle", label: "Mahalle" },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {loading ? <Skeleton h="h-44" /> : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Yeterli veri yok</div>
      ) : (
        <div className="divide-y divide-border/50">
          {rows.map((r) => {
            const max = Math.max(...rows.map(x => x.avg), 1);
            const name = (r as any)[tab] || "—";
            return (
              <div key={`${tab}-${name}`} className="px-5 py-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{name}</span>
                  <span className="text-muted-foreground">{r.count} kapanış · <span className="font-semibold text-foreground">{r.avg} gün</span></span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(r.avg / max) * 100}%`, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useCapStatuses() {
  return useQuery<Record<string, any>>({
    queryKey: ["/api/employees/cap-statuses"],
    queryFn: async () => {
      const res = await fetch("/api/employees/cap-statuses", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useClosingStats(startDate: string, endDate: string, office?: string, dealCategory?: string, dealType?: string) {
  return useQuery<any>({
    queryKey: ["/api/closings/stats", startDate, endDate, office ?? "all", dealCategory ?? "all", dealType ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (office) params.set("office", office);
      if (dealCategory) params.set("dealCategory", dealCategory);
      if (dealType) params.set("dealType", dealType);
      const res = await fetch(`/api/closings/stats?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 3 * 60 * 1000,
  });
}

function mergeTargetRows(a: any[], b: any[]): any[] {
  const sumN = (x: string | null | undefined, y: string | null | undefined) =>
    x == null && y == null ? null : String(parseFloat(x ?? "0") + parseFloat(y ?? "0"));
  const sumI = (x: number | null | undefined, y: number | null | undefined) =>
    x == null && y == null ? null : (x ?? 0) + (y ?? 0);
  const map = new Map<number, any>();
  for (const t of a) map.set(t.month, { ...t });
  for (const t of b) {
    if (!map.has(t.month)) { map.set(t.month, { ...t }); continue; }
    const e = map.get(t.month)!;
    map.set(t.month, {
      ...e,
      bhbTarget:             sumN(e.bhbTarget,             t.bhbTarget),
      bhbHighTarget:         sumN(e.bhbHighTarget,         t.bhbHighTarget),
      bmTarget:              sumN(e.bmTarget,              t.bmTarget),
      bmHighTarget:          sumN(e.bmHighTarget,          t.bmHighTarget),
      satilikAdetTarget:     sumI(e.satilikAdetTarget,     t.satilikAdetTarget),
      satilikAdetHighTarget: sumI(e.satilikAdetHighTarget, t.satilikAdetHighTarget),
      kiralikAdetTarget:     sumI(e.kiralikAdetTarget,     t.kiralikAdetTarget),
      kiralikAdetHighTarget: sumI(e.kiralikAdetHighTarget, t.kiralikAdetHighTarget),
    });
  }
  return Array.from(map.values()).sort((x, y) => x.month - y.month);
}

function useFinancialTargets(year: number, office: string) {
  return useQuery<any[]>({
    queryKey: ["/api/financial-targets", year, office],
    queryFn: async () => {
      const res = await fetch(`/api/financial-targets?year=${year}&office=${encodeURIComponent(office)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

function TargetProgressCard({ label, actual, reelTarget, highTarget, color, format: fmt, showForecast, showReForecast }: {
  label: string; actual: number; reelTarget: number; highTarget: number; color: string;
  format: (n: number) => string; showForecast: boolean; showReForecast: boolean;
}) {
  const showBoth = !showForecast && !showReForecast;
  const effReel = (showForecast || showBoth) ? reelTarget : 0;
  const effHigh = (showReForecast || showBoth) ? highTarget : 0;

  const maxT = Math.max(effReel, effHigh, 0);
  const meetsHigh = effHigh > 0 && actual >= effHigh;
  const meetsReel = effReel > 0 && actual >= effReel;
  const barFill  = maxT > 0 ? Math.min(100, (actual / maxT) * 100) : 0;
  const reelMark = maxT > 0 && effHigh > effReel && effReel > 0
    ? (effReel / maxT) * 100 : null;
  const barColor = meetsHigh ? "#f59e0b" : meetsReel ? "#10b981" : color;

  const badge = (pct: number, over: boolean, lbl: string) => (
    <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${over ? (lbl === "RF" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700") : "bg-muted text-muted-foreground"}`}>
      {lbl} %{Math.round(Math.min(100, pct))}
    </span>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {effReel > 0 && badge(actual / effReel * 100, meetsReel, "F")}
          {effHigh > 0 && badge(actual / effHigh * 100, meetsHigh, "RF")}
        </div>
      </div>
      {maxT > 0 ? (
        <>
          <div className="text-2xl font-bold text-foreground">{fmt(maxT)}</div>
          <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
            {reelMark !== null && (
              <div className="absolute top-0 bottom-0 w-px bg-white/80 z-10" style={{ left: `${reelMark}%` }} />
            )}
            <div className="h-full rounded-full transition-all" style={{ width: `${barFill}%`, backgroundColor: barColor }} />
          </div>
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <span>Gerçekleşen: <span className="font-semibold text-foreground">{fmt(actual)}</span></span>
            {effReel > 0 && effHigh > 0 && <span>Forecast: <span className="font-semibold text-foreground">{fmt(effReel)}</span></span>}
          </div>
          {meetsHigh && <p className="text-xs text-amber-600 font-semibold">Re-Forecast aşıldı!</p>}
          {!meetsHigh && meetsReel && <p className="text-xs text-emerald-600 font-semibold">Forecast aşıldı!</p>}
        </>
      ) : (
        <>
          <div className="text-2xl font-bold text-foreground">{fmt(actual)}</div>
          <div className="text-xs text-muted-foreground/50 italic">Hedef belirlenmedi</div>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, children, extra }: {
  title: string;
  children: (h: number) => React.ReactNode;
  extra?: React.ReactNode;
}) {
  const [fs, setFs] = useState(false);
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            {extra}
          </div>
          <button
            onClick={() => setFs(true)}
            className="ml-2 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Tam ekran"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {children(260)}
      </div>
      {fs && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setFs(false)}
        >
          <div
            className="bg-card rounded-xl border border-border p-6 w-full max-w-5xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{title}</h2>
                {extra}
              </div>
              <button
                onClick={() => setFs(false)}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {children(500)}
          </div>
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FinancialReports() {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [fromDate, setFromDate] = useState(() => formatYMD(new Date(new Date().getFullYear(), 0, 1)));
  const [toDate, setToDate] = useState(() => formatYMD(new Date()));
  const [officeFilter, setOfficeFilter] = useState<string | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [dealTypeFilter, setDealTypeFilter] = useState<string | undefined>(undefined);
  const [agentSort, setAgentSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "bhb", dir: "desc" });
  const [showEditor, setShowEditor] = useState(false);
  const [editorYear, setEditorYear] = useState(() => new Date().getFullYear());
  const [editorOffice, setEditorOffice] = useState<string>("Akatlar");
  const [draftTargets, setDraftTargets] = useState<Record<number, { bhb: string; bhbHigh: string; bm: string; bmHigh: string; satilik: string; satilikHigh: string; kiralik: string; kiralikHigh: string }>>({});
  const [savingMonth, setSavingMonth] = useState<number | null>(null);
  const [showReelTarget,   setShowReelTarget]   = useState(true);
  const [showYuksekTarget, setShowYuksekTarget] = useState(true);
  const [showPrevYear, setShowPrevYear] = useState(true);

  const { data: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const qc = useQueryClient();

  const vy = viewDate.getFullYear();
  const vm = viewDate.getMonth();
  const prevMonth = () => setViewDate(new Date(vy, vm - 1, 1));
  const nextMonth = () => setViewDate(new Date(vy, vm + 1, 1));
  const monthStart = formatYMD(new Date(vy, vm, 1));
  const monthEnd   = formatYMD(new Date(vy, vm + 1, 0));

  const computedStart = useCustomRange ? fromDate : monthStart;
  const computedEnd   = useCustomRange ? toDate   : monthEnd;
  const { data: stats, isLoading } = useClosingStats(computedStart, computedEnd, officeFilter, categoryFilter, dealTypeFilter);

  const prevYearStart = useMemo(() => {
    const d = new Date(computedStart + "T00:00:00");
    return formatYMD(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
  }, [computedStart]);
  const prevYearEnd = useMemo(() => {
    const d = new Date(computedEnd + "T00:00:00");
    return formatYMD(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
  }, [computedEnd]);
  const { data: prevStats } = useClosingStats(prevYearStart, prevYearEnd, officeFilter, categoryFilter, dealTypeFilter);

  const { data: capStatuses = {} } = useCapStatuses();

  // ── Randevu (interview) queries ─────────────────────────────────────────────
  const { data: allInterviews = [] } = useQuery<any[]>({
    queryKey: ["/api/interviews?all=true"],
    queryFn: () => fetch("/api/interviews?all=true", { credentials: "include" }).then(r => r.ok ? r.json() : []),
    staleTime: 5 * 60 * 1000,
  });
  const { data: apptTargets = [] } = useQuery<any[]>({
    queryKey: ["/api/interview-targets", vy, vm + 1],
    queryFn: () => fetch(`/api/interview-targets?year=${vy}&month=${vm + 1}`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    staleTime: 5 * 60 * 1000,
  });

  const APPT_CATS = ["K0", "K1", "K2"] as const;

  const apptActuals = useMemo(() => {
    const from = new Date(computedStart + "T00:00:00");
    const to = new Date(computedEnd + "T23:59:59");
    const counts: Record<string, number> = { K0: 0, K1: 0, K2: 0 };
    for (const iv of allInterviews) {
      if (!iv.startTime) continue;
      const d = new Date(iv.startTime);
      if (d < from || d > to) continue;
      if (officeFilter && iv.candidate?.office !== officeFilter) continue;
      const cat: string = iv.candidate?.category ?? "K0";
      if (cat in counts) counts[cat]++;
    }
    return counts;
  }, [allInterviews, computedStart, computedEnd, officeFilter]);

  const apptTargetTotals = useMemo(() => {
    const totals: Record<string, number> = { K0: 0, K1: 0, K2: 0 };
    for (const t of apptTargets) {
      if (t.category in totals) totals[t.category] += t.target ?? 0;
    }
    return totals;
  }, [apptTargets]);

  const targetFetchYear = useCustomRange ? parseInt(fromDate.substring(0, 4)) : vy;
  const { data: targetsAk = [] } = useFinancialTargets(targetFetchYear, "Akatlar");
  const { data: targetsZk = [] } = useFinancialTargets(targetFetchYear, "Zekeriyaköy");
  const targets = useMemo(
    () => !officeFilter ? mergeTargetRows(targetsAk, targetsZk)
        : officeFilter === "Akatlar" ? targetsAk : targetsZk,
    [officeFilter, targetsAk, targetsZk]
  );
  const { data: editorTargetsRaw = [] } = useFinancialTargets(editorYear, editorOffice);

  // Sync editor draft whenever server data or editorYear changes
  useEffect(() => {
    const rows: typeof draftTargets = {};
    const p = (v: any) => v != null ? String(parseFloat(v)) : "";
    const i = (v: any) => v != null ? String(v) : "";
    for (let m = 1; m <= 12; m++) {
      const t = editorTargetsRaw.find((x: any) => x.month === m);
      rows[m] = {
        bhb: p(t?.bhbTarget), bhbHigh: p(t?.bhbHighTarget),
        bm: p(t?.bmTarget), bmHigh: p(t?.bmHighTarget),
        satilik: i(t?.satilikAdetTarget), satilikHigh: i(t?.satilikAdetHighTarget),
        kiralik: i(t?.kiralikAdetTarget), kiralikHigh: i(t?.kiralikAdetHighTarget),
      };
    }
    setDraftTargets(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorTargetsRaw, editorYear]);

  const saveTarget = async (month: number) => {
    const row = draftTargets[month];
    if (!row) return;
    setSavingMonth(month);
    try {
      await fetch(`/api/financial-targets/${editorYear}/${month}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          office: editorOffice,
          bhbTarget:             row.bhb         !== "" ? parseFloat(row.bhb)         || null : null,
          bhbHighTarget:         row.bhbHigh     !== "" ? parseFloat(row.bhbHigh)     || null : null,
          bmTarget:              row.bm          !== "" ? parseFloat(row.bm)          || null : null,
          bmHighTarget:          row.bmHigh      !== "" ? parseFloat(row.bmHigh)      || null : null,
          satilikAdetTarget:     row.satilik     !== "" ? parseInt(row.satilik)       || null : null,
          satilikAdetHighTarget: row.satilikHigh !== "" ? parseInt(row.satilikHigh)   || null : null,
          kiralikAdetTarget:     row.kiralik     !== "" ? parseInt(row.kiralik)       || null : null,
          kiralikAdetHighTarget: row.kiralikHigh !== "" ? parseInt(row.kiralikHigh)   || null : null,
        }),
      });
      qc.invalidateQueries({ queryKey: ["/api/financial-targets", editorYear, editorOffice] });
    } finally {
      setSavingMonth(null);
    }
  };

  const sortedAgents = useMemo(() => {
    const rows = [...(stats?.byAgent ?? [])];
    const { key, dir } = agentSort;
    rows.sort((a: any, b: any) => {
      let av: any, bv: any;
      if (key === "bhbpc") { av = a.count > 0 ? a.bhb / a.count : -1; bv = b.count > 0 ? b.bhb / b.count : -1; }
      else if (key === "name" || key === "kwuid") { av = (a[key] ?? "").toLowerCase(); bv = (b[key] ?? "").toLowerCase(); }
      else { av = a[key] ?? 0; bv = b[key] ?? 0; }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [stats?.byAgent, agentSort]);

  const capList = useMemo(() => {
    return Object.values(capStatuses as Record<string, any>)
      .filter((s: any) => s.capAmount !== null)
      .map((s: any) => ({
        ...s,
        pct: s.capAmount > 0 ? Math.min(100, Math.round((s.capUsed / s.capAmount) * 100)) : 0,
      }))
      .sort((a: any, b: any) => b.pct - a.pct);
  }, [capStatuses]);

  const cappers       = capList.filter((s: any) => s.pct >= 100);
  const almostCappers = capList.filter((s: any) => s.pct >= 75 && s.pct < 100);

  const probableCappers = useMemo(() => {
    const today = new Date();
    return capList.filter((s: any) => {
      if (s.pct >= 75 || !s.periodStart || s.capAmount <= 0) return false;
      const start = new Date(s.periodStart);
      const monthsElapsed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
      if (monthsElapsed <= 0) return false;
      const monthsRemaining = 12 - monthsElapsed;
      if (monthsRemaining <= 0) return false;
      const ratePerMonth = s.capUsed / monthsElapsed;
      const projected = s.capUsed + ratePerMonth * monthsRemaining;
      return projected >= s.capAmount;
    });
  }, [capList]);

  const MONTH_NAMES_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const capResetMonth = (s: any): string | null => {
    if (!s.periodStart) return null;
    return MONTH_NAMES_TR[new Date(s.periodStart).getMonth()];
  };

  // Group productive + probable agents by their reset month (0-indexed)
  const resetByMonth = useMemo(() => {
    const map: Record<number, any[]> = {};
    for (let i = 0; i < 12; i++) map[i] = [];
    const currentMonthIdx = new Date().getMonth();
    const productiveSet = new Set([...cappers, ...almostCappers, ...probableCappers].map((s: any) => s.employeeId));
    for (const s of capList) {
      if (!s.periodStart) continue;
      const resetMonth = new Date(s.periodStart).getMonth();
      const isCurrentMonthReset = resetMonth === currentMonthIdx;
      const prevPct = s.capAmount > 0 ? (s.prevCapUsed ?? 0) / s.capAmount * 100 : 0;
      if (productiveSet.has(s.employeeId) || (isCurrentMonthReset && prevPct >= 75)) {
        map[resetMonth].push(s);
      }
    }
    return map;
  }, [capList, cappers, almostCappers, probableCappers]);

  const fmtMonthKey = (key: string) => {
    const [y, m] = key.split("-");
    return format(new Date(+y, +m - 1, 1), "MMM yy", { locale: tr });
  };

  const monthlyData = useMemo(
    () => (stats?.monthlyTrend ?? []).map((r: any) => ({ ...r, monthKey: r.month, month: fmtMonthKey(r.month) })),
    [stats?.monthlyTrend]
  );
  const prevMonthlyData = useMemo(
    () => (prevStats?.monthlyTrend ?? []).map((r: any) => ({ ...r, monthKey: r.month, month: fmtMonthKey(r.month) })),
    [prevStats?.monthlyTrend]
  );

  const targetsByMonthKey = useMemo(() => {
    const map = new Map<string, any>();
    for (const t of targets) {
      map.set(`${(t as any).year}-${String((t as any).month).padStart(2, "0")}`, t);
    }
    return map;
  }, [targets]);

  const monthlyDataWithTargets = useMemo(() =>
    monthlyData.map((r: any) => {
      const t = targetsByMonthKey.get(r.monthKey);
      return {
        ...r,
        bhbTarget:     t?.bhbTarget     ? parseFloat(t.bhbTarget)     : null,
        bhbHighTarget: t?.bhbHighTarget ? parseFloat(t.bhbHighTarget) : null,
        bmTarget:      t?.bmTarget      ? parseFloat(t.bmTarget)      : null,
        bmHighTarget:  t?.bmHighTarget  ? parseFloat(t.bmHighTarget)  : null,
        satilikTarget:     t?.satilikAdetTarget     ?? null,
        satilikHighTarget: t?.satilikAdetHighTarget ?? null,
        kiralikTarget:     t?.kiralikAdetTarget     ?? null,
        kiralikHighTarget: t?.kiralikAdetHighTarget ?? null,
      };
    }),
    [monthlyData, targetsByMonthKey]
  );

  const periodTargets = useMemo(() => {
    const tMap = new Map((targets as any[]).map(t => [t.month as number, t]));
    const start = new Date(computedStart + "T00:00:00");
    const end   = new Date(computedEnd   + "T00:00:00");
    let bhb = 0, bhbHigh = 0, bm = 0, bmHigh = 0;
    let satilik = 0, satilikHigh = 0, kiralik = 0, kiralikHigh = 0, count = 0;
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const endD = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= endD) {
      if (cur.getFullYear() === targetFetchYear) {
        const t = tMap.get(cur.getMonth() + 1) as any;
        if (t) {
          bhb     += parseFloat(t.bhbTarget     ?? "0");
          bhbHigh += parseFloat(t.bhbHighTarget ?? "0");
          bm      += parseFloat(t.bmTarget      ?? "0");
          bmHigh  += parseFloat(t.bmHighTarget  ?? "0");
          satilik     += t.satilikAdetTarget     ?? 0;
          satilikHigh += t.satilikAdetHighTarget ?? 0;
          kiralik     += t.kiralikAdetTarget     ?? 0;
          kiralikHigh += t.kiralikAdetHighTarget ?? 0;
          count++;
        }
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    return { bhb, bhbHigh, bm, bmHigh, satilik, satilikHigh, kiralik, kiralikHigh, hasAny: count > 0 };
  }, [targets, computedStart, computedEnd, targetFetchYear]);
  const mergedMonthlyData = useMemo(() => {
    const prevByM = new Map(prevMonthlyData.map((r: any) => [parseInt(r.monthKey.split("-")[1]), r]));
    const currByM = new Map(monthlyDataWithTargets.map((r: any) => [parseInt(r.monthKey.split("-")[1]), r]));
    const allNums = [...new Set([...currByM.keys(), ...prevByM.keys()])].sort((a, b) => a - b);
    return allNums.map(m => {
      const curr = currByM.get(m) ?? {};
      const prev = prevByM.get(m);
      return {
        ...curr,
        month: MONTH_NAMES_TR[m - 1],
        prevVolume: prev?.volume ?? null,
        prevBhb: prev?.bhb ?? null,
        prevBm: prev?.bm ?? null,
        prevSatilikCount: prev?.satilikCount ?? null,
        prevKiralikCount: prev?.kiralikCount ?? null,
      };
    });
  }, [monthlyDataWithTargets, prevMonthlyData]);

  const yoyDelta = useMemo(() => {
    if (!prevStats || !stats) return null;
    const pct = (curr: number, prev: number) => prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;
    return {
      count:  pct(stats.completedCount,  prevStats.completedCount),
      volume: pct(stats.completedVolume, prevStats.completedVolume),
      bhb:    pct(stats.completedBHB,    prevStats.completedBHB),
      bm:     pct(stats.completedBM,     prevStats.completedBM),
    };
  }, [stats, prevStats]);

  const topAgents        = (stats?.byAgent ?? []).slice(0, 12);
  const byCategory       = stats?.byCategory ?? [];
  const byDealType       = (stats?.byDealType ?? []) as { dealType: string; count: number; volume: number; bhb: number }[];
  const byIl             = (stats?.byIl ?? []).slice(0, 8);
  const byIlce           = (stats?.byIlce ?? []).slice(0, 8);
  const avgSaleDays           = stats?.avgSaleDays ?? null;
  const avgSaleDaysByIl       = (stats?.avgSaleDaysByIl ?? [])      as { il: string;      avg: number; count: number }[];
  const avgSaleDaysByIlce     = (stats?.avgSaleDaysByIlce ?? [])    as { ilce: string;    avg: number; count: number }[];
  const avgSaleDaysByMahalle  = (stats?.avgSaleDaysByMahalle ?? []) as { mahalle: string; avg: number; count: number }[];
  const avgRentalDays         = stats?.avgRentalDays ?? null;
  const avgRentalDaysByIl     = (stats?.avgRentalDaysByIl ?? [])      as { il: string;      avg: number; count: number }[];
  const avgRentalDaysByIlce   = (stats?.avgRentalDaysByIlce ?? [])    as { ilce: string;    avg: number; count: number }[];
  const avgRentalDaysByMahalle= (stats?.avgRentalDaysByMahalle ?? []) as { mahalle: string; avg: number; count: number }[];

  // dynamic height for agent bar chart so no labels are skipped
  const agentChartHeight = Math.max(260, topAgents.length * 28);

  return (
    <Layout>
      <div className="space-y-6">

        {/* ── Header + Filters ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-primary" />
              Finansal Raporlar
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Kapanış ve gelir analizleri</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Office filter */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {([undefined, "Akatlar", "Zekeriyaköy"] as const).map((o) => (
                <Button
                  key={String(o)}
                  size="sm"
                  variant={officeFilter === o ? "default" : "ghost"}
                  className="h-7 text-xs px-3"
                  onClick={() => setOfficeFilter(o)}
                >
                  {o ?? "Tümü"}
                </Button>
              ))}
            </div>

            {/* İşlem (dealCategory) filter */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {([undefined, "Satış", "Kiralık"] as const).map((c) => (
                <Button
                  key={String(c)}
                  size="sm"
                  variant={categoryFilter === c ? "default" : "ghost"}
                  className="h-7 text-xs px-3"
                  onClick={() => setCategoryFilter(c)}
                >
                  {c ?? "Tüm İşlem"}
                </Button>
              ))}
            </div>

            {/* İşlem Tipi filter */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {([undefined, "Arsa", "Konut", "Ticari"] as const).map((t) => (
                <Button
                  key={String(t)}
                  size="sm"
                  variant={dealTypeFilter === t ? "default" : "ghost"}
                  className="h-7 text-xs px-3"
                  onClick={() => setDealTypeFilter(t)}
                >
                  {t ?? "Tüm Tip"}
                </Button>
              ))}
            </div>

            {/* Date range toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <Button size="sm" variant={!useCustomRange ? "default" : "ghost"} className="h-7 text-xs px-3" onClick={() => setUseCustomRange(false)}>Aylık</Button>
              <Button size="sm" variant={useCustomRange ? "default" : "ghost"} className="h-7 text-xs px-3" onClick={() => setUseCustomRange(true)}>Özel Aralık</Button>
            </div>
            {!useCustomRange && (
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={prevMonth}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <span className="text-xs font-medium px-2 min-w-[110px] text-center capitalize">
                  {format(viewDate, "MMMM yyyy", { locale: tr })}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={nextMonth}><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
            {useCustomRange && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[140px] h-7 text-xs" />
                <span className="text-xs text-muted-foreground">—</span>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[140px] h-7 text-xs" />
              </div>
            )}

            {/* Chart overlay toggles */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <Button
                size="sm"
                variant={showReelTarget ? "default" : "ghost"}
                className={`h-7 text-xs px-3 gap-1 ${showReelTarget ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500" : ""}`}
                onClick={() => setShowReelTarget(v => !v)}
              >
                <Target className="h-3 w-3" />
                Forecast
              </Button>
              <Button
                size="sm"
                variant={showYuksekTarget ? "default" : "ghost"}
                className={`h-7 text-xs px-3 gap-1 ${showYuksekTarget ? "bg-orange-500 hover:bg-orange-600 text-white border-orange-500" : ""}`}
                onClick={() => setShowYuksekTarget(v => !v)}
              >
                <Target className="h-3 w-3" />
                Re-Forecast
              </Button>
              <Button
                size="sm"
                variant={showPrevYear ? "default" : "ghost"}
                className={`h-7 text-xs px-3 gap-1 ${showPrevYear ? "bg-sky-500 hover:bg-sky-600 text-white border-sky-500" : ""}`}
                onClick={() => setShowPrevYear(v => !v)}
              >
                <TrendingUp className="h-3 w-3" />
                Geçen Yıl
              </Button>
            </div>
          </div>
        </div>

        {/* ── Randevu Hedef Takibi ── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Randevu Hedef Takibi</h2>
            {officeFilter && (
              <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">{officeFilter}</span>
            )}
            <span className="text-xs text-muted-foreground ml-1">
              {useCustomRange ? `${fromDate} – ${toDate}` : format(viewDate, "MMMM yyyy", { locale: tr })}
            </span>
          </div>
          <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {(["K0", "K1", "K2", "Toplam"] as const).map((cat) => {
              const actual = cat === "Toplam"
                ? APPT_CATS.reduce((s, c) => s + apptActuals[c], 0)
                : apptActuals[cat] ?? 0;
              const target = cat === "Toplam"
                ? APPT_CATS.reduce((s, c) => s + apptTargetTotals[c], 0)
                : apptTargetTotals[cat] ?? 0;
              const pct = target > 0 ? Math.round((actual / target) * 100) : null;
              const done = target > 0 && actual >= target;
              const styles: Record<string, { badge: string; text: string; bar: string }> = {
                K0:     { badge: "bg-blue-100 text-blue-700",    text: "text-blue-600",    bar: "#3b82f6" },
                K1:     { badge: "bg-amber-100 text-amber-700",  text: "text-amber-600",   bar: "#f59e0b" },
                K2:     { badge: "bg-emerald-100 text-emerald-700", text: "text-emerald-600", bar: "#10b981" },
                Toplam: { badge: "bg-purple-100 text-purple-700", text: "text-purple-600", bar: "#8b5cf6" },
              };
              const s = styles[cat];
              return (
                <div key={cat} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${s.badge}`}>{cat}</span>
                    {done && <span className="text-[10px] text-emerald-600 font-medium">✓ Hedef tamam</span>}
                  </div>
                  <p className={`text-2xl font-bold ${s.text}`}>{actual}</p>
                  {target > 0 ? (
                    <>
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct ?? 0)}%`, backgroundColor: s.bar }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {target} hedefin <span className="font-medium">{pct}%</span>'i
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Hedef tanımlı değil</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Target Progress ── */}
        {(periodTargets.hasAny || isAdmin) && (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">Hedef Takibi</h2>
              {officeFilter && (
                <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">{officeFilter}</span>
              )}
              <span className="text-xs text-muted-foreground ml-1">
                {useCustomRange ? `${fromDate} – ${toDate}` : format(viewDate, "MMMM yyyy", { locale: tr })}
              </span>
              {isAdmin && (
                <Button
                  size="sm" variant="ghost"
                  className="ml-auto h-7 text-xs gap-1"
                  onClick={() => setShowEditor(v => !v)}
                >
                  <Save className="h-3.5 w-3.5" />
                  Hedef Düzenle
                </Button>
              )}
            </div>
            <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <TargetProgressCard label="BHB Hedefi" actual={stats?.completedBHB ?? 0} reelTarget={periodTargets.bhb} highTarget={periodTargets.bhbHigh} color="#10b981" format={fmtTRY} showForecast={showReelTarget} showReForecast={showYuksekTarget} />
              <TargetProgressCard label="BM Payı Hedefi" actual={stats?.completedBM ?? 0} reelTarget={periodTargets.bm} highTarget={periodTargets.bmHigh} color="#8b5cf6" format={fmtTRY} showForecast={showReelTarget} showReForecast={showYuksekTarget} />
              <TargetProgressCard label="Satılık Adet Hedefi" actual={stats?.completedSatilikCount ?? 0} reelTarget={periodTargets.satilik} highTarget={periodTargets.satilikHigh} color="#3b82f6" format={(n) => String(Math.round(n))} showForecast={showReelTarget} showReForecast={showYuksekTarget} />
              <TargetProgressCard label="Kiralık Adet Hedefi" actual={stats?.completedKiralikCount ?? 0} reelTarget={periodTargets.kiralik} highTarget={periodTargets.kiralikHigh} color="#f97316" format={(n) => String(Math.round(n))} showForecast={showReelTarget} showReForecast={showYuksekTarget} />
            </div>
          </div>
        )}

        {/* ── Metric Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={Handshake} color="bg-blue-50 text-blue-600"
            label="Tamamlanan Kapanış"
            value={stats?.completedCount ?? 0}
            sub={`${stats?.expectedCount ?? 0} beklenen`}
            yoy={yoyDelta?.count}
          />
          <MetricCard
            icon={TrendingUp} color="bg-emerald-50 text-emerald-600"
            label="İşlem Hacmi"
            value={stats ? fmtTRY(stats.completedVolume) : "—"}
            sub={stats?.expectedVolume ? `+ ${fmtTRY(stats.expectedVolume)} beklenen` : undefined}
            yoy={yoyDelta?.volume}
          />
          <MetricCard
            icon={DollarSign} color="bg-amber-50 text-amber-600"
            label="BHB Geliri"
            value={stats ? fmtTRY(stats.completedBHB) : "—"}
            sub={stats?.expectedBHB ? `+ ${fmtTRY(stats.expectedBHB)} beklenen` : undefined}
            yoy={yoyDelta?.bhb}
          />
          <MetricCard
            icon={Users} color="bg-purple-50 text-purple-600"
            label="BM Geliri (Ofis)"
            value={stats ? fmtTRY(stats.completedBM) : "—"}
            sub={stats?.expectedBM ? `+ ${fmtTRY(stats.expectedBM)} beklenen` : undefined}
            yoy={yoyDelta?.bm}
          />
        </div>

        {/* ── Side Type Breakdown ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-center gap-3">
            <div className="rounded-lg p-2 bg-blue-50 text-blue-600 text-lg font-bold w-10 h-10 flex items-center justify-center">A</div>
            <div>
              <div className="text-xs text-muted-foreground">Alıcı Tarafı</div>
              <div className="text-2xl font-bold">{stats?.bySideType?.buyer ?? 0}</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-center gap-3">
            <div className="rounded-lg p-2 bg-emerald-50 text-emerald-600 text-lg font-bold w-10 h-10 flex items-center justify-center">S</div>
            <div>
              <div className="text-xs text-muted-foreground">Satıcı Tarafı</div>
              <div className="text-2xl font-bold">{stats?.bySideType?.seller ?? 0}</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-center gap-3">
            <div className="rounded-lg p-2 bg-amber-50 text-amber-600 text-lg font-bold w-10 h-10 flex items-center justify-center">Y</div>
            <div>
              <div className="text-xs text-muted-foreground">Yönlendirme</div>
              <div className="text-2xl font-bold">{stats?.bySideType?.referral ?? 0}</div>
            </div>
          </div>
        </div>

        {/* ── Monthly Trend ── */}
        <div className="grid lg:grid-cols-2 gap-6">
          <ChartCard title="Aylık İşlem Hacmi">
            {(h) => isLoading ? <Skeleton /> : mergedMonthlyData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={h}>
                <ComposedChart data={mergedMonthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} width={48} />
                  <Tooltip content={<TRYTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                  {showPrevYear && <Bar dataKey="prevVolume" name="Geçen Yıl Hacim" fill="#93c5fd" fillOpacity={0.6} radius={[3, 3, 0, 0]} />}
                  <Bar dataKey="volume" name="İşlem Hacmi" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Aylık BHB Geliri">
            {(h) => isLoading ? <Skeleton /> : mergedMonthlyData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={h}>
                <ComposedChart data={mergedMonthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} width={48} />
                  <Tooltip content={<TRYTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                  {showPrevYear && <Bar dataKey="prevBhb" name="Geçen Yıl BHB" fill="#6ee7b7" fillOpacity={0.6} radius={[3, 3, 0, 0]} />}
                  <Bar dataKey="bhb" name="BHB" fill="#10b981" radius={[4, 4, 0, 0]} />
                  {showReelTarget   && <Line type="monotone" dataKey="bhbTarget"     name="BHB Forecast"    stroke="#10b981" strokeWidth={2} strokeDasharray="7 3" dot={{ r: 2.5, fill: "#10b981" }} connectNulls={false} />}
                  {showYuksekTarget && <Line type="monotone" dataKey="bhbHighTarget" name="BHB Re-Forecast"  stroke="#f59e0b" strokeWidth={2} strokeDasharray="7 3" dot={{ r: 2.5, fill: "#f59e0b" }} connectNulls={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* ── BM Trend + Closing Count ── */}
        <div className="grid lg:grid-cols-2 gap-6">
          <ChartCard title="Aylık BM Geliri (Ofis)">
            {(h) => isLoading ? <Skeleton h="h-48" /> : mergedMonthlyData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={h}>
                <ComposedChart data={mergedMonthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} width={48} />
                  <Tooltip content={<TRYTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                  {showPrevYear && <Bar dataKey="prevBm" name="Geçen Yıl BM" fill="#c4b5fd" fillOpacity={0.6} radius={[3, 3, 0, 0]} />}
                  <Bar dataKey="bm" name="BM Geliri" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  {showReelTarget   && <Line type="monotone" dataKey="bmTarget"     name="BM Forecast"    stroke="#8b5cf6" strokeWidth={2} strokeDasharray="7 3" dot={{ r: 2.5, fill: "#8b5cf6" }} connectNulls={false} />}
                  {showYuksekTarget && <Line type="monotone" dataKey="bmHighTarget" name="BM Re-Forecast"  stroke="#f59e0b" strokeWidth={2} strokeDasharray="7 3" dot={{ r: 2.5, fill: "#f59e0b" }} connectNulls={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Aylık İşlem Adedi (Satılık / Kiralık)">
            {(h) => isLoading ? <Skeleton h="h-48" /> : mergedMonthlyData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={h}>
                <ComposedChart data={mergedMonthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={32} allowDecimals={false} />
                  <Tooltip content={<CountTooltip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                  {showPrevYear && <Bar dataKey="prevSatilikCount" name="Geçen Yıl Sat." fill="#93c5fd" fillOpacity={0.6} barSize={8} radius={[3, 3, 0, 0]} />}
                  {showPrevYear && <Bar dataKey="prevKiralikCount" name="Geçen Yıl Kir." fill="#fed7aa" fillOpacity={0.6} barSize={8} radius={[3, 3, 0, 0]} />}
                  <Bar dataKey="satilikCount" name="Satılık" fill="#3b82f6" barSize={8} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="kiralikCount" name="Kiralık" fill="#f97316" barSize={8} radius={[3, 3, 0, 0]} />
                  {showReelTarget   && <Line type="monotone" dataKey="satilikTarget"     name="Satılık Forecast"    stroke="#3b82f6" strokeWidth={2} strokeDasharray="7 3" dot={{ r: 2.5, fill: "#3b82f6" }} connectNulls={false} />}
                  {showYuksekTarget && <Line type="monotone" dataKey="satilikHighTarget" name="Satılık Re-Forecast"   stroke="#60a5fa" strokeWidth={2} strokeDasharray="7 3" dot={{ r: 2.5, fill: "#60a5fa" }} connectNulls={false} />}
                  {showReelTarget   && <Line type="monotone" dataKey="kiralikTarget"     name="Kiralık Forecast"    stroke="#f97316" strokeWidth={2} strokeDasharray="7 3" dot={{ r: 2.5, fill: "#f97316" }} connectNulls={false} />}
                  {showYuksekTarget && <Line type="monotone" dataKey="kiralikHighTarget" name="Kiralık Re-Forecast"   stroke="#fb923c" strokeWidth={2} strokeDasharray="7 3" dot={{ r: 2.5, fill: "#fb923c" }} connectNulls={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* ── BM/BHB Oranı + Danışman BHB ── */}
        {(() => {
          const ratioData = mergedMonthlyData.map((r: any) => ({
            month: r.month,
            oran: r.bhb > 0 ? parseFloat(((r.bm / r.bhb) * 100).toFixed(1)) : 0,
            prevOran: r.prevBhb > 0 ? parseFloat(((r.prevBm / r.prevBhb) * 100).toFixed(1)) : null,
            bhb: r.bhb,
            bm: r.bm,
          }));
          const totalBHB = ratioData.reduce((s: number, r: any) => s + (r.bhb ?? 0), 0);
          const totalBM  = ratioData.reduce((s: number, r: any) => s + (r.bm ?? 0), 0);
          const overallRatio = totalBHB > 0 ? ((totalBM / totalBHB) * 100).toFixed(1) : "—";
          const top8 = topAgents.slice(0, 8);
          return (
            <div className="grid lg:grid-cols-2 gap-6">
              <ChartCard
                title="Aylık BM/BHB Oranı"
                extra={ratioData.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Ort: <span className="font-semibold text-purple-600">%{overallRatio}</span>
                  </span>
                ) : undefined}
              >
                {(h) => isLoading ? <Skeleton h="h-56" /> : ratioData.length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={h}>
                    <ComposedChart data={ratioData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => `%${v}`} tick={{ fontSize: 10 }} width={40} domain={[0, "auto"]} />
                      <Tooltip
                        content={({ active, payload, label }: any) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-xs space-y-0.5">
                              <p className="font-semibold mb-1">{label}</p>
                              <p className="text-purple-600">BM/BHB: %{d.oran}</p>
                              {d.prevOran != null && <p className="text-purple-300">Geçen Yıl: %{d.prevOran}</p>}
                              <p className="text-muted-foreground">BHB: {fmtTRY(d.bhb)}</p>
                              <p className="text-muted-foreground">BM: {fmtTRY(d.bm)}</p>
                            </div>
                          );
                        }}
                      />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                      {showPrevYear && <Bar dataKey="prevOran" name="Geçen Yıl %" fill="#c4b5fd" fillOpacity={0.6} radius={[3, 3, 0, 0]} />}
                      <Bar dataKey="oran" name="BM/BHB %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title="Danışman BHB Performansı (Top 8)">
                {(h) => isLoading ? <Skeleton h="h-56" /> : top8.length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart data={top8} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
                      <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} interval={0} />
                      <Tooltip content={<TRYTooltip />} />
                      <Bar dataKey="bhb" name="BHB" radius={[0, 4, 4, 0]} barSize={12}>
                        {top8.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>
          );
        })()}

        {/* ── Category + Deal Type + İl + İlçe ── */}
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Deal category */}
          <ChartCard title="İşlem Kategorisi">
            {(h) => isLoading ? <Skeleton h="h-44" /> : byCategory.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={h}>
                <BarChart data={byCategory} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<CountTooltip />} />
                  <Bar dataKey="count" name="Kapanış" radius={[4, 4, 0, 0]} barSize={40}>
                    {byCategory.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Deal type */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">İşlem Tipi</h2>
            {isLoading ? <Skeleton h="h-44" /> : byDealType.length === 0 ? <Empty /> : (
              <div className="space-y-2.5 pt-1">
                {byDealType.map((r, i) => {
                  const max = Math.max(...byDealType.map(x => x.count), 1);
                  return (
                    <div key={r.dealType}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-muted-foreground">{r.dealType}</span>
                        <span className="font-semibold">{r.count} · {fmtShort(r.volume)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* İl distribution */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">İl Dağılımı</h2>
            {isLoading ? <Skeleton h="h-44" /> : byIl.length === 0 ? <Empty /> : (
              <div className="space-y-2.5 pt-1">
                {byIl.map((r: any, i: number) => {
                  const max = Math.max(...byIl.map((x: any) => x.volume), 1);
                  return (
                    <div key={r.il}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-muted-foreground">{r.il}</span>
                        <span className="font-semibold">{r.count} · {fmtShort(r.volume)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(r.volume / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* İlçe distribution */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">İlçe Dağılımı</h2>
            {isLoading ? <Skeleton h="h-44" /> : byIlce.length === 0 ? <Empty /> : (
              <div className="space-y-2.5 pt-1">
                {byIlce.map((r: any, i: number) => {
                  const max = Math.max(...byIlce.map((x: any) => x.volume), 1);
                  return (
                    <div key={r.ilce}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-muted-foreground">{r.ilce}</span>
                        <span className="font-semibold">{r.count} · {fmtShort(r.volume)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(r.volume / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Average Sale/Rental Time ── */}
        <div className="grid lg:grid-cols-2 gap-6">
          {([
            { label: "Ortalama Satış Süresi", avg: avgSaleDays, byIl: avgSaleDaysByIl, byIlce: avgSaleDaysByIlce, byMahalle: avgSaleDaysByMahalle, color: "#6366f1" },
            { label: "Ortalama Kiralık Süresi", avg: avgRentalDays, byIl: avgRentalDaysByIl, byIlce: avgRentalDaysByIlce, byMahalle: avgRentalDaysByMahalle, color: "#f59e0b" },
          ] as const).map(({ label, avg, byIl, byIlce, byMahalle, color }) => (
            <AvgDurationCard
              key={label}
              label={label}
              avg={avg}
              byIl={byIl as any}
              byIlce={byIlce as any}
              byMahalle={byMahalle as any}
              color={color}
              loading={isLoading}
            />
          ))}
        </div>

        {/* ── Agent Productivity Table ── */}
        {(() => {
          const agentCols: { key: string; label: string; align: "left" | "right" }[] = [
            { key: "#",    label: "#",            align: "left"  },
            { key: "name", label: "Danışman",     align: "left"  },
            { key: "kwuid",label: "KWUID",        align: "left"  },
            { key: "count",label: "Kapanış",      align: "right" },
            { key: "bhb",  label: "BHB",          align: "right" },
            { key: "bm",   label: "BM Payı",      align: "right" },
            { key: "net",  label: "Danışman Net", align: "right" },
            { key: "bhbpc",label: "BHB/Kapanış",  align: "right" },
          ];
          const handleAgentSort = (key: string) => {
            if (key === "#") return;
            setAgentSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
          };
          const SortIcon = ({ col }: { col: string }) => {
            if (agentSort.key !== col) return <ChevronUp className="ml-1 h-3 w-3 opacity-20 inline" />;
            return agentSort.dir === "asc"
              ? <ChevronUp className="ml-1 h-3 w-3 opacity-80 inline" />
              : <ChevronDown className="ml-1 h-3 w-3 opacity-80 inline" />;
          };
          return (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="text-base font-semibold">Danışman Performans Tablosu</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Seçili dönem tamamlanan kapanışlar — kolona tıklayarak sırala</p>
              </div>
              {isLoading ? (
                <div className="p-5 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-muted/40 rounded animate-pulse" />)}</div>
              ) : sortedAgents.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">Bu dönem için veri yok</div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-border">
                    {sortedAgents.map((a: any, i: number) => (
                      <div key={a.name} className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs text-muted-foreground mr-2">{i + 1}.</span>
                            <span className="font-medium text-sm">{a.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{a.kwuid || "—"}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div><span className="text-muted-foreground">Kapanış: </span>{a.count}</div>
                          <div><span className="text-muted-foreground">Ort. BHB: </span>{a.count > 0 ? fmtTRY(a.bhb / a.count) : "—"}</div>
                          <div><span className="text-muted-foreground">BHB: </span><span className="font-medium">{fmtTRY(a.bhb)}</span></div>
                          <div><span className="text-muted-foreground">BM: </span><span className="text-blue-700">{fmtTRY(a.bm)}</span></div>
                          <div className="col-span-2"><span className="text-muted-foreground">Net: </span><span className="font-semibold text-emerald-700">{fmtTRY(a.net)}</span></div>
                        </div>
                      </div>
                    ))}
                    <div className="p-4 bg-muted/30 text-xs font-semibold grid grid-cols-2 gap-x-4 gap-y-1">
                      <div>Toplam kapanış: {(stats?.byAgent ?? []).reduce((s: number, a: any) => s + a.count, 0)}</div>
                      <div>Net: <span className="text-emerald-700">{fmtTRY((stats?.byAgent ?? []).reduce((s: number, a: any) => s + a.net, 0))}</span></div>
                      <div>BHB: {fmtTRY((stats?.byAgent ?? []).reduce((s: number, a: any) => s + a.bhb, 0))}</div>
                      <div>BM: <span className="text-blue-700">{fmtTRY((stats?.byAgent ?? []).reduce((s: number, a: any) => s + a.bm, 0))}</span></div>
                    </div>
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border">
                          {agentCols.map((col) => (
                            <th
                              key={col.key}
                              onClick={() => handleAgentSort(col.key)}
                              className={`text-xs font-medium text-muted-foreground py-2 px-4 ${col.align === "right" ? "text-right" : "text-left"} ${col.key !== "#" ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                            >
                              {col.label}
                              {col.key !== "#" && <SortIcon col={col.key} />}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedAgents.map((a: any, i: number) => (
                          <tr key={a.name} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                            <td className="py-2 px-4 text-xs text-muted-foreground">{i + 1}</td>
                            <td className="py-2 px-4 font-medium">{a.name}</td>
                            <td className="py-2 px-4 text-xs text-muted-foreground">{a.kwuid || "—"}</td>
                            <td className="py-2 px-4 text-right">{a.count}</td>
                            <td className="py-2 px-4 text-right font-medium">{fmtTRY(a.bhb)}</td>
                            <td className="py-2 px-4 text-right text-blue-700">{fmtTRY(a.bm)}</td>
                            <td className="py-2 px-4 text-right font-semibold text-emerald-700">{fmtTRY(a.net)}</td>
                            <td className="py-2 px-4 text-right text-muted-foreground">{a.count > 0 ? fmtTRY(a.bhb / a.count) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/30 font-semibold border-t border-border">
                          <td colSpan={3} className="py-2.5 px-4 text-xs">Toplam</td>
                          <td className="py-2.5 px-4 text-right">{(stats?.byAgent ?? []).reduce((s: number, a: any) => s + a.count, 0)}</td>
                          <td className="py-2.5 px-4 text-right">{fmtTRY((stats?.byAgent ?? []).reduce((s: number, a: any) => s + a.bhb, 0))}</td>
                          <td className="py-2.5 px-4 text-right text-blue-700">{fmtTRY((stats?.byAgent ?? []).reduce((s: number, a: any) => s + a.bm, 0))}</td>
                          <td className="py-2.5 px-4 text-right text-emerald-700">{fmtTRY((stats?.byAgent ?? []).reduce((s: number, a: any) => s + a.net, 0))}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* ── First-timers + New cappers (period highlights) ── */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* First-time closers */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <div>
                <h2 className="text-base font-semibold">İlk Defa İşlem Yapanlar</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Bu dönemde ilk kapanışını yapan danışmanlar</p>
              </div>
              <span className="ml-auto text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5">
                {(stats?.firstTimers ?? []).length}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-7 bg-muted/40 rounded animate-pulse" />)}</div>
              ) : (stats?.firstTimers ?? []).length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">Bu dönem için yok</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {(stats?.firstTimers ?? []).map((p: any) => (
                    <li key={p.employeeId} className="px-5 py-2.5 flex items-center gap-3 text-sm hover-elevate transition-colors">
                      <span className="font-medium flex-1 truncate">{p.name}</span>
                      {p.bhb > 0 && (
                        <span className="text-xs font-medium text-emerald-600 tabular-nums" title="BHB Payı">{fmtTRY(p.bhb)}</span>
                      )}
                      {p.bm > 0 && (
                        <span className="text-xs font-medium text-blue-600 tabular-nums" title="BM Payı">{fmtTRY(p.bm)}</span>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format(new Date(p.firstDate), "d MMM yyyy", { locale: tr })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* New cappers */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <div>
                <h2 className="text-base font-semibold">Yeni Capper Olanlar</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Bu dönemde cap'ini dolduran danışmanlar</p>
              </div>
              <span className="ml-auto text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                {(stats?.newCappers ?? []).length}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="p-5 space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-7 bg-muted/40 rounded animate-pulse" />)}</div>
              ) : (stats?.newCappers ?? []).length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">Bu dönem için yok</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {(stats?.newCappers ?? []).map((p: any) => (
                    <li key={p.employeeId} className="px-5 py-2.5 flex items-center gap-3 text-sm hover-elevate transition-colors">
                      <span className="font-medium flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums" title={`Cap: ${fmtTRY(p.capAmount)}`}>
                        {format(new Date(p.capDate), "d MMM yyyy", { locale: tr })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ── Cap Reset Calendar ── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-base font-semibold">Cap Yenileme Takvimi</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Her danışmanın cap döneminin başladığı ay</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 divide-x divide-y divide-border/50">
            {["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"].map((monthName, i) => {
              const agents = resetByMonth[i] ?? [];
              const now = new Date();
              const isCurrentMonth = i === now.getMonth();
              return (
                <div key={i} className={`p-3 min-h-[110px] ${isCurrentMonth ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}>
                  <div className={`text-xs font-semibold mb-2 ${isCurrentMonth ? "text-blue-600" : "text-muted-foreground"}`}>
                    {monthName}
                  </div>
                  {agents.length === 0 ? (
                    <div className="text-xs text-muted-foreground/50">—</div>
                  ) : (
                    <div className="space-y-1">
                      {agents.map((s: any) => (
                        <div key={s.employeeId} className="flex items-center gap-1">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${s.pct >= 100 ? "bg-emerald-500" : s.pct >= 75 ? "bg-amber-500" : "bg-muted-foreground/40"}`} />
                          <span className="text-xs truncate leading-tight">{s.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Capper Lists ── */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Current Cappers */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">✓</span>
              <h2 className="text-base font-semibold">Cap Yapanlar</h2>
              <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">{cappers.length} danışman</span>
            </div>
            {cappers.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Henüz cap yapan danışman yok</div>
            ) : (
              <div className="divide-y divide-border/50">
                {cappers.map((s: any) => (
                  <div key={s.employeeId} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.kwuid || "—"}</div>
                    </div>
                    {capResetMonth(s) && (
                      <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">{capResetMonth(s)}</span>
                    )}
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold text-emerald-600">{fmtTRY(s.capUsed)} / {fmtTRY(s.capAmount)}</div>
                      <div className="text-xs text-muted-foreground">{s.pct}% kullanıldı</div>
                    </div>
                    <div className="w-2 h-8 rounded-full bg-emerald-500 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Almost Cappers */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">!</span>
              <h2 className="text-base font-semibold">Cap'e Yaklaşanlar</h2>
              <span className="ml-auto text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">{almostCappers.length} danışman</span>
            </div>
            {almostCappers.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">75% eşiğinde danışman yok</div>
            ) : (
              <div className="divide-y divide-border/50">
                {almostCappers.map((s: any) => (
                  <div key={s.employeeId} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.kwuid || "—"}</div>
                    </div>
                    {capResetMonth(s) && (
                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">{capResetMonth(s)}</span>
                    )}
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold text-amber-600">{fmtTRY(s.capUsed)} / {fmtTRY(s.capAmount)}</div>
                      <div className="text-xs text-muted-foreground">{fmtTRY(s.capRemaining ?? 0)} kaldı · {s.pct}%</div>
                    </div>
                    <div className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: s.pct >= 90 ? "#f97316" : "#f59e0b" }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Probable Cappers */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">~</span>
              <h2 className="text-base font-semibold">Cap Yapabilecekler</h2>
              <span className="ml-auto text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">{probableCappers.length} danışman</span>
            </div>
            {probableCappers.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Mevcut hızda cap yapabilecek danışman yok</div>
            ) : (
              <div className="divide-y divide-border/50">
                {probableCappers.map((s: any) => {
                  const today = new Date();
                  const start = new Date(s.periodStart);
                  const monthsElapsed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
                  const monthsRemaining = 12 - monthsElapsed;
                  const ratePerMonth = monthsElapsed > 0 ? s.capUsed / monthsElapsed : 0;
                  const projected = s.capUsed + ratePerMonth * monthsRemaining;
                  const projPct = s.capAmount > 0 ? Math.round((projected / s.capAmount) * 100) : 0;
                  return (
                    <div key={s.employeeId} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.kwuid || "—"}</div>
                      </div>
                      {capResetMonth(s) && (
                        <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full shrink-0">{capResetMonth(s)}</span>
                      )}
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold text-blue-600">{s.pct}% → proj. {projPct}%</div>
                        <div className="text-xs text-muted-foreground">{fmtTRY(s.capUsed)} / {fmtTRY(s.capAmount)}</div>
                      </div>
                      <div className="w-2 h-8 rounded-full bg-blue-400 shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Admin Target Editor ── */}
        {isAdmin && showEditor && (() => {
          const MONTH_LABELS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
          return (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
                <Target className="h-4 w-4 text-primary shrink-0" />
                <h2 className="text-base font-semibold">Aylık Hedef Yönetimi</h2>
                {/* Office selector */}
                <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
                  {(["Akatlar", "Zekeriyaköy"] as const).map(o => (
                    <Button key={o} size="sm" variant={editorOffice === o ? "default" : "ghost"} className="h-6 text-xs px-3" onClick={() => setEditorOffice(o)}>
                      {o}
                    </Button>
                  ))}
                </div>
                {/* Year selector */}
                <div className="flex items-center gap-1 ml-auto">
                  {[new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map(y => (
                    <Button key={y} size="sm" variant={editorYear === y ? "default" : "outline"} className="h-7 text-xs px-3" onClick={() => setEditorYear(y)}>
                      {y}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-left w-20" rowSpan={2}>Ay</th>
                      <th colSpan={2} className="text-xs font-medium text-muted-foreground py-1 px-2 text-center border-l border-border">BHB (₺)</th>
                      <th colSpan={2} className="text-xs font-medium text-muted-foreground py-1 px-2 text-center border-l border-border">BM Payı (₺)</th>
                      <th colSpan={2} className="text-xs font-medium text-muted-foreground py-1 px-2 text-center border-l border-border">Satılık Adet</th>
                      <th colSpan={2} className="text-xs font-medium text-muted-foreground py-1 px-2 text-center border-l border-border">Kiralık Adet</th>
                      <th className="w-8" rowSpan={2}></th>
                    </tr>
                    <tr className="bg-muted/30 border-b border-border">
                      {["Forecast","Re-Forecast","Forecast","Re-Forecast","Forecast","Re-Forecast","Forecast","Re-Forecast"].map((lbl, i) => (
                        <th key={i} className={`text-[10px] font-medium text-muted-foreground py-1 px-2 text-right ${i % 2 === 0 ? "border-l border-border" : ""}`}>{lbl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                      const empty = { bhb: "", bhbHigh: "", bm: "", bmHigh: "", satilik: "", satilikHigh: "", kiralik: "", kiralikHigh: "" };
                      const row = draftTargets[month] ?? empty;
                      const isSaving = savingMonth === month;
                      const setRow = (field: string, val: string) =>
                        setDraftTargets(prev => ({ ...prev, [month]: { ...(prev[month] ?? empty), [field]: val } }));
                      const inp = (field: keyof typeof empty, wide?: boolean) => (
                        <td key={field} className={`py-1 px-1.5 ${["bhb","bm","satilik","kiralik"].includes(field) ? "border-l border-border/40" : ""}`}>
                          <Input
                            type="number"
                            value={row[field] ?? ""}
                            onChange={e => setRow(field, e.target.value)}
                            onBlur={() => saveTarget(month)}
                            placeholder="—"
                            className={`h-6 text-xs text-right tabular-nums ${wide ? "w-28" : "w-20"}`}
                            disabled={isSaving}
                          />
                        </td>
                      );
                      return (
                        <tr key={month} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="py-1.5 px-4 font-medium text-xs">{MONTH_LABELS[month - 1]}</td>
                          {inp("bhb", true)}{inp("bhbHigh", true)}
                          {inp("bm", true)}{inp("bmHigh", true)}
                          {inp("satilik")}{inp("satilikHigh")}
                          {inp("kiralik")}{inp("kiralikHigh")}
                          <td className="py-1 px-1 text-center text-xs text-muted-foreground">
                            {isSaving ? "…" : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
                Alandan çıktığınızda (blur) otomatik kaydedilir.
              </div>
            </div>
          );
        })()}

      </div>
    </Layout>
  );
}
