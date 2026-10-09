import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Route as RouteIcon, Trophy, Lock, Link2, Eye, Mail } from "lucide-react";
import { UkWelcomeEmailDialog } from "@/components/UkWelcomeEmailDialog";
import { UK_PROGRAM_WEEKS, UK_TARGET_ITEMS } from "@shared/uk-program";
import { UkWeekGrid, UkGridLegend } from "@/components/UkWeekGrid";
import { UkMondaySelect, localTodayYmd } from "@/components/UkMondaySelect";
import { ukStartForCurrentWeek } from "@shared/uk-program";

type WeekRow = {
  week: number; monday: string | null; totalActivities: number; doneActivities: number;
  arama: number | null; randevu: number | null; tekYetki: number | null;
  kapanis: number; bhb: number; katkiPayi: number;
  coachNote: string | null; confirmedAt: string | null; confirmedBy: string | null;
};

type ProgramData = {
  participant: { employeeId: number; name: string; kwuid: string | null; status: string; coachId: number | null; coachName: string | null; programStart: string | null; ukStartDate: string | null; manual: boolean; profileCoach?: boolean; source: "manual" | "auto" | "backfill" | null };
  week1Monday: string | null;
  currentWeek: number;
  checks: Record<string, { at: string; by: string | null }>;
  weeks: WeekRow[];
  score: { rows: { key: string; label: string; points: number; planned: number; done: number; earned: number }[]; total: number; max: number };
  targetScore: {
    rows: { key: string; label: string; points: number; source: "manual" | "auto"; mode: "weekly" | "total"; target: number | null; hint: string; done: number; targetTotal: number | null; weeksMet: number | null; earned: number }[];
    total: number; max: number;
  };
  totals: { activities: number; done: number };
  canEdit: boolean;
  isAdmin?: boolean;
};

