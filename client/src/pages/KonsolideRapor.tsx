// Konsolide Rapor — ofisin "KONSOLİDE 20xx" Excel'inin birebir ekran karşılığı.
// Üst tablo: RANDEVU / BRÜT / NET (Toplam · Yeni · K1 · K2) × Hedef · Actual · H/G%.
// Alt tablo: BHB Forecast · BM'ye Kalan Hizmet Bedeli · Masraflar · Diğer Gelirler · Kar ·
// Satılık Adet · Kiralık Adet × Hedef · Actual · H/G%.
// Satırlar: 12 ay + YTD (tamamlanmış aylar) + fark + TOPLAM (12 ay). Veri tek uçtan gelir
// (/api/reports/konsolide); yüzdeler ve toplamlar burada ve Excel aktarımında aynı yardımcılarla hesaplanır.
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Table2, Target } from "lucide-react";
import {
  addCatCounts, cumulativeHgPct, emptyCatCounts, monthlyHgPct,
  type CatCounts, type KonsolideMonth, type KonsolideReport,
} from "@shared/konsolide-report";

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

type Forecast = "forecast" | "reforecast";

// ── Biçimlendirme ─────────────────────────────────────────────────────────────
const fmtInt = (n: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(n));
const fmtPct = (p: number | null) => (p === null ? "-" : `${p}%`);

// ── Satır modeli: ay satırları + YTD + TOPLAM aynı yapıda ────────────────────
type Pair = { hedef: number; actual: number };
type CatPair = { hedef: CatCounts; actual: CatCounts };
type Row = {
  key: string;
  label: string;
  kind: "month" | "ytd" | "total";
  randevu: CatPair; brut: CatPair; net: CatPair;
  bhb: Pair; bm: Pair; masraf: Pair; digerGelir: Pair; kar: Pair; satilik: Pair; kiralik: Pair;
};

const pick = (v: { hedef: number; hedefHigh?: number; actual: number }, f: Forecast): Pair => ({
  hedef: f === "reforecast" ? (v.hedefHigh ?? v.hedef) : v.hedef,
  actual: v.actual,
});

function monthRow(m: KonsolideMonth, f: Forecast): Row {
  return {
    key: `m${m.month}`, label: MONTHS_TR[m.month - 1], kind: "month",
    randevu: m.randevu, brut: m.brut, net: m.net,
    bhb: pick(m.bhb, f), bm: pick(m.bm, f), masraf: pick(m.masraf, f), digerGelir: pick(m.digerGelir, f),
    kar: pick(m.kar, f), satilik: pick(m.satilik, f), kiralik: pick(m.kiralik, f),
  };
}

const emptyCatPair = (): CatPair => ({ hedef: emptyCatCounts(), actual: emptyCatCounts() });
const addPair = (a: Pair, b: Pair): Pair => ({ hedef: a.hedef + b.hedef, actual: a.actual + b.actual });
const addCatPair = (a: CatPair, b: CatPair): CatPair => ({ hedef: addCatCounts(a.hedef, b.hedef), actual: addCatCounts(a.actual, b.actual) });

function sumRows(rows: Row[], key: string, label: string, kind: Row["kind"]): Row {
  const z: Pair = { hedef: 0, actual: 0 };
  return rows.reduce<Row>((acc, r) => ({
    ...acc,
    randevu: addCatPair(acc.randevu, r.randevu), brut: addCatPair(acc.brut, r.brut), net: addCatPair(acc.net, r.net),
    bhb: addPair(acc.bhb, r.bhb), bm: addPair(acc.bm, r.bm), masraf: addPair(acc.masraf, r.masraf),
    digerGelir: addPair(acc.digerGelir, r.digerGelir), kar: addPair(acc.kar, r.kar),
    satilik: addPair(acc.satilik, r.satilik), kiralik: addPair(acc.kiralik, r.kiralik),
  }), {
    key, label, kind,
    randevu: emptyCatPair(), brut: emptyCatPair(), net: emptyCatPair(),
    bhb: z, bm: z, masraf: z, digerGelir: z, kar: z, satilik: z, kiralik: z,
  });
}

// ── Hücreler ──────────────────────────────────────────────────────────────────
// Excel'deki gibi: hedef mavi, gerçekleşen siyah; H/G% aylıkta sapma (A−H)/H, toplam satırlarında A/H.
function HgCell({ hedef, actual, kind, invert, className = "" }: { hedef: number; actual: number; kind: Row["kind"]; invert?: boolean; className?: string }) {
  const p = kind === "month" ? monthlyHgPct(hedef, actual) : cumulativeHgPct(hedef, actual);
  let tone = "";
  if (p !== null && kind === "month") {
    const good = invert ? p <= 0 : p >= 0;
    tone = good ? "text-emerald-700" : "text-red-600";
  }
  return <td className={`px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap ${tone} ${className}`}>{fmtPct(p)}</td>;
}

