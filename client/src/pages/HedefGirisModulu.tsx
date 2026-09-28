import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAllJobs } from "@/hooks/use-jobs";
import { useEmployees } from "@/hooks/use-employees";
import { useAuth } from "@/hooks/use-auth";
import { useAdvisorBhbTargets, useUpsertAdvisorBhbTarget } from "@/hooks/use-advisor-scorecard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Target, DollarSign, Receipt, TrendingUp, UserCheck, ExternalLink, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function fmtTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " ₺";
}

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const OFFICES = ["Akatlar", "Zekeriyaköy"] as const;
const APPT_CATS = ["K0", "K1", "K2"] as const;
const K0K1K2 = APPT_CATS;

function useFinancialTargetsYear(year: number, office: string) {
  return useQuery<any[]>({
    queryKey: ["/api/financial-targets", year, office],
    queryFn: async () => {
      const res = await fetch(`/api/financial-targets?year=${year}&office=${encodeURIComponent(office)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

// ── Bölüm 1: Finansal Hedefler (BHB/BM/Satılık/Kiralık) — yıllık toplam özet ──
function FinansalHedeflerOzet({ year }: { year: number }) {
  const { data: ak = [] } = useFinancialTargetsYear(year, "Akatlar");
  const { data: zk = [] } = useFinancialTargetsYear(year, "Zekeriyaköy");
  const totals = useMemo(() => {
    const all = [...ak, ...zk];
    return all.reduce((acc, t) => ({
      bhb: acc.bhb + parseFloat(t.bhbTarget ?? "0"),
      bm: acc.bm + parseFloat(t.bmTarget ?? "0"),
      satilik: acc.satilik + (t.satilikAdetTarget ?? 0),
      kiralik: acc.kiralik + (t.kiralikAdetTarget ?? 0),
    }), { bhb: 0, bm: 0, satilik: 0, kiralik: 0 });
  }, [ak, zk]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Finansal Hedefler</h2>
        <span className="text-xs text-muted-foreground ml-1">{year} — her iki ofis toplamı</span>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs gap-1" asChild>
          <Link href="/financial-reports"><ExternalLink className="h-3.5 w-3.5" /> Aylık Detaya Git</Link>
        </Button>
      </div>
      <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1">
          <span className="text-xs text-muted-foreground">BHB Hedefi</span>
          <div className="text-xl font-bold">{fmtTRY(totals.bhb)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1">
          <span className="text-xs text-muted-foreground">BM Payı Hedefi</span>
          <div className="text-xl font-bold">{fmtTRY(totals.bm)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1">
          <span className="text-xs text-muted-foreground">Satılık Adet Hedefi</span>
          <div className="text-xl font-bold">{Math.round(totals.satilik)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1">
          <span className="text-xs text-muted-foreground">Kiralık Adet Hedefi</span>
          <div className="text-xl font-bold">{Math.round(totals.kiralik)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Bölüm 2: Randevu (Randevu/İnterview) Hedefleri — ilan bazlı ──
function RandevuHedefEditor({ year }: { year: number }) {
  const { data: jobs = [] } = useAllJobs();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [jobId, setJobId] = useState<string>("");
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [office, setOffice] = useState<string>("Akatlar");
  const [saving, setSaving] = useState(false);

  const { data: targets = [] } = useQuery<any[]>({
    queryKey: ["/api/interview-targets", year, month, jobId, office],
    queryFn: async () => {
      const res = await fetch(`/api/interview-targets?year=${year}&month=${month}&office=${encodeURIComponent(office)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const all = await res.json();
      return jobId ? all.filter((t: any) => String(t.jobId) === jobId) : all;
    },
    enabled: !!jobId,
  });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const valueFor = (cat: string) => draft[cat] ?? String(targets.find((t: any) => t.category === cat)?.target ?? "");

  const save = async (category: string) => {
    if (!jobId) { toast({ title: "Önce bir ilan seçin", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await fetch("/api/interview-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobId: Number(jobId), year, month: Number(month), category, office, target: Number(draft[category] ?? 0) }),
      });
      qc.invalidateQueries({ queryKey: ["/api/interview-targets"] });
      toast({ title: `${category} hedefi kaydedildi` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Calendar className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Randevu Hedefleri</h2>
        <span className="text-xs text-muted-foreground ml-1">İlan bazlı, aylık — K0/K1/K2</span>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select value={jobId} onValueChange={setJobId}>
            <SelectTrigger><SelectValue placeholder="İlan seçin" /></SelectTrigger>
            <SelectContent>
              {jobs.map((j: any) => <SelectItem key={j.id} value={String(j.id)}>{j.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={office} onValueChange={setOffice}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {OFFICES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {!jobId ? (
          <p className="text-sm text-muted-foreground/60 italic">Hedef girmek için bir ilan seçin.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {APPT_CATS.map((cat) => (
              <div key={cat} className="flex items-center gap-2">
                <span className="text-sm font-medium w-8">{cat}</span>
                <Input
                  type="number"
                  value={valueFor(cat)}
                  onChange={(e) => setDraft((d) => ({ ...d, [cat]: e.target.value }))}
                  onBlur={() => draft[cat] !== undefined && save(cat)}
                  disabled={saving}
                  className="h-9"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bölüm 3: Büyüme Hedefleri — HM × ofis bazlı, aylık (brüt K0/K1/K2 + net) ──
interface GrowthTargetValue { brutTargetK0: number; brutTargetK1: number; brutTargetK2: number; netTarget: number; }
const emptyGrowthTarget: GrowthTargetValue = { brutTargetK0: 0, brutTargetK1: 0, brutTargetK2: 0, netTarget: 0 };
const growthCatKey = { K0: "brutTargetK0", K1: "brutTargetK1", K2: "brutTargetK2" } as const;

function useGrowthTargetsByOffice(year: number, month: number, office: string) {
  return useQuery<(GrowthTargetValue & { userId: number })[]>({
    queryKey: ["/api/growth/targets-by-office", year, month, office],
    queryFn: async () => {
      const p = new URLSearchParams({ year: String(year), month: String(month), office });
      const res = await fetch(`/api/growth/targets-by-office?${p}`, { credentials: "include" });
      return res.ok ? res.json() : [];
    },
  });
}

function useSaveGrowthTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: GrowthTargetValue & { year: number; month: number; office: string; userId: number }) => {
      const res = await fetch("/api/growth/my-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/growth/targets-by-office", vars.year, vars.month, vars.office] });
      qc.invalidateQueries({ queryKey: ["/api/growth/my-target"] });
      qc.invalidateQueries({ queryKey: ["/api/growth/stats"] });
    },
  });
}

function GrowthTargetCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
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
        className="w-14 text-center text-xs border border-primary rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
      />
    );
  }

  return (
    <button
      onClick={() => { setLocal(String(value)); setEditing(true); }}
      className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors min-w-[24px] text-center"
      title="Hedefi düzenle"
    >
      {value > 0 ? value : <span className="opacity-40">—</span>}
    </button>
  );
}

function BuyumeHedefEditor({ year, month }: { year: number; month: number }) {
  const [office, setOffice] = useState<string>("Akatlar");
  const { data: hiringManagers = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetch("/api/users", { credentials: "include" }).then((r) => r.ok ? r.json() : []),
    select: (rows) => rows.filter((u) => u.role === "hiring_manager"),
  });
  const { data: rows = [] } = useGrowthTargetsByOffice(year, month, office);
  const saveTarget = useSaveGrowthTarget();
  const byUser = useMemo(() => {
    const map = new Map<number, GrowthTargetValue>();
    for (const t of rows) map.set(t.userId, { brutTargetK0: t.brutTargetK0, brutTargetK1: t.brutTargetK1, brutTargetK2: t.brutTargetK2, netTarget: t.netTarget });
    return map;
  }, [rows]);
  const brutTotal = (t: GrowthTargetValue) => t.brutTargetK0 + t.brutTargetK1 + t.brutTargetK2;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Büyüme Hedefleri</h2>
        <span className="text-xs text-muted-foreground ml-1">HM bazlı, aylık — {MONTHS[month - 1]} {year}</span>
        <Select value={office} onValueChange={setOffice}>
          <SelectTrigger className="w-32 ml-auto h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OFFICES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {hiringManagers.length === 0 ? (
        <p className="text-sm text-muted-foreground p-6 text-center">Hiring manager bulunamadı</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left font-medium text-muted-foreground py-2.5 px-4">Hiring Manager</th>
                {K0K1K2.map((cat) => (
                  <th key={cat} className="text-center font-semibold py-2.5 px-4">{cat}</th>
                ))}
                <th className="text-center font-medium text-muted-foreground py-2.5 px-4">Toplam Brüt</th>
                <th className="text-center font-medium text-muted-foreground py-2.5 px-4">Net Hedef</th>
              </tr>
            </thead>
            <tbody>
              {hiringManagers.map((hm) => {
                const t = byUser.get(hm.id) ?? emptyGrowthTarget;
                return (
                  <tr key={hm.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 font-medium text-sm text-foreground">{hm.name}</td>
                    {K0K1K2.map((cat) => (
                      <td key={cat} className="py-3 px-4 text-center">
                        <GrowthTargetCell
                          value={t[growthCatKey[cat]]}
                          onSave={(v) => saveTarget.mutate({ ...t, [growthCatKey[cat]]: v, year, month, office, userId: hm.id })}
                        />
                      </td>
                    ))}
                    <td className="py-3 px-4 text-center font-medium">{brutTotal(t)}</td>
                    <td className="py-3 px-4 text-center">
                      <GrowthTargetCell
                        value={t.netTarget}
                        onSave={(v) => saveTarget.mutate({ ...t, netTarget: v, year, month, office, userId: hm.id })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Bölüm 4: Danışman BHB Hedefleri — danışman × çeyrek/yıl bazlı ──
function AdvisorBhbHedefEditor({ year }: { year: number }) {
  const { data: employees = [] } = useEmployees();
  const advisors = useMemo(
    () => (employees as any[])
      .filter((e) => e.status === "active")
      .sort((a: any, b: any) => (a.candidate?.name ?? "").localeCompare(b.candidate?.name ?? "", "tr")),
    [employees]
  );
  const [employeeId, setEmployeeId] = useState<string>("");
  const [quarter, setQuarter] = useState(0); // 0 = yıllık

  const empId = employeeId ? Number(employeeId) : null;
  const { data: targets = [] } = useAdvisorBhbTargets(empId);
  const { mutate: upsertTarget, isPending: isSaving } = useUpsertAdvisorBhbTarget(empId);
  const [draft, setDraft] = useState<string>("");

  const currentTarget = targets.find((t: any) => t.year === year && t.quarter === quarter);
  const displayValue = draft !== "" ? draft : String(currentTarget?.bhbTarget ?? "");

  const handleSave = () => {
    if (!empId) return;
    const v = Number(draft !== "" ? draft : currentTarget?.bhbTarget ?? 0);
    upsertTarget({ year, quarter, bhbTarget: v }, { onSuccess: () => setDraft("") });
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Danışman BHB Hedefleri</h2>
        <span className="text-xs text-muted-foreground ml-1">Danışman bazlı, çeyreklik/yıllık</span>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs gap-1" asChild>
          <Link href="/advisor-personal-scorecard"><ExternalLink className="h-3.5 w-3.5" /> Karneye Git</Link>
        </Button>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select value={employeeId} onValueChange={(v) => { setEmployeeId(v); setDraft(""); }}>
            <SelectTrigger><SelectValue placeholder="Danışman seçin" /></SelectTrigger>
            <SelectContent>
              {advisors.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.candidate?.name ?? `#${e.id}`}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(quarter)} onValueChange={(v) => { setQuarter(Number(v)); setDraft(""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Yıllık</SelectItem>
              {[1, 2, 3, 4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Hedef BHB (₺)"
              value={displayValue}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!empId}
              className="h-9"
            />
            <Button size="sm" onClick={handleSave} disabled={!empId || isSaving} className="shrink-0">
              {isSaving ? "..." : "Kaydet"}
            </Button>
          </div>
        </div>
        {!empId && <p className="text-sm text-muted-foreground/60 italic">Hedef girmek için bir danışman seçin.</p>}
      </div>
    </div>
  );
}

// ── Bölüm 5: Masraf Hedefleri — yıllık özet + link ──
function MasrafHedefleriOzet({ year }: { year: number }) {
  const { data = [] } = useQuery<any[]>({
    queryKey: ["/api/expense-targets", year],
    queryFn: () => fetch(`/api/expense-targets?year=${year}`, { credentials: "include" }).then((r) => r.json()),
  });
  const totals = useMemo(() => data.reduce((acc: any, t: any) => {
    const amt = parseFloat(t.amount ?? "0");
    if (t.type === "income") acc.income += amt; else acc.expense += amt;
    return acc;
  }, { income: 0, expense: 0 }), [data]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Receipt className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Masraf Hedefleri</h2>
        <span className="text-xs text-muted-foreground ml-1">{year} yılı toplamı</span>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs gap-1" asChild>
          <Link href="/expense-reports"><ExternalLink className="h-3.5 w-3.5" /> Kategori Detayına Git</Link>
        </Button>
      </div>
      <div className="p-4 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1">
          <span className="text-xs text-muted-foreground">Gelir Hedefi</span>
          <div className="text-xl font-bold text-emerald-600">{fmtTRY(totals.income)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1">
          <span className="text-xs text-muted-foreground">Masraf Hedefi</span>
          <div className="text-xl font-bold text-red-600">{fmtTRY(totals.expense)}</div>
        </div>
      </div>
    </div>
  );
}

export default function HedefGirisModulu() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" /> Hedef Giriş Modülü
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tüm hedef türlerinin girişi tek modülde — makrodan (yıllık toplam) mikroya
              (ilan/ofis/danışman bazlı) giriş
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[year - 1, year, year + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Makro: yıllık toplam özetler */}
        <FinansalHedeflerOzet year={year} />
        <MasrafHedefleriOzet year={year} />

        {/* Mikro: doğrudan giriş noktaları — hepsi bu modülde */}
        <RandevuHedefEditor year={year} />
        <BuyumeHedefEditor year={year} month={month} />
        <AdvisorBhbHedefEditor year={year} />
      </div>
    </Layout>
  );
}
