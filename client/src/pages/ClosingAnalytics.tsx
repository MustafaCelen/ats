import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useClosingAnalytics, useClosingLocations, type Currency } from "@/hooks/use-stats";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Line, Legend, LineChart,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrendingUp, MapPin, Home, DollarSign, Percent, Clock, Layers, Building2, Maximize2 } from "lucide-react";

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
            <h1 className="text-2xl font-display font-bold text-foreground">Kapanış Analitiği</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Yıllık karşılaştırmalı trend raporları</p>
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
          type ChartDef = { id: string; icon: any; title: string; subtitle: string; hasData: boolean; render: (h: number) => JSX.Element };

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
