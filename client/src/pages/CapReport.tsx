import { useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Cell, ReferenceLine,
} from "recharts";
import { Trophy, Clock, TrendingUp, Users } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CapRow {
  employeeId: number;
  name: string;
  kwuid: string | null;
  status: string;
  capAmount: number;
  capUsed: number;
  periodStart: string;
  achievedAt: string | null;
  achievementDays: number | null;
  hasCapped: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n) + " ₺";
}
function fmtDays(d: number) {
  const m = Math.floor(d / 30);
  const rem = d % 30;
  if (m === 0) return `${d} gün`;
  if (rem === 0) return `${m} ay`;
  return `${m} ay ${rem} gün`;
}
function monthIndex(periodStart: string, achievedAt: string): number {
  const ps = new Date(periodStart);
  const at = new Date(achievedAt);
  return Math.floor((at.getTime() - ps.getTime()) / (1000 * 60 * 60 * 24 * 30)) + 1;
}

const MONTH_LABELS = ["1. ay", "2. ay", "3. ay", "4. ay", "5. ay", "6. ay",
                      "7. ay", "8. ay", "9. ay", "10. ay", "11. ay", "12. ay"];

const COLORS = ["#10b981","#3b82f6","#f59e0b","#8b5cf6","#ef4444","#06b6d4",
                "#f97316","#84cc16","#ec4899","#14b8a6","#6366f1","#a78bfa"];

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

