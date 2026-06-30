import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ShieldAlert, AlertTriangle, Minus, CheckCircle, TrendingUp, TrendingDown, Building2,
} from "lucide-react";

interface ChurnRow {
  employeeId: number;
  name: string;
  kwuid: string | null;
  category: string | null;
  tenureMonths: number;
  lastClosingDate: string | null;
  daysSinceLast: number | null;
  closings3m: number;
  closingsPrev3m: number;
  trend: "up" | "flat" | "down";
  activeListings: number;
  score: number;
  risk: "high" | "medium" | "low";
}

function RiskBadge({ risk }: { risk: string }) {
  if (risk === "high") return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 ring-1 ring-red-300"><AlertTriangle className="h-3 w-3" /> Yüksek</span>;
  if (risk === "medium") return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-300"><Minus className="h-3 w-3" /> Orta</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"><CheckCircle className="h-3 w-3" /> Düşük</span>;
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <>—</>;
  const cls = category === "K2" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : category === "K1" ? "bg-amber-50 text-amber-700 ring-amber-200"
    : "bg-slate-50 text-slate-700 ring-slate-200";
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${cls}`}>{category}</span>;
}

function ActiveListingCell({ n }: { n: number }) {
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-bold ${n === 0 ? "text-red-600" : n <= 2 ? "text-amber-600" : "text-emerald-600"}`}>
      <Building2 className="h-3.5 w-3.5 opacity-70" />{n}
    </span>
  );
}

function rowCls(risk: string) {
  return `transition-colors ${risk === "high" ? "bg-red-50/40 hover:bg-red-50/70" : risk === "medium" ? "bg-amber-50/30 hover:bg-amber-50/60" : "hover:bg-muted/20"}`;
}

export default function AgentHealth() {
  const { data: churnData = [], isLoading } = useQuery<ChurnRow[]>({
    queryKey: ["/api/reports/churn"],
    queryFn: () => fetch("/api/reports/churn").then((r) => r.json()),
  });

  const { data: teams = [] } = useQuery<{ id: number; name: string; memberIds: number[] }[]>({
    queryKey: ["/api/teams"],
    queryFn: () => fetch("/api/teams", { credentials: "include" }).then(r => r.json()),
  });

  const employeeTeamMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of teams) {
      for (const id of t.memberIds) map.set(id, t.name);
    }
    return map;
  }, [teams]);

  const hadClosings = churnData.filter((r) => r.lastClosingDate !== null && r.risk === "high");
  const neverClosed = churnData.filter((r) => r.lastClosingDate === null && r.risk === "high");
  const highRisk = churnData.filter((r) => r.risk === "high").length;
  const medRisk = churnData.filter((r) => r.risk === "medium").length;
  const lowRisk = churnData.filter((r) => r.risk === "low").length;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" /> Danışman Sağlığı
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Son işlem tarihi ve aktif ilan varlığına göre risk altındaki danışmanlar
            </p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <p className="text-xs font-bold text-red-700 uppercase tracking-wide">Yüksek Risk</p>
            </div>
            <p className="text-3xl font-bold text-red-700">{isLoading ? "…" : highRisk}</p>
            <p className="text-xs text-red-500 mt-1">danışman dikkat gerektiriyor</p>
          </div>
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Minus className="h-4 w-4 text-amber-600" />
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Orta Risk</p>
            </div>
            <p className="text-3xl font-bold text-amber-700">{isLoading ? "…" : medRisk}</p>
            <p className="text-xs text-amber-500 mt-1">danışman takipte</p>
          </div>
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Düşük Risk</p>
            </div>
            <p className="text-3xl font-bold text-emerald-700">{isLoading ? "…" : lowRisk}</p>
            <p className="text-xs text-emerald-500 mt-1">danışman sağlıklı</p>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-border bg-card shadow-sm p-12 text-center text-sm text-muted-foreground">Yükleniyor…</div>
        ) : (<>
          {/* ── Üretim Durağanlığı ── */}
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
                      <th className="text-left px-5 py-3">Takım</th>
                      <th className="text-left px-5 py-3">Risk</th>
                      <th className="text-left px-5 py-3">Son İşlem</th>
                      <th className="text-center px-5 py-3">Son 3 Ay</th>
                      <th className="text-center px-5 py-3">Önceki 3 Ay</th>
                      <th className="text-center px-5 py-3">Aktif İlan</th>
                      <th className="text-center px-5 py-3">Trend</th>
                      <th className="text-left px-5 py-3">Kıdem</th>
                      <th className="text-left px-5 py-3">Kategori</th>
                      <th className="text-right px-5 py-3">Skor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {hadClosings.map((r) => (
                      <tr key={r.employeeId} className={rowCls(r.risk)}>
                        <td className="px-5 py-3">
                          <p className="font-medium">{r.name}</p>
                          {r.kwuid && <p className="text-xs text-muted-foreground font-mono">{r.kwuid}</p>}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {employeeTeamMap.has(r.employeeId)
                            ? <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{employeeTeamMap.get(r.employeeId)}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-5 py-3"><RiskBadge risk={r.risk} /></td>
                        <td className="px-5 py-3">
                          <p>{format(new Date(r.lastClosingDate!), "d MMM yyyy", { locale: tr })}</p>
                          <p className="text-xs text-muted-foreground">{r.daysSinceLast} gün önce</p>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`text-sm font-bold ${r.closings3m === 0 ? "text-red-600" : r.closings3m <= 1 ? "text-amber-600" : "text-emerald-600"}`}>{r.closings3m}</span>
                        </td>
                        <td className="px-5 py-3 text-center text-muted-foreground">{r.closingsPrev3m}</td>
                        <td className="px-5 py-3 text-center"><ActiveListingCell n={r.activeListings} /></td>
                        <td className="px-5 py-3 text-center">
                          {r.trend === "up" && <TrendingUp className="h-4 w-4 text-emerald-600 mx-auto" />}
                          {r.trend === "down" && <TrendingDown className="h-4 w-4 text-red-500 mx-auto" />}
                          {r.trend === "flat" && <Minus className="h-4 w-4 text-muted-foreground mx-auto" />}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{r.tenureMonths < 1 ? "<1 ay" : `${r.tenureMonths} ay`}</td>
                        <td className="px-5 py-3"><CategoryBadge category={r.category} /></td>
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

          {/* ── Henüz İşlem Yapmamış ── */}
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
                      <th className="text-left px-5 py-3">Takım</th>
                      <th className="text-left px-5 py-3">Risk</th>
                      <th className="text-center px-5 py-3">Aktif İlan</th>
                      <th className="text-left px-5 py-3">Kıdem</th>
                      <th className="text-left px-5 py-3">Kategori</th>
                      <th className="text-right px-5 py-3">Skor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {neverClosed.map((r) => (
                      <tr key={r.employeeId} className={rowCls(r.risk)}>
                        <td className="px-5 py-3">
                          <p className="font-medium">{r.name}</p>
                          {r.kwuid && <p className="text-xs text-muted-foreground font-mono">{r.kwuid}</p>}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {employeeTeamMap.has(r.employeeId)
                            ? <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{employeeTeamMap.get(r.employeeId)}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-5 py-3"><RiskBadge risk={r.risk} /></td>
                        <td className="px-5 py-3 text-center"><ActiveListingCell n={r.activeListings} /></td>
                        <td className="px-5 py-3 text-muted-foreground">{r.tenureMonths < 1 ? "<1 ay" : `${r.tenureMonths} ay`}</td>
                        <td className="px-5 py-3"><CategoryBadge category={r.category} /></td>
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
    </Layout>
  );
}
