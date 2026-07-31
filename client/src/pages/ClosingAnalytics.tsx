import { useState, useMemo, Fragment } from "react";
import { Layout } from "@/components/Layout";
import { useClosingAnalytics, useClosingLocations, usePeriodComparison, type Currency, type PeriodComparisonScope } from "@/hooks/use-stats";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Line, Legend, LineChart,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrendingUp, MapPin, Home, DollarSign, Percent, Clock, Layers, Building2, Maximize2, ArrowLeftRight } from "lucide-react";

const OFFICE_OPTIONS = [
  { label: "Her İki Ofis", value: undefined },
  { label: "Akatlar", value: "Akatlar" },
  { label: "Zekeriyaköy", value: "Zekeriyaköy" },
] as const;

const CATEGORY_OPTIONS = [
  { label: "Tümü", value: undefined },
  { label: "Satış", value: "Satış" },
  { label: "Kiralık", value: "Kiralık" },
  { label: "Yönlendirme", value: "Yönlendirme" },
] as const;

// Year-over-year color palette: each year gets a distinct color
const YEAR_PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const colorForYear = (i: number) => YEAR_PALETTE[i % YEAR_PALETTE.length];

const MONTH_ABBR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const fmtMonNum = (num: string) => MONTH_ABBR[parseInt(num, 10) - 1] ?? num;

function formatYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CURRENCY_SYMBOL: Record<Currency, string> = { TL: "₺", USD: "$", GOLD: "gr" };
const CURRENCY_LABEL: Record<Currency, string> = { TL: "TL", USD: "USD", GOLD: "Altın (gr)" };

