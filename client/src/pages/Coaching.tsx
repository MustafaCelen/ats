import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, AreaChart, Area,
} from "recharts";
import {
  Users, TrendingUp, DollarSign, Handshake, ChevronDown, ChevronRight,
  Award, Target, BarChart2, ChevronLeft,
} from "lucide-react";
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTH_NAMES = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const CURRENT_YEAR = new Date().getFullYear();

function monthLabel(key: string) {
  const [, m] = key.split("-");
  return MONTH_NAMES[parseInt(m, 10) - 1] ?? key;
}

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

function CapBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-500" : pct >= 50 ? "bg-blue-500" : "bg-slate-300";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs font-semibold w-10 text-right">{pct}%</span>
    </div>
  );
}

function SideTypePips({ buyer, seller, referral }: { buyer: number; seller: number; referral: number }) {
  const total = buyer + seller + referral;
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex gap-2 text-xs">
      {buyer > 0 && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">A:{buyer}</span>}
      {seller > 0 && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">S:{seller}</span>}
      {referral > 0 && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Y:{referral}</span>}
    </div>
  );
}

function StudentCard({ student, rank }: { student: any; rank: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
          ${rank === 1 ? "bg-yellow-100 text-yellow-700" : rank === 2 ? "bg-slate-100 text-slate-600" : rank === 3 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{student.name}</span>
            {student.kwuid && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{student.kwuid}</span>}
            {student.isUK
              ? <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">ÜK{student.ukRate ? ` ${student.ukRate}` : ""}</span>
              : <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium">DÜA</span>
            }
          </div>
          <div className="mt-1"><CapBar pct={student.capPct} /></div>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-right">
          <div>
            <p className="text-xs text-muted-foreground">Kapanış</p>
            <p className="text-sm font-bold">{student.totalClosings}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">BHB</p>
            <p className="text-sm font-bold">{fmtShort(student.totalBHB)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net</p>
            <p className="text-sm font-bold">{fmtShort(student.totalNet)}</p>
          </div>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/10">
          {/* Stat row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Hacim</p>
              <p className="font-bold">{fmtTRY(student.totalVolume)}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Ort. Satış</p>
              <p className="font-bold">{fmtTRY(student.avgDealValue)}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">BM</p>
              <p className="font-bold">{fmtTRY(student.totalBM)}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Ort. Süre</p>
              <p className="font-bold">{student.avgSaleDays != null ? `${student.avgSaleDays} gün` : "—"}</p>
            </div>
          </div>

          {/* Side types + deal types */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Taraf Tipi</p>
              <SideTypePips buyer={student.bySideType?.buyer ?? 0} seller={student.bySideType?.seller ?? 0} referral={student.bySideType?.referral ?? 0} />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">İşlem Tipi</p>
              <div className="flex flex-wrap gap-1">
                {(student.byDealType ?? []).map((d: any) => (
                  <span key={d.dealType} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-medium">
                    {d.dealType}: {d.count}
                  </span>
                ))}
                {student.byDealType?.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
              </div>
            </div>
          </div>

          {/* Monthly trend chart */}
          {student.monthlyTrend?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Aylık Trend</p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={student.monthlyTrend.map((m: any) => ({ ...m, monthLabel: monthLabel(m.month) }))} barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-card border border-border rounded-lg shadow p-2 text-xs space-y-0.5">
                          <p className="font-semibold">{label}</p>
                          <p>Kapanış: {payload[0]?.value}</p>
                          <p>BHB: {fmtTRY(payload[1]?.value as number ?? 0)}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" name="Kapanış" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="bhb" name="BHB" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CoachSection({ coach, filteredStudents, defaultExpanded = false }: { coach: any; filteredStudents: any[]; defaultExpanded?: boolean }) {
  const [open, setOpen] = useState(defaultExpanded);
  if (filteredStudents.length === 0) return null;
  const sectionBHB = filteredStudents.reduce((s: number, st: any) => s + st.totalBHB, 0);
  const sectionVolume = filteredStudents.reduce((s: number, st: any) => s + st.totalVolume, 0);
  return (
    <div className="border border-border rounded-2xl bg-card shadow-sm overflow-hidden">
      <button
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
          {coach.coachName.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base">{coach.coachName}</p>
          <p className="text-xs text-muted-foreground">{filteredStudents.length} öğrenci</p>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Toplam BHB</p>
            <p className="font-bold">{fmtTRY(sectionBHB)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Toplam Hacim</p>
            <p className="font-bold">{fmtShort(sectionVolume)} ₺</p>
          </div>
          {open ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4 space-y-3 bg-muted/5">
          {filteredStudents.map((s: any, i: number) => (
            <StudentCard key={s.employeeId} student={s} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Coaching() {
  const [viewDate, setViewDate] = useState(() => new Date(CURRENT_YEAR, new Date().getMonth(), 1));
  const [allYear, setAllYear] = useState(false);
  const [selectedCoachId, setSelectedCoachId] = useState<number | null | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "uk" | "dua">("all");

  const prevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const startDate = allYear
    ? formatYMD(new Date(viewDate.getFullYear(), 0, 1))
    : formatYMD(new Date(viewDate.getFullYear(), viewDate.getMonth(), 1));
  const endDate = allYear
    ? formatYMD(new Date(viewDate.getFullYear(), 11, 31))
    : formatYMD(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0));

  const { data, isLoading } = useQuery<{ coaches: any[] }>({
    queryKey: ["/api/coaching/stats", startDate, endDate],
    queryFn: () =>
      fetch(`/api/coaching/stats?startDate=${startDate}&endDate=${endDate}`)
        .then(r => r.json()),
  });

  const allCoaches = data?.coaches ?? [];

  // Filtered coaches based on selection
  const coaches = useMemo(() => {
    if (selectedCoachId === "all") return allCoaches;
    return allCoaches.filter(c => c.coachId === selectedCoachId);
  }, [allCoaches, selectedCoachId]);

  // Flatten filtered students for summary and rankings
  const allStudents = useMemo(() => {
    const flat = coaches.flatMap((c: any) => c.students);
    if (typeFilter === "uk") return flat.filter((s: any) => s.isUK);
    if (typeFilter === "dua") return flat.filter((s: any) => !s.isUK);
    return flat;
  }, [coaches, typeFilter]);
  const totalClosings = useMemo(() => allStudents.reduce((s, st) => s + st.totalClosings, 0), [allStudents]);
  const totalBHB = useMemo(() => allStudents.reduce((s, st) => s + st.totalBHB, 0), [allStudents]);
  const totalVolume = useMemo(() => allStudents.reduce((s, st) => s + st.totalVolume, 0), [allStudents]);
  const avgCapPct = useMemo(() => allStudents.length > 0
    ? Math.round(allStudents.reduce((s, st) => s + st.capPct, 0) / allStudents.length) : 0, [allStudents]);

  // Aggregate monthly trend across filtered students
  const aggregatedMonthly = useMemo(() => {
    const map = new Map<string, { count: number; bhb: number; volume: number }>();
    for (const st of allStudents) {
      for (const m of (st.monthlyTrend ?? [])) {
        if (!map.has(m.month)) map.set(m.month, { count: 0, bhb: 0, volume: 0 });
        const cur = map.get(m.month)!;
        cur.count += m.count; cur.bhb += m.bhb; cur.volume += m.volume;
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, monthLabel: monthLabel(month), ...v }));
  }, [allStudents]);

  const topByBHB = useMemo(() => [...allStudents].sort((a, b) => b.totalBHB - a.totalBHB).slice(0, 10), [allStudents]);
  const topByClosings = useMemo(() => [...allStudents].sort((a, b) => b.totalClosings - a.totalClosings).slice(0, 10), [allStudents]);

  const isSingleCoach = coaches.length === 1;
  const showCoachFilter = allCoaches.length > 1;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Üretkenlik Koçluğu</h1>
            <p className="text-sm text-muted-foreground mt-0.5">ÜK danışmanlarının analitik raporu</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* Month navigator */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAllYear(v => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                  ${allYear ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
              >
                Tüm Yıl
              </button>
              <div className="flex items-center gap-1 bg-muted/60 rounded-xl p-1">
                <button onClick={prevMonth} className="p-1 rounded hover:bg-muted transition-colors">
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-semibold w-32 text-center">
                  {allYear
                    ? viewDate.getFullYear()
                    : format(viewDate, "MMMM yyyy", { locale: tr })}
                </span>
                <button onClick={nextMonth} className="p-1 rounded hover:bg-muted transition-colors">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Type filter */}
            <div className="flex items-center gap-1 bg-muted/60 rounded-xl p-1">
              {([["all", "Tümü"], ["uk", "Koçluk"], ["dua", "DÜA"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTypeFilter(val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                    ${typeFilter === val ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Coach filter */}
            {showCoachFilter && (
              <div className="flex items-center gap-1 flex-wrap justify-end">
                <button
                  onClick={() => setSelectedCoachId("all")}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
                    ${selectedCoachId === "all"
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-card text-muted-foreground border-border hover:border-violet-400 hover:text-violet-600"}`}
                >
                  Tüm Koçlar
                </button>
                {allCoaches.map(c => (
                  <button
                    key={c.coachId ?? "none"}
                    onClick={() => setSelectedCoachId(c.coachId)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
                      ${selectedCoachId === c.coachId
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-card text-muted-foreground border-border hover:border-violet-400 hover:text-violet-600"}`}
                  >
                    {c.coachName}
                    <span className="ml-1 opacity-60">({c.studentCount})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {!isLoading && allStudents.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Bu dönem için koçluk verisi bulunamadı.</p>
            <p className="text-sm mt-1">ÜK aktif danışman kaydı bulunmuyor ya da bu dönemde kapanış yapılmamış olabilir.</p>
          </div>
        )}

        {!isLoading && allStudents.length > 0 && (
          <>
            {/* Summary metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard icon={Users} label="Toplam Öğrenci" value={allStudents.length}
                sub={`${coaches.length} koç`} color="bg-violet-100 text-violet-600" />
              <MetricCard icon={Handshake} label="Toplam Kapanış" value={totalClosings}
                color="bg-blue-100 text-blue-600" />
              <MetricCard icon={DollarSign} label="Toplam BHB" value={fmtShort(totalBHB) + " ₺"}
                sub={fmtTRY(totalBHB)} color="bg-emerald-100 text-emerald-600" />
              <MetricCard icon={Target} label="Ort. Cap %" value={`${avgCapPct}%`}
                sub={`Toplam hacim: ${fmtShort(totalVolume)} ₺`} color="bg-amber-100 text-amber-600" />
            </div>

            {/* Monthly trend */}
            {aggregatedMonthly.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold mb-4">Aylık Trend — Tüm ÜK Danışmanları</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={aggregatedMonthly}>
                    <defs>
                      <linearGradient id="bhbGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-card border border-border rounded-lg shadow-lg p-2 text-xs space-y-0.5">
                            <p className="font-semibold mb-1">{label}</p>
                            <p>Kapanış: {payload.find((p: any) => p.dataKey === "count")?.value}</p>
                            <p>BHB: {fmtTRY(payload.find((p: any) => p.dataKey === "bhb")?.value as number ?? 0)}</p>
                          </div>
                        );
                      }}
                    />
                    <Area type="monotone" dataKey="bhb" stroke="#6366f1" fill="url(#bhbGrad)" strokeWidth={2} dot={false} name="BHB" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Rankings row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Top by BHB */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Award className="h-4 w-4 text-amber-500" /> BHB Sıralaması</h2>
                <ResponsiveContainer width="100%" height={Math.max(120, topByBHB.length * 32)}>
                  <BarChart data={topByBHB.map(s => ({ name: s.name.split(" ")[0], bhb: s.totalBHB }))} layout="vertical" barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={v => fmtShort(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                    <Tooltip formatter={(v: number) => fmtTRY(v)} />
                    <Bar dataKey="bhb" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top by closings */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><BarChart2 className="h-4 w-4 text-blue-500" /> Kapanış Sıralaması</h2>
                <ResponsiveContainer width="100%" height={Math.max(120, topByClosings.length * 32)}>
                  <BarChart data={topByClosings.map(s => ({ name: s.name.split(" ")[0], closings: s.totalClosings }))} layout="vertical" barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
                    <Tooltip />
                    <Bar dataKey="closings" name="Kapanış" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cap % overview */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-emerald-500" /> Cap Durumu</h2>
              <div className="space-y-2">
                {[...allStudents].sort((a, b) => b.capPct - a.capPct).map(s => (
                  <div key={s.employeeId} className="flex items-center gap-3">
                    <span className="text-xs w-28 truncate font-medium">{s.name}</span>
                    <div className="flex-1"><CapBar pct={s.capPct} /></div>
                    <span className="text-xs text-muted-foreground w-20 text-right">
                      {fmtShort(s.capUsed)} / {fmtShort(s.capAmount)} ₺
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Coach sections */}
            <div className="space-y-4">
              <h2 className="text-base font-bold">
                {isSingleCoach ? "Öğrenciler" : "Koçlar ve Öğrencileri"}
              </h2>
              {coaches.map((coach: any) => {
                const filtered = coach.students.filter((s: any) => {
                  if (typeFilter === "uk") return s.isUK;
                  if (typeFilter === "dua") return !s.isUK;
                  return true;
                });
                return (
                  <CoachSection
                    key={coach.coachId ?? "unassigned"}
                    coach={coach}
                    filteredStudents={filtered}
                    defaultExpanded={isSingleCoach || coaches.length <= 2}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
