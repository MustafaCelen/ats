import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AdvisorBhbTarget, AdvisorNote, AdvisorAppointment } from "@shared/schema";

// ── BHB Targets (çeyrek bazlı) ──────────────────────────────────────────────────

export function useAdvisorBhbTargets(employeeId: number | null) {
  return useQuery<AdvisorBhbTarget[]>({
    queryKey: ["/api/employees", employeeId, "bhb-targets"],
    queryFn: () => fetch(`/api/employees/${employeeId}/bhb-targets`).then((r) => r.json()),
    enabled: employeeId != null,
  });
}

export function useUpsertAdvisorBhbTarget(employeeId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { year: number; quarter: number; bhbTarget: number }) =>
      apiRequest("PUT", `/api/employees/${employeeId}/bhb-targets`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", employeeId, "bhb-targets"] }),
  });
}

// ── Notes ────────────────────────────────────────────────────────────────────────

export function useAdvisorNotes(employeeId: number | null) {
  return useQuery<AdvisorNote[]>({
    queryKey: ["/api/employees", employeeId, "notes"],
    queryFn: () => fetch(`/api/employees/${employeeId}/notes`).then((r) => r.json()),
    enabled: employeeId != null,
  });
}

export function useCreateAdvisorNote(employeeId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { content: string; meetingDate?: string; agenda?: string; coachNote?: string; nextStep?: string }) =>
      apiRequest("POST", `/api/employees/${employeeId}/notes`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", employeeId, "notes"] }),
  });
}

export function useDeleteAdvisorNote(employeeId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: number) => apiRequest("DELETE", `/api/advisor-notes/${noteId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", employeeId, "notes"] }),
  });
}

// ── Appointments (randevu + takvim) ──────────────────────────────────────────────

export function useAdvisorAppointments(employeeId: number | null) {
  return useQuery<AdvisorAppointment[]>({
    queryKey: ["/api/employees", employeeId, "appointments"],
    queryFn: () => fetch(`/api/employees/${employeeId}/appointments`).then((r) => r.json()),
    enabled: employeeId != null,
  });
}

export function useCreateAdvisorAppointment(employeeId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: { title: string; startTime: string; endTime: string; location?: string; notes?: string }) =>
      apiRequest("POST", `/api/employees/${employeeId}/appointments`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", employeeId, "appointments"] }),
    onError: () => toast({ title: "Hata", description: "Randevu oluşturulamadı. Lütfen tekrar deneyin.", variant: "destructive" }),
  });
}

export function useUpdateAdvisorAppointmentStatus(employeeId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/advisor-appointments/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", employeeId, "appointments"] }),
  });
}

export function useRescheduleAdvisorAppointment(employeeId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, startTime, endTime }: { id: number; startTime: string; endTime: string }) =>
      apiRequest("PATCH", `/api/advisor-appointments/${id}`, { startTime, endTime }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", employeeId, "appointments"] }),
  });
}

export function useDeleteAdvisorAppointment(employeeId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/advisor-appointments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/employees", employeeId, "appointments"] }),
  });
}

export function useSyncAdvisorAppointmentCalendar(employeeId: number | null) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/advisor-appointments/${id}/calendar`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/employees", employeeId, "appointments"] });
      toast({ title: "Takvime eklendi", description: "Randevu Google Takvim'e eklendi." });
    },
    onError: async () => {
      const res = await fetch("/api/auth/google?link=1");
      const data = await res.json().catch(() => ({}));
      toast({ title: "Takvim bağlantısı gerekli", description: "Google Takvim erişimi yenileniyor..." });
      if (data.url) window.location.href = data.url;
    },
  });
}