const HedefCell = ({ v, className = "" }: { v: number; className?: string }) => (
  <td className={`px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap text-sky-800 ${className}`}>{v ? fmtInt(v) : <span className="opacity-40">-</span>}</td>
);
const ActualCell = ({ v, className = "" }: { v: number; className?: string }) => (
  <td className={`px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap ${v < 0 ? "text-red-600" : ""} ${className}`}>{fmtInt(v)}</td>
);

// Bir metrik grubu (RANDEVU / BRÜT / NET): Toplam (H, A, %) + Yeni (H, A) + K1 (H, A) + K2 (H, A)
function CatGroupCells({ v, kind, first }: { v: CatPair; kind: Row["kind"]; first?: boolean }) {
  const b = first ? "border-l-2 border-border" : "border-l border-border";
  return (
    <>
      <HedefCell v={v.hedef.toplam} className={b} />
      <ActualCell v={v.actual.toplam} />
      <HgCell hedef={v.hedef.toplam} actual={v.actual.toplam} kind={kind} />
      <HedefCell v={v.hedef.K0} className="border-l border-border/60" />
      <ActualCell v={v.actual.K0} />
      <HedefCell v={v.hedef.K1} className="border-l border-border/60" />
      <ActualCell v={v.actual.K1} />
      <HedefCell v={v.hedef.K2} className="border-l border-border/60" />
      <ActualCell v={v.actual.K2} />
    </>
  );
}

function PairCells({ v, kind, invert }: { v: Pair; kind: Row["kind"]; invert?: boolean }) {
  return (
    <>
      <HedefCell v={v.hedef} className="border-l border-border" />
      <ActualCell v={v.actual} />
      <HgCell hedef={v.hedef} actual={v.actual} kind={kind} invert={invert} />
    </>
  );
}

const rowClass = (kind: Row["kind"]) =>
  kind === "ytd" ? "bg-slate-800 text-white font-bold [&_td]:text-white"
  : kind === "total" ? "bg-muted/60 font-bold border-t-2 border-border"
  : "border-b border-border/60 hover:bg-muted/20";

const GROUP_STYLES = {
  randevu: "bg-red-600 text-white",
  brut: "bg-blue-700 text-white",
  net: "bg-emerald-700 text-white",
  fin: "bg-slate-700 text-white",
  adet: "bg-emerald-700 text-white",
};

