import { useState, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { useClosingAnalytics, useClosingLocations, type Currency } from "@/hooks/use-stats";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
  ComposedChart, Line, Legend, AreaChart, Area, LineChart,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
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

const CATEGORY_COLORS: Record<string, string> = {
  "Satış":       "#3b82f6",
  "Kiralık":     "#10b981",
  "Yönlendirme": "#f59e0b",
  "Belirtilmemiş": "#9ca3af",
};

// Series palette (used for districts, neighborhoods, price ranges)
const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#94a3b8"];
const colorFor = (i: number) => PALETTE[i % PALETTE.length];

// Price range palette: cool→warm as price grows
const PRICE_COLORS: Record<string, string> = {
  "0 - 2M":   "#0ea5e9",
  "2 - 5M":   "#22c55e",
  "5 - 10M":  "#eab308",
  "10 - 25M": "#f97316",
  "25 - 50M": "#ef4444",
  "50M+":     "#a855f7",
};

function formatYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtMonth(m: string) {
  const [y, mm] = m.split("-");
  return format(new Date(Number(y), Number(mm) - 1, 1), "MMM yy", { locale: tr });
}
function fmtMonthLong(m: string) {
  const [y, mm] = m.split("-");
  return format(new Date(Number(y), Number(mm) - 1, 1), "MMMM yyyy", { locale: tr });
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

function Card({ icon: Icon, title, subtitle, onExpand, children }: { icon: any; title: string; subtitle?: string; onExpand?: () => void; children: React.ReactNode }) {
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

const QUICK_RANGES = [
  { label: "Son 6 ay",  months: 6  },
  { label: "Son 12 ay", months: 12 },
  { label: "Son 24 ay", months: 24 },
  { label: "Son 36 ay", months: 36 },
] as const;

export default function ClosingAnalytics() {
  const now = new Date();
  const [fromDate, setFromDate] = useState(formatYMD(new Date(now.getFullYear(), now.getMonth() - 11, 1)));
  const [toDate, setToDate] = useState(formatYMD(now));
  const [officeFilter, setOfficeFilter] = useState<string | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(undefined);
  const [ilFilter, setIlFilter] = useState<string | undefined>(undefined);
  const [ilceFilter, setIlceFilter] = useState<string | undefined>(undefined);
  const [mahalleFilter, setMahalleFilter] = useState<string | undefined>(undefined);
  const [currency, setCurrency] = useState<Currency>("TL");
  const [expandedChart, setExpandedChart] = useState<string | null>(null);

  const applyQuickRange = (months: number) => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
    setFromDate(formatYMD(start));
    setToDate(formatYMD(end));
  };

  const { data, isLoading } = useClosingAnalytics(fromDate, toDate, officeFilter, categoryFilter, ilFilter, ilceFilter, mahalleFilter, currency);
  const { data: locations = [] } = useClosingLocations();

  // Cascading location dropdowns — Il → Ilce → Mahalle
  const ilOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of locations) if (l.il) set.add(l.il);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [locations]);
  const ilceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of locations) {
      if (!l.ilce) continue;
      if (ilFilter && l.il !== ilFilter) continue;
      set.add(l.ilce);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [locations, ilFilter]);
  const mahalleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of locations) {
      if (!l.mahalle) continue;
      if (ilFilter && l.il !== ilFilter) continue;
      if (ilceFilter && l.ilce !== ilceFilter) continue;
      set.add(l.mahalle);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "tr"));
  }, [locations, ilFilter, ilceFilter]);

  const skel = <div className="h-64 bg-muted/40 rounded-lg animate-pulse" />;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header + filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Kapanış Analitiği</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Coğrafi dağılım, fiyat trendleri ve işlem kırılımı</p>
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
                  data-testid={`btn-office-${o.label.replace(/\s/g, "-")}`}
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
            {/* Currency toggle */}
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

        {/* Date range + location controls */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Dönem:</span>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-[140px]" />
              <span className="text-muted-foreground">→</span>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-[140px]" />
            </div>
            <div className="flex items-center gap-1">
              {QUICK_RANGES.map((r) => (
                <Button key={r.label} size="sm" variant="outline" className="h-8 text-xs" onClick={() => applyQuickRange(r.months)}>
                  {r.label}
                </Button>
              ))}
            </div>
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
          type ChartDef = { id: string; icon: any; title: string; subtitle: string; hasData: boolean; render: (height: number) => JSX.Element };
          const chartDefs: ChartDef[] = [
            {
              id: "volume", icon: TrendingUp, title: "Aylık Kapanış Hacmi", subtitle: `İşlem adedi (bar) ve toplam ${CURRENCY_LABEL[currency]} (çizgi)`,
              hasData: (data?.monthlyVolume?.length ?? 0) > 0,
              render: (h) => (
                <ResponsiveContainer width="100%" height={h}>
                  <ComposedChart data={data!.monthlyVolume} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtMonth} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtMoney(v, currency)} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} labelFormatter={fmtMonthLong}
                      formatter={(v: number, n: string) => n.startsWith("Toplam") ? [fmtMoneyFull(v, currency), n] : [v, n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="count" name="Adet" fill="#3b82f6" />
                    <Line yAxisId="right" type="monotone" dataKey="totalValue" name={`Toplam ${CURRENCY_LABEL[currency]}`} stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ),
            },
            {
              id: "avgPrice", icon: DollarSign, title: "Ortalama Satış Fiyatı Trendi", subtitle: `Aylık ortalama (${CURRENCY_LABEL[currency]})`,
              hasData: (data?.monthlyAvgPrice?.length ?? 0) > 0,
              render: (h) => (
                <ResponsiveContainer width="100%" height={h}>
                  <ComposedChart data={data!.monthlyAvgPrice} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtMonth} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtMoney(v, currency)} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} labelFormatter={fmtMonthLong}
                      formatter={(v: number) => [fmtMoneyFull(v, currency), "Ortalama"]} />
                    <Line type="monotone" dataKey="avgPrice" name="Ortalama" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ),
            },
            {
              id: "districts", icon: MapPin, title: "İlçe Trend", subtitle: "Aylık işlem adedi · Top 6 ilçe + Diğer",
              hasData: (data?.districtsTrend?.data?.length ?? 0) > 0,
              render: (h) => (
                <ResponsiveContainer width="100%" height={h}>
                  <LineChart data={data!.districtsTrend.data} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtMonth} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} labelFormatter={fmtMonthLong} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data!.districtsTrend.series.map((s, i) => (
                      <Line key={s} type="monotone" dataKey={s} stroke={colorFor(i)} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ),
            },
            {
              id: "neighborhoods", icon: Home, title: "Mahalle Trend", subtitle: "Aylık işlem adedi · Top 6 mahalle + Diğer",
              hasData: (data?.neighborhoodsTrend?.data?.length ?? 0) > 0,
              render: (h) => (
                <ResponsiveContainer width="100%" height={h}>
                  <LineChart data={data!.neighborhoodsTrend.data} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtMonth} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} labelFormatter={fmtMonthLong} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data!.neighborhoodsTrend.series.map((s, i) => (
                      <Line key={s} type="monotone" dataKey={s} stroke={colorFor(i)} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ),
            },
            {
              id: "priceRange", icon: Building2, title: "Fiyat Aralığı Kompozisyonu", subtitle: "Aylık işlem sayısı · yığılmış",
              hasData: (data?.priceRangeTrend?.data?.length ?? 0) > 0,
              render: (h) => (
                <ResponsiveContainer width="100%" height={h}>
                  <AreaChart data={data!.priceRangeTrend.data} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtMonth} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} labelFormatter={fmtMonthLong} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data!.priceRangeTrend.series.map((s) => (
                      <Area key={s} type="monotone" dataKey={s} stackId="p" stroke={PRICE_COLORS[s] ?? "#9ca3af"} fill={PRICE_COLORS[s] ?? "#9ca3af"} fillOpacity={0.65} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ),
            },
            {
              id: "category", icon: Layers, title: "Kategori Kompozisyonu", subtitle: "Aylık işlem sayısı · yığılmış (Satış / Kiralık / Yönlendirme)",
              hasData: (data?.categoryTrend?.data?.length ?? 0) > 0,
              render: (h) => (
                <ResponsiveContainer width="100%" height={h}>
                  <AreaChart data={data!.categoryTrend.data} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtMonth} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} labelFormatter={fmtMonthLong} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data!.categoryTrend.series.map((s) => (
                      <Area key={s} type="monotone" dataKey={s} stackId="c" stroke={CATEGORY_COLORS[s] ?? "#9ca3af"} fill={CATEGORY_COLORS[s] ?? "#9ca3af"} fillOpacity={0.65} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ),
            },
            {
              id: "commission", icon: Percent, title: "Ortalama Komisyon Oranı Trendi", subtitle: "Kategori başına aylık ortalama (%)",
              hasData: (data?.commissionTrend?.data?.length ?? 0) > 0,
              render: (h) => (
                <ResponsiveContainer width="100%" height={h}>
                  <LineChart data={data!.commissionTrend.data} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtMonth} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} labelFormatter={fmtMonthLong}
                      formatter={(v: number) => `${Number(v).toFixed(2)}%`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data!.commissionTrend.series.map((s) => (
                      <Line key={s} type="monotone" dataKey={s} stroke={CATEGORY_COLORS[s] ?? "#9ca3af"} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ),
            },
            {
              id: "duration", icon: Clock, title: "Ortalama İşlem Süresi Trendi", subtitle: "Kategori başına aylık ortalama (gün)",
              hasData: (data?.durationTrend?.data?.length ?? 0) > 0,
              render: (h) => (
                <ResponsiveContainer width="100%" height={h}>
                  <LineChart data={data!.durationTrend.data} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtMonth} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} labelFormatter={fmtMonthLong}
                      formatter={(v: number) => `${Math.round(Number(v))} gün`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data!.durationTrend.series.map((s) => (
                      <Line key={s} type="monotone" dataKey={s} stroke={CATEGORY_COLORS[s] ?? "#9ca3af"} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ),
            },
          ];
          const active = chartDefs.find((c) => c.id === expandedChart) ?? null;
          const renderCardBody = (def: ChartDef, height: number) => isLoading ? skel : !def.hasData ? <EmptyState /> : def.render(height);

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
