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
