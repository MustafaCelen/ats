import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useApplications, useUpdateApplicationStatus, type ApplicationWithRelations } from "@/hooks/use-applications";
import { useAuth } from "@/hooks/use-auth";
import { format, isPast, isFuture } from "date-fns";
import {
  Calendar, Clock, MapPin, Plus, CheckCircle2, XCircle, Trash2,
  Video, AlertCircle, CalendarPlus, CalendarCheck, Star, MessageSquarePlus,
  RefreshCcw, Search,
} from "lucide-react";
import { StarPicker, ScoreBadge } from "@/components/ScoreBadge";
import { MentionTextarea } from "@/components/MentionTextarea";
import type { PublicUser } from "@shared/schema";
import { SiGoogle } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import type { Interview, Candidate, Job, Application } from "@shared/schema";
import { APPLICATION_STAGES, STAGE_LABELS } from "@shared/schema";
import { STAGE_COLORS } from "@/components/StatusBadge";

type InterviewWithRelations = Interview & { candidate?: Candidate; job?: Job; application?: Application };

const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  scheduled: { label: "Scheduled",  color: "bg-blue-100 text-blue-700 border-blue-200",    icon: Calendar },
  completed: { label: "Completed",  color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelled: { label: "Cancelled",  color: "bg-red-100 text-red-700 border-red-200",       icon: XCircle },
};

function useInterviews() {
  return useQuery<InterviewWithRelations[]>({
    queryKey: ["/api/interviews"],
  });
}

function useCreateInterview() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/interviews", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/interviews"] });
      qc.invalidateQueries({ queryKey: ["/api/interviews?all=true"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
    },
    onError: () => {
      toast({ title: "Hata", description: "Mülakat oluşturulamadı. Lütfen tekrar deneyin.", variant: "destructive" });
    },
  });
}

function useUpdateInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/interviews/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/interviews"] });
      qc.invalidateQueries({ queryKey: ["/api/interviews?all=true"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
    },
  });
}

function useDeleteInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/interviews/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/interviews"] });
      qc.invalidateQueries({ queryKey: ["/api/interviews?all=true"] });
    },
  });
}


