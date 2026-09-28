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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Target, DollarSign, Receipt, TrendingUp, UserCheck, ExternalLink, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EXPENSE_CATEGORY_GROUPS, INCOME_CATEGORIES } from "@shared/schema";

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

// ── Bölüm 1: Finansal Hedefler (BHB/BM/Satılık/Kiralık) — ofis × ay bazlı doğrudan giriş ──
type FinancialTargetDraft = {
  bhb: string; bhbHigh: string; bm: string; bmHigh: string;
  satilik: string; satilikHigh: string; kiralik: string; kiralikHigh: string;
};
const emptyFinancialDraft: FinancialTargetDraft = {
  bhb: "", bhbHigh: "", bm: "", bmHigh: "", satilik: "", satilikHigh: "", kiralik: "", kiralikHigh: "",
};

function FinansalHedefEditor({ year }: { year: number }) {
  const qc = useQueryClient();
  const [office, setOffice] = useState<string>("Akatlar");
  const { data: rawTargets = [] } = useFinancialTargetsYear(year, office);
  const [draft, setDraft] = useState<Record<number, FinancialTargetDraft>>({});
  const [savingMonth, setSavingMonth] = useState<number | null>(null);

  const rowFor = (month: number): FinancialTargetDraft => {
    if (draft[month]) return draft[month];
    const t = rawTargets.find((x: any) => x.month === month);
    const p = (v: any) => (v != null ? String(parseFloat(v)) : "");
    const i = (v: any) => (v != null ? String(v) : "");
    return {
      bhb: p(t?.bhbTarget), bhbHigh: p(t?.bhbHighTarget),
      bm: p(t?.bmTarget), bmHigh: p(t?.bmHighTarget),
      satilik: i(t?.satilikAdetTarget), satilikHigh: i(t?.satilikAdetHighTarget),
      kiralik: i(t?.kiralikAdetTarget), kiralikHigh: i(t?.kiralikAdetHighTarget),
    };
  };
  const setField = (month: number, field: keyof FinancialTargetDraft, value: string) =>
    setDraft((prev) => ({ ...prev, [month]: { ...rowFor(month), [field]: value } }));

  const saveMonth = async (month: number) => {
    const row = rowFor(month);
    setSavingMonth(month);
    try {
      await fetch(`/api/financial-targets/${year}/${month}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          office,
          bhbTarget: row.bhb !== "" ? parseFloat(row.bhb) || null : null,
          bhbHighTarget: row.bhbHigh !== "" ? parseFloat(row.bhbHigh) || null : null,
          bmTarget: row.bm !== "" ? parseFloat(row.bm) || null : null,
          bmHighTarget: row.bmHigh !== "" ? parseFloat(row.bmHigh) || null : null,
          satilikAdetTarget: row.satilik !== "" ? parseInt(row.satilik) || null : null,
          satilikAdetHighTarget: row.satilikHigh !== "" ? parseInt(row.satilikHigh) || null : null,
          kiralikAdetTarget: row.kiralik !== "" ? parseInt(row.kiralik) || null : null,
          kiralikAdetHighTarget: row.kiralikHigh !== "" ? parseInt(row.kiralikHigh) || null : null,
        }),
      });
      qc.invalidateQueries({ queryKey: ["/api/financial-targets", year, office] });
    } finally {
      setSavingMonth(null);
    }
  };

  const inp = (month: number, field: keyof FinancialTargetDraft, wide?: boolean) => (
    <td key={field} className={`py-1 px-1.5 ${["bhb", "bm", "satilik", "kiralik"].includes(field) ? "border-l border-border/40" : ""}`}>
      <Input
        type="number"
        value={rowFor(month)[field]}
        onChange={(e) => setField(month, field, e.target.value)}
        onBlur={() => saveMonth(month)}
        placeholder="—"
        disabled={savingMonth === month}
        className={`h-7 text-xs text-right tabular-nums ${wide ? "w-24" : "w-16"}`}
      />
    </td>
  );

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <DollarSign className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Finansal Hedefler</h2>
        <span className="text-xs text-muted-foreground ml-1">BHB / BM / Satılık / Kiralık — aylık, ofis bazlı</span>
        <Select value={office} onValueChange={setOffice}>
          <SelectTrigger className="w-32 ml-auto h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OFFICES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-left w-16" rowSpan={2}>Ay</th>
              <th colSpan={2} className="text-xs font-medium text-muted-foreground py-1 px-2 text-center border-l border-border">BHB (₺)</th>
              <th colSpan={2} className="text-xs font-medium text-muted-foreground py-1 px-2 text-center border-l border-border">BM Payı (₺)</th>
              <th colSpan={2} className="text-xs font-medium text-muted-foreground py-1 px-2 text-center border-l border-border">Satılık Adet</th>
              <th colSpan={2} className="text-xs font-medium text-muted-foreground py-1 px-2 text-center border-l border-border">Kiralık Adet</th>
              <th className="w-6" rowSpan={2}></th>
            </tr>
            <tr className="bg-muted/30 border-b border-border">
              {["Forecast", "Re-Forecast", "Forecast", "Re-Forecast", "Forecast", "Re-Forecast", "Forecast", "Re-Forecast"].map((lbl, i) => (
                <th key={i} className={`text-[10px] font-medium text-muted-foreground py-1 px-2 text-right ${i % 2 === 0 ? "border-l border-border" : ""}`}>{lbl}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
              <tr key={month} className="border-b border-border/50 hover:bg-muted/20">
                <td className="py-1.5 px-4 font-medium text-xs">{MONTHS[month - 1]}</td>
                {inp(month, "bhb", true)}{inp(month, "bhbHigh", true)}
                {inp(month, "bm", true)}{inp(month, "bmHigh", true)}
                {inp(month, "satilik")}{inp(month, "satilikHigh")}
                {inp(month, "kiralik")}{inp(month, "kiralikHigh")}
                <td className="py-1 px-1 text-center text-xs text-muted-foreground">{savingMonth === month ? "…" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
        Alandan çıktığınızda (blur) otomatik kaydedilir.
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

// ── Bölüm 5: Masraf Hedefleri — kategori bazlı, aylık, tablı (grup + toplam) ──
const MASRAF_TABS: { key: string; label: string; type: "income" | "expense"; categories: readonly string[] }[] = [
  { key: "_toplam_", label: "Genel Toplam", type: "expense", categories: ["_TOTAL_"] },
  { key: "_gelir_", label: "Gelir", type: "income", categories: INCOME_CATEGORIES },
  ...EXPENSE_CATEGORY_GROUPS.map((g) => ({ key: g.group, label: g.group, type: "expense" as const, categories: g.items })),
];

function useExpenseTargetsYear(year: number) {
  return useQuery<any[]>({
    queryKey: ["/api/expense-targets", year],
    queryFn: async () => {
      const res = await fetch(`/api/expense-targets?year=${year}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

function MasrafHedefEditor({ year }: { year: number }) {
  const qc = useQueryClient();
  const { data: allTargets = [] } = useExpenseTargetsYear(year);
  const [activeTab, setActiveTab] = useState(MASRAF_TABS[0].key);
  const [draft, setDraft] = useState<Record<string, string>>({}); // key: `${type}|${category}|${month}`
  const [saving, setSaving] = useState<string | null>(null);

  const yearTotals = useMemo(() => {
    let income = 0, expense = 0;
    for (const t of allTargets) {
      const amt = parseFloat(t.amount ?? "0");
      if (t.category === "_TOTAL_") continue; // toplam satırı kategori toplamına karışmasın
      if (t.type === "income") income += amt; else expense += amt;
    }
    // Genel Toplam sekmesi manuel girilen tek satırdır — kategori toplamı sıfırsa onu kullan.
    const manualIncome = allTargets.find((t: any) => t.type === "income" && t.category === "_TOTAL_");
    const manualExpense = allTargets.find((t: any) => t.type === "expense" && t.category === "_TOTAL_");
    return {
      income: income || parseFloat(manualIncome?.amount ?? "0"),
      expense: expense || parseFloat(manualExpense?.amount ?? "0"),
    };
  }, [allTargets]);

  const valueFor = (type: string, category: string, month: number) => {
    const k = `${type}|${category}|${month}`;
    if (draft[k] !== undefined) return draft[k];
    const t = allTargets.find((x: any) => x.type === type && x.category === category && x.month === month);
    return t ? String(parseFloat(t.amount)) : "";
  };

  const save = async (type: string, category: string, month: number) => {
    const k = `${type}|${category}|${month}`;
    const raw = draft[k];
    if (raw === undefined) return;
    const n = parseFloat(raw.replace(",", "."));
    setSaving(k);
    try {
      await fetch("/api/expense-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ year, month, category, type, amount: isNaN(n) ? 0 : n }),
      });
      qc.invalidateQueries({ queryKey: ["/api/expense-targets", year] });
    } finally {
      setSaving(null);
    }
  };

  const tab = MASRAF_TABS.find((t) => t.key === activeTab) ?? MASRAF_TABS[0];
  const tabTotals = useMemo(() => {
    const perMonth = Array(12).fill(0);
    for (const cat of tab.categories) {
      for (let m = 1; m <= 12; m++) {
        const v = parseFloat(valueFor(tab.type, cat, m) || "0");
        if (!isNaN(v)) perMonth[m - 1] += v;
      }
    }
    return perMonth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, allTargets, draft]);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
        <Receipt className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Masraf Hedefleri</h2>
        <span className="text-xs text-muted-foreground ml-1">{year} — kategori bazlı, aylık</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="text-emerald-600 font-semibold">Gelir: {fmtTRY(yearTotals.income)}</span>
          <span className="text-red-600 font-semibold">Gider: {fmtTRY(yearTotals.expense)}</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" asChild>
            <Link href="/expense-reports"><ExternalLink className="h-3.5 w-3.5" /> Rapor Detayına Git</Link>
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="px-5 pt-3 overflow-x-auto">
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            {MASRAF_TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="text-xs h-7 px-3 rounded-full border border-border data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {MASRAF_TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className="text-xs font-medium text-muted-foreground py-2 px-4 text-left sticky left-0 bg-muted/40 min-w-[220px]">
                      {t.key === "_toplam_" ? "" : "Kategori"}
                    </th>
                    {MONTHS.map((m) => (
                      <th key={m} className="text-[10px] font-medium text-muted-foreground py-2 px-1.5 text-right min-w-[68px]">{m.slice(0, 3)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.categories.map((cat) => (
                    <tr key={cat} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-1.5 px-4 text-xs font-medium sticky left-0 bg-card">
                        {cat === "_TOTAL_" ? "Aylık Toplam Hedef" : cat}
                      </td>
                      {MONTHS.map((_, i) => {
                        const month = i + 1;
                        const k = `${t.type}|${cat}|${month}`;
                        return (
                          <td key={month} className="py-1 px-1">
                            <Input
                              type="number"
                              value={valueFor(t.type, cat, month)}
                              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                              onBlur={() => save(t.type, cat, month)}
                              disabled={saving === k}
                              placeholder="—"
                              className={`h-7 text-xs text-right tabular-nums w-full ${t.type === "income" ? "focus-visible:ring-emerald-500" : "focus-visible:ring-red-500"}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {t.categories.length > 1 && (
                    <tr className="bg-muted/30 font-semibold">
                      <td className="py-2 px-4 text-xs sticky left-0 bg-muted/30">Sekme Toplamı</td>
                      {tabTotals.map((v, i) => (
                        <td key={i} className={`py-2 px-1.5 text-right text-xs tabular-nums ${t.type === "income" ? "text-emerald-700" : "text-red-700"}`}>
                          {v > 0 ? fmtTRY(v) : "—"}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="px-5 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
        Alandan çıktığınızda (blur) otomatik kaydedilir. Kategoriler Masraf Raporları sayfasındaki gruplarla birebir aynıdır.
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

        {/* Makro: yıllık/aylık hedefler — hepsi doğrudan bu modülde girilir */}
        <FinansalHedefEditor year={year} />
        <MasrafHedefEditor year={year} />

        {/* Mikro: diğer giriş noktaları */}
        <RandevuHedefEditor year={year} />
        <BuyumeHedefEditor year={year} month={month} />
        <AdvisorBhbHedefEditor year={year} />
      </div>
    </Layout>
  );
}
