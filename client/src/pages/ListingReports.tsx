import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  BarChart2, Building2, Users, TrendingDown, TrendingUp, Bell, RefreshCw,
  ChevronLeft, ChevronRight, Search, Clock, LayoutDashboard, Settings,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdvisorReport {
  employeeId: number | null;
  advisorName: string | null;
  employeeName: string | null;
  totalActive: number;
  totalPassive: number;
  agreementUploaded: number;
  agreementPending: number;
  closeReasonSubmitted: number;
  closeReasonPending: number;
  noAgreementCount: number;
  closingCount: number;
  lastClosingDate: string | null;
}

type AdvisorSortKey = "displayName" | "totalActive" | "totalPassive" | "agreementUploaded" |
  "agreementPending" | "noAgreementCount" | "closeReasonSubmitted" | "closeReasonPending" |
  "closingCount" | "lastClosingDate";

interface DisplayRow {
  isTeam: boolean;
  displayName: string;
  memberCount?: number;
  subName?: string | null;
  hasEmployeeId?: boolean;
  totalActive: number;
  totalPassive: number;
  agreementUploaded: number;
  agreementPending: number;
  noAgreementCount: number;
  closeReasonSubmitted: number;
  closeReasonPending: number;
  closingCount: number;
  lastClosingDate: string | null;
}

interface OfficeReport {
  office: string | null;
  totalActive: number;
  totalPassive: number;
  agreementUploaded: number;
  closeReasonSubmitted: number;
}

interface CloseReasonStat {
  closeReason: string;
  count: number;
}

interface MonthlyTrend {
  month: string;
  newActive: number;
  newPassive: number;
}

interface TypeStats {
  satilik: { active: number; passive: number; activeVolume: number; passiveVolume: number };
  kiralik: { active: number; passive: number; activeVolume: number; passiveVolume: number };
}

interface DateReportRow {
  month: string;
  satilikActive: number; satilikPassive: number; satilikVolume: number;
  kiralikActive: number; kiralikPassive: number; kiralikVolume: number;
}

interface Over90DayListing {
  id: number;
  listingNumber: string;
  advisorName: string | null;
  employeeName: string | null;
  office: string | null;
  price: string | null;
  publishedDate: string | null;
  daysActive: number;
}

interface AgeGroupRow {
  label: string; order: number;
  count: number; volume: number;
  satilikCount: number; satilikVolume: number;
  kiralikCount: number; kiralikVolume: number;
}

const AGE_COLORS = ["#22c55e","#84cc16","#eab308","#f97316","#ef4444","#dc2626","#7f1d1d"];
const PAGE_SIZE = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtVol(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(".", ",") + " Mr ₺";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1).replace(".", ",") + " M ₺";
  if (n >= 1_000)         return (n / 1_000).toFixed(0) + " K ₺";
  return n.toLocaleString("tr-TR") + " ₺";
}

function fmtMonth(ym: string): string {
  const [year, month] = ym.split("-");
  const monthNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const m = parseInt(month, 10);
  return `${monthNames[m - 1] ?? month} ${year}`;
}