// ── Excel aktarımı ────────────────────────────────────────────────────────────
function exportXlsx(year: number, rows: Row[], forecast: Forecast, showPnl: boolean) {
  const wb = XLSX.utils.book_new();
  const pct = (h: number, a: number, kind: Row["kind"]) => {
    const p = kind === "month" ? monthlyHgPct(h, a) : cumulativeHgPct(h, a);
    return p === null ? "-" : p / 100;
  };
  const catCols = (v: CatPair, kind: Row["kind"]) => [
    v.hedef.toplam, v.actual.toplam, pct(v.hedef.toplam, v.actual.toplam, kind),
    v.hedef.K0, v.actual.K0, v.hedef.K1, v.actual.K1, v.hedef.K2, v.actual.K2,
  ];
  const pairCols = (v: Pair, kind: Row["kind"]) => [v.hedef, v.actual, pct(v.hedef, v.actual, kind)];

  // Sayfa 1 — KONSOLİDE
  const sub = ["Hedef", "Actual", "H/G %", "Hedef", "Actual", "Hedef", "Actual", "Hedef", "Actual"];
  const aoa1: (string | number)[][] = [
    [`KONSOLİDE ${year}`, "RANDEVU", "", "", "", "", "", "", "", "", "BRÜT", "", "", "", "", "", "", "", "", "NET", "", "", "", "", "", "", "", ""],
    ["", "Toplam Randevu", "", "", "Yeni", "", "K1", "", "K2", "", "Toplam Brüt", "", "", "Yeni", "", "K1", "", "K2", "", "Toplam Net", "", "", "Yeni", "", "K1", "", "K2", ""],
    ["", ...sub, ...sub, ...sub],
    ...rows.map((r) => [r.label, ...catCols(r.randevu, r.kind), ...catCols(r.brut, r.kind), ...catCols(r.net, r.kind)]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(aoa1);
  const merges1: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 2, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 0, c: 9 } }, { s: { r: 0, c: 10 }, e: { r: 0, c: 18 } }, { s: { r: 0, c: 19 }, e: { r: 0, c: 27 } },
  ];
  for (const base of [1, 10, 19]) {
    merges1.push({ s: { r: 1, c: base }, e: { r: 1, c: base + 2 } });
    for (const off of [3, 5, 7]) merges1.push({ s: { r: 1, c: base + off }, e: { r: 1, c: base + off + 1 } });
  }
  ws1["!merges"] = merges1;
  XLSX.utils.book_append_sheet(wb, ws1, "Konsolide");

  // Sayfa 2 — Finansal
  const finGroups = [
    `${year} BHB ${forecast === "reforecast" ? "Re-Forecast" : "Forecast"}`, "BM'ye Kalan Hizmet Bedeli",
    ...(showPnl ? ["Masraflar", "Diğer Gelirler", "Kar"] : []), "Satılık Adet", "Kiralık Adet",
  ];
  const aoa2: (string | number)[][] = [
    ["", ...finGroups.flatMap((g) => [g, "", ""])],
    ["", ...finGroups.flatMap(() => ["Hedef", "Actual", "H/G %"])],
    ...rows.map((r) => [
      r.label,
      ...pairCols(r.bhb, r.kind), ...pairCols(r.bm, r.kind),
      ...(showPnl ? [...pairCols(r.masraf, r.kind), ...pairCols(r.digerGelir, r.kind), ...pairCols(r.kar, r.kind)] : []),
      ...pairCols(r.satilik, r.kind), ...pairCols(r.kiralik, r.kind),
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
  ws2["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    ...finGroups.map((_, i) => ({ s: { r: 0, c: 1 + i * 3 }, e: { r: 0, c: 3 + i * 3 } })),
  ];
  XLSX.utils.book_append_sheet(wb, ws2, "Finansal");

  // Yüzde hücreleri Excel'de % biçiminde görünsün
  for (const ws of [ws1, ws2]) {
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        const header = ws[XLSX.utils.encode_cell({ r: ws === ws1 ? 2 : 1, c: C })];
        if (cell && typeof cell.v === "number" && header?.v === "H/G %") cell.z = "0%";
        else if (cell && typeof cell.v === "number") cell.z = "#,##0";
      }
    }
  }
  XLSX.writeFile(wb, `konsolide-${year}.xlsx`);
}

