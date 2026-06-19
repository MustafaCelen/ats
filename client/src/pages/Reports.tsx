import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useReportStats } from "@/hooks/use-stats";
import { STAGE_COLORS } from "@/components/StatusBadge";
import { STAGE_LABELS } from "@shared/schema";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, CartesianGrid } from "recharts";
import { Calendar, Clock, TrendingUp, Users, CheckCircle, DollarSign, Briefcase, Activity, TimerReset, XCircle, UserMinus, UserPlus, ChevronLeft, ChevronRight, FileSignature, AlertTriangle, TrendingDown, Minus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";

function MetricCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: number | string; sub?: string; color: string; }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4 shadow-sm">
      <div className={`rounded-lg p-2.5 ${color} shrink-0`}><Icon className="h-4 w-4" /></div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-xl font-display font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-foreground capitalize mb-1">{label}</p>
      <p className="text-muted-foreground">{payload[0]?.value} candidates</p>
    </div>
  );
}

function formatDateInput(date: Date) {
  return date.toISOString().split("T")[0];
}

const OFFICE_OPTIONS = [
  { label: "Her İki Ofis", value: undefined },
  { label: "Akatlar", value: "Akatlar" },
  { label: "Zekeriyaköy", value: "Zekeriyaköy" },
] as const;

function formatYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Reports() {
  const [mainTab, setMainTab] = useState<"ise-alim" | "churn">("ise-alim");
  const [viewDate, setViewDate] = useState(() => new Date());
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [fromDate, setFromDate] = useState(formatDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [toDate, setToDate] = useState(formatDateInput(new Date()));
  const [officeFilter, setOfficeFilter] = useState<string | undefined>(undefined);
  const { data: churnData = [], isLoading: churnLoading } = useQuery<any[]>({
    queryKey: ["/api/reports/churn"],
    queryFn: () => fetch("/api/reports/churn").then((r) => r.json()),
    enabled: mainTab === "churn",
  });

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();
  const prevMonth = () => setViewDate(new Date(viewYear, viewMonth - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewYear, viewMonth + 1, 1));

  const monthStart = formatYMD(new Date(viewYear, viewMonth, 1));
  const monthEnd = formatYMD(new Date(viewYear, viewMonth + 1, 0));

  const computedStart = useCustomRange ? fromDate : monthStart;
  const computedEnd = useCustomRange ? toDate : monthEnd;
  const { data: stats, isLoading } = useReportStats(computedStart, computedEnd, officeFilter);

  const funnelData = (stats?.funnel ?? []).filter((f: any) => f.stage !== "rejected");
  const stageTimes = (stats?.stageTimes ?? []).filter((s: any) => s.stage !== "rejected");
  const maxStage = Math.max(...stageTimes.map((t: any) => t.avgDays), 1);

  const hadClosings  = churnData.filter((r: any) => r.lastClosingDate !== null && r.risk === "high");
  const neverClosed  = churnData.filter((r: any) => r.lastClosingDate === null && r.risk === "high");
  const highRisk  = churnData.filter((r: any) => r.risk === "high").length;
  const medRisk   = churnData.filter((r: any) => r.risk === "medium").length;
  const lowRisk   = churnData.filter((r: any) => r.risk === "low").length;

  return (
    <Layout>
      <div className="space-y-6">
        {/* ── Main tab bar ── */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => setMainTab("ise-alim")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${mainTab === "ise-alim" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            İşe Alım Raporu
          </button>
          <button
            onClick={() => setMainTab("churn")}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${mainTab === "churn" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Danışman Sağlığı
            {highRisk > 0 && (
              <span className="ml-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{highRisk}</span>
            )}
          </button>
        </div>

        {mainTab === "churn" && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Yüksek Risk</p>
                </div>
                <p className="text-3xl font-bold text-red-700">{churnLoading ? "…" : highRisk}</p>
                <p className="text-xs text-red-500 mt-1">danışman dikkat gerektiriyor</p>
              </div>
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Minus className="h-4 w-4 text-amber-600" />
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Orta Risk</p>
                </div>
                <p className="text-3xl font-bold text-amber-700">{churnLoading ? "…" : medRisk}</p>
                <p className="text-xs text-amber-500 mt-1">danışman takipte</p>
              </div>
              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Düşük Risk</p>
                </div>
                <p className="text-3xl font-bold text-emerald-700">{churnLoading ? "…" : lowRisk}</p>
                <p className="text-xs text-emerald-500 mt-1">danışman sağlıklı</p>
              </div>
            </div>

            {churnLoading ? (
              <div className="rounded-xl border border-border bg-card shadow-sm p-12 text-center text-sm text-muted-foreground">Yükleniyor…</div>
            ) : (<>
            {/* ── Daha önce işlem yapmış ── */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
                <ShieldAlert className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Üretim Durağanlığı</h2>
                <span className="text-xs text-muted-foreground">— daha önce işlem yapmış, son dönem sessiz</span>
                <span className="ml-auto text-xs font-semibold text-muted-foreground">{hadClosings.length} danışman</span>
              </div>
              {hadClosings.length === 0 ? (
                <div className="px-5 py-8 text-sm text-muted-foreground text-center">Bu grupta danışman yok.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs text-muted-foreground uppercase">
                      <tr>
                        <th className="text-left px-5 py-3">Danışman</th>
                        <th className="text-left px-5 py-3">Risk</th>
                        <th className="text-left px-5 py-3">Son İşlem</th>
                        <th className="text-center px-5 py-3">Son 3 Ay</th>
                        <th className="text-center px-5 py-3">Önceki 3 Ay</th>
                        <th className="text-center px-5 py-3">Trend</th>
                        <th className="text-left px-5 py-3">Tenure</th>
                        <th className="text-left px-5 py-3">Kategori</th>
                        <th className="text-right px-5 py-3">Skor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {hadClosings.map((r: any) => (
                        <tr key={r.employeeId} className={`transition-colors ${r.risk === "high" ? "bg-red-50/40 hover:bg-red-50/70" : r.risk === "medium" ? "bg-amber-50/30 hover:bg-amber-50/60" : "hover:bg-muted/20"}`}>
                          <td className="px-5 py-3">
                            <p className="font-medium">{r.name}</p>
                            {r.kwuid && <p className="text-xs text-muted-foreground font-mono">{r.kwuid}</p>}
                          </td>
                          <td className="px-5 py-3">
                            {r.risk === "high" && <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 ring-1 ring-red-300"><AlertTriangle className="h-3 w-3" /> Yüksek</span>}
                            {r.risk === "medium" && <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-300"><Minus className="h-3 w-3" /> Orta</span>}
                            {r.risk === "low" && <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"><CheckCircle className="h-3 w-3" /> Düşük</span>}
                          </td>
                          <td className="px-5 py-3">
                            <p>{format(new Date(r.lastClosingDate), "d MMM yyyy", { locale: tr })}</p>
                            <p className="text-xs text-muted-foreground">{r.daysSinceLast} gün önce</p>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`text-sm font-bold ${r.closings3m === 0 ? "text-red-600" : r.closings3m <= 1 ? "text-amber-600" : "text-emerald-600"}`}>{r.closings3m}</span>
                          </td>
                          <td className="px-5 py-3 text-center text-muted-foreground">{r.closingsPrev3m}</td>
                          <td className="px-5 py-3 text-center">
                            {r.trend === "up" && <TrendingUp className="h-4 w-4 text-emerald-600 mx-auto" />}
                            {r.trend === "down" && <TrendingDown className="h-4 w-4 text-red-500 mx-auto" />}
                            {r.trend === "flat" && <Minus className="h-4 w-4 text-muted-foreground mx-auto" />}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">{r.tenureMonths < 1 ? "<1 ay" : `${r.tenureMonths} ay`}</td>
                          <td className="px-5 py-3">
                            {r.category ? <span className={`text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${r.category === "K2" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : r.category === "K1" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-50 text-slate-700 ring-slate-200"}`}>{r.category}</span> : "—"}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className={`text-sm font-bold ${r.score >= 60 ? "text-red-600" : r.score >= 30 ? "text-amber-600" : "text-emerald-600"}`}>{r.score}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Hiç işlem yapmamış ── */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold">Henüz İşlem Yapmamış</h2>
                <span className="text-xs text-muted-foreground">— sistemde hiç kapanış kaydı yok</span>
                <span className="ml-auto text-xs font-semibold text-muted-foreground">{neverClosed.length} danışman</span>
              </div>
              {neverClosed.length === 0 ? (
                <div className="px-5 py-8 text-sm text-muted-foreground text-center">Bu grupta danışman yok.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs text-muted-foreground uppercase">
                      <tr>
                        <th className="text-left px-5 py-3">Danışman</th>
                        <th className="text-left px-5 py-3">Risk</th>
                        <th className="text-left px-5 py-3">Tenure</th>
                        <th className="text-left px-5 py-3">Kategori</th>
                        <th className="text-right px-5 py-3">Skor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {neverClosed.map((r: any) => (
                        <tr key={r.employeeId} className={`transition-colors ${r.risk === "high" ? "bg-red-50/40 hover:bg-red-50/70" : r.risk === "medium" ? "bg-amber-50/30 hover:bg-amber-50/60" : "hover:bg-muted/20"}`}>
                          <td className="px-5 py-3">
                            <p className="font-medium">{r.name}</p>
                            {r.kwuid && <p className="text-xs text-muted-foreground font-mono">{r.kwuid}</p>}
                          </td>
                          <td className="px-5 py-3">
                            {r.risk === "high" && <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 ring-1 ring-red-300"><AlertTriangle className="h-3 w-3" /> Yüksek</span>}
                            {r.risk === "medium" && <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-300"><Minus className="h-3 w-3" /> Orta</span>}
                            {r.risk === "low" && <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"><CheckCircle className="h-3 w-3" /> Düşük</span>}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground">{r.tenureMonths < 1 ? "<1 ay" : `${r.tenureMonths} ay`}</td>
                          <td className="px-5 py-3">
                            {r.category ? <span className={`text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${r.category === "K2" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : r.category === "K1" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-50 text-slate-700 ring-slate-200"}`}>{r.category}</span> : "—"}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className={`text-sm font-bold ${r.score >= 60 ? "text-red-600" : r.score >= 30 ? "text-amber-600" : "text-emerald-600"}`}>{r.score}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </>)}
          </div>
        )}

        {mainTab === "ise-alim" && (<>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Reports &amp; Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Insights into your recruitment pipeline</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Office filter */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {OFFICE_OPTIONS.map((o) => (
                <Button
                  key={o.label}
                  size="sm"
                  variant={officeFilter === o.value ? "default" : "ghost"}
                  className="h-7 text-xs px-3"
                  onClick={() => setOfficeFilter(o.value as string | undefined)}
                  data-testid={`btn-office-${o.label.replace(/\s/g, "-")}`}
                >
                  {o.label}
                </Button>
              ))}
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <Button
                size="sm"
                variant={!useCustomRange ? "default" : "ghost"}
                className="h-7 text-xs px-3"
                onClick={() => setUseCustomRange(false)}
                data-testid="btn-range-monthly"
              >
                Aylık
              </Button>
              <Button
                size="sm"
                variant={useCustomRange ? "default" : "ghost"}
                className="h-7 text-xs px-3"
                onClick={() => setUseCustomRange(true)}
                data-testid="btn-range-custom"
              >
                Özel Aralık
              </Button>
            </div>

            {/* Monthly navigator */}
            {!useCustomRange && (
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={prevMonth} data-testid="btn-prev-month">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs font-medium px-2 min-w-[110px] text-center capitalize" data-testid="label-month">
                  {format(viewDate, "MMMM yyyy", { locale: tr })}
                </span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={nextMonth} data-testid="btn-next-month">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {/* Custom date range */}
            {useCustomRange && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[140px]" data-testid="input-report-from" />
                <span className="text-xs text-muted-foreground">—</span>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[140px]" data-testid="input-report-to" />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard icon={Users} label="Total Applications" value={stats?.total ?? 0} color="bg-blue-50 text-blue-600" />
          <MetricCard icon={CheckCircle} label="Hired" value={stats?.hired ?? 0} sub={`${stats?.conversionRate ?? 0}% conversion`} color="bg-emerald-50 text-emerald-600" />
          <MetricCard icon={Clock} label="Ort. Sözleşme Süresi" value={`${stats?.avgTimeToContractSign ?? 0}g`} sub="başvurudan sözleşmeye" color="bg-amber-50 text-amber-600" />
          <MetricCard icon={TrendingUp} label="Ort. İşe Giriş Süresi" value={`${stats?.avgTimeToEmploy ?? 0}g`} sub="başvurudan girişe" color="bg-teal-50 text-teal-600" />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Recruitment Funnel</h2>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">All-time</span>
            </div>
            {isLoading ? <div className="h-64 bg-muted/40 rounded-lg animate-pulse" /> : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={funnelData} layout="vertical" barSize={22} margin={{ left: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="stage" tickFormatter={(v) => STAGE_LABELS[v] ?? v} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {funnelData.map((entry: any) => <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] ?? "#94a3b8"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold mb-4">Applications Over Time</h2>
            {isLoading ? <div className="h-64 bg-muted/40 rounded-lg animate-pulse" /> : stats?.weeklyApplications?.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No data for selected period</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={stats?.weeklyApplications ?? []} margin={{ left: -20 }}>
                  <defs>
                    <linearGradient id="appGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                  <Area type="monotone" dataKey="count" name="Applications" stroke="#3b82f6" strokeWidth={2} fill="url(#appGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ── Rejection Drop-off ───────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="p-5 border-b border-border flex items-start gap-3">
            <div className="rounded-lg p-2 bg-red-50 text-red-500 shrink-0 mt-0.5"><XCircle className="h-4 w-4" /></div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Rejection Drop-off by Stage</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Shows which pipeline stage candidates were in when they were rejected — helps identify where you lose the most people</p>
            </div>
          </div>
          {isLoading ? (
            <div className="h-56 px-5 py-4 animate-pulse space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-8 bg-muted rounded" />)}
            </div>
          ) : !stats?.rejectionDropoff?.length ? (
            <div className="px-5 py-8 text-sm text-muted-foreground text-center">No rejections recorded in this period.</div>
          ) : (
            <div className="p-5 grid sm:grid-cols-2 gap-6 items-start">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={stats.rejectionDropoff.map((r: any) => ({ ...r, label: STAGE_LABELS[r.fromStage] ?? r.fromStage }))}
                  layout="vertical"
                  barSize={20}
                  margin={{ left: 4, right: 16 }}
                >
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const total = stats.rejectionDropoff.reduce((s: number, r: any) => s + r.count, 0);
                      const pct = total > 0 ? Math.round((payload[0].value as number / total) * 100) : 0;
                      return (
                        <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm">
                          <p className="font-semibold text-foreground mb-1">{label}</p>
                          <p className="text-muted-foreground">{payload[0].value} rejected ({pct}%)</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {stats.rejectionDropoff.map((r: any) => (
                      <Cell key={r.fromStage} fill={STAGE_COLORS[r.fromStage] ?? "#f87171"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="space-y-2" data-testid="rejection-dropoff-table">
                {(() => {
                  const totalRej = stats.rejectionDropoff.reduce((s: number, r: any) => s + r.count, 0);
                  return stats.rejectionDropoff.map((r: any) => {
                    const pct = totalRej > 0 ? Math.round((r.count / totalRej) * 100) : 0;
                    const color = STAGE_COLORS[r.fromStage] ?? "#f87171";
                    return (
                      <div key={r.fromStage} className="flex items-center gap-3" data-testid={`rejection-row-${r.fromStage}`}>
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-foreground capitalize">{STAGE_LABELS[r.fromStage] ?? r.fromStage}</span>
                            <span className="text-xs text-muted-foreground ml-2">{r.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
                <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                  Total rejected in period: <span className="font-semibold text-foreground">{stats.rejectionDropoff.reduce((s: number, r: any) => s + r.count, 0)}</span>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid xl:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="p-5 border-b border-border flex items-center gap-2"><TimerReset className="h-4 w-4 text-primary" /><div><h2 className="text-base font-semibold">Average Time in Stage</h2><p className="text-xs text-muted-foreground mt-0.5">How long candidates spend in each stage on average</p></div></div>
            <div className="divide-y divide-border">
              {isLoading ? [1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-14 px-5 animate-pulse flex items-center gap-4"><div className="h-3 w-24 bg-muted rounded" /><div className="flex-1 h-2 bg-muted/50 rounded-full" /><div className="h-3 w-12 bg-muted rounded" /></div>) : stageTimes.length === 0 ? <div className="px-5 py-6 text-sm text-muted-foreground">No stage history yet.</div> : stageTimes.map((s: any) => {
                const width = maxStage > 0 ? (s.avgDays / maxStage) * 100 : 0;
                return (
                  <div key={s.stage} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-28 text-sm font-medium text-foreground">{STAGE_LABELS[s.stage] ?? s.stage}</div>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${width}%`, backgroundColor: STAGE_COLORS[s.stage] ?? "#94a3b8" }} /></div>
                    <div className="w-16 text-right text-sm text-muted-foreground">{s.avgDays > 0 ? `${s.avgDays}d` : "—"}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="p-5 border-b border-border flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold">Sorumlu Yönetici Verimliliği</h2></div>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {(stats?.hiringManagerEfficiency ?? []).map((m: any) => (
                <div key={m.userId} className="p-4 space-y-2">
                  <div className="font-medium text-sm">{m.name}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Söz. Süresi: <span className="font-medium text-foreground">{m.avgTimeToContractSign} gün</span></span>
                    <span>Giriş Süresi: <span className="font-medium text-foreground">{m.avgTimeToEmploy} gün</span></span>
                    <span>Randevu: <span className="font-medium text-foreground">{m.interviews}</span></span>
                    <span>K0/K1/K2: <span className="font-medium text-foreground">{m.k0 ?? 0}/{m.k1 ?? 0}/{m.k2 ?? 0}</span></span>
                    <span>Sözleşme: <span className="font-medium text-foreground">{m.totalHires}</span></span>
                    <span>Giriş: <span className={`font-medium ${m.employedCount > 0 ? "text-emerald-600" : "text-foreground"}`}>{m.employedCount ?? 0}</span></span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground uppercase text-xs">
                  <tr>
                    <th className="text-left p-4">Yönetici</th>
                    <th className="text-left p-4">Ort. Sözleşme Süresi</th>
                    <th className="text-left p-4">Ort. İşe Giriş Süresi</th>
                    <th className="text-left p-4">Randevu</th>
                    <th className="text-left p-4">K0</th>
                    <th className="text-left p-4">K1</th>
                    <th className="text-left p-4">K2</th>
                    <th className="text-left p-4">Sözleşme</th>
                    <th className="text-left p-4">Giriş</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.hiringManagerEfficiency ?? []).map((m: any) => (
                    <tr key={m.userId} className="border-t border-border">
                      <td className="p-4 font-medium">{m.name}</td>
                      <td className="p-4">{m.avgTimeToContractSign} gün</td>
                      <td className="p-4">{m.avgTimeToEmploy} gün</td>
                      <td className="p-4">{m.interviews}</td>
                      <td className="p-4">{m.k0 ?? 0}</td>
                      <td className="p-4">{m.k1 ?? 0}</td>
                      <td className="p-4">{m.k2 ?? 0}</td>
                      <td className="p-4">{m.totalHires}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 font-medium ${m.employedCount > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {m.employedCount ?? 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Passive Employees ────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden" data-testid="passive-employees-section">
          <div className="p-5 border-b border-border flex items-start gap-3">
            <div className="rounded-lg p-2 bg-orange-50 text-orange-500 shrink-0 mt-0.5"><UserMinus className="h-4 w-4" /></div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-foreground">Pasife Düşen Çalışanlar</h2>
                {!isLoading && (
                  <span className="inline-flex items-center rounded-full bg-orange-100 text-orange-700 text-xs font-semibold px-2.5 py-0.5" data-testid="passive-count-badge">
                    {stats?.passiveEmployeeCount ?? 0}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Seçili dönemde pasife alınan çalışanlar</p>
            </div>
          </div>
          {isLoading ? (
            <div className="px-5 py-4 animate-pulse space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded" />)}
            </div>
          ) : !stats?.passiveEmployees?.length ? (
            <div className="px-5 py-8 text-sm text-muted-foreground text-center">Bu dönemde pasife düşen çalışan bulunmuyor.</div>
          ) : (() => {
            // Collect all unique years across all passive employees
            const allYears = Array.from(
              new Set(
                (stats.passiveEmployees as any[]).flatMap((e: any) =>
                  (e.bhbByYear ?? []).map((b: any) => b.year)
                )
              )
            ).sort((a, b) => a - b);

            const fmtDuration = (startDate: string | null, endDate: string | null) => {
              if (!startDate) return "—";
              const s = new Date(startDate);
              const e = endDate ? new Date(endDate) : new Date();
              const totalMonths = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
              const years = Math.floor(totalMonths / 12);
              const months = totalMonths % 12;
              if (years === 0) return `${months} ay`;
              if (months === 0) return `${years} yıl`;
              return `${years} yıl ${months} ay`;
            };

            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-muted-foreground uppercase text-xs">
                    <tr>
                      <th className="text-left p-4">Çalışan</th>
                      <th className="text-left p-4">Ünvan</th>
                      <th className="text-left p-4">Giriş Tarihi</th>
                      <th className="text-left p-4">Şirkette Süre</th>
                      {allYears.map((y) => (
                        <th key={y} className="text-right p-4">{y} BHB</th>
                      ))}
                      <th className="text-left p-4">Pasife Alınma Tarihi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stats.passiveEmployees as any[]).map((emp: any) => {
                      const bhbMap = new Map((emp.bhbByYear ?? []).map((b: any) => [b.year, b.bhb]));
                      return (
                        <tr key={emp.id} className="border-t border-border" data-testid={`passive-employee-row-${emp.id}`}>
                          <td className="p-4 font-medium text-foreground">{emp.name}</td>
                          <td className="p-4 text-muted-foreground">{emp.title ?? "—"}</td>
                          <td className="p-4 text-muted-foreground whitespace-nowrap">
                            {emp.startDate ? new Date(emp.startDate).toLocaleDateString("tr-TR") : "—"}
                          </td>
                          <td className="p-4 text-muted-foreground whitespace-nowrap">
                            {fmtDuration(emp.startDate, emp.passiveAt)}
                          </td>
                          {allYears.map((y) => (
                            <td key={y} className="p-4 text-right font-mono text-foreground whitespace-nowrap">
                              {bhbMap.has(y)
                                ? new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(bhbMap.get(y) as number) + " ₺"
                                : "—"}
                            </td>
                          ))}
                          <td className="p-4 text-muted-foreground whitespace-nowrap">
                            {emp.passiveAt ? new Date(emp.passiveAt).toLocaleDateString("tr-TR") : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>

        {/* ── New Employees ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden" data-testid="new-employees-section">
          <div className="p-5 border-b border-border flex items-start gap-3">
            <div className="rounded-lg p-2 bg-emerald-50 text-emerald-600 shrink-0 mt-0.5"><UserPlus className="h-4 w-4" /></div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-foreground">Yeni Başlayan Danışmanlar</h2>
                {!isLoading && (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-0.5">
                    {stats?.newEmployeeCount ?? 0}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Seçili dönemde sisteme katılan danışmanlar</p>
            </div>
          </div>
          {isLoading ? (
            <div className="px-5 py-4 animate-pulse space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded" />)}
            </div>
          ) : !stats?.newEmployees?.length ? (
            <div className="px-5 py-8 text-sm text-muted-foreground text-center">Bu dönemde sisteme katılan danışman bulunmuyor.</div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-border">
                {stats.newEmployees.map((emp: any) => (
                  <div key={emp.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-foreground">{emp.name}</span>
                      {emp.category ? (
                        <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${
                          emp.category === "K2" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                          emp.category === "K1" ? "bg-amber-50 text-amber-700 ring-amber-200" :
                          "bg-slate-50 text-slate-700 ring-slate-200"
                        }`}>{emp.category}</span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div><span className="font-medium">Bant:</span> {emp.jobTitle ?? "—"}</div>
                      <div><span className="font-medium">Şehir:</span> {emp.city ?? "—"}</div>
                      <div><span className="font-medium">Sözleşme:</span> {emp.contractType ?? "—"}</div>
                      <div><span className="font-medium">KWUID:</span> {emp.kwuid ?? "—"}</div>
                      <div className="col-span-2"><span className="font-medium">Başlangıç:</span> {emp.startDate ? new Date(emp.startDate).toLocaleDateString("tr-TR") : "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-muted-foreground uppercase text-xs">
                    <tr>
                      <th className="text-left p-4">Danışman</th>
                      <th className="text-left p-4">Üretim Bandı</th>
                      <th className="text-left p-4">Şehir</th>
                      <th className="text-left p-4">Kategori</th>
                      <th className="text-left p-4">Sözleşme</th>
                      <th className="text-left p-4">KWUID</th>
                      <th className="text-left p-4">Başlangıç Tarihi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.newEmployees.map((emp: any) => (
                      <tr key={emp.id} className="border-t border-border">
                        <td className="p-4 font-medium text-foreground">{emp.name}</td>
                        <td className="p-4 text-muted-foreground">{emp.jobTitle ?? "—"}</td>
                        <td className="p-4 text-muted-foreground">{emp.city ?? "—"}</td>
                        <td className="p-4">
                          {emp.category ? (
                            <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${
                              emp.category === "K2" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                              emp.category === "K1" ? "bg-amber-50 text-amber-700 ring-amber-200" :
                              "bg-slate-50 text-slate-700 ring-slate-200"
                            }`}>{emp.category}</span>
                          ) : "—"}
                        </td>
                        <td className="p-4 text-muted-foreground">{emp.contractType ?? "—"}</td>
                        <td className="p-4 font-mono text-xs text-muted-foreground">{emp.kwuid ?? "—"}</td>
                        <td className="p-4 text-muted-foreground">
                          {emp.startDate ? new Date(emp.startDate).toLocaleDateString("tr-TR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── New Contract Signers ──────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden" data-testid="new-contract-signers-section">
          <div className="p-5 border-b border-border flex items-start gap-3">
            <div className="rounded-lg p-2 bg-violet-50 text-violet-600 shrink-0 mt-0.5"><FileSignature className="h-4 w-4" /></div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-foreground">Yeni Sözleşme İmzalayanlar</h2>
                {!isLoading && (
                  <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 text-xs font-semibold px-2.5 py-0.5">
                    {stats?.newContractSignerCount ?? 0}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Seçili dönemde sözleşme imzalayan adaylar</p>
            </div>
          </div>
          {isLoading ? (
            <div className="px-5 py-4 animate-pulse space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded" />)}
            </div>
          ) : !stats?.newContractSigners?.length ? (
            <div className="px-5 py-8 text-sm text-muted-foreground text-center">Bu dönemde sözleşme imzalayan aday bulunmuyor.</div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-border">
                {stats.newContractSigners.map((s: any) => (
                  <div key={s.applicationId} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-foreground">{s.candidateName}</span>
                      {s.category ? (
                        <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${
                          s.category === "K2" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                          s.category === "K1" ? "bg-amber-50 text-amber-700 ring-amber-200" :
                          "bg-slate-50 text-slate-700 ring-slate-200"
                        }`}>{s.category}</span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <div><span className="font-medium">Bant:</span> {s.jobTitle ?? "—"}</div>
                      <div><span className="font-medium">Şehir:</span> {s.city ?? "—"}</div>
                      <div className="col-span-2"><span className="font-medium">Sözleşme:</span> {s.signedAt ? new Date(s.signedAt).toLocaleDateString("tr-TR") : "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-muted-foreground uppercase text-xs">
                    <tr>
                      <th className="text-left p-4">Danışman</th>
                      <th className="text-left p-4">Üretim Bandı</th>
                      <th className="text-left p-4">Şehir</th>
                      <th className="text-left p-4">Kategori</th>
                      <th className="text-left p-4">Sözleşme Tarihi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.newContractSigners.map((s: any) => (
                      <tr key={s.applicationId} className="border-t border-border">
                        <td className="p-4 font-medium text-foreground">{s.candidateName}</td>
                        <td className="p-4 text-muted-foreground">{s.jobTitle ?? "—"}</td>
                        <td className="p-4 text-muted-foreground">{s.city ?? "—"}</td>
                        <td className="p-4">
                          {s.category ? (
                            <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${
                              s.category === "K2" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                              s.category === "K1" ? "bg-amber-50 text-amber-700 ring-amber-200" :
                              "bg-slate-50 text-slate-700 ring-slate-200"
                            }`}>{s.category}</span>
                          ) : "—"}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {s.signedAt ? new Date(s.signedAt).toLocaleDateString("tr-TR") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="p-5 border-b border-border flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold">Aktif İlan Performansı</h2></div>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border">
            {(stats?.activeJobPerformance ?? []).map((job: any) => (
              <div key={job.jobId} className="p-4 space-y-2">
                <div className="font-medium text-sm">{job.title}</div>
                <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <div className="text-center"><div className="font-medium text-foreground">{job.applicants}</div><div>Toplam</div></div>
                  <div className="text-center"><div className="font-medium text-foreground">{job.k0}</div><div>K0</div></div>
                  <div className="text-center"><div className="font-medium text-foreground">{job.k1}</div><div>K1</div></div>
                  <div className="text-center"><div className="font-medium text-foreground">{job.k2}</div><div>K2</div></div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground uppercase text-xs">
                <tr>
                  <th className="text-left p-4">İlan Başlığı</th>
                  <th className="text-left p-4">Başvuranlar</th>
                  <th className="text-left p-4">K0</th>
                  <th className="text-left p-4">K1</th>
                  <th className="text-left p-4">K2</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.activeJobPerformance ?? []).map((job: any) => (
                  <tr key={job.jobId} className="border-t border-border">
                    <td className="p-4 font-medium">{job.title}</td>
                    <td className="p-4">{job.applicants}</td>
                    <td className="p-4">{job.k0}</td>
                    <td className="p-4">{job.k1}</td>
                    <td className="p-4">{job.k2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>)} {/* end ise-alim */}
      </div>
    </Layout>
  );
}
