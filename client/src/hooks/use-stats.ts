import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useDashboardStats() {
  return useQuery({
    queryKey: [api.stats.dashboard.path],
    queryFn: async () => {
      const res = await fetch(api.stats.dashboard.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load dashboard stats");
      return res.json();
    },
  });
}

export function useReportStats(startDate?: string, endDate?: string, office?: string) {
  return useQuery({
    queryKey: [api.stats.reports.path, startDate, endDate, office],
    queryFn: async () => {
      const url = new URL(api.stats.reports.path, window.location.origin);
      if (startDate) url.searchParams.set("startDate", startDate);
      if (endDate) url.searchParams.set("endDate", endDate);
      if (office) url.searchParams.set("office", office);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load report stats");
      return res.json();
    },
  });
}

export function useEmployeeTrend(months: number = 24, office?: string) {
  return useQuery<{ month: string; count: number; joined: number; left: number; net: number }[]>({
    queryKey: [api.stats.employeeTrend.path, months, office],
    queryFn: async () => {
      const url = new URL(api.stats.employeeTrend.path, window.location.origin);
      url.searchParams.set("months", String(months));
      if (office) url.searchParams.set("office", office);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load employee trend");
      return res.json();
    },
  });
}

export type TrendSeries = { series: string[]; data: Array<Record<string, any>> };
export type Currency = "TL" | "USD" | "GOLD";
export type ClosingAnalytics = {
  currency: Currency;
  currencyAvailable: Record<Currency, boolean>;
  monthlyVolume: { month: string; count: number; totalValue: number }[];
  monthlyAvgPrice: { month: string; avgPrice: number }[];
  districtsTrend: TrendSeries;
  neighborhoodsTrend: TrendSeries;
  priceRangeTrend: TrendSeries;
  categoryTrend: TrendSeries;
  commissionTrend: TrendSeries;
  durationTrend: TrendSeries;
};

export function useClosingAnalytics(startDate?: string, endDate?: string, office?: string, dealCategory?: string, il?: string, ilce?: string, mahalle?: string, currency: Currency = "TL") {
  return useQuery<ClosingAnalytics>({
    queryKey: [api.stats.closingAnalytics.path, startDate, endDate, office, dealCategory, il, ilce, mahalle, currency],
    queryFn: async () => {
      const url = new URL(api.stats.closingAnalytics.path, window.location.origin);
      if (startDate) url.searchParams.set("startDate", startDate);
      if (endDate) url.searchParams.set("endDate", endDate);
      if (office) url.searchParams.set("office", office);
      if (dealCategory) url.searchParams.set("dealCategory", dealCategory);
      if (il) url.searchParams.set("il", il);
      if (ilce) url.searchParams.set("ilce", ilce);
      if (mahalle) url.searchParams.set("mahalle", mahalle);
      url.searchParams.set("currency", currency);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load closing analytics");
      return res.json();
    },
  });
}

export function useClosingLocations() {
  return useQuery<{ il: string; ilce: string; mahalle: string }[]>({
    queryKey: [api.stats.closingLocations.path],
    queryFn: async () => {
      const res = await fetch(api.stats.closingLocations.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load closing locations");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export type PeriodComparisonScope = {
  totalBHB: number; satilikBHB: number; kiralikBHB: number;
  totalVolume: number; satilikVolume: number; kiralikVolume: number;
  totalCount: number; satilikCount: number; kiralikCount: number;
  danismanSayisi: number; capperSayisi: number; milyonerSayisi: number; uretenSayisi: number;
  danismanBasinaAylikBHB: number; danismanBasinaAylikSP: number;
  kepliKepsizOrani: { kepli: number; kepsiz: number };
  portfoyuOlanDanismanSayisi: number;
  alinanSozlesmeAdedi: number; alinanSozlesmeHacmi: number;
  aktifPortfoyAdedi: number; aktifPortfoyHacmi: number;
  saticiAliciDengesi: { satici: number; alici: number };
  ortalamaSatisFiyati: number;
  priceBuckets: { label: string; count: number; avgDuration: number | null }[];
  kapanisSuresi: number;
  durationBuckets: { label: string; count: number }[];
  indirimOrani: number;
  icerideKapanmaOrani: number;
};
export type PeriodComparisonReport = Record<string, { periodA: PeriodComparisonScope; periodB: PeriodComparisonScope }>;

export function usePeriodComparison(periodAStart?: string, periodAEnd?: string, periodBStart?: string, periodBEnd?: string) {
  return useQuery<PeriodComparisonReport>({
    queryKey: [api.stats.periodComparison.path, periodAStart, periodAEnd, periodBStart, periodBEnd],
    enabled: !!(periodAStart && periodAEnd && periodBStart && periodBEnd),
    queryFn: async () => {
      const url = new URL(api.stats.periodComparison.path, window.location.origin);
      url.searchParams.set("periodAStart", periodAStart!);
      url.searchParams.set("periodAEnd", periodAEnd!);
      url.searchParams.set("periodBStart", periodBStart!);
      url.searchParams.set("periodBEnd", periodBEnd!);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load period comparison report");
      return res.json();
    },
  });
}
