import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell,
} from "recharts";
import {
  TrendingUp, DollarSign, Users, Handshake,
  ChevronLeft, ChevronRight, Calendar, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

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
function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4 shadow-sm">
      <div className={`rounded-lg p-2.5 ${color} shrink-0`}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-bold text-foreground truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
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

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useCapStatuses() {
  return useQuery<Record<string, any>>({
    queryKey: ["/api/employees/cap-statuses"],
    queryFn: async () => {
      const res = await fetch("/api/employees/cap-statuses", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
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
  });
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

  const vy = viewDate.getFullYear();
  const vm = viewDate.getMonth();
  const prevMonth = () => setViewDate(new Date(vy, vm - 1, 1));
  const nextMonth = () => setViewDate(new Date(vy, vm + 1, 1));
  const monthStart = formatYMD(new Date(vy, vm, 1));
  const monthEnd   = formatYMD(new Date(vy, vm + 1, 0));

  const computedStart = useCustomRange ? fromDate : monthStart;
  const computedEnd   = useCustomRange ? toDate   : monthEnd;
  const { data: stats, isLoading } = useClosingStats(computedStart, computedEnd, officeFilter, categoryFilter, dealTypeFilter);
  const { data: capStatuses = {} } = useCapStatuses();

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
    () => (stats?.monthlyTrend ?? []).map((r: any) => ({ ...r, month: fmtMonthKey(r.month) })),
    [stats?.monthlyTrend]
  );
  const topAgents        = (stats?.byAgent ?? []).slice(0, 12);
  const byCategory       = stats?.byCategory ?? [];
  const byDealType       = (stats?.byDealType ?? []) as { dealType: string; count: number; volume: number; bhb: number }[];
  const byIl             = (stats?.byIl ?? []).slice(0, 8);
  const byIlce           = (stats?.byIlce ?? []).slice(0, 8);
  const avgSaleDays        = stats?.avgSaleDays ?? null;
  const avgSaleDaysByIlce  = (stats?.avgSaleDaysByIlce ?? [])  as { ilce: string; avg: number; count: number }[];
  const avgRentalDays      = stats?.avgRentalDays ?? null;
  const avgRentalDaysByIlce = (stats?.avgRentalDaysByIlce ?? []) as { ilce: string; avg: number; count: number }[];

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
          </div>
        </div>

        {/* ── Metric Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={Handshake} color="bg-blue-50 text-blue-600"
            label="Tamamlanan Kapanış"
            value={stats?.completedCount ?? 0}
            sub={`${stats?.expectedCount ?? 0} beklenen`}
          />
          <MetricCard
            icon={TrendingUp} color="bg-emerald-50 text-emerald-600"
            label="İşlem Hacmi"
            value={stats ? fmtTRY(stats.completedVolume) : "—"}
            sub={stats?.expectedVolume ? `+ ${fmtTRY(stats.expectedVolume)} beklenen` : undefined}
          />
          <MetricCard
            icon={DollarSign} color="bg-amber-50 text-amber-600"
            label="BHB Geliri"
            value={stats ? fmtTRY(stats.completedBHB) : "—"}
            sub={stats?.expectedBHB ? `+ ${fmtTRY(stats.expectedBHB)} beklenen` : undefined}
          />
          <MetricCard
            icon={Users} color="bg-purple-50 text-purple-600"
            label="BM Geliri (Ofis)"
            value={stats ? fmtTRY(stats.completedBM) : "—"}
            sub={stats?.expectedBM ? `+ ${fmtTRY(stats.expectedBM)} beklenen` : undefined}
          />
        </div>

        {/* ── Side Type Breakdown ── */}
        <div className="grid grid-cols-3 gap-4">
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
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">Aylık İşlem Hacmi</h2>
            {isLoading ? <Skeleton /> : monthlyData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="gVol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} width={48} />
                  <Tooltip content={<TRYTooltip />} />
                  <Area type="monotone" dataKey="volume" name="İşlem Hacmi" stroke="#3b82f6" fill="url(#gVol)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">Aylık BHB Geliri</h2>
            {isLoading ? <Skeleton /> : monthlyData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <defs>
                    <linearGradient id="gBHB" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} width={48} />
                  <Tooltip content={<TRYTooltip />} />
                  <Area type="monotone" dataKey="bhb" name="BHB" stroke="#10b981" fill="url(#gBHB)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Top Agents ── */}
        <div className="grid lg:grid-cols-1 gap-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">Danışman BHB Performansı (Top 12)</h2>
            {isLoading ? <Skeleton /> : topAgents.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={agentChartHeight}>
                <BarChart data={topAgents} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 8 }}>
                  <XAxis type="number" tickFormatter={fmtShort} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} interval={0} />
                  <Tooltip content={<TRYTooltip />} />
                  <Bar dataKey="bhb" name="BHB" radius={[0, 4, 4, 0]} barSize={14}>
                    {topAgents.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── BM Trend + Closing Count ── */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">Aylık BM Geliri (Ofis)</h2>
            {isLoading ? <Skeleton h="h-48" /> : monthlyData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} width={48} />
                  <Tooltip content={<TRYTooltip />} />
                  <Bar dataKey="bm" name="BM Geliri" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">Aylık Kapanış Adedi</h2>
            {isLoading ? <Skeleton h="h-48" /> : monthlyData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={32} allowDecimals={false} />
                  <Tooltip content={<CountTooltip />} />
                  <Bar dataKey="count" name="Kapanış" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Category + Deal Type + İl + İlçe ── */}
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Deal category */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">İşlem Kategorisi</h2>
            {isLoading ? <Skeleton h="h-44" /> : byCategory.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={180}>
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
          </div>

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
            { label: "Ortalama Satış Süresi", avg: avgSaleDays, byIlce: avgSaleDaysByIlce, color: "#6366f1" },
            { label: "Ortalama Kiralık Süresi", avg: avgRentalDays, byIlce: avgRentalDaysByIlce, color: "#f59e0b" },
          ] as const).map(({ label, avg, byIlce: rows, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-4">
                <div>
                  <h2 className="text-base font-semibold">{label}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Yalnızca süre bilgisi olan kapanışlar · min. 3 kapanış/ilçe</p>
                </div>
                {avg !== null && (
                  <div className="ml-auto text-right shrink-0">
                    <div className="text-2xl font-bold">{avg} <span className="text-sm font-normal text-muted-foreground">gün</span></div>
                    <div className="text-xs text-muted-foreground">{rows.reduce((s, r) => s + r.count, 0)} kapanış</div>
                  </div>
                )}
              </div>
              {isLoading ? <Skeleton h="h-44" /> : rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Yeterli veri yok</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {rows.map((r, i) => {
                    const max = Math.max(...rows.map(x => x.avg), 1);
                    return (
                      <div key={r.ilce} className="px-5 py-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium">{r.ilce}</span>
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
          ))}
        </div>

        {/* ── Agent Productivity Table ── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-base font-semibold">Danışman Performans Tablosu</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Seçili dönem tamamlanan kapanışlar — BHB'ye göre sıralı</p>
          </div>
          {isLoading ? (
            <div className="p-5 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-muted/40 rounded animate-pulse" />)}</div>
          ) : (stats?.byAgent ?? []).length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Bu dönem için veri yok</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    {["#","Danışman","KWUID","Kapanış","BHB","BM Payı","Danışman Net","BHB/Kapanış"].map((h) => (
                      <th key={h} className={`text-xs font-medium text-muted-foreground py-2 px-4 ${h === "#" || h === "Danışman" || h === "KWUID" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(stats?.byAgent ?? []).map((a: any, i: number) => (
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
          )}
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

      </div>
    </Layout>
  );
}
