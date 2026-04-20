import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { format, getDaysInMonth, startOfMonth, endOfMonth, isToday, isFuture, startOfDay } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Calendar, ChevronLeft, ChevronRight, ChevronRight as ArrowRight, Users,
} from "lucide-react";
import { CANDIDATE_CATEGORIES } from "@shared/schema";

// ── Data hooks ────────────────────────────────────────────────────────────────
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

// ── Category badge colors ─────────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  K0: "bg-blue-100 text-blue-700",
  K1: "bg-amber-100 text-amber-700",
  K2: "bg-emerald-100 text-emerald-700",
};

const CAT_HEADER: Record<string, string> = {
  K0: "text-blue-600",
  K1: "text-amber-600",
  K2: "text-emerald-600",
};

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: interviews = [], isLoading } = useInterviews();

  // Month navigation
  const [viewDate, setViewDate] = useState(new Date());
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth(); // 0-based

  const prevMonth = () => setViewDate(new Date(viewYear, viewMonth - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewYear, viewMonth + 1, 1));

  const daysInMonth = getDaysInMonth(viewDate);

  // Build day × category matrix
  const matrix = useMemo(() => {
    // matrix[day] = { K0: n, K1: n, K2: n }  day is 1-based
    const m: Record<number, Record<string, number>> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      m[d] = { K0: 0, K1: 0, K2: 0 };
    }
    for (const iv of interviews) {
      if (!iv.startTime) continue;
      const d = new Date(iv.startTime);
      if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
      const day = d.getDate();
      const cat: string = iv.candidate?.category ?? "K0";
      if (m[day] && cat in m[day]) {
        m[day][cat]++;
      }
    }
    return m;
  }, [interviews, viewYear, viewMonth, daysInMonth]);

  // Monthly totals
  const totals = useMemo(() => {
    const t: Record<string, number> = { K0: 0, K1: 0, K2: 0 };
    for (let d = 1; d <= daysInMonth; d++) {
      for (const cat of CANDIDATE_CATEGORIES) {
        t[cat] += matrix[d][cat];
      }
    }
    return t;
  }, [matrix, daysInMonth]);

  const grandTotal = CANDIDATE_CATEGORIES.reduce((s, c) => s + totals[c], 0);

  // Upcoming interviews (next 5)
  const upcoming = useMemo(() => {
    const now = new Date();
    return interviews
      .filter((iv) => iv.startTime && new Date(iv.startTime) >= now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 6);
  }, [interviews]);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Aylık görüşme takibi
          </p>
        </div>

        {/* Monthly KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {([...CANDIDATE_CATEGORIES, "Toplam"] as const).map((cat) => {
            const count = cat === "Toplam" ? grandTotal : totals[cat as string];
            const colorClass = cat === "Toplam"
              ? "bg-purple-100 text-purple-700"
              : CAT_COLORS[cat as string];
            return (
              <div key={cat} className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-center gap-3">
                <div className={`rounded-lg px-2.5 py-1 text-sm font-bold ${colorClass}`}>{cat}</div>
                <div>
                  <p className="text-xs text-muted-foreground">{format(viewDate, "MMMM", { locale: tr })}</p>
                  <p className="text-2xl font-bold text-foreground">{count}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Main layout: table + sidebar */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Daily interview table */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {/* Table header with month nav */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Günlük Görüşme Takibi
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={prevMonth}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-medium w-32 text-center">
                  {format(viewDate, "MMMM yyyy", { locale: tr })}
                </span>
                <button
                  onClick={nextMonth}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left font-medium text-muted-foreground py-2.5 px-4 w-16">Gün</th>
                      <th className="text-left font-medium text-muted-foreground py-2.5 px-3 w-24">Tarih</th>
                      {CANDIDATE_CATEGORIES.map((cat) => (
                        <th key={cat} className={`text-center font-semibold py-2.5 px-4 w-20 ${CAT_HEADER[cat]}`}>
                          {cat}
                        </th>
                      ))}
                      <th className="text-center font-medium text-muted-foreground py-2.5 px-4 w-20">Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                      const date = new Date(viewYear, viewMonth, day);
                      const isCurrentDay = isToday(date);
                      const dayTotal = CANDIDATE_CATEGORIES.reduce((s, c) => s + matrix[day][c], 0);
                      const isFutureDay = isFuture(startOfDay(date));

                      return (
                        <tr
                          key={day}
                          className={`border-b border-border/50 transition-colors ${
                            isCurrentDay
                              ? "bg-primary/5 border-l-2 border-l-primary"
                              : "hover:bg-muted/30"
                          }`}
                        >
                          <td className="py-2 px-4">
                            <span className={`text-xs font-medium ${isCurrentDay ? "text-primary font-bold" : "text-muted-foreground"}`}>
                              {format(date, "EEE", { locale: tr })}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span className={`text-sm ${isCurrentDay ? "font-bold text-primary" : "text-foreground"}`}>
                              {day} {format(date, "MMM", { locale: tr })}
                            </span>
                          </td>
                          {CANDIDATE_CATEGORIES.map((cat) => {
                            const count = matrix[day][cat];
                            return (
                              <td key={cat} className="py-2 px-4 text-center">
                                {isFutureDay && count === 0 ? (
                                  <span className="text-muted-foreground/40 text-xs">—</span>
                                ) : count > 0 ? (
                                  <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold ${CAT_COLORS[cat]}`}>
                                    {count}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">0</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2 px-4 text-center">
                            {isFutureDay && dayTotal === 0 ? (
                              <span className="text-muted-foreground/40 text-xs">—</span>
                            ) : (
                              <span className={`text-sm font-semibold ${dayTotal > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>
                                {dayTotal > 0 ? dayTotal : "0"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 border-t-2 border-border">
                      <td colSpan={2} className="py-2.5 px-4 text-sm font-semibold text-foreground">
                        Aylık Toplam
                      </td>
                      {CANDIDATE_CATEGORIES.map((cat) => (
                        <td key={cat} className="py-2.5 px-4 text-center">
                          <span className={`text-sm font-bold ${CAT_HEADER[cat]}`}>{totals[cat]}</span>
                        </td>
                      ))}
                      <td className="py-2.5 px-4 text-center">
                        <span className="text-sm font-bold text-foreground">{grandTotal}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Sidebar: Upcoming interviews */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Yaklaşan Görüşmeler
              </h2>
              <Link href="/interviews" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                Tümü <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto">
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Planlanmış görüşme yok</p>
              ) : (
                upcoming.map((iv: any) => {
                  const cat: string = iv.candidate?.category ?? "K0";
                  return (
                    <div key={iv.id} className="flex items-start gap-3">
                      <div className={`rounded-md px-1.5 py-0.5 text-xs font-bold shrink-0 mt-0.5 ${CAT_COLORS[cat]}`}>
                        {cat}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {iv.candidate?.name ?? "Aday"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {iv.title}
                        </p>
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
      </div>
    </Layout>
  );
}
