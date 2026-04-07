import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const KEY = "/api/employees";

export function useEmployees() {
  return useQuery<any[]>({
    queryKey: [KEY],
    queryFn: async () => {
      const res = await fetch(KEY, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load employees");
      return res.json();
    },
  });
}

export function useCompleteHiring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { candidateId: number; jobId: number; applicationId: number; title?: string }) =>
      apiRequest("POST", KEY, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ["/api/applications"] });
      qc.invalidateQueries({ queryKey: ["/api/candidates"] });
    },
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; status?: string; title?: string; notes?: string; kwuid?: string; kwMail?: string; startDate?: string; contractType?: string | null; uretkenlikKoclugu?: boolean; uretkenlikKocluguManagerId?: number | null; uretkenlikKocluguOran?: string | null; capMonth?: string; capValue?: string; billingName?: string; billingAddress?: string; billingDistrict?: string; billingCity?: string; billingCountry?: string; taxOffice?: string; taxId?: string; birthDate?: string }) =>
      apiRequest("PATCH", `${KEY}/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

export function useImportEmployees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: Record<string, string>[]) =>
      apiRequest("POST", `${KEY}/import`, { rows }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `${KEY}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}
