import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Application, Candidate, Interview, Job } from "@shared/schema";
import { STAGE_LABELS } from "@shared/schema";
import { Layout } from "@/components/Layout";
import { useApplications, type ApplicationWithRelations } from "@/hooks/use-applications";
import { useCandidates } from "@/hooks/use-candidates";
import { useAllJobs } from "@/hooks/use-jobs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarPlus,
  CalendarRange,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  MessageCircle,
  Phone,
  Search,
  Target,
  UserPlus,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react";

type LeadTrackingField =
  | "leadWhatsappSent" | "leadPhoneCallDone" | "leadNoAppointment"
  | "leadCallbackNeeded" | "leadSecondNoteRead" | "leadJoinedCompany"
  | "profession" | "leadCallNotes" | "leadCallbackNotes" | "leadSecondNote";

function useJobAssignments() {
  return useQuery<{ jobId: number; userId: number; userName: string }[]>({
    queryKey: ["/api/job-assignments"],
    queryFn: async () => {
      const response = await fetch("/api/job-assignments", { credentials: "include" });
      if (!response.ok) throw new Error("Atamalar alınamadı");
      return response.json();
    },
  });
}

type InterviewWithRelations = Interview & {
  candidate?: Candidate;
  job?: Job;
  application?: Application;
};