function SectionCard({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

type TabKey = "genel" | "danismanlar" | "yas" | "trend" | "kalkis" | "ayarlar";

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ListingReports() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("genel");

  // ── Reminder settings ──
  const [agreementDays, setAgreementDays] = useState(3);
  const [closeReasonDays, setCloseReasonDays] = useState(3);
  const [runningReminders, setRunningReminders] = useState(false);
  const [reminderResult, setReminderResult] = useState<{ agreementQueued: number; closeReasonQueued: number } | null>(null);

  // ── Advisor table sort + pagination + search + team filter ──
  const [sortKey, setSortKey] = useState<AdvisorSortKey>("totalActive");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [advisorPage, setAdvisorPage] = useState(0);
  const [advisorSearch, setAdvisorSearch] = useState("");

  // ── Over-90 sort + pagination + office filter ──
  type Over90SortKey = "listingNumber" | "employeeName" | "office" | "price" | "daysActive";
  const [o90Sort, setO90Sort] = useState<{ key: Over90SortKey; dir: "asc" | "desc" }>({ key: "daysActive", dir: "desc" });
  const [o90Page, setO90Page] = useState(0);
  const [o90OfficeFilter, setO90OfficeFilter] = useState<string>("all");

  // ── Data queries ──
  const { data: advisorData = [], isLoading: loadingAdvisor } = useQuery<AdvisorReport[]>({
    queryKey: ["/api/listings/reports/advisor"],
    queryFn: () => fetch("/api/listings/reports/advisor", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: officeData = [], isLoading: loadingOffice } = useQuery<OfficeReport[]>({
    queryKey: ["/api/listings/reports/office"],
    queryFn: () => fetch("/api/listings/reports/office", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: closeReasonData = [], isLoading: loadingCloseReason } = useQuery<CloseReasonStat[]>({
    queryKey: ["/api/listings/reports/close-reasons"],
    queryFn: () => fetch("/api/listings/reports/close-reasons", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: trendData = [], isLoading: loadingTrend } = useQuery<MonthlyTrend[]>({
    queryKey: ["/api/listings/reports/monthly-trend"],
    queryFn: () => fetch("/api/listings/reports/monthly-trend", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: typeStats, isLoading: loadingTypeStats } = useQuery<TypeStats>({
    queryKey: ["/api/listings/reports/type-stats"],
    queryFn: () => fetch("/api/listings/reports/type-stats", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: dateReport = [], isLoading: loadingDateReport } = useQuery<DateReportRow[]>({
    queryKey: ["/api/listings/reports/date-report"],
    queryFn: () => fetch("/api/listings/reports/date-report", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: over90Data = [], isLoading: loadingOver90 } = useQuery<Over90DayListing[]>({
    queryKey: ["/api/listings/reports/over-90-days"],
    queryFn: () => fetch("/api/listings/reports/over-90-days", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: ageGroups = [], isLoading: loadingAgeGroups } = useQuery<AgeGroupRow[]>({
    queryKey: ["/api/listings/reports/age-groups"],
    queryFn: () => fetch("/api/listings/reports/age-groups", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: teams = [] } = useQuery<{ id: number; name: string; memberIds: number[] }[]>({
    queryKey: ["/api/teams"],
    queryFn: () => fetch("/api/teams", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });

  // ── Derived data ──

  const employeeTeamMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of teams) {
      for (const id of t.memberIds) map.set(id, t.name);
    }
    return map;
  }, [teams]);

  const sortedAdvisors = useMemo((): DisplayRow[] => {
    const teamAggMap = new Map<string, DisplayRow>();
    const individuals: DisplayRow[] = [];

    for (const r of advisorData) {
      const teamName = r.employeeId != null ? employeeTeamMap.get(r.employeeId) : undefined;
      if (teamName) {
        if (!teamAggMap.has(teamName)) {
          teamAggMap.set(teamName, {
            isTeam: true, displayName: teamName, memberCount: 0,
            totalActive: 0, totalPassive: 0, agreementUploaded: 0, agreementPending: 0,
            noAgreementCount: 0, closeReasonSubmitted: 0, closeReasonPending: 0,
            closingCount: 0, lastClosingDate: null,
          });
        }
        const agg = teamAggMap.get(teamName)!;
        agg.memberCount = (agg.memberCount ?? 0) + 1;
        agg.totalActive += r.totalActive;
        agg.totalPassive += r.totalPassive;
        agg.agreementUploaded += r.agreementUploaded;
        agg.agreementPending += r.agreementPending;
        agg.noAgreementCount += r.noAgreementCount;
        agg.closeReasonSubmitted += r.closeReasonSubmitted;
        agg.closeReasonPending += r.closeReasonPending;
        agg.closingCount += r.closingCount;
        if (r.lastClosingDate && (!agg.lastClosingDate || r.lastClosingDate > agg.lastClosingDate)) {
          agg.lastClosingDate = r.lastClosingDate;
        }
      } else {
        individuals.push({
          isTeam: false,
          displayName: r.employeeName ?? r.advisorName ?? "—",
          subName: r.employeeName && r.advisorName && r.employeeName !== r.advisorName ? r.advisorName : null,
          hasEmployeeId: r.employeeId != null,
          totalActive: r.totalActive, totalPassive: r.totalPassive,
          agreementUploaded: r.agreementUploaded, agreementPending: r.agreementPending,
          noAgreementCount: r.noAgreementCount, closeReasonSubmitted: r.closeReasonSubmitted,
          closeReasonPending: r.closeReasonPending, closingCount: r.closingCount,
          lastClosingDate: r.lastClosingDate,
        });
      }
    }

    const q = advisorSearch.toLowerCase().trim();
    const allRows: DisplayRow[] = [...Array.from(teamAggMap.values()), ...individuals];
    const filtered = q ? allRows.filter(r => r.displayName.toLowerCase().includes(q)) : allRows;

    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [advisorData, sortKey, sortDir, advisorSearch, employeeTeamMap]);

  const advisorPageCount = Math.ceil(sortedAdvisors.length / PAGE_SIZE);
  const advisorPageRows = sortedAdvisors.slice(advisorPage * PAGE_SIZE, (advisorPage + 1) * PAGE_SIZE);

  const toggleSort = (key: AdvisorSortKey) => {
    setAdvisorPage(0);
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const toggleO90Sort = (key: Over90SortKey) => {
    setO90Page(0);
    setO90Sort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  };

  const o90Offices = useMemo(() =>
    Array.from(new Set(over90Data.map(r => r.office ?? "—"))).sort(),
    [over90Data]
  );

  const sortedO90 = useMemo(() => {
    const filtered = o90OfficeFilter === "all"
      ? over90Data
      : over90Data.filter(r => (r.office ?? "—") === o90OfficeFilter);
    return [...filtered].sort((a, b) => {
      const key = o90Sort.key;
      const av = key === "price" ? Number(a.price ?? 0) : key === "employeeName" ? (a.employeeName ?? a.advisorName ?? "") : (a as any)[key];
      const bv = key === "price" ? Number(b.price ?? 0) : key === "employeeName" ? (b.employeeName ?? b.advisorName ?? "") : (b as any)[key];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return o90Sort.dir === "asc" ? cmp : -cmp;
    });
  }, [over90Data, o90Sort, o90OfficeFilter]);

  const o90PageCount = Math.ceil(sortedO90.length / PAGE_SIZE);
  const o90PageRows = sortedO90.slice(o90Page * PAGE_SIZE, (o90Page + 1) * PAGE_SIZE);

  const totalCloseReasons = closeReasonData.reduce((s, r) => s + r.count, 0);

  // ── Sort header components ──

  const SortTh = ({ col, label }: { col: AdvisorSortKey; label: string }) => (
    <th
      className="px-3 py-2.5 font-medium text-right cursor-pointer select-none hover:text-foreground whitespace-nowrap"
      onClick={() => toggleSort(col)}
    >
      {label}{sortKey === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  const O90Th = ({ col, label, align = "right" }: { col: Over90SortKey; label: string; align?: "left" | "right" }) => (
    <th
      className={`px-3 py-2.5 font-medium cursor-pointer select-none hover:text-foreground whitespace-nowrap text-${align}`}
      onClick={() => toggleO90Sort(col)}
    >
      {label}{o90Sort.key === col ? (o90Sort.dir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
    if (total <= 1) return null;
    return (
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border text-xs text-muted-foreground">
        <button onClick={() => onPage(page - 1)} disabled={page === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <span>{page + 1} / {total}</span>
        <button onClick={() => onPage(page + 1)} disabled={page >= total - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
    );
  }

  const handleRunReminders = async () => {
    setRunningReminders(true);
    setReminderResult(null);
    try {
      const res = await fetch("/api/listings/reminders/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agreementDays, closeReasonDays }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Hata", description: data.message, variant: "destructive" });
        return;
      }
      setReminderResult(data);
      toast({
        title: "Hatırlatmalar gönderiliyor",
        description: `Sözleşme: ${data.agreementQueued}, Kalkış sebebi: ${data.closeReasonQueued} ilan`,
      });
    } catch {
      toast({ title: "Hata", description: "İstek gönderilemedi.", variant: "destructive" });
    } finally {
      setRunningReminders(false);
    }
  };

  // ── Tab definitions ──

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "genel",       label: "Genel Bakış",      icon: LayoutDashboard },
    { key: "danismanlar", label: "Danışman Raporu",   icon: Users },
    { key: "yas",         label: "Portföy Yaşı",      icon: Clock },
    { key: "trend",       label: "Trend & Tarih",     icon: TrendingUp },
    { key: "kalkis",      label: "Kalkış Analizi",    icon: TrendingDown },
    { key: "ayarlar",     label: "Ayarlar",            icon: Settings },
  ];

  return (
    <Layout>
      <div className="space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" />
            İlan Raporları
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Danışman, ofis ve kalkış sebebi bazlı detaylı ilan analizleri
          </p>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Genel Bakış ──────────────────────────────────────────────── */}
        {activeTab === "genel" && (
          <div className="space-y-6">

            {/* Aylık Trend Chart */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Aylık Trend ({new Date().getFullYear()})</h2>
              </div>
              <div className="p-4">
                {loadingTrend ? (
                  <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">Yükleniyor…</div>
                ) : trendData.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">Veri yok.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={trendData.map(r => ({ ay: fmtMonth(r.month), "Yeni Aktif": r.newActive, "Yeni Pasif": r.newPassive }))} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="ay" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                        cursor={{ fill: "hsl(var(--muted))" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Yeni Aktif" fill="#10b981" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Yeni Pasif" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Top 10 Danışman + Donut */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                  <Users className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">En Çok Aktif İlan — Top 10 Danışman</h2>
                </div>
                <div className="p-4">
                  {loadingAdvisor ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Yükleniyor…</div>
                  ) : advisorData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Veri yok.</div>
                  ) : (() => {
                    const chartData = [...advisorData]
                      .sort((a, b) => b.totalActive - a.totalActive)
                      .slice(0, 10)
                      .map(r => ({ isim: (r.employeeName ?? r.advisorName ?? "—").split(" ").slice(0, 2).join(" "), "Aktif": r.totalActive }))
                      .reverse();
                    return (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={chartData} layout="vertical" barCategoryGap="25%">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                          <YAxis type="category" dataKey="isim" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={90} />
                          <Tooltip
                            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                            cursor={{ fill: "hsl(var(--muted))" }}
                          />
                          <Bar dataKey="Aktif" fill="#10b981" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    );
                  })()}
                </div>
              </div>

              {/* Satılık / Kiralık Donut */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                  <BarChart2 className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Aktif Portföy Dağılımı</h2>
                </div>
                <div className="p-4 flex flex-col items-center">
                  {loadingTypeStats ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Yükleniyor…</div>
                  ) : !typeStats ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Veri yok.</div>
                  ) : (() => {
                    const countData = [
                      { name: "Satılık", value: typeStats.satilik.active, color: "#3b82f6" },
                      { name: "Kiralık", value: typeStats.kiralik.active, color: "#7c3aed" },
                    ];
                    const volData = [
                      { name: "Satılık", value: typeStats.satilik.activeVolume, color: "#3b82f6" },
                      { name: "Kiralık", value: typeStats.kiralik.activeVolume, color: "#7c3aed" },
                    ];
                    const total = typeStats.satilik.active + typeStats.kiralik.active;
                    return (
                      <div className="w-full space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-center text-xs">
                          <div className="text-muted-foreground">İlan Adedi</div>
                          <div className="text-muted-foreground">Hacim</div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie data={countData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                                {countData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                              </Pie>
                              <Tooltip
                                formatter={(v: number) => [v + " ilan", ""]}
                                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie data={volData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                                {volData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                              </Pie>
                              <Tooltip
                                formatter={(v: number) => [fmtVol(v), ""]}
                                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-6 text-xs">
                          {countData.map((d) => (
                            <div key={d.name} className="flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                              <span className="font-medium">{d.name}</span>
                              <span className="text-muted-foreground">
                                {total > 0 ? Math.round((d.value / total) * 100) : 0}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

            </div>

            {/* Satılık / Kiralık Özet Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(["satilik", "kiralik"] as const).map((type) => {
                const d = typeStats?.[type];
                const label = type === "satilik" ? "Satılık" : "Kiralık";
                const color = type === "satilik" ? "text-blue-700" : "text-violet-700";
                const bg    = type === "satilik" ? "bg-blue-50 border-blue-200" : "bg-violet-50 border-violet-200";
                return (
                  <div key={type} className={`rounded-xl border p-4 space-y-3 ${bg}`}>
                    <div className={`text-sm font-semibold ${color}`}>{label} İlanlar</div>
                    {loadingTypeStats ? (
                      <div className="text-muted-foreground text-xs">Yükleniyor…</div>
                    ) : d ? (
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Aktif İlan</span>
                          <span className="font-medium">{d.active.toLocaleString("tr-TR")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pasif İlan</span>
                          <span className="font-medium">{d.passive.toLocaleString("tr-TR")}</span>
                        </div>
                        <div className="flex justify-between border-t border-border/50 pt-1 mt-1">
                          <span className="text-muted-foreground">Aktif Portföy Hacmi</span>
                          <span className={`font-bold ${color}`}>{fmtVol(d.activeVolume)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pasif Tarihsel Hacim</span>
                          <span className="font-medium text-muted-foreground">{fmtVol(d.passiveVolume)}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* ── Tab: Danışman Raporu ──────────────────────────────────────────── */}
        {activeTab === "danismanlar" && (
          <div className="space-y-4">

            {/* Search */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Danışman ara…"
                  value={advisorSearch}
                  onChange={e => { setAdvisorSearch(e.target.value); setAdvisorPage(0); }}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              {advisorSearch && (
                <span className="text-xs text-muted-foreground">
                  {sortedAdvisors.length} sonuç
                </span>
              )}
            </div>

            <SectionCard title={`Danışman Bazlı Rapor (${sortedAdvisors.length})`} icon={Users}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("displayName")}>
                      Danışman / Takım{sortKey === "displayName" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                    </th>
                    <SortTh col="totalActive"          label="Aktif" />
                    <SortTh col="totalPassive"         label="Pasif" />
                    <SortTh col="agreementUploaded"    label="Söz. Yüklendi" />
                    <SortTh col="agreementPending"     label="Söz. Bekleyen" />
                    <SortTh col="noAgreementCount"     label="Söz. Yok" />
                    <SortTh col="closeReasonSubmitted" label="Sebep Girildi" />
                    <SortTh col="closeReasonPending"   label="Sebep Bekleyen" />
                    <SortTh col="closingCount"         label={`İşlem (${new Date().getFullYear()})`} />
                    <SortTh col="lastClosingDate"      label="Son İşlem" />
                  </tr>
                </thead>
                <tbody>
                  {loadingAdvisor ? (
                    <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">Yükleniyor…</td></tr>
                  ) : advisorPageRows.length === 0 ? (
                    <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                      {advisorSearch ? "Arama sonucu bulunamadı." : "Veri yok."}
                    </td></tr>
                  ) : advisorPageRows.map((r, i) => (
                    <tr key={i} className={`border-b border-border last:border-0 hover:bg-muted/30 ${r.isTeam ? "bg-blue-50/30" : ""}`}>
                      <td className="px-3 py-2.5">
                        {r.isTeam ? (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{r.displayName}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{r.memberCount} üye</span>
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-sm">{r.displayName}</div>
                            {r.subName && <div className="text-[11px] text-muted-foreground">{r.subName}</div>}
                            {!r.hasEmployeeId && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Eşleşmemiş</span>}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-emerald-700">{r.totalActive}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{r.totalPassive}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-700">{r.agreementUploaded}</td>
                      <td className="px-3 py-2.5 text-right text-amber-600">{r.agreementPending}</td>
                      <td className="px-3 py-2.5 text-right">
                        {r.noAgreementCount > 0
                          ? <span className="font-semibold text-red-600">{r.noAgreementCount}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-700">{r.closeReasonSubmitted}</td>
                      <td className="px-3 py-2.5 text-right text-violet-600">{r.closeReasonPending}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{r.closingCount || "—"}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {r.lastClosingDate ? new Date(r.lastClosingDate).toLocaleDateString("tr-TR") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={advisorPage} total={advisorPageCount} onPage={setAdvisorPage} />
            </SectionCard>

          </div>
        )}

        {/* ── Tab: Portföy Yaşı ────────────────────────────────────────────── */}
        {activeTab === "yas" && (
          <div className="space-y-6">

            {/* Yaş Dağılımı Pie Charts */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <Clock className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Aktif İlanların Yaş Dağılımı (30 Günlük Gruplar)</h2>
              </div>
              {loadingAgeGroups ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Yükleniyor…</div>
              ) : ageGroups.every(g => g.count === 0) ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Veri yok.</div>
              ) : (
                <div className="p-4 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {([
                      { title: "Genel", countKey: "count" as const, volKey: "volume" as const },
                      { title: "Satılık (≥1M ₺)", countKey: "satilikCount" as const, volKey: "satilikVolume" as const },
                      { title: "Kiralık (<1M ₺)", countKey: "kiralikCount" as const, volKey: "kiralikVolume" as const },
                    ]).map(({ title, countKey, volKey }) => {
                      const data = ageGroups.filter(g => g[countKey] > 0).map((g) => ({
                        name: g.label, value: g[countKey], volume: g[volKey],
                        color: AGE_COLORS[g.order],
                      }));
                      const total = data.reduce((s, d) => s + d.value, 0);
                      if (total === 0) return null;
                      return (
                        <div key={title} className="space-y-3">
                          <div className="text-sm font-medium text-center">{title}</div>
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                              </Pie>
                              <Tooltip
                                formatter={(v: number, _n: string, props: any) => [
                                  `${v} ilan (${total > 0 ? Math.round((v / total) * 100) : 0}%) — ${fmtVol(props.payload.volume)}`,
                                  props.payload.name,
                                ]}
                                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="space-y-1">
                            {ageGroups.map((g) => {
                              const cnt = g[countKey]; const vol = g[volKey];
                              if (cnt === 0) return null;
                              return (
                                <div key={g.label} className="flex items-center gap-2 text-xs">
                                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: AGE_COLORS[g.order] }} />
                                  <span className="w-16 font-medium">{g.label} gün</span>
                                  <span className="font-semibold">{cnt}</span>
                                  <span className="text-muted-foreground ml-auto">{fmtVol(vol)}</span>
                                </div>
                              );
                            })}
                            <div className="flex justify-between text-xs font-semibold border-t border-border pt-1 mt-1">
                              <span>Toplam</span>
                              <span>{total} ilan — {fmtVol(ageGroups.reduce((s, g) => s + g[volKey], 0))}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 90+ gün aktif ilanlar */}
            <div className="space-y-3">
              {/* Office filter */}
              {o90Offices.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Ofis:</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => { setO90OfficeFilter("all"); setO90Page(0); }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        o90OfficeFilter === "all"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Tümü ({over90Data.length})
                    </button>
                    {o90Offices.map(office => {
                      const cnt = over90Data.filter(r => (r.office ?? "—") === office).length;
                      return (
                        <button
                          key={office}
                          onClick={() => { setO90OfficeFilter(office); setO90Page(0); }}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            o90OfficeFilter === office
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {office} ({cnt})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <SectionCard title={`90+ Gün Aktif İlanlar (${sortedO90.length})`} icon={Clock}>
                {loadingOver90 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Yükleniyor…</div>
                ) : sortedO90.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {o90OfficeFilter !== "all" ? "Bu ofiste 90+ günlük aktif ilan yok." : "90 günden uzun süredir aktif ilan yok."}
                  </div>
                ) : (
                  <>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                          <O90Th col="listingNumber" label="İlan No"  align="left" />
                          <O90Th col="employeeName"  label="Danışman" align="left" />
                          <O90Th col="office"        label="Ofis"     align="left" />
                          <O90Th col="price"         label="Fiyat"    align="right" />
                          <th className="px-3 py-2.5 font-medium text-right">Yayın Tarihi</th>
                          <O90Th col="daysActive"    label="Gün"      align="right" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {o90PageRows.map((r) => (
                          <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-3 py-2 font-mono text-[11px]">{r.listingNumber}</td>
                            <td className="px-3 py-2">{r.employeeName ?? r.advisorName ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.office ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {r.price ? Number(r.price).toLocaleString("tr-TR") + " ₺" : "—"}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{r.publishedDate ?? "—"}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`font-semibold ${r.daysActive > 180 ? "text-red-600" : r.daysActive > 120 ? "text-orange-500" : "text-yellow-600"}`}>
                                {r.daysActive}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pager page={o90Page} total={o90PageCount} onPage={setO90Page} />
                  </>
                )}
              </SectionCard>
            </div>

          </div>
        )}

        {/* ── Tab: Trend & Tarih ───────────────────────────────────────────── */}
        {activeTab === "trend" && (
          <div className="space-y-6">

            {/* Aylık Trend Tablosu */}
            <SectionCard title="Aylık Trend (Son 12 Ay)" icon={TrendingUp}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Ay</th>
                    <th className="px-3 py-2.5 font-medium text-right">Yeni Aktif</th>
                    <th className="px-3 py-2.5 font-medium text-right">Yeni Pasif</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingTrend ? (
                    <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">Yükleniyor…</td></tr>
                  ) : trendData.length === 0 ? (
                    <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">Veri yok.</td></tr>
                  ) : [...trendData].reverse().map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2.5 font-medium">{fmtMonth(r.month)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-700 font-medium">{r.newActive}</td>
                      <td className="px-3 py-2.5 text-right text-slate-500">{r.newPassive}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>

            {/* İlan Tarihi Bazlı Rapor */}
            <SectionCard title="İlan Tarihi Bazlı Rapor (Aylık)" icon={TrendingUp}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Ay</th>
                    <th className="px-3 py-2.5 font-medium text-right text-blue-700">Sat. Aktif</th>
                    <th className="px-3 py-2.5 font-medium text-right text-blue-400">Sat. Pasif</th>
                    <th className="px-3 py-2.5 font-medium text-right text-blue-700">Sat. Hacim</th>
                    <th className="px-3 py-2.5 font-medium text-right text-violet-700">Kir. Aktif</th>
                    <th className="px-3 py-2.5 font-medium text-right text-violet-400">Kir. Pasif</th>
                    <th className="px-3 py-2.5 font-medium text-right text-violet-700">Kir. Hacim</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDateReport ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Yükleniyor…</td></tr>
                  ) : dateReport.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Veri yok.</td></tr>
                  ) : dateReport.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2.5 font-medium">{fmtMonth(r.month)}</td>
                      <td className="px-3 py-2.5 text-right text-blue-700 font-medium">{r.satilikActive || "—"}</td>
                      <td className="px-3 py-2.5 text-right text-blue-400">{r.satilikPassive || "—"}</td>
                      <td className="px-3 py-2.5 text-right text-blue-700 font-medium whitespace-nowrap">{r.satilikVolume ? fmtVol(r.satilikVolume) : "—"}</td>
                      <td className="px-3 py-2.5 text-right text-violet-700 font-medium">{r.kiralikActive || "—"}</td>
                      <td className="px-3 py-2.5 text-right text-violet-400">{r.kiralikPassive || "—"}</td>
                      <td className="px-3 py-2.5 text-right text-violet-700 font-medium whitespace-nowrap">{r.kiralikVolume ? fmtVol(r.kiralikVolume) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>

          </div>
        )}

        {/* ── Tab: Kalkış Analizi ──────────────────────────────────────────── */}
        {activeTab === "kalkis" && (
          <div className="space-y-6">

            {/* Paket (Ofis) Bazlı Kırılım */}
            <SectionCard title="Paket Bazlı Kırılım" icon={Building2}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Ofis</th>
                    <th className="px-3 py-2.5 font-medium text-right">Aktif</th>
                    <th className="px-3 py-2.5 font-medium text-right">Pasif</th>
                    <th className="px-3 py-2.5 font-medium text-right">Söz. Yüklendi</th>
                    <th className="px-3 py-2.5 font-medium text-right">Sebep Girildi</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingOffice ? (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Yükleniyor…</td></tr>
                  ) : officeData.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Veri yok.</td></tr>
                  ) : officeData.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2.5 font-medium">{r.office ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-emerald-700">{r.totalActive}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{r.totalPassive}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-700">{r.agreementUploaded}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-700">{r.closeReasonSubmitted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>

            {/* Kalkış Sebebi Analizi */}
            <SectionCard title="Kalkış Sebebi Analizi" icon={TrendingDown}>
              {loadingCloseReason ? (
                <div className="px-4 py-8 text-center text-muted-foreground">Yükleniyor…</div>
              ) : closeReasonData.length === 0 ? (
                <div className="px-4 py-8 text-center text-muted-foreground">Henüz kalkış sebebi girilmemiş.</div>
              ) : (
                <div className="p-4 space-y-3">
                  {closeReasonData.map((r, i) => {
                    const pct = totalCloseReasons > 0 ? Math.round((r.count / totalCloseReasons) * 100) : 0;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{r.closeReason}</span>
                          <span className="text-muted-foreground">{r.count} <span className="text-xs">({pct}%)</span></span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-1 text-xs text-muted-foreground">
                    Toplam: {totalCloseReasons} kalkış
                  </div>
                </div>
              )}
            </SectionCard>

          </div>
        )}

        {/* ── Tab: Ayarlar ─────────────────────────────────────────────────── */}
        {activeTab === "ayarlar" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Hatırlatma Ayarları</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Belirtilen gün sayısını geçmiş, henüz sözleşme/sebep girilmemiş danışmanlara WhatsApp hatırlatması gönderir.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Sözleşme hatırlatma (gün)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={agreementDays}
                    onChange={(e) => setAgreementDays(Math.max(1, Number(e.target.value)))}
                    className="h-8 text-sm w-32"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kalkış sebebi hatırlatma (gün)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={closeReasonDays}
                    onChange={(e) => setCloseReasonDays(Math.max(1, Number(e.target.value)))}
                    className="h-8 text-sm w-32"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={runningReminders}
                  onClick={handleRunReminders}
                >
                  {runningReminders
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Bell className="h-3.5 w-3.5" />}
                  Hatırlatmaları Çalıştır
                </Button>
                {reminderResult && (
                  <span className="text-xs text-muted-foreground">
                    Sözleşme kuyruğu: <b className="text-foreground">{reminderResult.agreementQueued}</b>,
                    &nbsp;Kalkış sebebi kuyruğu: <b className="text-foreground">{reminderResult.closeReasonQueued}</b>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Not: Sistem her gece otomatik olarak da 3 günlük hatırlatmaları çalıştırır.
              </p>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
