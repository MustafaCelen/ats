import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { User, ChevronDown, Check, Wallet, CalendarClock, Target, Award, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useEmployees } from "@/hooks/use-employees";

function fmtTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " ₺";
}
function fmtPct(n: number) {
  return `%${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtDays(n: number | null) {
  return n == null ? "—" : `${n.toLocaleString("tr-TR")} gün`;
}

type MonthBucket = { total: number; months: number[] };
interface PersonalScorecardData {
  employeeId: number; employeeName: string; kwuid: string;
  ukStartDate: string | null;
  cap: { capAmount: number | null; capUsed: number; capRemaining: number | null; periodStart: string; capYear: number; isCapper: boolean };
  years: number[];
  bhbByYear: Record<number, MonthBucket>;
  islemByYear: { toplam: Record<number, MonthBucket>; satilik: Record<number, MonthBucket>; kiralik: Record<number, MonthBucket> };
  sozlesmeByYear: Record<number, MonthBucket>;
  satilikStatsByYear: Record<number, { avgCommissionRate: number; totalVolume: number }>;
  portfolio: {
    satilik: { activeCount: number; activeVolume: number; lastDate: string | null; daysSinceLast: number | null };
    kiralik: { activeCount: number; activeVolume: number; lastDate: string | null; daysSinceLast: number | null };
  };
  donusSuresi: { satilikAvgDays: number | null; kiralikAvgDays: number | null };
}

function useAdvisorPersonalScorecard(employeeId: number | null) {
  return useQuery<PersonalScorecardData>({
    queryKey: [`/api/employees/${employeeId}/personal-scorecard`],
    queryFn: async () => {
      const r = await fetch(`/api/employees/${employeeId}/personal-scorecard`, { credentials: "include" });
      if (!r.ok) throw new Error("Karne yüklenemedi");
      return r.json();
    },
    enabled: employeeId != null,
  });
}

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-lg font-bold truncate">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function AdvisorPicker({ employeeId, onChange }: { employeeId: number | null; onChange: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const { data: employees = [] } = useEmployees();
  const active = (employees as any[]).filter((e) => e.status === "active");
  const selected = (employees as any[]).find((e) => e.id === employeeId);
  const label = selected ? `${selected.candidate?.name ?? `#${selected.id}`}${selected.candidate?.office ? ` — ${selected.candidate.office}` : ""}` : "Danışman seçin…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[260px] justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Danışman ara…" className="text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs">Danışman bulunamadı.</CommandEmpty>
            <CommandGroup>
              {active.map((e: any) => (
                <CommandItem
                  key={e.id}
                  value={`${e.candidate?.name ?? ""} ${e.kwuid ?? ""}`}
                  onSelect={() => { onChange(e.id); setOpen(false); }}
                  className="text-xs cursor-pointer"
                >
                  <Check className={`h-3.5 w-3.5 ${employeeId === e.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{e.candidate?.name ?? `#${e.id}`}</span>
                  {e.candidate?.office && <span className="ml-auto text-muted-foreground">{e.candidate.office}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const MONTH_LABELS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function MonthTable({ title, years, byYear, format }: {
  title: string; years: number[]; byYear: Record<number, MonthBucket>; format: (n: number) => string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium"></th>
              {years.map((y) => <th key={y} className="text-right px-3 py-2 font-medium">{y}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr className="font-semibold bg-muted/20">
              <td className="px-3 py-1.5">Toplam</td>
              {years.map((y) => <td key={y} className="text-right px-3 py-1.5 font-mono">{format(byYear[y]?.total ?? 0)}</td>)}
            </tr>
            {MONTH_LABELS.map((label, i) => (
              <tr key={label}>
                <td className="px-3 py-1.5">{label}</td>
                {years.map((y) => (
                  <td key={y} className="text-right px-3 py-1.5 font-mono">{format(byYear[y]?.months?.[i] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PortfolioCategoryBlock({ title, stat }: {
  title: string;
  stat: { activeCount: number; activeVolume: number; lastDate: string | null; daysSinceLast: number | null };
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">Aktif Portföy Adedi</p>
          <p className="text-base font-bold">{stat.activeCount.toLocaleString("tr-TR")}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Aktif Portföy Hacmi</p>
          <p className="text-base font-bold">{fmtTRY(stat.activeVolume)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Son Portföy Tarihi</p>
          <p className="text-base font-bold">{fmtDate(stat.lastDate)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Kaç Gündür Portföy Almıyor</p>
          <p className="text-base font-bold">{fmtDays(stat.daysSinceLast)}</p>
        </div>
      </div>
    </div>
  );
}

export default function AdvisorPersonalScorecard() {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const { data, isLoading } = useAdvisorPersonalScorecard(employeeId);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <User className="h-6 w-6 text-primary" />
              Danışman Karnesi
              {data?.cap.isCapper && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-300">
                  CAPPER
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tek bir danışmanın Cap durumu, aylık BHB/işlem geçmişi ve portföyü
            </p>
          </div>
          <AdvisorPicker employeeId={employeeId} onChange={setEmployeeId} />
        </div>

        {!employeeId && (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Başlamak için yukarıdan bir danışman seçin.
          </div>
        )}

        {employeeId && isLoading && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Yükleniyor…</div>
        )}

        {employeeId && !isLoading && data && (
          <>
            {/* ── Cap + ÜK ── */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <StatTile
                icon={<Wallet className="h-4.5 w-4.5" />}
                label="Cap'e Kalan Tutar"
                value={data.cap.capRemaining != null ? fmtTRY(data.cap.capRemaining) : "—"}
                sub={data.cap.capAmount != null ? `Cap: ${fmtTRY(data.cap.capAmount)} · Kullanılan: ${fmtTRY(data.cap.capUsed)}` : undefined}
              />
              <StatTile icon={<CalendarClock className="h-4.5 w-4.5" />} label="CAP Yıldönümü" value={fmtDate(data.cap.periodStart)} />
              <StatTile icon={<Target className="h-4.5 w-4.5" />} label="CAP Tutarı" value={data.cap.capAmount != null ? fmtTRY(data.cap.capAmount) : "—"} />
              <StatTile icon={<Award className="h-4.5 w-4.5" />} label="ÜK Giriş Tarihi" value={data.ukStartDate ? fmtDate(data.ukStartDate) : "—"} />
            </div>

            {/* ── BHB aylık ── */}
            <MonthTable title="BHB" years={data.years} byYear={data.bhbByYear} format={fmtTRY} />

            {/* ── İşlem adedi aylık: Toplam / Satılık / Kiralık ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <MonthTable title="Toplam İşlem" years={data.years} byYear={data.islemByYear.toplam} format={(n) => n.toLocaleString("tr-TR")} />
              <MonthTable title="Satılık İşlem" years={data.years} byYear={data.islemByYear.satilik} format={(n) => n.toLocaleString("tr-TR")} />
              <MonthTable title="Kiralık İşlem" years={data.years} byYear={data.islemByYear.kiralik} format={(n) => n.toLocaleString("tr-TR")} />
            </div>

            {/* ── Alınan Sözleşme Sayıları (aylık, portföye eklenen yeni ilan) ── */}
            <MonthTable title="Alınan Sözleşme Sayıları" years={data.years} byYear={data.sozlesmeByYear} format={(n) => n.toLocaleString("tr-TR")} />

            {/* ── Yıllık satılık özet ── */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border">
                <h3 className="text-sm font-semibold">Yıllık Satılık Özeti</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium"></th>
                      {data.years.map((y) => <th key={y} className="text-right px-3 py-2 font-medium">{y}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="px-3 py-1.5">Ortalama Satılık BHB Oranı</td>
                      {data.years.map((y) => (
                        <td key={y} className="text-right px-3 py-1.5 font-mono">{fmtPct(data.satilikStatsByYear[y]?.avgCommissionRate ?? 0)}</td>
                      ))}
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5">Toplam Satılık Hacmi</td>
                      {data.years.map((y) => (
                        <td key={y} className="text-right px-3 py-1.5 font-mono">{fmtTRY(data.satilikStatsByYear[y]?.totalVolume ?? 0)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── İşleme Dönme Süresi ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatTile icon={<Timer className="h-4.5 w-4.5" />} label="Satılık İşleme Dönme Süresi" value={fmtDays(data.donusSuresi.satilikAvgDays)} />
              <StatTile icon={<Timer className="h-4.5 w-4.5" />} label="Kiralık İşleme Dönme Süresi" value={fmtDays(data.donusSuresi.kiralikAvgDays)} />
            </div>

            {/* ── Portföy: Satılık / Kiralık ayrı ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <PortfolioCategoryBlock title="Aktif Satılık Portföy" stat={data.portfolio.satilik} />
              <PortfolioCategoryBlock title="Aktif Kiralık Portföy" stat={data.portfolio.kiralik} />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