function fmtMoney(v: number, currency: Currency) {
  const sym = CURRENCY_SYMBOL[currency];
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B ${sym}`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M ${sym}`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K ${sym}`;
  return `${v.toFixed(0)} ${sym}`;
}
function fmtMoneyFull(v: number, currency: Currency) {
  const sym = CURRENCY_SYMBOL[currency];
  const n = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: currency === "GOLD" ? 2 : 0 }).format(v);
  return currency === "TL" ? `${n} ${sym}` : currency === "USD" ? `${sym}${n}` : `${n} ${sym}`;
}

// Filter rows to only include months in [startMo, endMo] (1-based)
function filterByMonths<T extends { month: string }>(rows: T[], startMo: number, endMo: number): T[] {
  return rows.filter((r) => {
    const mo = parseInt((r.month as string).split("-")[1], 10);
    return startMo <= endMo ? mo >= startMo && mo <= endMo : mo >= startMo || mo <= endMo;
  });
}

// Pivot [{month:"2024-01", value:X}, ...] → [{mo:"01", label:"Oca", "2024":X, "2025":Y}, ...]
function yoyMonthly<T extends { month: string }>(
  rows: T[],
  valueKey: keyof T,
): { data: Record<string, any>[]; years: string[] } {
  const years = new Set<string>();
  const byMonth: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const [yr, mo] = (row.month as string).split("-");
    years.add(yr);
    if (!byMonth[mo]) byMonth[mo] = {};
    byMonth[mo][yr] = Number(row[valueKey]) || 0;
  }
  const sortedYears = [...years].sort();
  return {
    data: Object.keys(byMonth)
      .sort()
      .map((mo) => ({ mo, label: fmtMonNum(mo), ...byMonth[mo] })),
    years: sortedYears,
  };
}

// Aggregate TrendSeries [{month, seriesA:v, seriesB:v}] by year → [{name:seriesA, "2024":total, ...}]
function aggregateByYear(
  trend: { series: string[]; data: Record<string, any>[] },
  mode: "sum" | "avg" = "sum",
): { data: Record<string, any>[]; years: string[] } {
  const years = new Set<string>();
  const acc: Record<string, Record<string, number>> = {};
  const cnt: Record<string, Record<string, number>> = {};
  for (const row of trend.data) {
    const yr = (row.month as string).split("-")[0];
    years.add(yr);
    for (const s of trend.series) {
      if (!acc[s]) { acc[s] = {}; cnt[s] = {}; }
      acc[s][yr] = (acc[s][yr] ?? 0) + (Number(row[s]) || 0);
      cnt[s][yr] = (cnt[s][yr] ?? 0) + 1;
    }
  }
  const sortedYears = [...years].sort();
  return {
    data: trend.series.map((s) => ({
      name: s,
      ...Object.fromEntries(
        sortedYears.map((yr) => [
          yr,
          mode === "avg" && cnt[s]?.[yr]
            ? acc[s][yr] / cnt[s][yr]
            : (acc[s]?.[yr] ?? 0),
        ]),
      ),
    })),
    years: sortedYears,
  };
}

const TOOLTIP_STYLE = { borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 };
const AXIS_PROPS = { axisLine: false, tickLine: false, tick: { fontSize: 11 } } as const;

const fmtInt = (v: number) => new Intl.NumberFormat("tr-TR").format(Math.round(v));

// Yıl bazlı dip toplam / ortalama tablosu — grafiklerin altında gösterilir
function TrendTable({ years, rows, footer, formatValue }: {
  years: string[];
  rows: { label: string; values: Record<string, number> }[];
  footer?: { label: string; values: Record<string, number> };
  formatValue: (v: number) => string;
}) {
  if (years.length === 0 || rows.length === 0) return null;
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">{rows.length === 1 ? "" : "Kategori"}</th>
            {years.map((y) => <th key={y} className="text-right px-3 py-2 font-medium text-muted-foreground">{y}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="px-3 py-1.5 font-medium whitespace-nowrap">{r.label}</td>
              {years.map((y) => <td key={y} className="text-right px-3 py-1.5 tabular-nums">{formatValue(r.values[y] ?? 0)}</td>)}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/20 font-semibold">
              <td className="px-3 py-1.5">{footer.label}</td>
              {years.map((y) => <td key={y} className="text-right px-3 py-1.5 tabular-nums">{formatValue(footer.values[y] ?? 0)}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// aggregateByYear sonucunu {label, values} satırlarına + "Toplam"/"Genel Ortalama" alt satırına çevirir
function pivotToRows(
  agg: { data: Record<string, any>[]; years: string[] },
  mode: "sum" | "avg",
  footerLabel: string,
): { rows: { label: string; values: Record<string, number> }[]; footer: { label: string; values: Record<string, number> } } {
  const rows = agg.data.map((d) => ({
    label: d.name as string,
    values: Object.fromEntries(agg.years.map((y) => [y, Number(d[y]) || 0])),
  }));
  const footerValues: Record<string, number> = {};
  for (const y of agg.years) {
    const vals = rows.map((r) => r.values[y] ?? 0);
    footerValues[y] = mode === "sum"
      ? vals.reduce((s, v) => s + v, 0)
      : (vals.filter((v) => v > 0).length ? vals.filter((v) => v > 0).reduce((s, v) => s + v, 0) / vals.filter((v) => v > 0).length : 0);
  }
  return { rows, footer: { label: footerLabel, values: footerValues } };
}

function Card({ icon: Icon, title, subtitle, onExpand, children }: {
  icon: any; title: string; subtitle?: string; onExpand?: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{title}</h2>
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Büyüt"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className={subtitle ? "mt-3" : "mt-4"}>{children}</div>
    </div>
  );
}

function EmptyState() {
  return <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Seçili dönem için veri yok</div>;
}

const MONTH_OPTIONS = [
  { value: 1, label: "Ocak" }, { value: 2, label: "Şubat" }, { value: 3, label: "Mart" },
  { value: 4, label: "Nisan" }, { value: 5, label: "Mayıs" }, { value: 6, label: "Haziran" },
  { value: 7, label: "Temmuz" }, { value: 8, label: "Ağustos" }, { value: 9, label: "Eylül" },
  { value: 10, label: "Ekim" }, { value: 11, label: "Kasım" }, { value: 12, label: "Aralık" },
] as const;

// Wide fixed range — fetch all years' data; month filter is applied on the frontend
const WIDE_FROM = "2020-01-01";

type Fmt = "money" | "int" | "percent" | "days";

function fmtByType(v: number, fmt: Fmt): string {
  switch (fmt) {
    case "money": return fmtMoneyFull(v, "TL");
    case "int": return fmtInt(v);
    case "percent": return `${v.toFixed(1)}%`;
    case "days": return `${Math.round(v)} gün`;
  }
}

// null = A değeri 0 olduğu için gelişim % hesaplanamıyor
function growthPct(a: number, b: number): number | null {
  if (!a) return b ? null : 0;
  return ((b - a) / a) * 100;
}

const PRICE_BUCKET_LABELS = [
  "10 milyon altı", "10-20 milyon arası", "20-30 milyon arası", "30-40 milyon arası",
  "40-50 milyon arası", "50-75 milyon arası", "75-100 milyon arası", "100-150 milyon arası", "150 milyon üstü",
];
const DURATION_BUCKET_LABELS = ["0-3 ay arası", "3-6 ay arası", "6 aydan çok"];

type MetricRow = { label: string; fmt: Fmt; get: (s: PeriodComparisonScope) => number; indent?: boolean };

const METRIC_ROWS: MetricRow[] = [
  { label: "Toplam BHB", fmt: "money", get: (s) => s.totalBHB },
  { label: "Satılık BHB", fmt: "money", get: (s) => s.satilikBHB, indent: true },
  { label: "Kiralık BHB", fmt: "money", get: (s) => s.kiralikBHB, indent: true },
  { label: "Toplam Hacim", fmt: "money", get: (s) => s.totalVolume },
  { label: "Satılık Hacim", fmt: "money", get: (s) => s.satilikVolume, indent: true },
  { label: "Kiralık Hacim", fmt: "money", get: (s) => s.kiralikVolume, indent: true },
  { label: "Toplam İşlem Adedi", fmt: "int", get: (s) => s.totalCount },
  { label: "Satılık Adedi", fmt: "int", get: (s) => s.satilikCount, indent: true },
  { label: "Kiralık Adedi", fmt: "int", get: (s) => s.kiralikCount, indent: true },
  { label: "Danışman Sayısı", fmt: "int", get: (s) => s.danismanSayisi },
  { label: "Üreten Danışman Sayısı", fmt: "int", get: (s) => s.uretenSayisi },
  { label: "Milyoner Sayısı (Yıllık BHB ≥ 1M)", fmt: "int", get: (s) => s.milyonerSayisi },
  { label: "Capper Sayısı", fmt: "int", get: (s) => s.capperSayisi },
  { label: "Kepli Oranı", fmt: "percent", get: (s) => s.kepliKepsizOrani.kepli },
  { label: "Kepsiz Oranı", fmt: "percent", get: (s) => s.kepliKepsizOrani.kepsiz },
  { label: "Danışman Başına Aylık BHB", fmt: "money", get: (s) => s.danismanBasinaAylikBHB },
  { label: "Danışman Başına Aylık Ş.P. (BM Payı)", fmt: "money", get: (s) => s.danismanBasinaAylikSP },
  { label: "Satıcı Tarafı Oranı", fmt: "percent", get: (s) => s.saticiAliciDengesi.satici },
  { label: "Alıcı Tarafı Oranı", fmt: "percent", get: (s) => s.saticiAliciDengesi.alici },
  { label: "İçeride Kapanma Oranı", fmt: "percent", get: (s) => s.icerideKapanmaOrani },
  { label: "Ortalama Satış Fiyatı", fmt: "money", get: (s) => s.ortalamaSatisFiyati },
  { label: "İndirim Oranı (Açılış Fiyatına Göre)", fmt: "percent", get: (s) => s.indirimOrani },
  { label: "Ortalama Kapanış Süresi", fmt: "days", get: (s) => s.kapanisSuresi },
  ...DURATION_BUCKET_LABELS.map((label, i) => ({
    label: `Süre Dilimi: ${label}`, fmt: "int" as Fmt,
    get: (s: PeriodComparisonScope) => s.durationBuckets[i]?.count ?? 0, indent: true,
  })),
  { label: "Portföyü Olan Danışman Sayısı", fmt: "int", get: (s) => s.portfoyuOlanDanismanSayisi },
  { label: "Alınan Sözleşme Adedi", fmt: "int", get: (s) => s.alinanSozlesmeAdedi },
  { label: "Alınan Sözleşme Hacmi", fmt: "money", get: (s) => s.alinanSozlesmeHacmi },
  { label: "Aktif Portföy Adedi", fmt: "int", get: (s) => s.aktifPortfoyAdedi },
  { label: "Aktif Portföy Hacmi", fmt: "money", get: (s) => s.aktifPortfoyHacmi },
  ...PRICE_BUCKET_LABELS.flatMap((label, i) => ([
    {
      label: `Fiyat Dilimi: ${label} (Adet)`, fmt: "int" as Fmt,
      get: (s: PeriodComparisonScope) => s.priceBuckets[i]?.count ?? 0, indent: true,
    },
    {
      label: `Fiyat Dilimi: ${label} (Hacim)`, fmt: "money" as Fmt,
      get: (s: PeriodComparisonScope) => s.priceBuckets[i]?.volume ?? 0, indent: true,
    },
  ])),
];

const SCOPE_KEYS = ["Akatlar", "Zekeriyaköy", "Konsolide"] as const;

function PeriodComparisonSection() {
  const today = useMemo(() => new Date(), []);
  const [periodAStart, setPeriodAStart] = useState(formatYMD(new Date(today.getFullYear() - 1, 0, 1)));
  const [periodAEnd, setPeriodAEnd] = useState(formatYMD(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())));
  const [periodBStart, setPeriodBStart] = useState(formatYMD(new Date(today.getFullYear(), 0, 1)));
  const [periodBEnd, setPeriodBEnd] = useState(formatYMD(today));

  const { data, isLoading } = usePeriodComparison(periodAStart, periodAEnd, periodBStart, periodBEnd);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <ArrowLeftRight className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Dönem Karşılaştırma Raporu</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">İki dönemi, ofis bazında (Akatlar / Zekeriyaköy / Konsolide) karşılaştırır</p>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Dönem A başlangıç</label>
            <Input type="date" className="h-8 text-xs w-[150px]" value={periodAStart} onChange={(e) => setPeriodAStart(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Dönem A bitiş</label>
            <Input type="date" className="h-8 text-xs w-[150px]" value={periodAEnd} onChange={(e) => setPeriodAEnd(e.target.value)} />
          </div>
        </div>
        <span className="text-muted-foreground text-sm pb-2">vs</span>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Dönem B başlangıç</label>
            <Input type="date" className="h-8 text-xs w-[150px]" value={periodBStart} onChange={(e) => setPeriodBStart(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Dönem B bitiş</label>
            <Input type="date" className="h-8 text-xs w-[150px]" value={periodBEnd} onChange={(e) => setPeriodBEnd(e.target.value)} />
          </div>
        </div>
      </div>

      {isLoading && <div className="h-40 bg-muted/40 rounded-lg animate-pulse" />}

      {!isLoading && data && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th rowSpan={2} className="text-left px-3 py-2 font-medium text-muted-foreground align-bottom">Metrik</th>
                {SCOPE_KEYS.map((key) => (
                  <th key={key} colSpan={3} className="text-center px-3 py-2 font-semibold border-l border-border">{key}</th>
                ))}
              </tr>
              <tr>
                {SCOPE_KEYS.map((key) => (
                  <Fragment key={key}>
                    <th className="text-right px-3 py-1.5 font-medium text-muted-foreground border-l border-border">Dönem A</th>
                    <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Dönem B</th>
                    <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Gelişim</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {METRIC_ROWS.map((row) => (
                <tr key={row.label}>
                  <td className={`px-3 py-1.5 font-medium whitespace-nowrap ${row.indent ? "pl-6 text-muted-foreground font-normal" : ""}`}>{row.label}</td>
                  {SCOPE_KEYS.map((key) => {
                    const scope = data[key];
                    if (!scope) return <td key={key} colSpan={3} className="text-right px-3 py-1.5 border-l border-border">—</td>;
                    const a = row.get(scope.periodA);
                    const b = row.get(scope.periodB);
                    const g = growthPct(a, b);
                    return (
                      <Fragment key={key}>
                        <td className="text-right px-3 py-1.5 tabular-nums border-l border-border">{fmtByType(a, row.fmt)}</td>
                        <td className="text-right px-3 py-1.5 tabular-nums">{fmtByType(b, row.fmt)}</td>
                        <td className={`text-right px-3 py-1.5 tabular-nums font-medium ${g === null ? "text-muted-foreground" : g > 0 ? "text-emerald-600" : g < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                          {g === null ? "—" : `${g > 0 ? "+" : ""}${g.toFixed(1)}%`}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ClosingAnalytics() {
  const [startMonth, setStartMonth] = useState(1);   // Ocak
  const [endMonth, setEndMonth] = useState(12);       // Aralık
  const [officeFilter, setOfficeFilter] = useState<string | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [ilFilter, setIlFilter] = useState<string | undefined>(undefined);
  const [ilceFilter, setIlceFilter] = useState<string | undefined>(undefined);
  const [mahalleFilter, setMahalleFilter] = useState<string | undefined>(undefined);
  const [currency, setCurrency] = useState<Currency>("TL");
  const [expandedChart, setExpandedChart] = useState<string | null>(null);

  const wideTo = useMemo(() => formatYMD(new Date()), []);

  const { data, isLoading } = useClosingAnalytics(
    WIDE_FROM, wideTo, officeFilter, categoryFilter, ilFilter, ilceFilter, mahalleFilter, currency,
  );
  const { data: locations = [] } = useClosingLocations();

  const ilOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of locations) if (l.il) set.add(l.il);
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [locations]);
  const ilceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of locations) {
      if (!l.ilce) continue;
      if (ilFilter && l.il !== ilFilter) continue;
      set.add(l.ilce);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [locations, ilFilter]);
  const mahalleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of locations) {
      if (!l.mahalle) continue;
      if (ilFilter && l.il !== ilFilter) continue;
      if (ilceFilter && l.ilce !== ilceFilter) continue;
      set.add(l.mahalle);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "tr"));
  }, [locations, ilFilter, ilceFilter]);

  const skel = <div className="h-64 bg-muted/40 rounded-lg animate-pulse" />;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header + filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Trend Raporları</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Yıllık karşılaştırmalı kapanış trendleri</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {OFFICE_OPTIONS.map((o) => (
                <Button
                  key={o.label}
                  size="sm"
                  variant={officeFilter === o.value ? "default" : "ghost"}
                  className="h-7 text-xs px-3"
                  onClick={() => setOfficeFilter(o.value as string | undefined)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {CATEGORY_OPTIONS.map((o) => (
                <Button
                  key={o.label}
                  size="sm"
                  variant={categoryFilter === o.value ? "default" : "ghost"}
                  className="h-7 text-xs px-3"
                  onClick={() => setCategoryFilter(o.value as string | undefined)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {(["TL", "USD", "GOLD"] as Currency[]).map((c) => {
                const disabled = c !== "TL" && data?.currencyAvailable && !data.currencyAvailable[c];
                return (
                  <Button
                    key={c}
                    size="sm"
                    variant={currency === c ? "default" : "ghost"}
                    className="h-7 text-xs px-3"
                    disabled={disabled}
                    onClick={() => !disabled && setCurrency(c)}
                    title={disabled ? (c === "GOLD" ? "Altın verisi yakında" : "Kur verisi yok") : ""}
                  >
                    {CURRENCY_LABEL[c]}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        <PeriodComparisonSection />

        {/* Month range + location controls */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-sm text-muted-foreground">Ay aralığı:</span>
            <select
              value={startMonth}
              onChange={(e) => setStartMonth(Number(e.target.value))}
              className="h-8 text-xs border border-input rounded bg-background px-2 min-w-[120px]"
            >
              {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <span className="text-sm text-muted-foreground">→</span>
            <select
              value={endMonth}
              onChange={(e) => setEndMonth(Number(e.target.value))}
              className="h-8 text-xs border border-input rounded bg-background px-2 min-w-[120px]"
            >
              {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <span className="text-xs text-muted-foreground">· Tüm yıllar karşılaştırılır</span>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-sm text-muted-foreground">Konum:</span>
            <select
              value={ilFilter ?? ""}
              onChange={(e) => { const v = e.target.value || undefined; setIlFilter(v); setIlceFilter(undefined); setMahalleFilter(undefined); }}
              className="h-8 text-xs border border-input rounded bg-background px-2 min-w-[140px]"
            >
              <option value="">Tüm iller</option>
              {ilOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select
              value={ilceFilter ?? ""}
              onChange={(e) => { const v = e.target.value || undefined; setIlceFilter(v); setMahalleFilter(undefined); }}
              className="h-8 text-xs border border-input rounded bg-background px-2 min-w-[160px]"
            >
              <option value="">Tüm ilçeler</option>
              {ilceOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select
              value={mahalleFilter ?? ""}
              onChange={(e) => setMahalleFilter(e.target.value || undefined)}
              className="h-8 text-xs border border-input rounded bg-background px-2 min-w-[180px]"
            >
              <option value="">Tüm mahalleler</option>
              {mahalleOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            {(ilFilter || ilceFilter || mahalleFilter) && (
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setIlFilter(undefined); setIlceFilter(undefined); setMahalleFilter(undefined); }}>
                Konum filtresini temizle
              </Button>
            )}
          </div>
        </div>

        {(() => {
          type ChartDef = { id: string; icon: any; title: string; subtitle: string; hasData: boolean; render: (h: number) => JSX.Element; table: JSX.Element | null };

          // Pre-filter data to selected month range before YoY pivots
          const fVol   = filterByMonths(data?.monthlyVolume ?? [], startMonth, endMonth);
          const fPrice = filterByMonths(data?.monthlyAvgPrice ?? [], startMonth, endMonth);
          const fDist  = { series: data?.districtsTrend?.series ?? [],    data: filterByMonths(data?.districtsTrend?.data ?? [], startMonth, endMonth) };
          const fNeigh = { series: data?.neighborhoodsTrend?.series ?? [], data: filterByMonths(data?.neighborhoodsTrend?.data ?? [], startMonth, endMonth) };
          const fRange = { series: data?.priceRangeTrend?.series ?? [],    data: filterByMonths(data?.priceRangeTrend?.data ?? [], startMonth, endMonth) };
          const fCat   = { series: data?.categoryTrend?.series ?? [],      data: filterByMonths(data?.categoryTrend?.data ?? [], startMonth, endMonth) };
          const fComm  = { series: data?.commissionTrend?.series ?? [],    data: filterByMonths(data?.commissionTrend?.data ?? [], startMonth, endMonth) };
          const fDur   = { series: data?.durationTrend?.series ?? [],      data: filterByMonths(data?.durationTrend?.data ?? [], startMonth, endMonth) };

          const chartDefs: ChartDef[] = [
            // ── 1. İşlem adedi: X=ay, lines per year
            {
              id: "volume",
              icon: TrendingUp,
              title: "Aylık Kapanış Adedi",
              subtitle: "Aylar bazında yıllık karşılaştırma",
              hasData: fVol.length > 0,
              render: (h) => {
                const { data: yoy, years } = yoyMonthly(fVol, "count");
                return (
                  <ResponsiveContainer width="100%" height={h}>
                    <LineChart data={yoy} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" {...AXIS_PROPS} />
                      <YAxis {...AXIS_PROPS} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {years.map((yr, i) => (
                        <Line key={yr} type="monotone" dataKey={yr} name={yr} stroke={colorForYear(i)} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                );
              },
              table: (() => {
                const { data: yoy, years } = yoyMonthly(fVol, "count");
                if (years.length === 0) return null;
                const totals: Record<string, number> = {};
                for (const yr of years) totals[yr] = yoy.reduce((s, row) => s + (Number(row[yr]) || 0), 0);
                return <TrendTable years={years} rows={[{ label: "Toplam Kapanış", values: totals }]} formatValue={fmtInt} />;
              })(),
            },

            // ── 2. Ortalama fiyat: X=ay, lines per year
            {
              id: "avgPrice",
              icon: DollarSign,
              title: "Ortalama Satış Fiyatı",
              subtitle: `Aylar bazında yıllık karşılaştırma · ${CURRENCY_LABEL[currency]}`,
              hasData: fPrice.length > 0,
              render: (h) => {
                const { data: yoy, years } = yoyMonthly(fPrice, "avgPrice");
                return (
                  <ResponsiveContainer width="100%" height={h}>
                    <LineChart data={yoy} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" {...AXIS_PROPS} />
                      <YAxis {...AXIS_PROPS} tickFormatter={(v) => fmtMoney(v, currency)} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number, name: string) => [fmtMoneyFull(v, currency), name]}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {years.map((yr, i) => (
                        <Line key={yr} type="monotone" dataKey={yr} name={yr} stroke={colorForYear(i)} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                );
              },
              table: (() => {
                const { data: yoy, years } = yoyMonthly(fPrice, "avgPrice");
                if (years.length === 0) return null;
                const avgs: Record<string, number> = {};
                for (const yr of years) {
                  const vals = yoy.map((row) => Number(row[yr]) || 0).filter((v) => v > 0);
                  avgs[yr] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
                }
                return <TrendTable years={years} rows={[{ label: "Ortalama Fiyat", values: avgs }]} formatValue={(v) => fmtMoneyFull(v, currency)} />;
              })(),
            },

            // ── 3. İlçe: X=ilçe, grouped bars per year
            {
              id: "districts",
              icon: MapPin,
              title: "İlçe Bazlı Karşılaştırma",
              subtitle: "Seçilen dönem toplamı · yıllık",
              hasData: fDist.data.length > 0,
              render: (h) => {
                const { data: yoy, years } = aggregateByYear(fDist, "sum");
                return (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart data={yoy} margin={{ left: -10, right: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" {...AXIS_PROPS} angle={-15} textAnchor="end" interval={0} />
                      <YAxis {...AXIS_PROPS} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {years.map((yr, i) => (
                        <Bar key={yr} dataKey={yr} name={yr} fill={colorForYear(i)} radius={[3, 3, 0, 0]} maxBarSize={32} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                );
              },
              table: (() => {
                const agg = aggregateByYear(fDist, "sum");
                if (agg.years.length === 0) return null;
                const { rows, footer } = pivotToRows(agg, "sum", "Toplam");
                return <TrendTable years={agg.years} rows={rows} footer={footer} formatValue={fmtInt} />;
              })(),
            },

            // ── 4. Mahalle: X=mahalle, grouped bars per year
            {
              id: "neighborhoods",
              icon: Home,
              title: "Mahalle Bazlı Karşılaştırma",
              subtitle: "Seçilen dönem toplamı · yıllık",
              hasData: fNeigh.data.length > 0,
              render: (h) => {
                const { data: yoy, years } = aggregateByYear(fNeigh, "sum");
                return (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart data={yoy} margin={{ left: -10, right: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" {...AXIS_PROPS} angle={-15} textAnchor="end" interval={0} />
                      <YAxis {...AXIS_PROPS} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {years.map((yr, i) => (
                        <Bar key={yr} dataKey={yr} name={yr} fill={colorForYear(i)} radius={[3, 3, 0, 0]} maxBarSize={32} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                );
              },
              table: (() => {
                const agg = aggregateByYear(fNeigh, "sum");
                if (agg.years.length === 0) return null;
                const { rows, footer } = pivotToRows(agg, "sum", "Toplam");
                return <TrendTable years={agg.years} rows={rows} footer={footer} formatValue={fmtInt} />;
              })(),
            },

            // ── 5. Fiyat aralığı: X=fiyat dilimi, grouped bars per year
            {
              id: "priceRange",
              icon: Building2,
              title: "Fiyat Aralığı Dağılımı",
              subtitle: "Fiyat dilimine göre işlem sayısı · yıllık karşılaştırma",
              hasData: fRange.data.length > 0,
              render: (h) => {
                const { data: yoy, years } = aggregateByYear(fRange, "sum");
                return (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart data={yoy} margin={{ left: -10, right: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" {...AXIS_PROPS} angle={-15} textAnchor="end" interval={0} />
                      <YAxis {...AXIS_PROPS} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {years.map((yr, i) => (
                        <Bar key={yr} dataKey={yr} name={yr} fill={colorForYear(i)} radius={[3, 3, 0, 0]} maxBarSize={32} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                );
              },
              table: (() => {
                const agg = aggregateByYear(fRange, "sum");
                if (agg.years.length === 0) return null;
                const { rows, footer } = pivotToRows(agg, "sum", "Toplam");
                return <TrendTable years={agg.years} rows={rows} footer={footer} formatValue={fmtInt} />;
              })(),
            },

            // ── 6. Kategori: X=kategori, grouped bars per year
            {
              id: "category",
              icon: Layers,
              title: "Kategori Karşılaştırması",
              subtitle: "Satış / Kiralık / Yönlendirme · yıllık",
              hasData: fCat.data.length > 0,
              render: (h) => {
                const { data: yoy, years } = aggregateByYear(fCat, "sum");
                return (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart data={yoy} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" {...AXIS_PROPS} />
                      <YAxis {...AXIS_PROPS} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {years.map((yr, i) => (
                        <Bar key={yr} dataKey={yr} name={yr} fill={colorForYear(i)} radius={[3, 3, 0, 0]} maxBarSize={40} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                );
              },
              table: (() => {
                const agg = aggregateByYear(fCat, "sum");
                if (agg.years.length === 0) return null;
                const { rows, footer } = pivotToRows(agg, "sum", "Toplam");
                return <TrendTable years={agg.years} rows={rows} footer={footer} formatValue={fmtInt} />;
              })(),
            },

            // ── 7. Komisyon: X=kategori, grouped bars per year (avg %)
            {
              id: "commission",
              icon: Percent,
              title: "Ortalama Komisyon Oranı",
              subtitle: "Kategori başına ortalama · yıllık karşılaştırma",
              hasData: fComm.data.length > 0,
              render: (h) => {
                const { data: yoy, years } = aggregateByYear(fComm, "avg");
                return (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart data={yoy} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" {...AXIS_PROPS} />
                      <YAxis {...AXIS_PROPS} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number) => `${Number(v).toFixed(2)}%`}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {years.map((yr, i) => (
                        <Bar key={yr} dataKey={yr} name={yr} fill={colorForYear(i)} radius={[3, 3, 0, 0]} maxBarSize={40} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                );
              },
              table: (() => {
                const agg = aggregateByYear(fComm, "avg");
                if (agg.years.length === 0) return null;
                const { rows, footer } = pivotToRows(agg, "avg", "Genel Ortalama");
                return <TrendTable years={agg.years} rows={rows} footer={footer} formatValue={(v) => `${v.toFixed(2)}%`} />;
              })(),
            },

            // ── 8. Süre: X=kategori, grouped bars per year (avg gün)
            {
              id: "duration",
              icon: Clock,
              title: "Ortalama İşlem Süresi",
              subtitle: "Kategori başına ortalama gün · yıllık karşılaştırma",
              hasData: fDur.data.length > 0,
              render: (h) => {
                const { data: yoy, years } = aggregateByYear(fDur, "avg");
                return (
                  <ResponsiveContainer width="100%" height={h}>
                    <BarChart data={yoy} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" {...AXIS_PROPS} />
                      <YAxis {...AXIS_PROPS} allowDecimals={false} tickFormatter={(v) => `${Math.round(v)}g`} />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number) => `${Math.round(Number(v))} gün`}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {years.map((yr, i) => (
                        <Bar key={yr} dataKey={yr} name={yr} fill={colorForYear(i)} radius={[3, 3, 0, 0]} maxBarSize={40} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                );
              },
              table: (() => {
                const agg = aggregateByYear(fDur, "avg");
                if (agg.years.length === 0) return null;
                const { rows, footer } = pivotToRows(agg, "avg", "Genel Ortalama");
                return <TrendTable years={agg.years} rows={rows} footer={footer} formatValue={(v) => `${Math.round(v)} gün`} />;
              })(),
            },
          ];

          const active = chartDefs.find((c) => c.id === expandedChart) ?? null;
          const renderCardBody = (def: ChartDef, height: number) =>
            isLoading ? skel : !def.hasData ? <EmptyState /> : def.render(height);

          return (
            <>
              {[0, 2, 4, 6].map((rowStart) => (
                <div key={rowStart} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {chartDefs.slice(rowStart, rowStart + 2).map((def) => (
                    <Card
                      key={def.id}
                      icon={def.icon}
                      title={def.title}
                      subtitle={def.subtitle}
                      onExpand={() => setExpandedChart(def.id)}
                    >
                      {renderCardBody(def, 290)}
                      {!isLoading && def.hasData && def.table}
                    </Card>
                  ))}
                </div>
              ))}

              <Dialog open={!!active} onOpenChange={(open) => { if (!open) setExpandedChart(null); }}>
                <DialogContent className="max-w-6xl w-[95vw]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      {active && <active.icon className="h-4 w-4 text-primary" />}
                      {active?.title}
                    </DialogTitle>
                    {active?.subtitle && <p className="text-xs text-muted-foreground mt-1">{active.subtitle}</p>}
                  </DialogHeader>
                  <div className="mt-4">
                    {active && renderCardBody(active, 600)}
                    {active && !isLoading && active.hasData && active.table}
                  </div>
                </DialogContent>
              </Dialog>
            </>
          );
        })()}
      </div>
    </Layout>
  );
}
