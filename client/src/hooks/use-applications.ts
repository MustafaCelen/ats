import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type Application, type Candidate, type Job, type InsertApplication } from "@shared/schema";

export type ApplicationWithRelations = Application & { candidate?: Candidate; job?: Job; latestNote?: string | null };

export function useApplications(jobId?: number, candidateId?: number) {
  return useQuery<ApplicationWithRelations[]>({
    queryKey: [api.applications.list.path, jobId, candidateId],
    queryFn: async () => {
      const url = new URL(api.applications.list.path, window.location.origin);
      if (jobId) url.searchParams.append("jobId", jobId.toString());
      if (candidateId) url.searchParams.append("candidateId", candidateId.toString());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch applications");
      return res.json();
    },
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertApplication) => {
      const res = await fetch(api.applications.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Başvuru oluşturulamadı.");
      }
      return res.json() as Promise<Application>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.applications.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
    },
  });
}

export function useUpdateApplicationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const url = buildUrl(api.applications.updateStatus.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json() as Promise<Application>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.applications.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats/reports"] });
    },
  });
}