function fmtYmd(ymd: string | null) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}
function fmtTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n) + " ₺";
}
function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Haftalık gerçekleşen + koç onayı ─────────────────────────────────────────
function WeekSummary({ employeeId, row, canEdit }: { employeeId: number; row: WeekRow; canEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [arama, setArama] = useState("");
  const [randevu, setRandevu] = useState("");
  const [tekYetki, setTekYetki] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setArama(row.arama?.toString() ?? "");
    setRandevu(row.randevu?.toString() ?? "");
    setTekYetki(row.tekYetki?.toString() ?? "");
    setNote(row.coachNote ?? "");
  }, [row.week, row.arama, row.randevu, row.tekYetki, row.coachNote]);

  const save = useMutation({
    mutationFn: (confirm: boolean | undefined) =>
      fetch(`/api/uk-program/${employeeId}/weeks/${row.week}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arama, randevu, tekYetki, coachNote: note, confirm }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? "Kaydedilemedi"); }),
    onSuccess: (_d, confirm) => {
      qc.invalidateQueries({ queryKey: ["/api/uk-program"] });
      toast({ title: confirm === true ? `${row.week}. hafta onaylandı` : confirm === false ? "Onay kaldırıldı" : "Kaydedildi" });
    },
    onError: (e: any) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const manual = (label: string, v: string, set: (s: string) => void, hint?: string) => (
    <div className="rounded-lg bg-muted/40 ring-1 ring-border p-2.5">
      <p className="text-[11px] text-muted-foreground font-medium mb-1">{label} {hint && <span className="text-[10px] text-primary/70">{hint}</span>}</p>
      <input
        type="number" min={0} value={v} disabled={!canEdit}
        onChange={(e) => set(e.target.value)}
        className="w-full bg-white border border-input rounded-md px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-transparent disabled:border-transparent"
        placeholder="—"
      />
    </div>
  );
  const auto = (label: string, v: string, hint: string) => (
    <div className="rounded-lg bg-primary/5 ring-1 ring-primary/15 p-2.5" title={hint}>
      <p className="text-[11px] text-muted-foreground font-medium mb-1">{label} <span className="text-[10px] text-primary/70">otomatik</span></p>
      <p className="px-2 py-1 text-sm font-semibold">{v}</p>
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold">Koçunla ölçülebilirliğini ve sonraki haftanın programını teyit et — {row.week}. hafta gerçekleşen</h3>
        {row.confirmedAt
          ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {row.confirmedBy ?? "Koç"} onayladı · {new Date(row.confirmedAt).toLocaleDateString("tr-TR")}</span>
          : <span className="text-xs text-muted-foreground">Koç onayı bekliyor</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {manual("Arama", arama, setArama, "hedef 50")}
        {manual("Randevu", randevu, setRandevu, "hedef 1")}
        {manual("Tek Yetki (Satılık)", tekYetki, setTekYetki)}
        {auto("Kapanış", String(row.kapanis), "Bu haftaki tamamlanan işlem kapanışları")}
        {auto("BHB", fmtTRY(row.bhb), "Bu haftaki tamamlanan kapanışların BHB toplamı")}
        {auto("Katkı Payı", String(row.katkiPayi), "Bu hafta referans olduğu yeni adaylar")}
      </div>
      <p className="text-[11px] text-muted-foreground">Haftalık hedef: günde 10 arama (haftada 50) ve 1 randevu. Tek yetki, kapanış ve katkı payı 6 hafta toplamında değerlendirilir.</p>
      <textarea
        value={note} disabled={!canEdit} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder={canEdit ? "Koç notu: haftanın değerlendirmesi, sonraki hafta için odak…" : "Koç notu yok"}
        className="w-full border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-muted/30"
      />
      {canEdit && (
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" disabled={save.isPending} onClick={() => save.mutate(undefined)}>Kaydet</Button>
          {row.confirmedAt
            ? <Button variant="outline" size="sm" disabled={save.isPending} onClick={() => save.mutate(false)}>Onayı Kaldır</Button>
            : <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(true)} className="gap-1.5"><CheckCircle2 className="h-4 w-4" /> Kaydet ve Haftayı Onayla</Button>}
        </div>
      )}
    </div>
  );
}

// ── Skor tablosu ─────────────────────────────────────────────────────────────
function ScoreTable({ data }: { data: ProgramData }) {
  const targetTotals = useMemo(() => {
    const sum = (k: keyof WeekRow) => data.weeks.reduce((s, w) => s + (Number(w[k]) || 0), 0);
    return {
      arama: sum("arama"), randevu: sum("randevu"), tekYetki: sum("tekYetki"),
      kapanis: sum("kapanis"), bhb: sum("bhb"), katkiPayi: sum("katkiPayi"),
    } as Record<string, number>;
  }, [data.weeks]);

  return (
    <div className="grid lg:grid-cols-[3fr_2fr] gap-4 items-start">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Aktivite</h3>
          <span className="text-xs text-muted-foreground">Puan × (yapılan ÷ planlanan)</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2">Kalem</th>
              <th className="text-right font-medium px-3 py-2">Yapılan / Planlanan</th>
              <th className="text-right font-medium px-3 py-2">Puan</th>
              <th className="text-right font-medium px-4 py-2">Kazanılan</th>
            </tr>
          </thead>
          <tbody>
            {data.score.rows.map((r) => {
              const pct = r.planned ? Math.min(100, (r.done / r.planned) * 100) : 0;
              return (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-4 py-2">
                    {r.label}
                    {r.key === "katki" && <span className="ml-1 text-[10px] text-muted-foreground">(referans olduğu adaylar)</span>}
                    <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">{r.done} / {r.planned}</td>
                  <td className="px-3 py-2 text-right">{r.points}</td>
                  <td className="px-4 py-2 text-right font-semibold">{r.earned.toLocaleString("tr-TR")}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-red-600 text-white">
            <tr>
              <td className="px-4 py-2.5 font-bold" colSpan={2}>TOPLAM PUAN</td>
              <td className="px-3 py-2.5 text-right font-bold">{data.score.max}</td>
              <td className="px-4 py-2.5 text-right font-bold text-base">{data.score.total.toLocaleString("tr-TR")}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Hedef</h3>
          <span className="text-xs text-muted-foreground text-right">Haftalık kalemler her hafta ayrı, diğerleri 6 hafta toplamı</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2">Kalem</th>
              <th className="text-right font-medium px-3 py-2">Gerçekleşen / Hedef</th>
              <th className="text-right font-medium px-3 py-2">Puan</th>
              <th className="text-right font-medium px-4 py-2">Kazanılan</th>
            </tr>
          </thead>
          <tbody>
            {data.targetScore.rows.map((r) => {
              const pct = r.points ? Math.min(100, (r.earned / r.points) * 100) : 0;
              return (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-4 py-2">
                    {r.label} {r.source === "auto" && <span className="text-[10px] text-primary/70">otomatik</span>}
                    <p className="text-[10px] text-muted-foreground">{r.hint}</p>
                    <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                    {r.key === "bhb"
                      ? <>{fmtTRY(r.done)} / {r.targetTotal == null ? "—" : fmtTRY(r.targetTotal)}</>
                      : <>{r.done.toLocaleString("tr-TR")} / {r.targetTotal?.toLocaleString("tr-TR") ?? "—"}</>}
                    {r.weeksMet != null && <p className="text-[10px]">{r.weeksMet}/{UK_PROGRAM_WEEKS} hafta tuttu</p>}
                  </td>
                  <td className="px-3 py-2 text-right">{r.points}</td>
                  <td className="px-4 py-2 text-right font-semibold">{r.earned.toLocaleString("tr-TR")}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-red-600 text-white">
            <tr>
              <td className="px-4 py-2.5 font-bold" colSpan={2}>TOPLAM PUAN</td>
              <td className="px-3 py-2.5 text-right font-bold">{data.targetScore.max}</td>
              <td className="px-4 py-2.5 text-right font-bold text-base">{data.targetScore.total.toLocaleString("tr-TR")}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function UkBasariRotasiDetail() {
  const [, params] = useRoute("/uk-basari-rotasi/:employeeId");
  const employeeId = Number(params?.employeeId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const key = ["/api/uk-program", employeeId];

  const { data, isLoading } = useQuery<ProgramData>({
    queryKey: key,
    queryFn: () => fetch(`/api/uk-program/${employeeId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: Number.isFinite(employeeId),
  });

  const [tab, setTab] = useState<number | "skor">(1);
  // İlk yüklemede programın bulunduğu haftayı aç.
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (data && !initialized) {
      setTab(data.currentWeek >= 1 && data.currentWeek <= UK_PROGRAM_WEEKS ? data.currentWeek : data.currentWeek > UK_PROGRAM_WEEKS ? "skor" : 1);
      setInitialized(true);
    }
  }, [data, initialized]);

  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      fetch(`/api/uk-program/${employeeId}/checks/${id}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? "Kaydedilemedi"); }),
    // İşaretleme anında görünsün; sunucu sonucu ardından tazelenir.
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ProgramData>(key);
      if (prev) {
        const checks = { ...prev.checks };
        if (done) checks[id] = { at: new Date().toISOString(), by: null }; else delete checks[id];
        qc.setQueryData<ProgramData>(key, { ...prev, checks });
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["/api/uk-program"] }),
  });

  const [startInput, setStartInput] = useState("");
  useEffect(() => { setStartInput(data?.participant.ukStartDate ?? ""); }, [data?.participant.ukStartDate]);
  const saveStart = useMutation({
    mutationFn: (v: string) =>
      fetch(`/api/uk-program/${employeeId}/start`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ukStartDate: v }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? "Kaydedilemedi"); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/uk-program"] }); toast({ title: "Program başlangıcı güncellendi" }); },
    onError: (e: any) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  // Danışmanın rotasını kendisinin doldurduğu portal linki (Google girişli, yalnızca kendi verisi).
  const copyAdvisorLink = async () => {
    try {
      const r = await fetch(`/api/uk-program/${employeeId}/advisor-link`, { credentials: "include" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Link alınamadı");
      await navigator.clipboard.writeText(d.url);
      toast({
        title: "Danışman linki kopyalandı",
        description: d.loginEmails?.length
          ? `Danışman bu linkten Google ile giriş yapar: ${d.loginEmails.join(" / ")}`
          : "Uyarı: danışmanın kayıtlı e-postası yok, giriş yapamaz. Önce KW e-postasını girin.",
        variant: d.loginEmails?.length ? undefined : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    }
  };

  // Manuel katılım: koç değiştir / programdan çıkar (admin).
  const [, navigate] = useLocation();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const { data: coaches = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/hiring-managers"],
    queryFn: () => fetch("/api/hiring-managers", { credentials: "include" }).then((r) => r.json()),
    enabled: !!data?.isAdmin && !!data?.participant.manual,
  });
  const changeCoach = useMutation({
    mutationFn: (coachUserId: string) =>
      fetch(`/api/uk-program/${employeeId}/coach`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachUserId: coachUserId ? Number(coachUserId) : null }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? "Kaydedilemedi"); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/uk-program"] }); toast({ title: "Koç güncellendi" }); },
    onError: (e: any) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });
  const removeEnrollment = useMutation({
    mutationFn: () =>
      fetch(`/api/uk-program/${employeeId}/enrollment`, { method: "DELETE", credentials: "include" })
        .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? "Çıkarılamadı"); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/uk-program"] });
      toast({ title: "Danışman programdan çıkarıldı", description: "Kayıtları saklandı; yeniden eklenirse geri gelir." });
      navigate("/uk-basari-rotasi");
    },
    onError: (e: any) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return <Layout><p className="text-sm text-muted-foreground">Yükleniyor…</p></Layout>;
  }
  if ((data as any).error) {
    return <Layout><p className="text-sm text-red-600">{(data as any).error}</p></Layout>;
  }

  const p = data.participant;
  const pct = Math.round((Object.keys(data.checks).length / data.totals.activities) * 100);
  const weekRow = typeof tab === "number" ? data.weeks[tab - 1] : null;

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Link href="/uk-basari-rotasi" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> 45+45 Başarı Rotası
          </Link>
          {data.canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <a href={`/api/uk-program/${employeeId}/preview-as-advisor`} target="_blank" rel="noreferrer">
                  <Eye className="h-4 w-4" /> Danışman Gözüyle Gör
                </a>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyAdvisorLink}>
                <Link2 className="h-4 w-4" /> Danışman Linkini Kopyala
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setWelcomeOpen(true)}>
                <Mail className="h-4 w-4" /> Hoş Geldin Maili
                {(p as any).welcomeSentAt && <CheckCircle2 className="h-3.5 w-3.5 opacity-80" />}
              </Button>
            </div>
          )}
        </div>
        {data.canEdit && <UkWelcomeEmailDialog employeeId={employeeId} open={welcomeOpen} onOpenChange={setWelcomeOpen} />}

        {/* Başlık */}
        <div className="rounded-xl overflow-hidden border border-border bg-[#24064f] text-white">
          <div className="p-5 flex flex-wrap items-start gap-6 justify-between">
            <div>
              <p className="text-xs tracking-widest text-white/70">ÜRETKENLİK KOÇLUĞU PROGRAMI</p>
              <h1 className="text-2xl font-extrabold flex items-center gap-2 mt-0.5"><RouteIcon className="h-6 w-6 text-amber-300" /> 45+45 Başarı Rotası</h1>
              <p className="mt-2 text-lg font-semibold">{p.name}{p.kwuid && <span className="ml-2 text-sm font-mono text-white/60">{p.kwuid}</span>}</p>
              <div className="text-sm text-white/70 flex items-center gap-2 flex-wrap">
                Koç:
                {data.isAdmin && p.manual && !p.profileCoach ? (
                  <select
                    value={p.coachId ?? ""}
                    onChange={(e) => changeCoach.mutate(e.target.value)}
                    className="bg-white/90 text-foreground rounded px-1.5 py-0.5 text-sm"
                  >
                    <option value="">atanmamış</option>
                    {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : <span>{p.coachName ?? "atanmamış"}</span>}
                {p.source === "manual" && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/40">Manuel eklendi</span>
                )}
                {p.source === "auto" && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-300/20 text-amber-100 ring-1 ring-amber-200/40" title="Profilde ÜK koçu atandığında bir sonraki pazartesiden başladı">Koç atamasıyla eklendi</span>
                )}
              </div>
              {data.isAdmin && (
                confirmRemove ? (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-white/80">Programdan çıkarılsın mı?</span>
                    <button onClick={() => removeEnrollment.mutate()} className="rounded bg-red-500 px-2 py-1 font-semibold">Evet, çıkar</button>
                    <button onClick={() => setConfirmRemove(false)} className="rounded bg-white/15 px-2 py-1">Vazgeç</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmRemove(true)} className="mt-2 text-xs text-white/60 hover:text-white underline underline-offset-2">
                    Programdan çıkar
                  </button>
                )
              )}
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className="rounded-lg bg-white/10 px-4 py-2.5 min-w-[150px]">
                <p className="text-[11px] text-white/70">Program başlangıcı</p>
                {data.canEdit ? (
                  <div className="mt-0.5">
                    <UkMondaySelect
                      value={startInput}
                      onChange={(v) => { setStartInput(v); saveStart.mutate(v); }}
                      className="bg-white/90 text-foreground rounded px-1.5 py-0.5 text-sm max-w-[260px]"
                    />
                  </div>
                ) : <p className="font-semibold">{fmtYmd(p.programStart)}</p>}

              </div>
              <div className="rounded-lg bg-white/10 px-4 py-2.5">
                <p className="text-[11px] text-white/70">Şu an</p>
                {data.canEdit ? (
                  // Koç danışmanı başka haftaya taşıyabilir: başlangıç, bugün seçilen haftada
                  // kalacak şekilde pazartesiye kaydırılır.
                  <select
                    value={data.currentWeek >= 1 && data.currentWeek <= UK_PROGRAM_WEEKS ? String(data.currentWeek) : ""}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const v = ukStartForCurrentWeek(localTodayYmd(), Number(e.target.value));
                      setStartInput(v);
                      saveStart.mutate(v);
                    }}
                    className="mt-0.5 bg-white/90 text-foreground rounded px-1.5 py-0.5 text-sm"
                    title="Danışmanın içinde bulunduğu haftayı değiştir"
                  >
                    {!(data.currentWeek >= 1 && data.currentWeek <= UK_PROGRAM_WEEKS) && (
                      <option value="">{data.currentWeek === 0 ? "Başlamadı" : "Tamamlandı"}</option>
                    )}
                    {Array.from({ length: UK_PROGRAM_WEEKS }, (_, i) => i + 1).map((w) => (
                      <option key={w} value={w}>{w}. hafta</option>
                    ))}
                  </select>
                ) : (
                  <p className="font-semibold">
                    {data.currentWeek === 0 ? "Başlamadı" : data.currentWeek > UK_PROGRAM_WEEKS ? "Tamamlandı" : `${data.currentWeek}. hafta`}
                  </p>
                )}
              </div>
              <div className="rounded-lg bg-white/10 px-4 py-2.5">
                <p className="text-[11px] text-white/70">Aktivite</p>
                <p className="font-semibold">{Object.keys(data.checks).length} / {data.totals.activities} <span className="text-white/60 text-xs">%{pct}</span></p>
              </div>
              <div className="rounded-lg bg-red-600 px-4 py-2.5">
                <p className="text-[11px] text-white/80">Aktivite puanı</p>
                <p className="text-xl font-extrabold">{data.score.total.toLocaleString("tr-TR")} <span className="text-sm font-semibold text-white/70">/ {data.score.max}</span></p>
              </div>
              <div className="rounded-lg bg-red-600 px-4 py-2.5">
                <p className="text-[11px] text-white/80">Hedef puanı</p>
                <p className="text-xl font-extrabold">{data.targetScore.total.toLocaleString("tr-TR")} <span className="text-sm font-semibold text-white/70">/ {data.targetScore.max}</span></p>
              </div>
            </div>
          </div>
        </div>

        {!data.canEdit && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Görüntüleme modu — kutucukları yalnızca danışmanın ÜK koçu veya admin işaretleyebilir.</p>
        )}

        {/* Sekmeler */}
        <div className="flex gap-1 border-b border-border flex-wrap">
          {data.weeks.map((w) => {
            const active = tab === w.week;
            const isCurrent = data.currentWeek === w.week;
            return (
              <button
                key={w.week}
                onClick={() => setTab(w.week)}
                className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {w.week}. Hafta
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${w.doneActivities === w.totalActivities ? "bg-emerald-100 text-emerald-700" : "bg-muted"}`}>
                  {w.doneActivities}/{w.totalActivities}
                </span>
                {w.confirmedAt && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Bu hafta" />}
              </button>
            );
          })}
          <button
            onClick={() => setTab("skor")}
            className={`px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${tab === "skor" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Trophy className="h-4 w-4" /> Skor Tablosu
          </button>
        </div>

        {typeof tab === "number" && weekRow && (
          <>
            <UkGridLegend />
            <UkWeekGrid
              week={tab}
              week1Monday={data.week1Monday}
              today={todayYmd()}
              checks={data.checks}
              canToggle={() => data.canEdit}
              onToggle={(id, done) => toggle.mutate({ id, done })}
            />
            <WeekSummary employeeId={employeeId} row={weekRow} canEdit={data.canEdit} />
          </>
        )}
        {tab === "skor" && <ScoreTable data={data} />}
      </div>
    </Layout>
  );
}