function useSyncCalendar() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/interviews/${id}/calendar`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/interviews"] });
      qc.invalidateQueries({ queryKey: ["/api/interviews?all=true"] });
      toast({ title: "Takvime eklendi", description: "Mülakat Google Takvim'e eklendi." });
    },
    onError: async () => {
      const res = await fetch("/api/auth/google?link=1");
      const data = await res.json().catch(() => ({}));
      toast({
        title: "Takvim bağlantısı gerekli",
        description: "Google Takvim erişimi yenileniyor...",
      });
      if (data.url) window.location.href = data.url;
    },
  });
}

function useRescheduleInterview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, startTime, endTime }: { id: number; startTime: string; endTime: string }) =>
      apiRequest("PATCH", `/api/interviews/${id}`, { startTime, endTime }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/interviews"] });
      qc.invalidateQueries({ queryKey: ["/api/interviews?all=true"] });
    },
  });
}

export default function Interviews() {
  const { data: interviews, isLoading } = useInterviews();
  const { data: authUser } = useAuth();
  const [filter, setFilter] = useState<"all" | "scheduled" | "completed" | "cancelled">("all");
  const [search, setSearch] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [evaluateTarget, setEvaluateTarget] = useState<InterviewWithRelations | null>(null);
  const [completeTarget, setCompleteTarget] = useState<InterviewWithRelations | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<InterviewWithRelations | null>(null);
  const { mutate: updateStatus } = useUpdateInterview();
  const { mutate: deleteInterview } = useDeleteInterview();
  const { mutate: syncCalendar, isPending: isSyncing } = useSyncCalendar();
  const { toast } = useToast();

  const filtered = (interviews ?? []).filter((iv) => {
    const matchesStatus = filter === "all" || iv.status === filter;
    const q = search.trim().toLowerCase();
    const matchesSearch = !q ||
      iv.candidate?.name?.toLowerCase().includes(q) ||
      iv.candidate?.referredBy?.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const upcoming = interviews?.filter((iv) => iv.status === "scheduled" && isFuture(new Date(iv.startTime))).length ?? 0;
  const todayCount = interviews?.filter((iv) => {
    const d = new Date(iv.startTime);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length ?? 0;
  const completed = interviews?.filter((iv) => iv.status === "completed").length ?? 0;

  const handleStatusChange = (id: number, status: string, title: string) => {
    updateStatus({ id, status }, {
      onSuccess: () => toast({ title: `Interview ${status}`, description: title }),
    });
  };

  const handleDelete = (id: number) => {
    deleteInterview(id, {
      onSuccess: () => toast({ title: "Interview removed" }),
    });
  };

  const handleSyncCalendar = (id: number) => {
    syncCalendar(id, {
      onSuccess: () => toast({ title: "Google Takvimine Eklendi", description: "Mülakat takvime eklendi." }),
      onError: () => toast({ title: "Hata", description: "Takvim eklenemedi. Google bağlantısını kontrol edin.", variant: "destructive" }),
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Interviews</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Schedule and manage candidate interviews</p>
          </div>
          <Button onClick={() => setScheduleOpen(true)} data-testid="btn-schedule-interview">
            <Plus className="mr-1.5 h-4 w-4" /> Schedule Interview
          </Button>
        </div>

        {/* Google Calendar connect banner */}
        {authUser && (
          authUser.hasGoogleCalendar ? (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CalendarCheck className="h-4 w-4 shrink-0" />
                <span className="font-medium">Google Takvim bağlı</span>
                <span className="text-emerald-600">— mülakatları takvime ekleyebilirsiniz</span>
              </div>
              <button
                className="text-xs text-emerald-600 underline underline-offset-2 hover:text-emerald-800 shrink-0"
                data-testid="btn-reconnect-google-calendar"
                onClick={async () => {
                  const res = await fetch("/api/auth/google?link=1");
                  const data = await res.json().catch(() => ({}));
                  if (data.url) window.location.href = data.url;
                }}
              >
                Yeniden bağla
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <SiGoogle className="h-5 w-5 text-[#4285F4] shrink-0" />
                <p className="text-sm text-blue-800 font-medium">
                  Google Takvim'i bağlayarak mülakatları otomatik ekleyin
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100"
                data-testid="btn-connect-google-calendar"
                onClick={async () => {
                  const res = await fetch("/api/auth/google?link=1");
                  const data = await res.json().catch(() => ({}));
                  if (data.url) window.location.href = data.url;
                }}
              >
                Bağla
              </Button>
            </div>
          )
        )}

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Upcoming", value: upcoming, color: "text-blue-600" },
            { label: "Today", value: todayCount, color: "text-amber-600" },
            { label: "Completed", value: completed, color: "text-emerald-600" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
              <p className={`text-2xl font-display font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="İsim veya referans ile ara..."
            className="pl-9"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 border-b border-border pb-3">
          {(["all", "scheduled", "completed", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid={`filter-${f}`}
            >
              {f === "all" ? `All (${interviews?.length ?? 0})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${interviews?.filter((iv) => iv.status === f).length ?? 0})`}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No interviews found</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setScheduleOpen(true)}>
              Schedule one now
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((iv) => {
              const cfg = STATUS_CONFIG[iv.status] ?? STATUS_CONFIG.scheduled;
              const StatusIcon = cfg.icon;
              const isOverdue = iv.status === "scheduled" && isPast(new Date(iv.endTime));

              return (
                <div
                  key={iv.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-all"
                  data-testid={`card-interview-${iv.id}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                        {isOverdue && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-orange-50 text-orange-700 border-orange-200">
                            <AlertCircle className="h-3 w-3" /> Overdue
                          </span>
                        )}
                        {(iv as any).rescheduleCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200" data-testid={`badge-reschedule-count-${iv.id}`}>
                            <RefreshCcw className="h-3 w-3" />
                            {(iv as any).rescheduleCount}× ertelendi
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-foreground">{iv.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        <Link
                          href={`/candidates/${iv.candidateId}`}
                          className="font-medium text-foreground hover:text-primary hover:underline transition-colors"
                          data-testid={`link-candidate-${iv.candidateId}`}
                        >
                          {iv.candidate?.name}
                        </Link>
                        {iv.job && <> · {iv.job.title}</>}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(iv.startTime), "MMM d, yyyy")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(iv.startTime), "h:mm a")} – {format(new Date(iv.endTime), "h:mm a")}
                        </span>
                        {iv.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {iv.location}
                          </span>
                        )}
                      </div>
                      {iv.notes && (
                        <p className="text-xs text-muted-foreground mt-2 italic">{iv.notes}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {(iv.application?.score ?? 0) > 0 && (
                        <ScoreBadge score={iv.application?.score} size="sm" showLabel data-testid={`score-interview-${iv.id}`} />
                      )}
                      {iv.status === "scheduled" && authUser?.hasGoogleCalendar && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
                          onClick={() => handleSyncCalendar(iv.id)}
                          disabled={isSyncing || !!(iv as any).calendarEventId}
                          data-testid={`btn-calendar-sync-${iv.id}`}
                        >
                          {(iv as any).calendarEventId
                            ? <><CalendarCheck className="mr-1 h-3.5 w-3.5 text-emerald-600" /> Takvimde</>
                            : <><CalendarPlus className="mr-1 h-3.5 w-3.5" /> Takvime Ekle</>
                          }
                        </Button>
                      )}
                      {iv.status === "scheduled" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-8"
                            onClick={() => setCompleteTarget(iv)}
                            data-testid={`btn-complete-interview-${iv.id}`}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                            Complete
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-8 border-violet-200 text-violet-700 hover:bg-violet-50"
                            onClick={() => setRescheduleTarget(iv)}
                            data-testid={`btn-reschedule-interview-${iv.id}`}
                          >
                            <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                            Ertele
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-8"
                            onClick={() => handleStatusChange(iv.id, "cancelled", iv.title)}
                            data-testid={`btn-cancel-interview-${iv.id}`}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5 text-red-500" />
                            Cancel
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8"
                        onClick={() => setEvaluateTarget(iv)}
                        data-testid={`btn-evaluate-${iv.id}`}
                      >
                        <MessageSquarePlus className="mr-1 h-3.5 w-3.5" />
                        Değerlendir
                      </Button>
                      {authUser?.role === "admin" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                          onClick={() => handleDelete(iv.id)}
                          data-testid={`btn-delete-interview-${iv.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      <CompleteInterviewDialog
        interview={completeTarget}
        open={!!completeTarget}
        onOpenChange={(v) => { if (!v) setCompleteTarget(null); }}
      />
      <RescheduleInterviewDialog
        interview={rescheduleTarget}
        open={!!rescheduleTarget}
        onOpenChange={(v) => { if (!v) setRescheduleTarget(null); }}
      />
      <ScheduleInterviewDialog open={scheduleOpen} onOpenChange={setScheduleOpen} />
      <InterviewRateNoteDialog
        key={evaluateTarget?.id ?? "none"}
        interview={evaluateTarget}
        open={!!evaluateTarget}
        onOpenChange={(v) => { if (!v) setEvaluateTarget(null); }}
        authorName={authUser?.name ?? "Hiring Manager"}
      />
    </Layout>
  );
}

function CompleteInterviewDialog({
  interview,
  open,
  onOpenChange,
}: {
  interview: InterviewWithRelations | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [stage, setStage] = useState("offer");
  const { mutate: completeInterview, isPending: completing } = useUpdateInterview();
  const { mutate: moveCandidate, isPending: moving } = useUpdateApplicationStatus();

  const handleConfirm = () => {
    if (!interview) return;
    completeInterview(
      { id: interview.id, status: "completed" },
      {
        onSuccess: () => {
          moveCandidate(
            { id: interview.applicationId, status: stage },
            {
              onSuccess: () => {
                toast({
                  title: "Interview completed",
                  description: `${interview.candidate?.name} moved to ${STAGE_LABELS[stage] ?? stage}`,
                });
                onOpenChange(false);
              },
            }
          );
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" aria-describedby="complete-iv-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Complete Interview
          </DialogTitle>
          <p id="complete-iv-desc" className="text-sm text-muted-foreground">
            {interview?.candidate?.name} · {interview?.title}
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Move candidate to</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger data-testid="select-next-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLICATION_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: STAGE_COLORS[s] ?? "#9ca3af" }}
                      />
                      {STAGE_LABELS[s] ?? s}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleConfirm}
              disabled={completing || moving}
              data-testid="btn-confirm-complete-interview"
            >
              {completing || moving ? "Saving..." : "Complete & Move"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleInterviewDialog({
  interview,
  open,
  onOpenChange,
}: {
  interview: InterviewWithRelations | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const { mutate: reschedule, isPending } = useRescheduleInterview();
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const pad = (n: number) => String(n).padStart(2, "0");

  const handleOpen = (v: boolean) => {
    if (v && interview) {
      const s = new Date(interview.startTime);
      const e = new Date(interview.endTime);
      setDate(`${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`);
      // Snap to nearest 15-min slot
      const snapMin = (d: Date) => pad(Math.round(d.getMinutes() / 15) * 15 === 60 ? 0 : Math.round(d.getMinutes() / 15) * 15);
      setStartTime(`${pad(s.getHours())}:${snapMin(s)}`);
      setEndTime(`${pad(e.getHours())}:${snapMin(e)}`);
    }
    onOpenChange(v);
  };

  const toTurkeyISO = (d: string, t: string) => d && t ? `${d}T${t}:00+03:00` : "";

  const handleConfirm = () => {
    if (!interview || !date || !startTime || !endTime) return;
    reschedule(
      { id: interview.id, startTime: toTurkeyISO(date, startTime), endTime: toTurkeyISO(date, endTime) },
      {
        onSuccess: () => {
          toast({
            title: "Randevu ertelendi",
            description: `${interview.candidate?.name} için yeni tarih kaydedildi.`,
          });
          onOpenChange(false);
        },
        onError: () => {
          toast({ title: "Hata", description: "Randevu güncellenemedi.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-sm" aria-describedby="reschedule-iv-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCcw className="h-4 w-4 text-violet-600" />
            Randevuyu Ertele
          </DialogTitle>
          <p id="reschedule-iv-desc" className="text-sm text-muted-foreground">
            {interview?.candidate?.name} · {interview?.title}
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Tarih *</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="input-reschedule-date"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Başlangıç *</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger data-testid="select-reschedule-start">
                  <SelectValue placeholder="Saat seçin" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Bitiş *</Label>
              <Select value={endTime} onValueChange={setEndTime}>
                <SelectTrigger data-testid="select-reschedule-end">
                  <SelectValue placeholder="Saat seçin" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {(interview as any)?.rescheduleCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Bu randevu daha önce {(interview as any).rescheduleCount} kez ertelendi.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              İptal
            </Button>
            <Button
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
              onClick={handleConfirm}
              disabled={isPending || !date || !startTime || !endTime}
              data-testid="btn-confirm-reschedule"
            >
              {isPending ? "Kaydediliyor..." : "Ertele & Kaydet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleInterviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: applications } = useApplications();
  const { mutate, isPending } = useCreateInterview();
  const { toast } = useToast();

  const [form, setForm] = useState({
    applicationId: "",
    title: "Randevu",
    date: "",
    startTime: "",
    endTime: "",
    location: "",
    notes: "",
  });
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateDropdownOpen, setCandidateDropdownOpen] = useState(false);

  const selectedApp = applications?.find((a) => a.id === parseInt(form.applicationId));

  const filteredApps = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    const base = (applications ?? []).filter(
      (a) => a.candidate?.name && a.status !== "employed" && a.status !== "rejected"
    );
    if (!q) return base;
    return base.filter(
      (a) =>
        a.candidate?.name?.toLowerCase().includes(q) ||
        (a.candidate?.phone ?? "").toLowerCase().includes(q) ||
        a.job?.title?.toLowerCase().includes(q)
    );
  }, [applications, candidateSearch]);

  const toTurkeyISO = (d: string, t: string) => d && t ? `${d}T${t}:00+03:00` : "";

  const handleSubmit = () => {
    if (!form.applicationId || !form.date || !form.startTime || !form.endTime) {
      toast({ title: "Eksik alan", description: "Lütfen tüm zorunlu alanları doldurun.", variant: "destructive" });
      return;
    }
    if (!selectedApp) return;

    mutate({
      applicationId: parseInt(form.applicationId),
      jobId: selectedApp.jobId,
      candidateId: selectedApp.candidateId,
      title: form.title || "Randevu",
      startTime: toTurkeyISO(form.date, form.startTime),
      endTime: toTurkeyISO(form.date, form.endTime),
      location: form.location || null,
      notes: form.notes || null,
      status: "scheduled",
    }, {
      onSuccess: () => {
        toast({ title: "Randevu oluşturuldu!" });
        onOpenChange(false);
        setForm({ applicationId: "", title: "Randevu", date: "", startTime: "", endTime: "", location: "", notes: "" });
        setCandidateSearch("");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby="schedule-interview-desc">
        <DialogHeader>
          <DialogTitle>Randevu Planla</DialogTitle>
          <p id="schedule-interview-desc" className="text-sm text-muted-foreground">
            Pipeline'daki bir aday ile randevu oluşturun.
          </p>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Başvuru *</Label>
            <div className="relative">
              <input
                type="text"
                value={candidateSearch}
                placeholder="İsim, telefon veya ilan ile ara..."
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                data-testid="select-interview-application"
                onChange={(e) => {
                  setCandidateSearch(e.target.value);
                  setForm((f) => ({ ...f, applicationId: "" }));
                  setCandidateDropdownOpen(true);
                }}
                onFocus={() => setCandidateDropdownOpen(true)}
                onBlur={() => setTimeout(() => setCandidateDropdownOpen(false), 150)}
              />
              {candidateDropdownOpen && filteredApps.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-md shadow-lg max-h-56 overflow-y-auto">
                  {filteredApps.map((a: ApplicationWithRelations) => (
                    <button
                      key={a.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2"
                      onMouseDown={() => {
                        setForm((f) => ({ ...f, applicationId: a.id.toString() }));
                        setCandidateSearch(`${a.candidate?.name} — ${a.job?.title}`);
                        setCandidateDropdownOpen(false);
                      }}
                    >
                      <span className="font-medium">{a.candidate?.name}</span>
                      <span className="text-xs text-muted-foreground truncate">{a.job?.title}{a.candidate?.phone ? ` · ${a.candidate.phone}` : ""}</span>
                    </button>
                  ))}
                </div>
              )}
              {candidateDropdownOpen && candidateSearch.trim() && filteredApps.length === 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
                  Aday bulunamadı
                </div>
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium mb-1.5 block">Randevu Başlığı</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="örn. Teknik Mülakat"
              data-testid="input-interview-title"
            />
          </div>

          <div>
            <Label className="text-xs font-medium mb-1.5 block">Tarih *</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              data-testid="input-interview-date"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Başlangıç *</Label>
              <Select value={form.startTime} onValueChange={(v) => setForm((f) => ({ ...f, startTime: v }))}>
                <SelectTrigger data-testid="select-interview-start">
                  <SelectValue placeholder="Saat seçin" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Bitiş *</Label>
              <Select value={form.endTime} onValueChange={(v) => setForm((f) => ({ ...f, endTime: v }))}>
                <SelectTrigger data-testid="select-interview-end">
                  <SelectValue placeholder="Saat seçin" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium mb-1.5 block">Konum / Link</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="örn. Zoom, Google Meet, Toplantı Odası 3"
              data-testid="input-interview-location"
            />
          </div>

          <div>
            <Label className="text-xs font-medium mb-1.5 block">Notlar</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Hazırlık notları veya gündem..."
              rows={2}
              data-testid="input-interview-notes"
            />
          </div>

          <Button onClick={handleSubmit} disabled={isPending} className="w-full" data-testid="btn-submit-interview">
            {isPending ? "Kaydediliyor..." : "Randevu Oluştur"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InterviewRateNoteDialog({
  interview,
  open,
  onOpenChange,
  authorName,
}: {
  interview: InterviewWithRelations | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  authorName: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [score, setScore] = useState(interview?.application?.score ?? 0);
  const [note, setNote] = useState("");
  const [expectedStartMonth, setExpectedStartMonth] = useState(interview?.candidate?.expectedStartMonth ?? "");
  const { data: assistants = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/assistants"],
  });

  const SCORE_LABELS = ["", "Çok Düşük", "Düşük", "Ortanın Altı", "Orta", "Ortalama", "İyi", "Güçlü", "Çok Güçlü", "Mükemmel", "Olağanüstü"];

  const { mutate: saveScore, isPending: savingScore } = useMutation({
    mutationFn: (s: number) => apiRequest("PATCH", `/api/applications/${interview!.applicationId}/score`, { score: s }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/applications"] });
      qc.invalidateQueries({ queryKey: ["/api/interviews"] });
    },
  });

  const { mutate: saveNote, isPending: savingNote } = useMutation({
    mutationFn: ({ content, candidateId }: { content: string; candidateId: number }) =>
      apiRequest("POST", `/api/candidates/${candidateId}/notes`, { content, authorName }),
    onSuccess: (_, { candidateId }) => {
      qc.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "notes"] });
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const { mutate: saveStartMonth, isPending: savingStartMonth } = useMutation({
    mutationFn: ({ candidateId, month }: { candidateId: number; month: string }) =>
      apiRequest("PUT", `/api/candidates/${candidateId}`, { expectedStartMonth: month }),
    onSuccess: (_, { candidateId }) => {
      qc.invalidateQueries({ queryKey: ["/api/candidates"] });
      qc.invalidateQueries({ queryKey: ["/api/candidates", String(candidateId)] });
      qc.invalidateQueries({ queryKey: ["/api/interviews"] });
    },
  });

  const handleSubmit = () => {
    if (!interview) return;
    saveScore(score);
    if (note.trim()) saveNote({ content: note.trim(), candidateId: interview.candidateId });
    if (expectedStartMonth && expectedStartMonth !== (interview.candidate?.expectedStartMonth ?? "")) {
      saveStartMonth({ candidateId: interview.candidateId, month: expectedStartMonth });
    }
    toast({
      title: score > 0 ? `Puan: ${score}/10` : "Puan güncellendi",
      description: note.trim() ? "Not adaya eklendi." : undefined,
    });
    onOpenChange(false);
    setScore(0);
    setNote("");
    setExpectedStartMonth("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      onOpenChange(v);
      if (!v) { setScore(0); setNote(""); setExpectedStartMonth(""); }
    }}>
      <DialogContent className="max-w-sm" aria-describedby="iv-rate-note-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" fill="currentColor" />
            Değerlendir — {interview?.candidate?.name}
          </DialogTitle>
          <p id="iv-rate-note-desc" className="text-sm text-muted-foreground">{interview?.job?.title}</p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div>
            <Label className="text-xs mb-2 block">Puan (1–10)</Label>
            <StarPicker value={score} onChange={setScore} />
            {score > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                {score}/10 — {SCORE_LABELS[score]}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Beklenen Başlangıç Ayı</Label>
            <Input
              type="month"
              value={expectedStartMonth}
              onChange={(e) => setExpectedStartMonth(e.target.value)}
              className="h-9 text-sm"
              data-testid="input-iv-expected-start-month"
            />
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Not (isteğe bağlı)</Label>
            <MentionTextarea
              value={note}
              onChange={setNote}
              assistants={assistants}
              placeholder="Mülakat notu, geri bildirim, gözlemler..."
              rows={3}
              className="text-sm"
              data-testid="input-iv-rate-note"
            />
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              Asistan atamak için <code className="bg-muted px-1 rounded font-mono">@isim</code> kullanın
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>İptal</Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={savingScore || savingNote || savingStartMonth}
              data-testid="btn-submit-iv-rate"
            >
              {(savingScore || savingNote || savingStartMonth) ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
