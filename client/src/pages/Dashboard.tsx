import { useState, useMemo, useCallback } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, getDaysInMonth, isToday, isFuture, startOfDay } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar, Users, Target } from "lucide-react";
import { CANDIDATE_CATEGORIES } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useInterviews() {
  return useQuery<any[]>({
    queryKey: ["/api/interviews"],
    queryFn: async () => {
      const res = await fetch("/api/interviews", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

function useJobs() {
  return useQuery<any[]>({
    queryKey: ["/api/jobs"],
    queryFn: async () => {
      const res = await fetch("/api/jobs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

function useTargets(year: number, month: number) {
  return useQuery<any[]>({
    queryKey: ["/api/interview-targets", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/interview-targets?year=${year}&month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

function useSaveTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { jobId: number; year: number; month: number; category: string; target: number }) => {
      await fetch("/api/interview-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/interview-targets", vars.year, vars.month] });
    },
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, { badge: string; text: string; bg: string }> = {
  K0: { badge: "bg-blue-100 text-blue-700",    text: "text-blue-600",    bg: "bg-blue-50" },
  K1: { badge: "bg-amber-100 text-amber-700",  text: "text-amber-600",  bg: "bg-amber-50" },
  K2: { badge: "bg-emerald-100 text-emerald-700", text: "text-emerald-600", bg: "bg-emerald-50" },
};

// ── Inline editable target cell ───────────────────────────────────────────────
function TargetCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value));

  const commit = () => {
    setEditing(false);
    const n = parseInt(local);
    if (!isNaN(n) && n !== value) onSave(n);
    else setLocal(String(value));
  };

  if (editing) {
    return (
      <input
        type="number"
        min="0"
        autoFocus
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setLocal(String(value)); } }}
        className="w-12 text-center text-xs border border-primary rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
      />
    );
  }

  return (
    <button
      onClick={() => { setLocal(String(value)); setEditing(true); }}
      className="text-xs text-muted-foreground hover:text-foreground hover:underline underline-dotted transition-colors min-w-[24px] text-center"
      title="Hedefi düzenle"
    >
      {value > 0 ? value : <span className="opacity-40">—</span>}
    </button>
  );
}

// ── Progress pill ─────────────────────────────────────────────────────────────
function Progress({ actual, target }: { actual: number; target: number }) {
  if (target === 0) {
    return <span className="text-sm font-semibold text-foreground">{actual > 0 ? actual : "—"}</span>;
  }
  const pct = Math.min(100, Math.round((actual / target) * 100));
  const done = actual >= target;
  const color = done ? "text-emerald-700" : actual > 0 ? "text-amber-700" : "text-muted-foreground";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-sm font-semibold ${color}`}>{actual}/{target}</span>
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${done ? "bg-emerald-500" : actual > 0 ? "bg-amber-500" : "bg-muted-foreground/30"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: user } = useAuth();
  const { data: interviews = [], isLoading: ivLoading } = useInterviews();
  const { data: jobs = [], isLoading: jobsLoading } = useJobs();

  const [viewDate, setViewDate] = useState(new Date());
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth(); // 0-based
  const apiMonth = viewMonth + 1; // 1-based for API

  const { data: targets = [] } = useTargets(viewYear, apiMonth);
  const saveTarget = useSaveTarget();

  const prevMonth = () => setViewDate(new Date(viewYear, viewMonth - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewYear, viewMonth + 1, 1));
  const daysInMonth = getDaysInMonth(viewDate);

  // Build: jobId → category → actual count (completed interviews this month)
  const actualsByJob = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    for (const iv of interviews) {
      if (iv.status !== "completed") continue;
      if (!iv.startTime) continue;
      const d = new Date(iv.startTime);
      if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
      const jid = iv.jobId;
      const cat: string = iv.candidate?.category ?? "K0";
      if (!map[jid]) map[jid] = { K0: 0, K1: 0, K2: 0 };
      if (cat in map[jid]) map[jid][cat]++;
    }
    return map;
  }, [interviews, viewYear, viewMonth]);

  // Build: jobId → category → target
  const targetsByJob = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    for (const t of targets) {
      if (!map[t.jobId]) map[t.jobId] = { K0: 0, K1: 0, K2: 0 };
      map[t.jobId][t.category] = t.target;
    }
    return map;
  }, [targets]);

  const handleSaveTarget = useCallback((jobId: number, category: string, target: number) => {
    saveTarget.mutate({ jobId, year: viewYear, month: apiMonth, category, target });
  }, [saveTarget, viewYear, apiMonth]);

  // Daily matrix per job (completed only)
  const dailyMatrixByJob = useMemo(() => {
    const result: Record<number, Record<number, Record<string, number>>> = {};
    for (const iv of interviews) {
      if (iv.status !== "completed") continue;
      if (!iv.startTime) continue;
      const d = new Date(iv.startTime);
      if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
      const day = d.getDate();
      const cat: string = iv.candidate?.category ?? "K0";
      const jid: number = iv.jobId;
      if (!result[jid]) {
        result[jid] = {};
        for (let dd = 1; dd <= daysInMonth; dd++) result[jid][dd] = { K0: 0, K1: 0, K2: 0 };
      }
      if (result[jid][day] && cat in result[jid][day]) result[jid][day][cat]++;
    }
    // Ensure every job has an entry (even if no interviews)
    for (const job of jobs) {
      if (!result[job.id]) {
        result[job.id] = {};
        for (let dd = 1; dd <= daysInMonth; dd++) result[job.id][dd] = { K0: 0, K1: 0, K2: 0 };
      }
    }
    return result;
  }, [interviews, viewYear, viewMonth, daysInMonth, jobs]);

  // Grand totals for KPI cards
  const grandActuals = useMemo(() => {
    const t: Record<string, number> = { K0: 0, K1: 0, K2: 0 };
    Object.values(actualsByJob).forEach((jm) => {
      CANDIDATE_CATEGORIES.forEach((c) => { t[c] += jm[c] ?? 0; });
    });
    return t;
  }, [actualsByJob]);

  const grandTargets = useMemo(() => {
    const t: Record<string, number> = { K0: 0, K1: 0, K2: 0 };
    Object.values(targetsByJob).forEach((jm) => {
      CANDIDATE_CATEGORIES.forEach((c) => { t[c] += jm[c] ?? 0; });
    });
    return t;
  }, [targetsByJob]);

  // Upcoming interviews — admins see all, HMs see only their assigned jobs
  const upcoming = useMemo(() => {
    const now = new Date();
    const assignedJobIds: number[] = user?.assignedJobIds ?? [];
    const isAdmin = user?.role === "admin";
    return interviews
      .filter((iv) => {
        if (!iv.startTime || new Date(iv.startTime) < now) return false;
        if (isAdmin) return true;
        return assignedJobIds.length === 0 || assignedJobIds.includes(iv.jobId);
      })
      .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 6);
  }, [interviews, user]);

  const isLoading = ivLoading || jobsLoading;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header + month nav */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Aylık görüşme takibi</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
            <span className="text-sm font-semibold w-36 text-center">
              {format(viewDate, "MMMM yyyy", { locale: tr })}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded hover:bg-muted transition-colors">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([...CANDIDATE_CATEGORIES, "Toplam"] as const).map((cat) => {
            const actual = cat === "Toplam"
              ? CANDIDATE_CATEGORIES.reduce((s, c) => s + grandActuals[c], 0)
              : grandActuals[cat as string];
            const target = cat === "Toplam"
              ? CANDIDATE_CATEGORIES.reduce((s, c) => s + grandTargets[c], 0)
              : grandTargets[cat as string];
            const done = target > 0 && actual >= target;
            const colors = cat === "Toplam"
              ? { badge: "bg-purple-100 text-purple-700", text: "text-purple-600" }
              : CAT_COLORS[cat as string];
            return (
              <div key={cat} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${colors.badge}`}>{cat}</span>
                  {done && <span className="text-[10px] text-emerald-600 font-medium">✓ Hedef tamam</span>}
                </div>
                <p className={`text-2xl font-bold ${colors.text}`}>{actual}</p>
                {target > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {target} hedefin <span className="font-medium">{Math.round((actual / target) * 100)}%</span>'i
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Per-job breakdown + upcoming sidebar */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Per-job table */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
              <Target className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Pozisyon Bazlı Hedefler</h2>
              <span className="text-xs text-muted-foreground ml-1">(hedef rakamına tıklayarak düzenleyin)</span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">Pozisyon bulunamadı</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left font-medium text-muted-foreground py-2.5 px-4">Pozisyon</th>
                      {CANDIDATE_CATEGORIES.map((cat) => (
                        <th key={cat} className={`text-center font-semibold py-2.5 px-4 ${CAT_COLORS[cat].text}`}>
                          <div>{cat}</div>
                          <div className="text-[10px] font-normal text-muted-foreground">Fiili / Hedef</div>
                        </th>
                      ))}
                      <th className="text-center font-medium text-muted-foreground py-2.5 px-4">Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job: any) => {
                      const actuals = actualsByJob[job.id] ?? { K0: 0, K1: 0, K2: 0 };
                      const tgts = targetsByJob[job.id] ?? { K0: 0, K1: 0, K2: 0 };
                      const totalActual = CANDIDATE_CATEGORIES.reduce((s, c) => s + actuals[c], 0);
                      const totalTarget = CANDIDATE_CATEGORIES.reduce((s, c) => s + tgts[c], 0);
                      return (
                        <tr key={job.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4">
                            <p className="font-medium text-sm text-foreground truncate max-w-[180px]">{job.title}</p>
                            <p className="text-xs text-muted-foreground">{job.department}</p>
                          </td>
                          {CANDIDATE_CATEGORIES.map((cat) => (
                            <td key={cat} className="py-3 px-4">
                              <div className="flex flex-col items-center gap-1.5">
                                <Progress actual={actuals[cat]} target={tgts[cat]} />
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <span>Hedef:</span>
                                  <TargetCell
                                    value={tgts[cat]}
                                    onSave={(v) => handleSaveTarget(job.id, cat, v)}
                                  />
                                </div>
                              </div>
                            </td>
                          ))}
                          <td className="py-3 px-4 text-center">
                            <Progress actual={totalActual} target={totalTarget} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Upcoming interviews */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Yaklaşan Görüşmeler
              </h2>
              <Link href="/interviews" className="text-xs text-primary hover:underline">Tümü</Link>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto">
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Planlanmış görüşme yok</p>
              ) : (
                upcoming.map((iv: any) => {
                  const cat: string = iv.candidate?.category ?? "K0";
                  return (
                    <div key={iv.id} className="flex items-start gap-3">
                      <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold shrink-0 mt-0.5 ${CAT_COLORS[cat].badge}`}>{cat}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{iv.candidate?.name ?? "Aday"}</p>
                        <p className="text-xs text-muted-foreground truncate">{iv.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {iv.startTime ? format(new Date(iv.startTime), "d MMM, HH:mm", { locale: tr }) : "TBD"}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Per-job daily calendars side by side */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Günlük Görüşme Takvimi</h2>
            <span className="text-xs text-muted-foreground ml-1">(tamamlanan görüşmeler, pozisyon bazlı)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-border bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground py-2 px-3 sticky left-0 bg-muted/30 z-10 w-28" rowSpan={2}>Tarih</th>
                  {jobs.map((job: any) => (
                    <th key={job.id} colSpan={4} className="text-center font-semibold text-foreground py-2 px-3 border-l border-border">
                      {job.title}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-border bg-muted/20">
                  {jobs.map((job: any) => (
                    <>
                      {CANDIDATE_CATEGORIES.map((cat) => (
                        <th key={`${job.id}-${cat}`} className={`text-center font-semibold py-1.5 px-3 w-12 ${CAT_COLORS[cat].text} ${cat === "K0" ? "border-l border-border" : ""}`}>{cat}</th>
                      ))}
                      <th key={`${job.id}-total`} className="text-center font-medium text-muted-foreground py-1.5 px-3 w-12">Top.</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const date = new Date(viewYear, viewMonth, day);
                  const isCurrentDay = isToday(date);
                  const isFutureDay = isFuture(startOfDay(date));
                  return (
                    <tr key={day} className={`border-b border-border/40 ${isCurrentDay ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                      <td className={`py-1.5 px-3 sticky left-0 z-10 whitespace-nowrap ${isCurrentDay ? "bg-primary/5" : "bg-card"}`}>
                        <span className={`text-[11px] mr-1.5 ${isCurrentDay ? "text-primary font-bold" : "text-muted-foreground"}`}>
                          {format(date, "EEE", { locale: tr })}
                        </span>
                        <span className={`text-xs ${isCurrentDay ? "font-bold text-primary" : "text-foreground"}`}>
                          {day} {format(date, "MMM", { locale: tr })}
                        </span>
                      </td>
                      {jobs.map((job: any) => {
                        const matrix = dailyMatrixByJob[job.id] ?? {};
                        const dayData = matrix[day] ?? { K0: 0, K1: 0, K2: 0 };
                        const dayTotal = CANDIDATE_CATEGORIES.reduce((s, c) => s + dayData[c], 0);
                        return (
                          <>
                            {CANDIDATE_CATEGORIES.map((cat) => {
                              const count = dayData[cat];
                              return (
                                <td key={`${job.id}-${cat}`} className={`py-1.5 px-3 text-center ${cat === "K0" ? "border-l border-border/50" : ""}`}>
                                  {isFutureDay && count === 0 ? (
                                    <span className="text-muted-foreground/25">—</span>
                                  ) : count > 0 ? (
                                    <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full font-semibold ${CAT_COLORS[cat].badge}`}>{count}</span>
                                  ) : (
                                    <span className="text-muted-foreground/40">0</span>
                                  )}
                                </td>
                              );
                            })}
                            <td key={`${job.id}-total`} className="py-1.5 px-3 text-center">
                              <span className={`${dayTotal > 0 ? "font-semibold text-foreground" : isFutureDay ? "text-muted-foreground/25" : "text-muted-foreground/40"}`}>
                                {isFutureDay && dayTotal === 0 ? "—" : dayTotal}
                              </span>
                            </td>
                          </>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/40 border-t-2 border-border font-semibold">
                  <td className="py-2 px-3 sticky left-0 bg-muted/40 z-10 text-xs">Aylık Toplam</td>
                  {jobs.map((job: any) => {
                    const matrix = dailyMatrixByJob[job.id] ?? {};
                    return (
                      <>
                        {CANDIDATE_CATEGORIES.map((cat) => (
                          <td key={`${job.id}-${cat}`} className={`py-2 px-3 text-center ${cat === "K0" ? "border-l border-border/50" : ""}`}>
                            <span className={`font-bold ${CAT_COLORS[cat].text}`}>
                              {Object.values(matrix).reduce((s, d) => s + (d[cat] ?? 0), 0)}
                            </span>
                          </td>
                        ))}
                        <td key={`${job.id}-total`} className="py-2 px-3 text-center font-bold text-foreground">
                          {Object.values(matrix).reduce((s, d) => s + CANDIDATE_CATEGORIES.reduce((ss, c) => ss + d[c], 0), 0)}
                        </td>
                      </>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>
    </Layout>
  );
}