// ── Sayfa ─────────────────────────────────────────────────────────────────────
export default function KonsolideRapor() {
  // ?year=2027 ile derin bağlantı; listede olmayan yıl seçeneğe eklenir
  const [year, setYear] = useState(() => {
    const q = parseInt(new URLSearchParams(window.location.search).get("year") ?? "", 10);
    return q >= 2000 && q <= 2100 ? q : CURRENT_YEAR;
  });
  const yearOptions = YEARS.includes(year) ? YEARS : [...YEARS, year].sort();
  const [forecast, setForecast] = useState<Forecast>("forecast");

  const { data, isLoading, isError } = useQuery<KonsolideReport>({
    queryKey: ["/api/reports/konsolide", year],
    queryFn: async () => {
      const res = await fetch(`/api/reports/konsolide?year=${year}`, { credentials: "include" });
      if (!res.ok) throw new Error("Konsolide rapor yüklenemedi");
      return res.json();
    },
    staleTime: 60_000,
  });

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const months = data.months.map((m) => monthRow(m, forecast));
    const through = data.ytdThroughMonth;
    const ytdLabel = through > 0 ? `YTD (${MONTHS_SHORT[0]}–${MONTHS_SHORT[through - 1]})` : "YTD (—)";
    const ytd = sumRows(months.slice(0, through), "ytd", ytdLabel, "ytd");
    const total = sumRows(months, "total", "TOPLAM", "total");
    return [...months, ytd, total];
  }, [data, forecast]);

  const ytd = rows.find((r) => r.kind === "ytd");
  const showPnl = data?.includesPnl !== false;
  const finColCount = 1 + (showPnl ? 7 : 4) * 3;
  const diff = (p: Pair) => (p.hedef || p.actual ? p.actual - p.hedef : null);
  const DiffCell = ({ v, span = 1 }: { v: number | null; span?: number }) => (
    <td colSpan={span} className={`px-2 py-1 text-right tabular-nums text-[11px] ${v !== null && v < 0 ? "text-red-600" : "text-emerald-700"}`}>
      {v === null ? "" : (v > 0 ? "+" : "") + fmtInt(v)}
    </td>
  );

  const subHead = (
    <>
      <th className="px-1.5 py-1.5 text-right font-medium border-l-2 border-border">Hedef</th>
      <th className="px-1.5 py-1.5 text-right font-medium">Actual</th>
      <th className="px-1.5 py-1.5 text-right font-medium">H/G %</th>
      {["Yeni", "K1", "K2"].map((c) => (
        <Fragment key={c}>
          <th className="px-1.5 py-1.5 text-right font-medium border-l border-border/60">Hedef</th>
          <th className="px-1.5 py-1.5 text-right font-medium">Actual</th>
        </Fragment>
      ))}
    </>
  );
  const catHead = (
    <>
      <th colSpan={3} className="px-2 py-1 text-center font-semibold border-l-2 border-border">Toplam</th>
      <th colSpan={2} className="px-2 py-1 text-center font-semibold border-l border-border/60">Yeni</th>
      <th colSpan={2} className="px-2 py-1 text-center font-semibold border-l border-border/60 bg-rose-50">K1</th>
      <th colSpan={2} className="px-2 py-1 text-center font-semibold border-l border-border/60 bg-amber-50">K2</th>
    </>
  );

  return (
    <Layout>
      <div className="space-y-5" data-testid="konsolide-page">
        {/* Başlık + filtreler */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Table2 className="h-6 w-6 text-primary" /> Konsolide Rapor
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Akatlar + Zekeriyaköy · aylık hedef / gerçekleşen · YTD tamamlanmış ayları, TOPLAM 12 ayı kapsar
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1" data-testid="konsolide-forecast-toggle">
              <Button size="sm" variant={forecast === "forecast" ? "default" : "ghost"}
                className={`h-7 text-xs px-3 gap-1 ${forecast === "forecast" ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
                onClick={() => setForecast("forecast")} data-testid="konsolide-forecast">
                <Target className="h-3 w-3" /> Forecast
              </Button>
              <Button size="sm" variant={forecast === "reforecast" ? "default" : "ghost"}
                className={`h-7 text-xs px-3 gap-1 ${forecast === "reforecast" ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}`}
                onClick={() => setForecast("reforecast")} data-testid="konsolide-reforecast">
                <Target className="h-3 w-3" /> Re-Forecast
              </Button>
            </div>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-24 h-9" data-testid="konsolide-year"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={!rows.length} onClick={() => exportXlsx(year, rows, forecast, showPnl)} data-testid="konsolide-export">
              <Download className="h-4 w-4" /> Excel'e Aktar
            </Button>
          </div>
        </div>

        {isError && <p className="text-sm text-red-600">Rapor yüklenemedi.</p>}
        {isLoading && <p className="text-sm text-muted-foreground">Yükleniyor…</p>}

        {rows.length > 0 && (
          <>
            {/* ── Tablo 1: KONSOLİDE — Randevu / Brüt / Net ── */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="text-[11px] min-w-full" data-testid="konsolide-table">
                  <thead>
                    <tr>
                      <th rowSpan={3} className="sticky left-0 z-10 bg-red-700 text-white px-3 py-2 text-left font-bold align-middle min-w-[110px]">
                        KONSOLİDE {year}
                      </th>
                      <th colSpan={9} className={`px-1.5 py-1.5 text-center font-bold tracking-wide ${GROUP_STYLES.randevu}`}>RANDEVU</th>
                      <th colSpan={9} className={`px-1.5 py-1.5 text-center font-bold tracking-wide ${GROUP_STYLES.brut}`}>BRÜT</th>
                      <th colSpan={9} className={`px-1.5 py-1.5 text-center font-bold tracking-wide ${GROUP_STYLES.net}`}>NET</th>
                    </tr>
                    <tr className="bg-muted/40">{catHead}{catHead}{catHead}</tr>
                    <tr className="bg-muted/30 text-muted-foreground border-b border-border">{subHead}{subHead}{subHead}</tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <Fragment key={r.key}>
                        {r.kind === "ytd" && <tr className="h-2" aria-hidden="true"><td colSpan={28} /></tr>}
                        <tr className={rowClass(r.kind)} data-testid={`konsolide-row-${r.key}`}>
                          <td className={`sticky left-0 z-10 px-3 py-1.5 font-semibold whitespace-nowrap ${r.kind === "ytd" ? "bg-slate-800" : r.kind === "total" ? "bg-muted" : "bg-card"}`}>{r.label}</td>
                          <CatGroupCells v={r.randevu} kind={r.kind} first />
                          <CatGroupCells v={r.brut} kind={r.kind} first />
                          <CatGroupCells v={r.net} kind={r.kind} first />
                        </tr>
                        {r.kind === "ytd" && ytd && (
                          <tr className="text-muted-foreground" data-testid="konsolide-row-diff">
                            <td className="sticky left-0 z-10 bg-card px-3 py-1 text-[11px]">YTD fark</td>
                            <DiffCell v={diff({ hedef: ytd.randevu.hedef.toplam, actual: ytd.randevu.actual.toplam })} span={9} />
                            <DiffCell v={diff({ hedef: ytd.brut.hedef.toplam, actual: ytd.brut.actual.toplam })} span={9} />
                            <DiffCell v={diff({ hedef: ytd.net.hedef.toplam, actual: ytd.net.actual.toplam })} span={9} />
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
                Yeni = K0. Aylık H/G% = (Actual − Hedef) / Hedef; YTD ve TOPLAM satırlarında Actual / Hedef. Net = brüt giriş − çıkış.
              </p>
            </div>

            {/* ── Tablo 2: Finansal — BHB / BM / Masraf / Diğer Gelir / Kar / Satılık / Kiralık ── */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="text-[11px] min-w-full" data-testid="konsolide-fin-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="sticky left-0 z-10 bg-slate-800 text-white px-3 py-2 text-left font-bold align-middle min-w-[110px]">Finansal {year}</th>
                      <th colSpan={3} className={`px-1.5 py-1.5 text-center font-bold ${GROUP_STYLES.fin}`}>{year} BHB {forecast === "reforecast" ? "Re-Forecast" : "Forecast"}</th>
                      <th colSpan={3} className={`px-1.5 py-1.5 text-center font-bold ${GROUP_STYLES.fin} border-l border-white/30`}>BM'ye Kalan Hizmet Bedeli</th>
                      {showPnl && (
                        <>
                          <th colSpan={3} className={`px-1.5 py-1.5 text-center font-bold ${GROUP_STYLES.fin} border-l border-white/30`}>Masraflar</th>
                          <th colSpan={3} className={`px-1.5 py-1.5 text-center font-bold ${GROUP_STYLES.fin} border-l border-white/30`}>Diğer Gelirler</th>
                          <th colSpan={3} className={`px-1.5 py-1.5 text-center font-bold ${GROUP_STYLES.fin} border-l border-white/30`}>Kar</th>
                        </>
                      )}
                      <th colSpan={3} className={`px-1.5 py-1.5 text-center font-bold ${GROUP_STYLES.adet} border-l border-white/30`}>Satılık Adet</th>
                      <th colSpan={3} className={`px-1.5 py-1.5 text-center font-bold ${GROUP_STYLES.adet} border-l border-white/30`}>Kiralık Adet</th>
                    </tr>
                    <tr className="bg-muted/30 text-muted-foreground border-b border-border">
                      {Array.from({ length: showPnl ? 7 : 4 }, (_, i) => (
                        <Fragment key={i}>
                          <th className="px-1.5 py-1.5 text-right font-medium border-l border-border">Hedef</th>
                          <th className="px-1.5 py-1.5 text-right font-medium">Actual</th>
                          <th className="px-1.5 py-1.5 text-right font-medium">H/G %</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <Fragment key={r.key}>
                        {r.kind === "ytd" && <tr className="h-2" aria-hidden="true"><td colSpan={finColCount} /></tr>}
                        <tr className={rowClass(r.kind)} data-testid={`konsolide-fin-row-${r.key}`}>
                          <td className={`sticky left-0 z-10 px-3 py-1.5 font-semibold whitespace-nowrap ${r.kind === "ytd" ? "bg-slate-800" : r.kind === "total" ? "bg-muted" : "bg-card"}`}>{r.label}</td>
                          <PairCells v={r.bhb} kind={r.kind} />
                          <PairCells v={r.bm} kind={r.kind} />
                          {showPnl && (
                            <>
                              <PairCells v={r.masraf} kind={r.kind} invert />
                              <PairCells v={r.digerGelir} kind={r.kind} />
                              <PairCells v={r.kar} kind={r.kind} />
                            </>
                          )}
                          <PairCells v={r.satilik} kind={r.kind} />
                          <PairCells v={r.kiralik} kind={r.kind} />
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
                Tutarlar ₺. {showPnl ? <>Kar = BM'ye kalan hizmet bedeli + diğer gelirler − masraflar (hedef tarafında aynı formül, BM hedefi {forecast === "reforecast" ? "Re-Forecast" : "Forecast"}). Masraflarda hedefin altında kalmak yeşil. </> : <>Masraf, diğer gelir ve kar kolonları yalnız yöneticiye gösterilir. </>}
                Hedefler Hedef Giriş modülünden gelir.
              </p>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