const TIME_SLOTS = Array.from({ length: 64 }, (_, i) => {
  const minutes = 8 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

const INTERVIEW_STATUS: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Planlandı", className: "border-blue-200 bg-blue-50 text-blue-700" },
  completed: { label: "Tamamlandı", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  cancelled: { label: "İptal", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

const STAGE_COLORS: Record<string, string> = {
  applied: "border-slate-200 bg-slate-50 text-slate-700",
  screening: "border-sky-200 bg-sky-50 text-sky-700",
  interview: "border-blue-200 bg-blue-50 text-blue-700",
  offer: "border-amber-200 bg-amber-50 text-amber-700",
  hired: "border-emerald-200 bg-emerald-50 text-emerald-700",
  myk_training: "border-cyan-200 bg-cyan-50 text-cyan-700",
  account_setup: "border-indigo-200 bg-indigo-50 text-indigo-700",
  documents: "border-violet-200 bg-violet-50 text-violet-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
};

function formatDateTime(value?: Date | string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value?: Date | string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function whatsappNumber(phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("90")) return digits;
  if (digits.startsWith("0")) return `90${digits.slice(1)}`;
  return `90${digits}`;
}

function useInterviews() {
  return useQuery<InterviewWithRelations[]>({
    queryKey: ["/api/interviews"],
    queryFn: async () => {
      const response = await fetch("/api/interviews", { credentials: "include" });
      if (!response.ok) throw new Error("Randevular alınamadı");
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
  });
}

function AppointmentDialog({
  application,
  open,
  onOpenChange,
}: {
  application: ApplicationWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    date: "",
    startTime: "10:00",
    endTime: "10:30",
    location: "",
  });

  useEffect(() => {
    if (open) {
      setForm({ date: "", startTime: "10:00", endTime: "10:30", location: "" });
    }
  }, [open, application?.id]);

  const createAppointment = useMutation({
    mutationFn: async () => {
      if (!application) throw new Error("Başvuru seçilmedi");
      const startTime = `${form.date}T${form.startTime}:00+03:00`;
      const endTime = `${form.date}T${form.endTime}:00+03:00`;
      const response = await apiRequest("POST", "/api/interviews", {
        applicationId: application.id,
        jobId: application.jobId,
        candidateId: application.candidateId,
        title: "Randevu",
        startTime,
        endTime,
        location: form.location || null,
        notes: null,
        status: "scheduled",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
      toast({
        title: "Randevu oluşturuldu",
        description: `${application?.candidate?.name ?? "Lead"} için randevu kaydedildi.`,
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Randevu oluşturulamadı", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby="lead-appointment-description">
        <DialogHeader>
          <DialogTitle>Randevu Oluştur</DialogTitle>
          <p id="lead-appointment-description" className="text-sm text-muted-foreground">
            {application?.candidate?.name} için yeni randevu planlayın.
          </p>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="mb-1.5 block text-xs">Tarih *</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">Başlangıç *</Label>
              <Select value={form.startTime} onValueChange={(value) => setForm((current) => ({ ...current, startTime: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((time) => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Bitiş *</Label>
              <Select value={form.endTime} onValueChange={(value) => setForm((current) => ({ ...current, endTime: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((time) => <SelectItem key={time} value={time}>{time}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Konum / görüşme linki</Label>
            <Input
              value={form.location}
              onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
              placeholder="Ofis, Zoom veya Google Meet"
            />
          </div>
          <Button
            className="w-full"
            disabled={!form.date || !form.startTime || !form.endTime || createAppointment.isPending}
            onClick={() => createAppointment.mutate()}
          >
            <CalendarPlus className="mr-2 h-4 w-4" />
            {createAppointment.isPending ? "Kaydediliyor..." : "Randevu Oluştur"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({
  application,
  open,
  onOpenChange,
}: {
  application: ApplicationWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState("");

  useEffect(() => {
    if (open) setContent("");
  }, [open, application?.id]);

  const addNote = useMutation({
    mutationFn: async () => {
      if (!application) throw new Error("Aday seçilmedi");
      const response = await apiRequest("POST", `/api/candidates/${application.candidateId}/notes`, { content });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", application?.candidateId, "notes"] });
      toast({ title: "Not kaydedildi", description: "Not aday profilinde de görüntülenecek." });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Not kaydedilemedi", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby="lead-note-description">
        <DialogHeader>
          <DialogTitle>Ekip Notu Ekle</DialogTitle>
          <p id="lead-note-description" className="text-sm text-muted-foreground">
            {application?.candidate?.name} için eklenen not aday profilindeki Notlar bölümüne kaydedilir.
          </p>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {application?.latestNote && (
            <div className="rounded-lg border border-violet-100 bg-violet-50/70 p-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700">Son not</p>
              <p className="text-sm text-slate-700">{application.latestNote}</p>
            </div>
          )}
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Yeni notunuzu yazın..."
            rows={4}
          />
          <Button className="w-full" disabled={!content.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
            <FileText className="mr-2 h-4 w-4" />
            {addNote.isPending ? "Kaydediliyor..." : "Notu Kaydet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadNoteDialog({
  candidate,
  field,
  title,
  description,
  open,
  onOpenChange,
  onSave,
}: {
  candidate: Candidate | null;
  field: LeadTrackingField;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (candidateId: number, field: LeadTrackingField, value: string) => void;
}) {
  const [content, setContent] = useState("");

  useEffect(() => {
    if (open) setContent(((candidate as any)?.[field] as string | null) ?? "");
  }, [open, candidate, field]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby="lead-field-note-description">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p id="lead-field-note-description" className="text-sm text-muted-foreground">
            {candidate?.name} — {description}
          </p>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Not yazın..." rows={4} />
          <Button
            className="w-full"
            onClick={() => {
              if (candidate) onSave(candidate.id, field, content);
              onOpenChange(false);
            }}
          >
            <FileText className="mr-2 h-4 w-4" /> Notu Kaydet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProfessionCell({ candidate, onSave }: { candidate: Candidate; onSave: (candidateId: number, value: string) => void }) {
  const [value, setValue] = useState((candidate as any).profession ?? "");

  useEffect(() => {
    setValue((candidate as any).profession ?? "");
  }, [candidate]);

  return (
    <Input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value !== ((candidate as any).profession ?? "")) onSave(candidate.id, value);
      }}
      placeholder="Meslek"
      className="h-8 text-xs"
    />
  );
}

export default function LeadTrackingBoard() {
  const { data: allApplications, isLoading: applicationsLoading } = useApplications();
  const { data: allCandidates, isLoading: candidatesLoading } = useCandidates();
  const { data: interviews, isLoading: interviewsLoading } = useInterviews();
  const { data: allJobs } = useAllJobs();
  const { data: jobAssignments } = useJobAssignments();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [newLeadJobIds, setNewLeadJobIds] = useState<Record<number, string>>({});
  const [appointmentTarget, setAppointmentTarget] = useState<ApplicationWithRelations | null>(null);
  const [noteTarget, setNoteTarget] = useState<ApplicationWithRelations | null>(null);
  const [fieldNoteTarget, setFieldNoteTarget] = useState<{ candidate: Candidate; field: LeadTrackingField; title: string; description: string } | null>(null);

  const productionJobs = useMemo(() => {
    const openJobs = (allJobs ?? []).filter((job) => job.status === "open");
    const production = openJobs.filter((job) => job.title.toLocaleLowerCase("tr-TR").includes("üretim bandı"));
    return production.length > 0 ? production : openJobs;
  }, [allJobs]);

  const jobLeaderNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of jobAssignments ?? []) {
      const current = map.get(row.jobId);
      map.set(row.jobId, current ? `${current}, ${row.userName}` : row.userName);
    }
    return map;
  }, [jobAssignments]);

  const boardApps = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return (allApplications ?? [])
      .filter((application) => application.candidate?.campaignId != null)
      .filter((application) => {
        if (!query) return true;
        return [
          application.candidate?.name,
          application.candidate?.phone,
          application.candidate?.city,
          application.job?.title,
          application.latestNote,
        ].some((value) => value?.toLocaleLowerCase("tr-TR").includes(query));
      })
      .sort((a, b) => new Date(b.appliedAt ?? 0).getTime() - new Date(a.appliedAt ?? 0).getTime());
  }, [allApplications, search]);

  const unassignedLeads = useMemo(() => {
    const assignedCandidateIds = new Set((allApplications ?? []).map((application) => application.candidateId));
    const query = search.trim().toLocaleLowerCase("tr-TR");
    return (allCandidates ?? [])
      .filter((candidate) => candidate.campaignId != null && !assignedCandidateIds.has(candidate.id))
      .filter((candidate) => {
        if (!query) return true;
        return [candidate.name, candidate.phone, candidate.city]
          .some((value) => value?.toLocaleLowerCase("tr-TR").includes(query));
      })
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  }, [allApplications, allCandidates, search]);

  const interviewByApplication = useMemo(() => {
    const grouped = new Map<number, InterviewWithRelations[]>();
    for (const interview of interviews ?? []) {
      const current = grouped.get(interview.applicationId) ?? [];
      current.push(interview);
      grouped.set(interview.applicationId, current);
    }

    const selected = new Map<number, InterviewWithRelations>();
    const now = Date.now();
    grouped.forEach((rows, applicationId) => {
      const upcoming = rows
        .filter((row) => row.status === "scheduled" && new Date(row.startTime).getTime() >= now)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
      const latest = [...rows].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())[0];
      if (upcoming ?? latest) selected.set(applicationId, upcoming ?? latest);
    });
    return selected;
  }, [interviews]);

  const updateLeadTracking = useMutation({
    mutationFn: async ({ candidateId, field, value }: { candidateId: number; field: LeadTrackingField; value: boolean | string }) => {
      const response = await apiRequest("PATCH", `/api/candidates/${candidateId}/lead-tracking`, { [field]: value });
      return response.json();
    },
    onMutate: async ({ candidateId, field, value }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/candidates"] });
      await queryClient.cancelQueries({ queryKey: ["/api/applications"] });
      const prevCandidates = queryClient.getQueryData<Candidate[]>(["/api/candidates"]);
      const prevApplications = queryClient.getQueryData<ApplicationWithRelations[]>(["/api/applications"]);
      const patch = (c: Candidate) => (c.id === candidateId ? { ...c, [field]: value } : c);
      queryClient.setQueryData<Candidate[]>(["/api/candidates"], (old) => old?.map(patch));
      queryClient.setQueryData<ApplicationWithRelations[]>(["/api/applications"], (old) =>
        old?.map((a) => (a.candidateId === candidateId && a.candidate ? { ...a, candidate: patch(a.candidate) } : a))
      );
      return { prevCandidates, prevApplications };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.prevCandidates) queryClient.setQueryData(["/api/candidates"], context.prevCandidates);
      if (context?.prevApplications) queryClient.setQueryData(["/api/applications"], context.prevApplications);
      toast({ title: "Güncellenemedi", description: error.message, variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
    },
  });

  const updateProductionBand = useMutation({
    mutationFn: async ({ applicationId, jobId }: { applicationId: number; jobId: number }) => {
      const response = await apiRequest("PATCH", `/api/applications/${applicationId}/job`, { jobId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      toast({ title: "Üretim bandı güncellendi" });
    },
    onError: (error: Error) => {
      toast({ title: "Atama güncellenemedi", description: error.message, variant: "destructive" });
    },
  });

  const createApplication = useMutation({
    mutationFn: async ({ candidateId, jobId }: { candidateId: number; jobId: number }) => {
      const response = await apiRequest("POST", "/api/applications", {
        candidateId,
        jobId,
        status: "applied",
      });
      return response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      setNewLeadJobIds((current) => {
        const next = { ...current };
        delete next[variables.candidateId];
        return next;
      });
      toast({ title: "Lead üretim bandına atandı", description: "Başvuru kaydı oluşturuldu." });
    },
    onError: (error: Error) => {
      toast({ title: "Başvuru oluşturulamadı", description: error.message, variant: "destructive" });
    },
  });

  const scheduledCount = (interviews ?? []).filter(
    (interview) => interview.status === "scheduled" && boardApps.some((application) => application.id === interview.applicationId)
  ).length;
  const completedCount = (interviews ?? []).filter(
    (interview) => interview.status === "completed" && boardApps.some((application) => application.id === interview.applicationId)
  ).length;
  const isLoading = applicationsLoading || candidatesLoading || interviewsLoading;

  return (
    <Layout>
      <div className="space-y-5">
        <div className="overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-emerald-50 shadow-sm">
          <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-slate-900">Lead Takip Sistemi</h1>
                <p className="text-sm text-slate-500">Randevu, üretim bandı ve ekip notlarını tek ekrandan takip edin</p>
              </div>
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Lead, telefon, şehir veya not ara..."
                className="border-white/80 bg-white pl-9 shadow-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 border-t border-violet-100/80 bg-white/65">
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Toplam lead</p>
              <p className="mt-0.5 text-xl font-bold text-slate-800">{boardApps.length + unassignedLeads.length}</p>
            </div>
            <div className="border-x border-violet-100/80 px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Planlı randevu</p>
              <p className="mt-0.5 text-xl font-bold text-blue-600">{scheduledCount}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tamamlanan</p>
              <p className="mt-0.5 text-xl font-bold text-emerald-600">{completedCount}</p>
            </div>
          </div>
        </div>

        {unassignedLeads.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-orange-200 bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50 px-4 py-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-orange-800">
                  <UserPlus className="h-4 w-4" /> Atanmamış Lead'ler
                </h2>
                <p className="mt-0.5 text-xs text-orange-700/70">Üretim bandı seçildiğinde lead için başvuru kaydı oluşturulur.</p>
              </div>
              <Badge variant="outline" className="border-orange-200 bg-white text-orange-700">{unassignedLeads.length}</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-orange-100 bg-orange-50/40 text-slate-600">
                    <th className="px-4 py-2.5 text-left font-semibold">Lead</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Telefon</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Geliş Tarihi</th>
                    <th className="w-[90px] px-3 py-2.5 text-center font-semibold">WhatsApp</th>
                    <th className="w-[90px] px-3 py-2.5 text-center font-semibold">Telefon Gör.</th>
                    <th className="w-[160px] px-3 py-2.5 text-left font-semibold">Telefon Notu</th>
                    <th className="w-[140px] px-3 py-2.5 text-left font-semibold">Meslek</th>
                    <th className="w-[280px] px-3 py-2.5 text-left font-semibold">Üretim Bandı</th>
                    <th className="w-[150px] px-3 py-2.5 text-left font-semibold">Aksiyon</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-100">
                  {unassignedLeads.map((candidate) => (
                    <tr key={candidate.id} className="hover:bg-orange-50/30">
                      <td className="px-4 py-3">
                        <Link href={`/candidates/${candidate.id}`} className="font-semibold text-slate-900 hover:text-orange-700 hover:underline">
                          {candidate.name}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-slate-500">{candidate.city || "Şehir belirtilmemiş"}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{candidate.phone || "—"}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(candidate.createdAt)}</td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-600"
                          checked={!!(candidate as any).leadWhatsappSent}
                          onChange={(e) => updateLeadTracking.mutate({ candidateId: candidate.id, field: "leadWhatsappSent", value: e.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-blue-600"
                          checked={!!(candidate as any).leadPhoneCallDone}
                          onChange={(e) => updateLeadTracking.mutate({ candidateId: candidate.id, field: "leadPhoneCallDone", value: e.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="line-clamp-2 w-full rounded-lg px-2 py-1.5 text-left leading-relaxed text-slate-600 hover:bg-orange-50"
                          onClick={() => setFieldNoteTarget({ candidate, field: "leadCallNotes", title: "Telefon Görüşmesi Notu", description: "telefon görüşmesi notları" })}
                        >
                          {(candidate as any).leadCallNotes || <span className="text-slate-400">Not ekle...</span>}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <ProfessionCell
                          candidate={candidate}
                          onSave={(candidateId, value) => updateLeadTracking.mutate({ candidateId, field: "profession", value })}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Select
                          value={newLeadJobIds[candidate.id] ?? ""}
                          onValueChange={(value) => setNewLeadJobIds((current) => ({ ...current, [candidate.id]: value }))}
                        >
                          <SelectTrigger className="h-9 border-orange-200 bg-white text-xs">
                            <SelectValue placeholder="Üretim bandı seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            {productionJobs.map((job) => (
                              <SelectItem key={job.id} value={String(job.id)}>{job.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-3">
                        <Button
                          size="sm"
                          className="h-8 bg-orange-600 text-xs text-white hover:bg-orange-700"
                          disabled={!newLeadJobIds[candidate.id] || createApplication.isPending}
                          onClick={() => createApplication.mutate({
                            candidateId: candidate.id,
                            jobId: Number(newLeadJobIds[candidate.id]),
                          })}
                        >
                          <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Başvuru Aç
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[2400px] w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-slate-50 text-slate-600">
                  <th className="sticky left-0 z-20 min-w-[190px] bg-slate-50 px-4 py-3 text-left font-semibold">
                    <span className="inline-flex items-center gap-1.5"><UsersRound className="h-4 w-4" /> Lead</span>
                  </th>
                  <th className="min-w-[125px] px-3 py-3 text-left font-semibold">İletişim</th>
                  <th className="min-w-[90px] px-3 py-3 text-center font-semibold">WhatsApp</th>
                  <th className="min-w-[90px] px-3 py-3 text-center font-semibold">Telefon Gör.</th>
                  <th className="min-w-[160px] px-3 py-3 text-left font-semibold">Telefon Notu</th>
                  <th className="min-w-[140px] px-3 py-3 text-left font-semibold">Meslek</th>
                  <th className="min-w-[135px] px-3 py-3 text-left font-semibold">Aşama</th>
                  <th className="min-w-[135px] bg-blue-50/70 px-3 py-3 text-left font-semibold text-blue-700">Randevu Durumu</th>
                  <th className="min-w-[165px] bg-blue-50/70 px-3 py-3 text-left font-semibold text-blue-700">Randevu Tarihi</th>
                  <th className="min-w-[145px] bg-blue-50/70 px-3 py-3 text-left font-semibold text-blue-700">Randevu Lideri</th>
                  <th className="min-w-[110px] bg-blue-50/70 px-3 py-3 text-center font-semibold text-blue-700">Randevu Oluşturmadı</th>
                  <th className="min-w-[220px] bg-violet-50/70 px-3 py-3 text-left font-semibold text-violet-700">Üretim Bandı</th>
                  <th className="min-w-[90px] px-3 py-3 text-center font-semibold">Tekrar Arama</th>
                  <th className="min-w-[160px] px-3 py-3 text-left font-semibold">Tekrar Arama Notu</th>
                  <th className="min-w-[110px] bg-emerald-50/70 px-3 py-3 text-center font-semibold text-emerald-700">KW'ye Katıldı</th>
                  <th className="min-w-[160px] px-3 py-3 text-left font-semibold">İkinci Not</th>
                  <th className="min-w-[90px] px-3 py-3 text-center font-semibold">İkinci Not Okundu</th>
                  <th className="min-w-[280px] bg-emerald-50/70 px-3 py-3 text-left font-semibold text-emerald-700">Ekip Notları</th>
                  <th className="min-w-[150px] px-3 py-3 text-left font-semibold">Aksiyon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr>
                    <td colSpan={19} className="py-14 text-center text-muted-foreground">Lead bilgileri yükleniyor...</td>
                  </tr>
                )}
                {!isLoading && boardApps.length === 0 && (
                  <tr>
                    <td colSpan={19} className="py-14 text-center">
                      <Target className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">Aramanızla eşleşen kampanya lead'i bulunamadı.</p>
                    </td>
                  </tr>
                )}
                {!isLoading && boardApps.map((application) => {
                  const candidate = application.candidate;
                  const interview = interviewByApplication.get(application.id);
                  const status = interview ? INTERVIEW_STATUS[interview.status] : null;
                  const whatsapp = whatsappNumber(candidate?.phone);

                  return (
                    <tr key={application.id} className="group bg-white transition-colors hover:bg-slate-50/70">
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 group-hover:bg-slate-50">
                        <Link href={`/candidates/${application.candidateId}`} className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 font-semibold text-violet-700">
                            {(candidate?.name ?? "?").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR")}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1 font-semibold text-slate-900 hover:text-violet-700">
                              <span className="truncate">{candidate?.name ?? "—"}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
                            </span>
                            <span className="mt-0.5 block text-[11px] text-slate-500">
                              {[candidate?.city, formatDate(application.appliedAt)].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                            disabled={!whatsapp}
                            onClick={() => window.open(`https://wa.me/${whatsapp}`, "_blank", "noopener,noreferrer")}
                            title="WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 border-blue-200 text-blue-600 hover:bg-blue-50"
                            disabled={!candidate?.phone}
                            onClick={() => { window.location.href = `tel:${candidate?.phone}`; }}
                            title={candidate?.phone ?? "Telefon yok"}
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-600"
                          checked={!!(candidate as any)?.leadWhatsappSent}
                          disabled={!candidate}
                          onChange={(e) => candidate && updateLeadTracking.mutate({ candidateId: candidate.id, field: "leadWhatsappSent", value: e.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-blue-600"
                          checked={!!(candidate as any)?.leadPhoneCallDone}
                          disabled={!candidate}
                          onChange={(e) => candidate && updateLeadTracking.mutate({ candidateId: candidate.id, field: "leadPhoneCallDone", value: e.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {candidate && (
                          <button
                            type="button"
                            className="line-clamp-2 w-full rounded-lg px-2 py-1.5 text-left leading-relaxed text-slate-600 hover:bg-slate-100"
                            onClick={() => setFieldNoteTarget({ candidate, field: "leadCallNotes", title: "Telefon Görüşmesi Notu", description: "telefon görüşmesi notları" })}
                          >
                            {(candidate as any).leadCallNotes || <span className="text-slate-400">Not ekle...</span>}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {candidate && (
                          <ProfessionCell
                            candidate={candidate}
                            onSave={(candidateId, value) => updateLeadTracking.mutate({ candidateId, field: "profession", value })}
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={STAGE_COLORS[application.status] ?? ""}>
                          {STAGE_LABELS[application.status] ?? application.status}
                        </Badge>
                      </td>
                      <td className="bg-blue-50/25 px-3 py-3">
                        {status ? (
                          <Badge variant="outline" className={status.className}>{status.label}</Badge>
                        ) : (
                          <span className="text-slate-400">Randevu yok</span>
                        )}
                      </td>
                      <td className="bg-blue-50/25 px-3 py-3">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <CalendarRange className="h-3.5 w-3.5 text-blue-500" />
                          <span>{formatDateTime(interview?.startTime)}</span>
                        </div>
                      </td>
                      <td className="bg-blue-50/25 px-3 py-3">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <UserRound className="h-3.5 w-3.5 text-blue-500" />
                          <span>{jobLeaderNames.get(application.jobId) || "—"}</span>
                        </div>
                      </td>
                      <td className="bg-blue-50/25 px-3 py-3 text-center">
                        {candidate && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-rose-600"
                            checked={!!(candidate as any).leadNoAppointment}
                            onChange={(e) => updateLeadTracking.mutate({ candidateId: candidate.id, field: "leadNoAppointment", value: e.target.checked })}
                          />
                        )}
                      </td>
                      <td className="bg-violet-50/25 px-3 py-3">
                        <Select
                          value={String(application.jobId)}
                          disabled={updateProductionBand.isPending}
                          onValueChange={(value) => updateProductionBand.mutate({
                            applicationId: application.id,
                            jobId: Number(value),
                          })}
                        >
                          <SelectTrigger className="h-9 border-violet-200 bg-white text-xs">
                            <SelectValue placeholder="Üretim bandı seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            {productionJobs.map((job) => (
                              <SelectItem key={job.id} value={String(job.id)}>{job.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {candidate && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-amber-600"
                            checked={!!(candidate as any).leadCallbackNeeded}
                            onChange={(e) => updateLeadTracking.mutate({ candidateId: candidate.id, field: "leadCallbackNeeded", value: e.target.checked })}
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {candidate && (
                          <button
                            type="button"
                            className="line-clamp-2 w-full rounded-lg px-2 py-1.5 text-left leading-relaxed text-slate-600 hover:bg-slate-100"
                            onClick={() => setFieldNoteTarget({ candidate, field: "leadCallbackNotes", title: "Tekrar Arama Notu", description: "tekrar arama notları" })}
                          >
                            {(candidate as any).leadCallbackNotes || <span className="text-slate-400">Not ekle...</span>}
                          </button>
                        )}
                      </td>
                      <td className="bg-emerald-50/20 px-3 py-3 text-center">
                        {candidate && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-emerald-600"
                            checked={!!(candidate as any).leadJoinedCompany}
                            onChange={(e) => updateLeadTracking.mutate({ candidateId: candidate.id, field: "leadJoinedCompany", value: e.target.checked })}
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {candidate && (
                          <button
                            type="button"
                            className="line-clamp-2 w-full rounded-lg px-2 py-1.5 text-left leading-relaxed text-slate-600 hover:bg-slate-100"
                            onClick={() => setFieldNoteTarget({ candidate, field: "leadSecondNote", title: "İkinci Not", description: "ikinci ekip notu" })}
                          >
                            {(candidate as any).leadSecondNote || <span className="text-slate-400">Not ekle...</span>}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {candidate && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-blue-600"
                            checked={!!(candidate as any).leadSecondNoteRead}
                            onChange={(e) => updateLeadTracking.mutate({ candidateId: candidate.id, field: "leadSecondNoteRead", value: e.target.checked })}
                          />
                        )}
                      </td>
                      <td className="bg-emerald-50/20 px-3 py-3">
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-emerald-50"
                          onClick={() => setNoteTarget(application)}
                        >
                          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="line-clamp-2 leading-relaxed text-slate-600">
                            {application.latestNote || "Not eklemek için tıklayın"}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <Button
                          size="sm"
                          className="h-8 bg-violet-600 text-xs text-white hover:bg-violet-700"
                          onClick={() => setAppointmentTarget(application)}
                        >
                          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                          Randevu Oluştur
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-blue-500" /> Randevu bilgileri Randevular modülünden otomatik gelir.</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Notlar aday profiliyle ortaktır.</span>
            <span className="inline-flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5 text-slate-400" /> Bu ekranda yalnızca üretim bandı düzenlenebilir.</span>
          </div>
        </div>
      </div>

      <AppointmentDialog
        application={appointmentTarget}
        open={!!appointmentTarget}
        onOpenChange={(open) => { if (!open) setAppointmentTarget(null); }}
      />
      <NoteDialog
        application={noteTarget}
        open={!!noteTarget}
        onOpenChange={(open) => { if (!open) setNoteTarget(null); }}
      />
      <LeadNoteDialog
        candidate={fieldNoteTarget?.candidate ?? null}
        field={fieldNoteTarget?.field ?? "leadCallNotes"}
        title={fieldNoteTarget?.title ?? ""}
        description={fieldNoteTarget?.description ?? ""}
        open={!!fieldNoteTarget}
        onOpenChange={(open) => { if (!open) setFieldNoteTarget(null); }}
        onSave={(candidateId, field, value) => updateLeadTracking.mutate({ candidateId, field, value })}
      />
    </Layout>
  );
}