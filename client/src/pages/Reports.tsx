import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useReportStats } from "@/hooks/use-stats";
import { STAGE_COLORS } from "@/components/StatusBadge";
import { STAGE_LABELS } from "@shared/schema";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, AreaChart, Area, CartesianGrid } from "recharts";
import { Calendar, Clock, TrendingUp, Users, CheckCircle, DollarSign, Briefcase, Activity, TimerReset, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const RANGES = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

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

export default function Reports() {
  const [activeDays, setActiveDays] = useState(30);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [fromDate, setFromDate] = useState(formatDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [toDate, setToDate] = useState(formatDateInput(new Date()));

  const computedStart = useCustomRange ? fromDate : formatDateInput(new Date(Date.now() - activeDays * 24 * 60 * 60 * 1000));
  const computedEnd = useCustomRange ? toDate : formatDateInput(new Date());
  const { data: stats, isLoading } = useReportStats(computedStart, computedEnd);

  const funnelData = (stats?.funnel ?? []).filter((f: any) => f.stage !== "rejected");
  const stageTimes = (stats?.stageTimes ?? []).filter((s: any) => s.stage !== "rejected");
  const maxStage = Math.max(...stageTimes.map((t: any) => t.avgDays), 1);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Reports &amp; Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Insights into your recruitment pipeline</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Button variant={useCustomRange ? "outline" : "default"} size="sm" onClick={() => setUseCustomRange(false)} data-testid="btn-range-presets">Presets</Button>
            <Button variant={useCustomRange ? "default" : "outline"} size="sm" onClick={() => setUseCustomRange(true)} data-testid="btn-range-custom">Custom Range</Button>
            {!useCustomRange && RANGES.map((r) => (
              <Button key={r.days} size="sm" variant={activeDays === r.days ? "default" : "outline"} onClick={() => setActiveDays(r.days)} data-testid={`btn-range-${r.days}`}>{r.label}</Button>
            ))}
            {useCustomRange && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[140px]" data-testid="input-report-from" />
                <span className="text-xs text-muted-foreground">to</span>
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
            <div className="overflow-x-auto">
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

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="p-5 border-b border-border flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold">Aktif İlan Performansı</h2></div>
          <div className="overflow-x-auto">
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
      </div>
    </Layout>
  );
}