function Skeleton({ h = "h-64" }: { h?: string }) {
  return <div className={`${h} rounded bg-muted/40 animate-pulse`} />;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CapReport() {
  const { data = [], isLoading, refetch } = useQuery<CapRow[]>({
    queryKey: ["/api/employees/cap-achievement"],
    queryFn: async () => {
      const res = await fetch("/api/employees/cap-achievement", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const capped = useMemo(() => data.filter((r) => r.hasCapped && r.achievementDays !== null), [data]);
  const notCapped = useMemo(() => data.filter((r) => !r.hasCapped), [data]);

  const avgDays = useMemo(() => {
    if (!capped.length) return null;
    return Math.round(capped.reduce((s, r) => s + r.achievementDays!, 0) / capped.length);
  }, [capped]);

  const fastest = useMemo(() => {
    if (!capped.length) return null;
    return capped.reduce((a, b) => a.achievementDays! < b.achievementDays! ? a : b);
  }, [capped]);

  // Distribution: how many capped in each month (1–12)
  const distribution = useMemo(() => {
    const counts = Array.from({ length: 12 }, (_, i) => ({ label: MONTH_LABELS[i], month: i + 1, count: 0 }));
    for (const r of capped) {
      if (!r.achievedAt) continue;
      const m = Math.min(12, Math.max(1, monthIndex(r.periodStart, r.achievedAt)));
      counts[m - 1].count += 1;
    }
    return counts;
  }, [capped]);

  const avgMonths = avgDays !== null ? (avgDays / 30).toFixed(1) : null;
  const avgMonthIndex = avgDays !== null ? Math.round(avgDays / 30) : null;

  return (
    <Layout>
      <div className="space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            Cap Analizi
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Danışmanların mevcut cap periyodunda cap'e ulaşma süreleri</p>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={Clock} color="bg-emerald-50 text-emerald-600"
            label="Ort. Cap Süresi"
            value={avgDays !== null ? fmtDays(avgDays) : "—"}
            sub={avgMonths ? `≈ ${avgMonths} ay` : undefined}
          />
          <MetricCard
            icon={Trophy} color="bg-amber-50 text-amber-600"
            label="Bu Dönem Cap'e Ulaşan"
            value={capped.length}
            sub={`${data.length} danışmandan`}
          />
          <MetricCard
            icon={TrendingUp} color="bg-blue-50 text-blue-600"
            label="En Hızlı Cap"
            value={fastest ? fmtDays(fastest.achievementDays!) : "—"}
            sub={fastest?.name ?? undefined}
          />
          <MetricCard
            icon={Users} color="bg-purple-50 text-purple-600"
            label="Devam Eden"
            value={notCapped.length}
            sub="henüz cap'e ulaşmadı"
          />
        </div>

        {/* Distribution chart — full width */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-semibold mb-1">Cap'e Ulaşılan Ay Dağılımı</h2>
          <p className="text-xs text-muted-foreground mb-4">Periyot başlangıcından kaçıncı ayda cap'e ulaşıldı</p>
          {isLoading ? <Skeleton /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={distribution} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={28} />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-xs">
                        <p className="font-semibold mb-1">{label}</p>
                        <p className="text-emerald-600">{payload[0].value} danışman</p>
                      </div>
                    );
                  }}
                />
                {avgMonthIndex !== null && (
                  <ReferenceLine
                    x={MONTH_LABELS[avgMonthIndex - 1]}
                    stroke="#f59e0b"
                    strokeDasharray="5 3"
                    strokeWidth={2}
                    label={{ value: "Ort.", position: "top", fontSize: 10, fill: "#f59e0b" }}
                  />
                )}
                <Bar dataKey="count" name="Danışman" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  {distribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Detail table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-base font-semibold">Cap Detay Tablosu</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Mevcut periyot — tüm danışmanlar</p>
          </div>
          {isLoading ? (
            <div className="p-5 space-y-2">{[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 bg-muted/40 rounded animate-pulse" />
            ))}</div>
          ) : data.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Veri yok</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-left">#</th>
                    <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-left">Danışman</th>
                    <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-left">KWUID</th>
                    <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-right">Cap Hedefi</th>
                    <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-right">Kullanılan</th>
                    <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-right">İlerleme</th>
                    <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-left">Periyot Başlangıcı</th>
                    <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-right">Cap Tarihi</th>
                    <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-right">Süre</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r, i) => {
                    const pct = r.capAmount > 0 ? Math.min(100, Math.round((r.capUsed / r.capAmount) * 100)) : 0;
                    return (
                      <tr key={r.employeeId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2 px-4 text-xs text-muted-foreground">{i + 1}</td>
                        <td className="py-2 px-4 font-medium">
                          <div className="flex items-center gap-2">
                            {r.hasCapped && <Trophy className="h-3 w-3 text-amber-500 shrink-0" />}
                            {r.name}
                            {r.status === "passive" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">ayrıldı</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-4 text-xs text-muted-foreground">{r.kwuid || "—"}</td>
                        <td className="py-2 px-4 text-right">{fmtTRY(r.capAmount)}</td>
                        <td className="py-2 px-4 text-right font-medium">{fmtTRY(r.capUsed)}</td>
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: r.hasCapped ? "#f59e0b" : pct >= 75 ? "#10b981" : "#3b82f6",
                                }}
                              />
                            </div>
                            <span className={`text-xs font-semibold w-9 text-right ${r.hasCapped ? "text-amber-600" : "text-foreground"}`}>
                              %{pct}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-4 text-xs text-muted-foreground">
                          {new Date(r.periodStart).toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}
                        </td>
                        <td className="py-2 px-4 text-right text-xs">
                          {r.achievedAt
                            ? new Date(r.achievedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="py-2 px-4 text-right">
                          {r.achievementDays !== null ? (
                            <span className={`text-xs font-semibold ${r.achievementDays <= (avgDays ?? Infinity) ? "text-emerald-600" : "text-blue-600"}`}>
                              {fmtDays(r.achievementDays)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {capped.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/30 border-t border-border font-semibold">
                      <td colSpan={8} className="py-2.5 px-4 text-xs text-muted-foreground">
                        Ortalama cap süresi ({capped.length} danışman)
                      </td>
                      <td className="py-2.5 px-4 text-right text-xs text-amber-600 font-bold">
                        {avgDays !== null ? fmtDays(avgDays) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
