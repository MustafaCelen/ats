import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { UkEnrollDialog } from "@/components/UkEnrollDialog";
import { UkWelcomeEmailDialog } from "@/components/UkWelcomeEmailDialog";
import { Layout } from "@/components/Layout";
import { Route as RouteIcon, Search, CheckCircle2, ChevronRight, UserPlus, Mail, Send } from "lucide-react";
import { UK_PROGRAM_WEEKS } from "@shared/uk-program";
import { useSortable } from "@/lib/sort";
import { SortTh } from "@/components/SortTh";

type Row = {
  employeeId: number; name: string; kwuid: string | null; status: string;
  coachId: number | null; coachName: string | null;
  programStart: string | null; week1Monday: string | null; currentWeek: number;
  done: number; total: number; score: number; targetScore: number; lastConfirmedWeek: number | null; canEdit: boolean; manual: boolean; welcomeSentAt: string | null;
};

function fmtDate(ymd: string | null) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

function WeekBadge({ week }: { week: number }) {
  if (week === 0) return <span className="text-xs text-muted-foreground">Başlamadı</span>;
  if (week > UK_PROGRAM_WEEKS) {
    return <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Tamamlandı</span>;
  }
  return <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">{week}. hafta</span>;
}

export default function UkBasariRotasi() {
  const [q, setQ] = useState("");
  const [includePassive, setIncludePassive] = useState(false);
  const [phase, setPhase] = useState<"all" | "active" | "done">("active");
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [mailFor, setMailFor] = useState<number | null>(null);
  const { data: me } = useAuth();
  const isAdmin = me?.role === "admin";
  const canEnroll = isAdmin || me?.role === "hiring_manager";
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const { data = [], isLoading } = useQuery<Row[]>({
    queryKey: ["/api/uk-program", includePassive],
    queryFn: () => fetch(`/api/uk-program?includePassive=${includePassive}`, { credentials: "include" }).then((r) => r.json()),
  });

  // Koç (hiring manager) filtresi: "all" | "none" (koçu atanmamış) | kullanıcı id'si.
  const [coach, setCoach] = useState<string>(() => {
    try { return localStorage.getItem("ukRotaCoachFilter") ?? "all"; } catch { return "all"; }
  });
  const changeCoach = (v: string) => {
    setCoach(v);
    try { localStorage.setItem("ukRotaCoachFilter", v); } catch {}
  };
  const { data: coaches = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/hiring-managers"],
    queryFn: () => fetch("/api/hiring-managers", { credentials: "include" }).then((r) => r.json()),
  });
  const byCoach = useMemo(() => data.filter((r) =>
    coach === "all" ? true : coach === "none" ? r.coachId == null : String(r.coachId) === coach,
  ), [data, coach]);

  const rows = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return byCoach.filter((r) => {
      // "Devam Eden" henüz başlamamışları da içerir (koç atamasıyla eklenenler sonraki pazartesi başlar).
      if (phase === "active" && r.currentWeek > UK_PROGRAM_WEEKS) return false;
      if (phase === "done" && r.currentWeek <= UK_PROGRAM_WEEKS) return false;
      if (!needle) return true;
      return [r.name, r.kwuid, r.coachName].some((v) => v?.toLocaleLowerCase("tr").includes(needle));
    });
  }, [byCoach, q, phase]);

  // Sütun sıralaması (ortak altyapı: @/lib/sort)
  const sortGetters = useMemo(() => ({
    name: (r: Row) => r.name, coachName: (r: Row) => r.coachName, programStart: (r: Row) => r.programStart,
    currentWeek: (r: Row) => r.currentWeek, progress: (r: Row) => (r.total ? r.done / r.total : 0),
    score: (r: Row) => r.score, targetScore: (r: Row) => r.targetScore ?? 0,
    lastConfirmedWeek: (r: Row) => r.lastConfirmedWeek, welcomeSentAt: (r: Row) => r.welcomeSentAt,
  }), []);
  const { sorted: sortedRows, sort, toggle: toggleSort } = useSortable(rows, sortGetters);

  const counts = useMemo(() => ({
    all: byCoach.length,
    active: byCoach.filter((r) => r.currentWeek <= UK_PROGRAM_WEEKS).length,
    done: byCoach.filter((r) => r.currentWeek > UK_PROGRAM_WEEKS).length,
  }), [byCoach]);

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <RouteIcon className="h-6 w-6 text-primary" /> 45+45 Başarı Rotası
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Üretkenlik Koçluğu programındaki danışmanların 6 haftalık rota ilerlemesi ve aktivite puanı
            </p>
          </div>
          {canEnroll && (
            <Button className="gap-1.5" onClick={() => setEnrollOpen(true)}>
              <UserPlus className="h-4 w-4" /> Danışman Ekle
            </Button>
          )}
        </div>
        <UkEnrollDialog
          isAdmin={isAdmin}
          meId={me?.id ?? null}
          open={enrollOpen}
          onOpenChange={setEnrollOpen}
          excludeIds={data.map((r) => r.employeeId)}
          onEnrolled={(id) => { qc.invalidateQueries({ queryKey: ["/api/uk-program"] }); navigate(`/uk-basari-rotasi/${id}`); }}
        />

        <div className="flex items-center gap-2 flex-wrap">
          {([["active", "Devam Eden"], ["done", "Tamamlanan"], ["all", "Tümü"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setPhase(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ring-1 transition-colors ${phase === k ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border text-muted-foreground hover:text-foreground"}`}
            >
              {label} ({counts[k]})
            </button>
          ))}
          <select
            value={coach}
            onChange={(e) => changeCoach(e.target.value)}
            className="h-9 border border-input rounded-lg px-2.5 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Koç filtresi"
          >
            <option value="all">Tüm koçlar</option>
            {coaches.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}{me?.id === c.id ? " (ben)" : ""}</option>
            ))}
            <option value="none">Koçu atanmamış</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground ml-2">
            <input type="checkbox" checked={includePassive} onChange={(e) => setIncludePassive(e.target.checked)} />
            Pasifleri dahil et
          </label>
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Danışman, KWUID veya koç ara…"
              className="w-full border border-input rounded-lg pl-9 pr-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-x-auto [contain:inline-size]">
          <table className="w-full text-sm min-w-[1040px] [&_td]:whitespace-nowrap">
            <thead className="bg-muted/40 text-muted-foreground text-xs [&_th]:px-2 [&_th]:py-2.5">
              <tr>
                <SortTh label="Danışman" sortKey="name" sort={sort} onSort={toggleSort} />
                <SortTh label="Koç" sortKey="coachName" sort={sort} onSort={toggleSort} />
                <SortTh label="Program Başlangıcı" sortKey="programStart" sort={sort} onSort={toggleSort} />
                <SortTh label="Durum" sortKey="currentWeek" sort={sort} onSort={toggleSort} />
                <SortTh label="Aktivite İlerlemesi" sortKey="progress" sort={sort} onSort={toggleSort} firstDir="desc" className="w-36" />
                <SortTh label="Aktivite Puanı" sortKey="score" sort={sort} onSort={toggleSort} align="right" firstDir="desc" />
                <SortTh label="Hedef Puanı" sortKey="targetScore" sort={sort} onSort={toggleSort} align="right" firstDir="desc" />
                <SortTh label="Koç Onayı" sortKey="lastConfirmedWeek" sort={sort} onSort={toggleSort} />
                <SortTh label="Hoş Geldin Maili" sortKey="welcomeSentAt" sort={sort} onSort={toggleSort} />
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Yükleniyor…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                  {data.length === 0
                    ? "Programda danışman yok. Danışman profilinde ÜK koçu atandığında bir sonraki pazartesiden otomatik eklenir; \"Danışman Ekle\" ile manuel de eklenebilir."
                    : "Bu filtrede danışman yok."}
                </td></tr>
              )}
              {sortedRows.map((r) => {
                const pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
                return (
                  <tr key={r.employeeId} className="border-t border-border hover:bg-muted/20">
                    <td className="px-2 py-2.5 max-w-[300px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link href={`/uk-basari-rotasi/${r.employeeId}`} className="font-semibold hover:text-primary truncate" title={r.name}>{r.name}</Link>
                        {r.kwuid && <span className="text-xs text-muted-foreground font-mono shrink-0">{r.kwuid}</span>}
                        {r.status !== "active" && <span className="text-[10px] text-muted-foreground shrink-0">(pasif)</span>}
                        {r.manual && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-sky-200 shrink-0" title="Programa manuel eklendi (ÜK işareti yok)">Manuel</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground max-w-[200px] truncate" title={r.coachName ?? undefined}>{r.coachName ?? "—"}</td>
                    <td className="px-2 py-2.5 tabular-nums">{fmtDate(r.programStart)}</td>
                    <td className="px-2 py-2.5"><WeekBadge week={r.currentWeek} /></td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right">{r.done}/{r.total}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{r.score.toLocaleString("tr-TR")} <span className="text-muted-foreground font-normal">/ 50</span></td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{(r.targetScore ?? 0).toLocaleString("tr-TR")} <span className="text-muted-foreground font-normal">/ 50</span></td>
                    <td className="px-2 py-2.5">
                      {r.lastConfirmedWeek
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {r.lastConfirmedWeek}. hafta</span>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        {r.welcomeSentAt
                          ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Mail className="h-3.5 w-3.5" /> {new Date(r.welcomeSentAt).toLocaleDateString("tr-TR")}</span>
                          : <span className="text-xs text-amber-700">Gönderilmedi</span>}
                        {r.canEdit && (
                          <Button
                            size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs"
                            onClick={() => setMailFor(r.employeeId)}
                            title="Hoş geldin mailini önizle ve gönder"
                          >
                            <Send className="h-3.5 w-3.5" /> {r.welcomeSentAt ? "Tekrar" : "Gönder"}
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-2">
                      <Link href={`/uk-basari-rotasi/${r.employeeId}`} className="text-muted-foreground hover:text-primary">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {mailFor != null && (
        <UkWelcomeEmailDialog employeeId={mailFor} open onOpenChange={(v) => { if (!v) setMailFor(null); }} />
      )}
    </Layout>
  );
}
