import { SortTh, SortableRows } from "@/components/SortTh";
import { useState, useMemo, Fragment } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { format, getDaysInMonth, isToday, isFuture, startOfDay } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar, Users, Target } from "lucide-react";
import { CANDIDATE_CATEGORIES } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useInterviews() {
  return useQuery<any[]>({
    queryKey: ["/api/interviews?all=true"],
    queryFn: async () => {
      const res = await fetch("/api/interviews?all=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

function useJobs() {
  return useQuery<any[]>({
    queryKey: ["/api/jobs?all=true"],
    queryFn: async () => {
      const res = await fetch("/api/jobs?all=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

function useTargets(year: number, month: number, office: string) {
  return useQuery<any[]>({
    queryKey: ["/api/interview-targets", year, month, office],
    queryFn: async () => {
      const res = await fetch(`/api/interview-targets?year=${year}&month=${month}&office=${encodeURIComponent(office)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}


interface GrowthTargetValue { brutTargetK0: number; brutTargetK1: number; brutTargetK2: number; netTarget: number; }

// Aylık büyüme hedefi — HM × ofis bazlı (randevu hedefleriyle aynı ofis seçici).
// office verilmezse ("Tümü" seçiliyken) tüm ofislerin toplamı salt-okunur döner.
// HM için kendi hedefi; admin için seçtiği HM'nin hedefi (userId).
// Brüt hedef K0/K1/K2'ye bölünür; Net tek sayı.
function useMyGrowthTarget(year: number, month: number, office: string | undefined, userId?: number | null) {
  return useQuery<GrowthTargetValue>({
    queryKey: ["/api/growth/my-target", year, month, office ?? null, userId ?? null],
    queryFn: async () => {
      const p = new URLSearchParams({ year: String(year), month: String(month) });
      if (office) p.set("office", office);
      if (userId) p.set("userId", String(userId));
      const res = await fetch(`/api/growth/my-target?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

// Admin için: tüm HM'lerin, seçili ofisteki (veya "Tümü" için tüm ofislerin toplam) hedeflerinin dökümü
function useGrowthTargetsByOffice(year: number, month: number, office: string | undefined, enabled: boolean) {
  return useQuery<(GrowthTargetValue & { userId: number })[]>({
    queryKey: ["/api/growth/targets-by-office", year, month, office ?? null],
    queryFn: async () => {
      const p = new URLSearchParams({ year: String(year), month: String(month) });
      if (office) p.set("office", office);
      const res = await fetch(`/api/growth/targets-by-office?${p}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
    enabled,
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CAT_COLORS: Record<string, { badge: string; text: string; bg: string }> = {
  K0: { badge: "bg-blue-100 text-blue-700",    text: "text-blue-600",    bg: "bg-blue-50" },
  K1: { badge: "bg-amber-100 text-amber-700",  text: "text-amber-600",  bg: "bg-amber-50" },
  K2: { badge: "bg-emerald-100 text-emerald-700", text: "text-emerald-600", bg: "bg-emerald-50" },
};

// ── Inline editable target cell ───────────────────────────────────────────────
function TargetCell({ value, onSave, readOnly = false }: { value: number; onSave: (v: number) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value));

  if (readOnly) {
    return (
      <span className="text-xs text-muted-foreground min-w-[24px] text-center" title="Düzenlemek için bir ofis seçin">
        {value > 0 ? value : <span className="opacity-40">—</span>}
      </span>
    );
  }

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
  const [officeFilter, setOfficeFilter] = useState<"all" | "Akatlar" | "Zekeriyaköy">("all");
  const filteredInterviews = useMemo(
    () => officeFilter === "all" ? interviews : interviews.filter((iv: any) => iv.candidate?.office === officeFilter),
    [interviews, officeFilter]
  );
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth(); // 0-based
  const apiMonth = viewMonth + 1; // 1-based for API

  // Targets are stored per office. "Tümü" shows the combined (Akatlar + Zekeriyaköy) sum.
  const isAllOffices = officeFilter === "all";
  const { data: targetsAkatlar = [] } = useTargets(viewYear, apiMonth, "Akatlar");
  const { data: targetsZekeriyakoy = [] } = useTargets(viewYear, apiMonth, "Zekeriyaköy");

  // Büyüme hedefi sadece hiring manager'lar için var olabilir. Admin, randevu hedef
  // tablosuyla birebir aynı yapıda (satır × tıkla-düzenle hücre) tüm HM'leri tek
  // tabloda görüp düzenler; HM ise sadece kendi satırını.
  const isAdmin = user?.role === "admin";
  const { data: hiringManagers = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetch("/api/users", { credentials: "include" }).then((r) => r.ok ? r.json() : []),
    enabled: isAdmin,
    select: (rows) => rows.filter((u) => u.role === "hiring_manager"),
  });
  const growthOffice = isAllOffices ? undefined : officeFilter;
  const { data: growthTargetsRows = [] } = useGrowthTargetsByOffice(viewYear, apiMonth, growthOffice, isAdmin);
  const targetsByUserMap = useMemo(() => {
    const map = new Map<number, GrowthTargetValue>();
    for (const t of growthTargetsRows) {
      map.set(t.userId, { brutTargetK0: t.brutTargetK0, brutTargetK1: t.brutTargetK1, brutTargetK2: t.brutTargetK2, netTarget: t.netTarget });
    }
    return map;
  }, [growthTargetsRows]);

  const { data: myGrowthTarget } = useMyGrowthTarget(viewYear, apiMonth, growthOffice, isAdmin ? null : user?.id ?? null);

  const prevMonth = () => setViewDate(new Date(viewYear, viewMonth - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewYear, viewMonth + 1, 1));
  const daysInMonth = getDaysInMonth(viewDate);

  // Build: jobId → category → actual count (completed interviews this month)
  const actualsByJob = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    for (const iv of filteredInterviews) {
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
  }, [filteredInterviews, viewYear, viewMonth]);

  // Build: jobId → category → target. For "Tümü" sum both offices; otherwise the selected office.
  const targetsByJob = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    const add = (arr: any[]) => {
      for (const t of arr) {
        if (!map[t.jobId]) map[t.jobId] = { K0: 0, K1: 0, K2: 0 };
        map[t.jobId][t.category] = (map[t.jobId][t.category] ?? 0) + t.target;
      }
    };
    if (isAllOffices) { add(targetsAkatlar); add(targetsZekeriyakoy); }
    else if (officeFilter === "Akatlar") add(targetsAkatlar);
    else add(targetsZekeriyakoy);
    return map;
  }, [isAllOffices, officeFilter, targetsAkatlar, targetsZekeriyakoy]);

  // Daily matrix per job (completed only)
  const dailyMatrixByJob = useMemo(() => {
    const result: Record<number, Record<number, Record<string, number>>> = {};
    for (const iv of filteredInterviews) {
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
  }, [filteredInterviews, viewYear, viewMonth, daysInMonth, jobs]);

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
            <div className="flex items-center gap-1 border rounded-md p-0.5 bg-muted/30">
              {(["all", "Akatlar", "Zekeriyaköy"] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setOfficeFilter(o)}
                  className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                    officeFilter === o
                      ? "bg-white dark:bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {o === "all" ? "Tüm Ofisler" : o}
                </button>
              ))}
            </div>
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

        {/* Büyüme hedefi — salt okunur özet; giriş artık Hedef Giriş Modülü'nde */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <Target className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Aylık Büyüme Hedefleri</h2>
            <span className="text-xs text-muted-foreground ml-1">
              {isAllOffices ? "(Tümü = Akatlar + Zekeriyaköy toplamı)" : "(salt okunur)"}
            </span>
            <Link href="/hedef-giris" className="ml-auto text-xs text-primary hover:underline">
              Hedef girişi için Hedef Giriş Modülü →
            </Link>
          </div>

          {(() => {
            const K0K1K2 = CANDIDATE_CATEGORIES as readonly ("K0" | "K1" | "K2")[];
            const catKey = { K0: "brutTargetK0", K1: "brutTargetK1", K2: "brutTargetK2" } as const;
            const brutTotal = (t: GrowthTargetValue) => t.brutTargetK0 + t.brutTargetK1 + t.brutTargetK2;
            const emptyTarget: GrowthTargetValue = { brutTargetK0: 0, brutTargetK1: 0, brutTargetK2: 0, netTarget: 0 };

            // Başlık: sort verilirse tıklanabilir (admin tablosu), verilmezse düz başlık
            const HeaderRow = ({ sort, toggle }: { sort?: any; toggle?: any }) => {
              const H = ({ label, k, align, cls }: { label: string; k: string; align: "left" | "center"; cls: string }) =>
                sort && toggle
                  ? <SortTh label={label} sortKey={k} sort={sort} onSort={toggle} align={align} className={`py-2.5 px-4 ${cls}`} />
                  : <th className={`text-${align} py-2.5 px-4 ${cls}`}>{label}</th>;
              return (
                <tr className="border-b border-border bg-muted/30">
                  <H label={isAdmin ? "Hiring Manager" : "Siz"} k="name" align="left" cls="font-medium text-muted-foreground" />
                  {K0K1K2.map((cat) => <H key={cat} label={cat} k={cat} align="center" cls={`font-semibold ${CAT_COLORS[cat].text}`} />)}
                  <H label="Toplam Brüt" k="brut" align="center" cls="font-medium text-muted-foreground" />
                  <H label="Net Hedef" k="net" align="center" cls="font-medium text-muted-foreground" />
                </tr>
              );
            };

            const Row = ({ name, t }: { name: string; t: GrowthTargetValue }) => (
              <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="py-3 px-4 font-medium text-sm text-foreground whitespace-nowrap">{name}</td>
                {K0K1K2.map((cat) => (
                  <td key={cat} className="py-3 px-4 text-center">
                    <TargetCell value={t[catKey[cat]]} onSave={() => {}} readOnly />
                  </td>
                ))}
                <td className="py-3 px-4 text-center font-medium">{brutTotal(t)}</td>
                <td className="py-3 px-4 text-center">
                  <TargetCell value={t.netTarget} onSave={() => {}} readOnly />
                </td>
              </tr>
            );

            if (isAdmin) {
              if (hiringManagers.length === 0) {
                return <p className="text-sm text-muted-foreground p-6 text-center">Hiring manager bulunamadı</p>;
              }
              const allValues = hiringManagers.map((hm) => targetsByUserMap.get(hm.id) ?? emptyTarget);
              return (
                <div className="overflow-x-auto">
                  <SortableRows
                    rows={hiringManagers}
                    getters={{
                      name: (hm: any) => hm.name,
                      K0: (hm: any) => (targetsByUserMap.get(hm.id) ?? emptyTarget).brutTargetK0,
                      K1: (hm: any) => (targetsByUserMap.get(hm.id) ?? emptyTarget).brutTargetK1,
                      K2: (hm: any) => (targetsByUserMap.get(hm.id) ?? emptyTarget).brutTargetK2,
                      brut: (hm: any) => brutTotal(targetsByUserMap.get(hm.id) ?? emptyTarget),
                      net: (hm: any) => (targetsByUserMap.get(hm.id) ?? emptyTarget).netTarget,
                    }}
                  >{({ sorted, sort, toggle }) => (
                  <table className="w-full text-sm">
                    <thead><HeaderRow sort={sort} toggle={toggle} /></thead>
                    <tbody>
                      {sorted.map((hm) => {
                        const t = targetsByUserMap.get(hm.id) ?? emptyTarget;
                        return <Row key={hm.id} name={hm.name} t={t} />;
                      })}
                      <tr className="bg-muted/20 font-semibold">
                        <td className="py-2.5 px-4">Toplam</td>
                        {K0K1K2.map((cat) => (
                          <td key={cat} className="py-2.5 px-4 text-center">
                            {allValues.reduce((s, t) => s + t[catKey[cat]], 0)}
                          </td>
                        ))}
                        <td className="py-2.5 px-4 text-center">{allValues.reduce((s, t) => s + brutTotal(t), 0)}</td>
                        <td className="py-2.5 px-4 text-center">{allValues.reduce((s, t) => s + t.netTarget, 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                  )}</SortableRows>
                </div>
              );
            }

            const mine = myGrowthTarget ?? emptyTarget;
            return (
              <table className="w-full text-sm">
                <thead><HeaderRow /></thead>
                <tbody>
                  <Row name={user?.name ?? "Siz"} t={mine} />
                </tbody>
              </table>
            );
          })()}
        </div>

        {/* Per-job breakdown + upcoming sidebar */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Per-job table */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
              <Target className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Hedefler</h2>
              <span className="text-xs text-muted-foreground ml-1">
                {isAllOffices ? "(Tümü = Akatlar + Zekeriyaköy toplamı)" : "(salt okunur)"}
              </span>
              <Link href="/hedef-giris" className="ml-auto text-xs text-primary hover:underline">
                Hedef girişi için Hedef Giriş Modülü →
              </Link>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-7 w-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">Pozisyon bulunamadı</p>
            ) : (
              <div className="overflow-x-auto">
                <SortableRows
                  rows={jobs}
                  getters={{
                    title: (job: any) => job.title,
                    K0: (job: any) => actualsByJob[job.id]?.K0 ?? 0, K1: (job: any) => actualsByJob[job.id]?.K1 ?? 0, K2: (job: any) => actualsByJob[job.id]?.K2 ?? 0,
                    total: (job: any) => CANDIDATE_CATEGORIES.reduce((s, c) => s + (actualsByJob[job.id]?.[c] ?? 0), 0),
                  }}
                >{({ sorted, sort, toggle }) => (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <SortTh label="Pozisyon" sortKey="title" sort={sort} onSort={toggle} className="py-2.5 px-4 font-medium text-muted-foreground" />
                      {CANDIDATE_CATEGORIES.map((cat) => (
                        <SortTh
                          key={cat} sortKey={cat} sort={sort} onSort={toggle} align="center" firstDir="desc"
                          className={`py-2.5 px-4 font-semibold ${CAT_COLORS[cat].text}`}
                          label={<span className="inline-block text-center"><span className="block">{cat}</span><span className="block text-[10px] font-normal text-muted-foreground">Fiili / Hedef</span></span>}
                        />
                      ))}
                      <SortTh label="Toplam" sortKey="total" sort={sort} onSort={toggle} align="center" firstDir="desc" className="py-2.5 px-4 font-medium text-muted-foreground" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((job: any) => {
                      const actuals = actualsByJob[job.id] ?? { K0: 0, K1: 0, K2: 0 };
                      const tgts = targetsByJob[job.id] ?? { K0: 0, K1: 0, K2: 0 };
                      const totalActual = CANDIDATE_CATEGORIES.reduce((s, c) => s + actuals[c], 0);
                      const totalTarget = CANDIDATE_CATEGORIES.reduce((s, c) => s + tgts[c], 0);
                      return (
                        <tr key={job.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4">
                            <p className="font-medium text-sm text-foreground truncate max-w-[180px]" title={job.title}>{job.title}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{job.department}</p>
                          </td>
                          {CANDIDATE_CATEGORIES.map((cat) => (
                            <td key={cat} className="py-3 px-4 text-center">
                              <div className="flex flex-col items-center gap-1.5">
                                <Progress actual={actuals[cat]} target={tgts[cat]} />
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <span>Hedef:</span>
                                  <TargetCell value={tgts[cat]} onSave={() => {}} readOnly />
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
                )}</SortableRows>
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
                    <Fragment key={job.id}>
                      {CANDIDATE_CATEGORIES.map((cat) => (
                        <th key={`${job.id}-${cat}`} className={`text-center font-semibold py-1.5 px-3 w-12 ${CAT_COLORS[cat].text} ${cat === "K0" ? "border-l border-border" : ""}`}>{cat}</th>
                      ))}
                      <th className="text-center font-medium text-muted-foreground py-1.5 px-3 w-12">Top.</th>
                    </Fragment>
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
                          <Fragment key={job.id}>
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
                            <td className="py-1.5 px-3 text-center">
                              <span className={`${dayTotal > 0 ? "font-semibold text-foreground" : isFutureDay ? "text-muted-foreground/25" : "text-muted-foreground/40"}`}>
                                {isFutureDay && dayTotal === 0 ? "—" : dayTotal}
                              </span>
                            </td>
                          </Fragment>
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
                      <Fragment key={job.id}>
                        {CANDIDATE_CATEGORIES.map((cat) => (
                          <td key={`${job.id}-${cat}`} className={`py-2 px-3 text-center ${cat === "K0" ? "border-l border-border/50" : ""}`}>
                            <span className={`font-bold ${CAT_COLORS[cat].text}`}>
                              {Object.values(matrix).reduce((s, d) => s + (d[cat] ?? 0), 0)}
                            </span>
                          </td>
                        ))}
                        <td className="py-2 px-3 text-center font-bold text-foreground">
                          {Object.values(matrix).reduce((s, d) => s + CANDIDATE_CATEGORIES.reduce((ss, c) => ss + d[c], 0), 0)}
                        </td>
                      </Fragment>
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
