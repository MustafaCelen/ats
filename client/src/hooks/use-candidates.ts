import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type Candidate, type InsertCandidate } from "@shared/schema";

export function useCandidates() {
  return useQuery<Candidate[]>({
    queryKey: [api.candidates.list.path],
    queryFn: async () => {
      const res = await fetch(api.candidates.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch candidates");
      return res.json();
    },
  });
}

export function useCandidate(id: number) {
  return useQuery<Candidate>({
    queryKey: [api.candidates.list.path, id],
    queryFn: async () => {
      const url = buildUrl(api.candidates.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch candidate");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertCandidate) => {
      const res = await fetch(api.candidates.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create candidate");
      return res.json() as Promise<Candidate>;
    },
    onSuccess: (newCandidate) => {
      // Immediately add to cache so it appears in list without waiting for refetch
      queryClient.setQueryData<Candidate[]>([api.candidates.list.path], (old) =>
        old ? [newCandidate, ...old] : [newCandidate]
      );
      queryClient.invalidateQueries({ queryKey: [api.candidates.list.path] });
    },
  });
}

export function useUpdateCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertCandidate> }) => {
      const res = await fetch(`/api/candidates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update candidate");
      return res.json() as Promise<Candidate>;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.candidates.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.candidates.list.path, id] });
    },
  });
}

export function useDeleteCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/candidates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete candidate");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.candidates.list.path] });
    },
  });
}
