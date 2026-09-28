import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAllJobs } from "@/hooks/use-jobs";
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

// ── Bölüm 2: Randevu (Randevu/İnterview) Hedefleri — ilan bazlı, şu ana kadar UI'ı yoktu ──
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

// ── Bölüm 3: Masraf Hedefleri — yıllık özet + link ──
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

// ── Bölüm 4 & 5: doğrudan link kartları (HM bazlı / danışman bazlı, kendi editörleri korunuyor) ──
function LinkCard({ icon: Icon, title, description, href }: { icon: any; title: string; description: string; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-1.5 hover:border-primary/50 transition-colors block">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </Link>
  );
}

export default function HedefGirisModulu() {
  const [year, setYear] = useState(new Date().getFullYear());

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" /> Hedef Giriş Modülü
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tüm hedef türlerinin tek bir bakışta özeti — makrodan (yıllık toplam) mikroya
              (ilan/ofis/danışman bazlı) giriş
            </p>
          </div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[year - 1, year, year + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Makro: yıllık toplam özetler */}
        <FinansalHedeflerOzet year={year} />
        <MasrafHedefleriOzet year={year} />

        {/* Mikro: yeni giriş noktası (daha önce hiç UI'ı yoktu) */}
        <RandevuHedefEditor year={year} />

        {/* Kendi özel editörü olan hedef türleri — buradan tek tıkla erişim */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LinkCard
            icon={TrendingUp}
            title="Büyüme Hedefleri (Hiring Manager bazlı)"
            description="Her HM kendi brüt (K0/K1/K2) ve net büyüme hedefini aylık olarak Dashboard'dan girer."
            href="/dashboard"
          />
          <LinkCard
            icon={UserCheck}
            title="Danışman BHB Hedefleri (çeyreklik)"
            description="Her danışman için ayrı, üç aylık BHB hedefi — Danışman Karnesi ekranından girilir."
            href="/advisor-personal-scorecard"
          />
        </div>
      </div>
    </Layout>
  );
}
