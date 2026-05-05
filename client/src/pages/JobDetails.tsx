import { useState, useEffect, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useJob, useUpdateJob } from "@/hooks/use-jobs";
import { useApplications, useUpdateApplicationStatus, type ApplicationWithRelations } from "@/hooks/use-applications";
import { useCreateApplication } from "@/hooks/use-applications";
import { useCandidates } from "@/hooks/use-candidates";
import { StatusBadge, STAGE_COLORS } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MapPin, Building2, MoreHorizontal, UserPlus, DollarSign,
  ArrowLeft, Users, Calendar, ChevronDown, ExternalLink, Star, CheckCircle2, GripVertical,
  LayoutGrid, List, Phone, Mail, MessageSquare, FileText, Search,
} from "lucide-react";
import { useCompleteHiring } from "@/hooks/use-employees";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { APPLICATION_STAGES, STAGE_LABELS } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ScoreBadge, StarPicker } from "@/components/ScoreBadge";

const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});
import { MentionTextarea } from "@/components/MentionTextarea";
import type { PublicUser } from "@shared/schema";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

const COLUMN_META: Record<string, { color: string; bg: string; dot: string }> = {
  applied:      { color: "text-blue-700",    bg: "bg-blue-50",    dot: "bg-blue-500" },
  screening:    { color: "text-purple-700",  bg: "bg-purple-50",  dot: "bg-purple-500" },
  interview:    { color: "text-amber-700",   bg: "bg-amber-50",   dot: "bg-amber-500" },
  offer:        { color: "text-pink-700",    bg: "bg-pink-50",    dot: "bg-pink-500" },
  hired:        { color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  myk_training: { color: "text-cyan-700",   bg: "bg-cyan-50",    dot: "bg-cyan-500" },
  account_setup:{ color: "text-indigo-700", bg: "bg-indigo-50",  dot: "bg-indigo-500" },
  documents:    { color: "text-violet-700",  bg: "bg-violet-50",  dot: "bg-violet-500" },
  rejected:     { color: "text-red-700",     bg: "bg-red-50",     dot: "bg-red-500" },
};

export default function JobDetails() {
  const [, params] = useRoute("/jobs/:id");
  const jobId = params ? parseInt(params.id) : 0;
  const { toast } = useToast();

  const { data: job, isLoading: jobLoading } = useJob(jobId);
  const { data: applications, isLoading: appsLoading } = useApplications(jobId);
  const { mutate: updateStatus } = useUpdateApplicationStatus();
  const { mutate: completeHiring, isPending: completingHiring } = useCompleteHiring();
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [interviewApp, setInterviewApp] = useState<ApplicationWithRelations | null>(null);
  const [offerApp, setOfferApp] = useState<ApplicationWithRelations | null>(null);
  const [rateNoteApp, setRateNoteApp] = useState<ApplicationWithRelations | null>(null);
  const [pendingHireApp, setPendingHireApp] = useState<ApplicationWithRelations | null>(null);
  const [activeApp, setActiveApp] = useState<ApplicationWithRelations | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [listStageFilter, setListStageFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const visibleApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return applications ?? [];
    return (applications ?? []).filter((a) =>
      a.candidate?.name?.toLowerCase().includes(q) ||
      a.candidate?.referredBy?.toLowerCase().includes(q)
    );
  }, [applications, search]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveApp(active.data.current?.app ?? null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const { app, stage } = active.data.current as { app: ApplicationWithRelations; stage: string };
    if (over && over.id !== stage) {
      handleStatusChange(app.id, over.id as string, app.candidate?.name ?? "");
    }
    setActiveApp(null);
  };

  if (jobLoading || appsLoading) {
    return (
      <Layout>
        <div className="space-y-4 animate-pulse">
          <div className="h-36 rounded-xl bg-muted/40" />
          <div className="flex gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="flex-1 h-80 rounded-xl bg-muted/30" />)}
          </div>
        </div>
      </Layout>
    );
  }

  if (!job) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Job not found.</p>
          <Link href="/jobs"><Button variant="outline" className="mt-4">Back to Jobs</Button></Link>
        </div>
      </Layout>
    );
  }

  const handleStatusChange = (appId: number, newStatus: string, candidateName: string) => {
    updateStatus({ id: appId, status: newStatus }, {
      onSuccess: () => {
        toast({ title: `Moved ${candidateName}`, description: `Status → ${newStatus}` });
      },
    });
  };

  const totalApps = applications?.length ?? 0;
  const interviewCount = applications?.filter((a) => a.status === "interview").length ?? 0;

  return (
    <Layout>
      <div className="space-y-5">
        {/* Back */}
        <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Jobs
        </Link>

        {/* Job header card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <StatusBadge status={job.status} />
                {job.department && (
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium">
                    {job.department}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground">{job.title}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{job.company}</span>
                <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>
                {job.salaryRange && <span className="flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />{job.salaryRange}</span>}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setAddCandidateOpen(true)} data-testid="btn-add-candidate-to-job">
                <UserPlus className="mr-1.5 h-4 w-4" /> Add Candidate
              </Button>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-5 pt-4 border-t border-border grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Total Candidates</p>
              <p className="text-xl font-display font-bold">{totalApps}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Interviews</p>
              <p className="text-xl font-display font-bold text-amber-600">{interviewCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-0.5">New this week</p>
              <p className="text-xl font-display font-bold text-emerald-600">
                {applications?.filter((a) => new Date(a.appliedAt!).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000).length ?? 0}
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="İsim veya referans ile ara..."
            className="w-full border border-input rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background"
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "kanban" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Kanban
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <List className="h-3.5 w-3.5" /> Liste
            </button>
          </div>
          {viewMode === "list" && (
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setListStageFilter("all")}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${listStageFilter === "all" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                Tümü
              </button>
              {APPLICATION_STAGES.map((s) => {
                const meta = COLUMN_META[s];
                return (
                  <button
                    key={s}
                    onClick={() => setListStageFilter(s)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${listStageFilter === s ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${meta?.dot}`} />
                    {STAGE_LABELS[s] ?? s}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Kanban board */}
        {viewMode === "kanban" && (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-3 min-w-[1100px]">
                {APPLICATION_STAGES.map((stage) => {
                  const meta = COLUMN_META[stage] ?? { color: "text-gray-600", bg: "bg-gray-50", dot: "bg-gray-400" };
                  const columnApps = visibleApps.filter((a) => a.status === stage);

                  return (
                    <DroppableColumn key={stage} stage={stage} meta={meta} count={columnApps.length}>
                      <AnimatePresence>
                        {columnApps.map((app) => (
                          <DraggableCard
                            key={app.id}
                            app={app}
                            stage={stage}
                            isDraggingActive={activeApp?.id === app.id}
                            completingHiring={completingHiring}
                            onStatusChange={(s) => handleStatusChange(app.id, s, app.candidate?.name ?? "")}
                            onRateNote={() => setRateNoteApp(app)}
                            onInterview={() => setInterviewApp(app)}
                            onOffer={() => setOfferApp(app)}
                            onCompleteHiring={() => setPendingHireApp(app)}
                          />
                        ))}
                      </AnimatePresence>
                      {columnApps.length === 0 && (
                        <div className="py-6 text-center text-xs text-muted-foreground opacity-50 select-none">
                          Drop here
                        </div>
                      )}
                    </DroppableColumn>
                  );
                })}
              </div>
            </div>

            <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
              {activeApp ? <CardDragPreview app={activeApp} /> : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* List view */}
        {viewMode === "list" && (
          <ApplicationListView
            applications={visibleApps.filter((a) => a.status !== "employed" && (listStageFilter === "all" || a.status === listStageFilter))}
            completingHiring={completingHiring}
            onStatusChange={handleStatusChange}
            onRateNote={(app) => setRateNoteApp(app)}
            onInterview={(app) => setInterviewApp(app)}
            onOffer={(app) => setOfferApp(app)}
            onCompleteHiring={(app) => setPendingHireApp(app)}
          />
        )}
      </div>

      <AddCandidateDialog open={addCandidateOpen} onOpenChange={setAddCandidateOpen} jobId={jobId} />
      {interviewApp && (
        <QuickInterviewDialog
          app={interviewApp}
          open={!!interviewApp}
          onOpenChange={(v) => { if (!v) setInterviewApp(null); }}
        />
      )}
      {offerApp && (
        <QuickOfferDialog
          app={offerApp}
          open={!!offerApp}
          onOpenChange={(v) => { if (!v) setOfferApp(null); }}
        />
      )}
      {rateNoteApp && (
        <RateNoteDialog
          app={rateNoteApp}
          open={!!rateNoteApp}
          onOpenChange={(v) => { if (!v) setRateNoteApp(null); }}
        />
      )}

      <AlertDialog open={!!pendingHireApp} onOpenChange={(v) => { if (!v) setPendingHireApp(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>İşe alımı tamamla</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">{pendingHireApp?.candidate?.name}</span> adlı aday aktif çalışan olarak sisteme eklenecek.
                </p>
                <ul className="space-y-1.5 pl-4 list-disc">
                  <li>Aday, pipeline'dan ve aday listesinden kaldırılacak.</li>
                  <li>Yalnızca <span className="font-medium text-foreground">Çalışanlar</span> sayfasından görüntülenebilecek.</li>
                  <li>Bu işlem geri alınamaz.</li>
                </ul>
                <p>Devam etmek istiyor musunuz?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                if (!pendingHireApp) return;
                completeHiring(
                  {
                    candidateId: pendingHireApp.candidateId,
                    jobId: pendingHireApp.jobId,
                    applicationId: pendingHireApp.id,
                    title: job?.title ?? undefined,
                  },
                  {
                    onSuccess: () => {
                      setPendingHireApp(null);
                      toast({
                        title: "İşe alım tamamlandı! 🎉",
                        description: `${pendingHireApp.candidate?.name} çalışan listesine eklendi.`,
                      });
                    },
                    onError: (err: any) => {
                      setPendingHireApp(null);
                      const msg = err?.message ?? "";
                      toast({
                        title: msg.includes("already") ? "Zaten çalışan listesinde" : "Hata oluştu",
                        variant: "destructive",
                      });
                    },
                  }
                );
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Evet, tamamla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

function ApplicationListView({
  applications,
  completingHiring,
  onStatusChange,
  onRateNote,
  onInterview,
  onOffer,
  onCompleteHiring,
}: {
  applications: ApplicationWithRelations[];
  completingHiring: boolean;
  onStatusChange: (id: number, status: string, name: string) => void;
  onRateNote: (app: ApplicationWithRelations) => void;
  onInterview: (app: ApplicationWithRelations) => void;
  onOffer: (app: ApplicationWithRelations) => void;
  onCompleteHiring: (app: ApplicationWithRelations) => void;
}) {
  if (applications.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
        Bu aşamada aday bulunmuyor.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div className="grid grid-cols-[2fr_130px_72px_150px_2fr_2fr_100px_148px] gap-3 px-4 py-2.5 bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        <div>Aday</div>
        <div>Aşama</div>
        <div>Puan</div>
        <div>İletişim</div>
        <div>Özet</div>
        <div>Son Not</div>
        <div>Tarih</div>
        <div />
      </div>

      {/* Rows */}
      <div className="divide-y divide-border">
        {applications.map((app) => {
          const meta = COLUMN_META[app.status] ?? { color: "text-gray-600", bg: "bg-gray-50", dot: "bg-gray-400" };
          return (
            <div
              key={app.id}
              className="grid grid-cols-[2fr_130px_72px_150px_2fr_2fr_100px_148px] gap-3 px-4 py-3 items-start hover:bg-muted/20 transition-colors group"
              data-testid={`list-row-${app.id}`}
            >
              {/* Candidate */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[11px] font-bold shrink-0">
                  {app.candidate?.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <Link href={`/candidates/${app.candidateId}`} className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate block">
                    {app.candidate?.name}
                  </Link>
                  <p className="text-xs text-muted-foreground truncate">{app.candidate?.city}{app.candidate?.district ? ` · ${app.candidate.district}` : ""}</p>
                </div>
              </div>

              {/* Stage */}
              <div>
                <Select value={app.status} onValueChange={(s) => onStatusChange(app.id, s, app.candidate?.name ?? "")}>
                  <SelectTrigger className="h-7 text-xs w-full border-0 bg-transparent px-0 focus:ring-0 shadow-none">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />
                      <span className={`font-medium text-xs ${meta.color}`}>{STAGE_LABELS[app.status] ?? app.status}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {APPLICATION_STAGES.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${COLUMN_META[s]?.dot ?? "bg-gray-400"}`} />
                          {STAGE_LABELS[s] ?? s}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Score */}
              <div>
                <ScoreBadge score={app.score} size="sm" showLabel />
              </div>

              {/* Contact */}
              <div className="space-y-0.5 min-w-0">
                {app.candidate?.phone ? (
                  <a href={`tel:${app.candidate.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors truncate">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="truncate">{app.candidate.phone}</span>
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground/40">—</span>
                )}
                {app.candidate?.referredBy ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <Users className="h-3 w-3 shrink-0" />
                    <span className="truncate">{app.candidate.referredBy}</span>
                  </span>
                ) : null}
              </div>

              {/* Özet */}
              <div className="min-w-0 overflow-hidden">
                {app.candidate?.resumeText ? (
                  <p className="text-xs text-muted-foreground line-clamp-2" title={app.candidate.resumeText}>
                    {app.candidate.resumeText}
                  </p>
                ) : (
                  <span className="text-xs text-muted-foreground/40">—</span>
                )}
              </div>

              {/* Latest note */}
              <div className="min-w-0 overflow-hidden">
                {app.latestNote ? (
                  <p className="text-xs text-muted-foreground line-clamp-2" title={app.latestNote}>
                    {app.latestNote}
                  </p>
                ) : (
                  <span className="text-xs text-muted-foreground/40">—</span>
                )}
              </div>

              {/* Date */}
              <div className="text-xs text-muted-foreground">
                {app.appliedAt ? formatDistanceToNow(new Date(app.appliedAt), { addSuffix: true }) : "—"}
              </div>

              {/* Actions — fixed width so Tamamla button never shifts layout */}
              <div className="flex items-center gap-1 justify-end w-full">
                {app.status === "documents" ? (
                  <button
                    onClick={() => onCompleteHiring(app)}
                    disabled={completingHiring}
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors disabled:opacity-50 whitespace-nowrap"
                    title="İşe Alımı Tamamla"
                  >
                    <CheckCircle2 className="h-3 w-3" /> Tamamla
                  </button>
                ) : (
                  <div className="w-[72px]" />
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem className="text-xs font-medium" onClick={() => onRateNote(app)}>
                      <Star className="h-3 w-3 mr-2 text-amber-400" fill="currentColor" /> Rate &amp; Add Note
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => onInterview(app)}>
                      <Calendar className="h-3 w-3 mr-2 text-amber-500" /> Schedule Interview
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onClick={() => onOffer(app)}>
                      <DollarSign className="h-3 w-3 mr-2 text-emerald-500" /> Create Offer
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-xs" asChild>
                      <Link href={`/candidates/${app.candidateId}`}>
                        <ExternalLink className="h-3 w-3 mr-2" /> View Profile
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Droppable column ──────────────────────────────────────────────────────────

function DroppableColumn({
  stage,
  meta,
  count,
  children,
}: {
  stage: string;
  meta: { color: string; bg: string; dot: string };
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[200px] flex flex-col rounded-xl border transition-colors duration-150 ${
        isOver
          ? "border-primary/50 bg-primary/5 shadow-inner"
          : "bg-muted/30 border-border/60"
      }`}
      style={{ maxHeight: "calc(100vh - 380px)", minHeight: 200 }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between p-3 border-b border-border/60 sticky top-0 bg-muted/30 backdrop-blur rounded-t-xl z-10">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          <span className="text-xs font-semibold text-foreground">{STAGE_LABELS[stage] ?? stage}</span>
        </div>
        <span className="text-xs font-bold bg-background border border-border px-1.5 py-0.5 rounded-full text-muted-foreground">
          {count}
        </span>
      </div>

      {/* Cards */}
      <div className="p-2 space-y-2 overflow-y-auto flex-1 scrollbar-hide">
        {children}
      </div>
    </div>
  );
}

// ─── Draggable card ────────────────────────────────────────────────────────────

function DraggableCard({
  app,
  stage,
  isDraggingActive,
  completingHiring,
  onStatusChange,
  onRateNote,
  onInterview,
  onOffer,
  onCompleteHiring,
}: {
  app: ApplicationWithRelations;
  stage: string;
  isDraggingActive: boolean;
  completingHiring: boolean;
  onStatusChange: (s: string) => void;
  onRateNote: () => void;
  onInterview: () => void;
  onOffer: () => void;
  onCompleteHiring: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: app.id,
    data: { app, stage },
  });

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: isDragging ? 0.25 : 1, scale: isDragging ? 0.97 : 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: isDragging ? 0.1 : 0.2 }}
      className="bg-card p-3 rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow group"
      data-testid={`card-application-${app.id}`}
    >
      <div className="flex items-start gap-1 mb-1.5">
        {/* Drag handle */}
        <button
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing mt-0.5 p-0.5 rounded text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors shrink-0 touch-none select-none"
          tabIndex={-1}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <p className="font-semibold text-sm text-foreground leading-tight flex-1 min-w-0 truncate">
          {app.candidate?.name}
        </p>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded text-muted-foreground transition-all shrink-0">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Move to</div>
            <DropdownMenuSeparator />
            {APPLICATION_STAGES.map((s) => (
              <DropdownMenuItem
                key={s}
                disabled={s === stage}
                onClick={() => onStatusChange(s)}
                className="capitalize text-xs"
                data-testid={`move-to-${s}-${app.id}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${COLUMN_META[s]?.dot ?? "bg-gray-400"} mr-2`} />
                {s}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs font-medium"
              onClick={onRateNote}
              data-testid={`rate-note-${app.id}`}
            >
              <Star className="h-3 w-3 mr-2 text-amber-400" fill="currentColor" />
              Rate &amp; Add Note
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs"
              onClick={onInterview}
              data-testid={`schedule-interview-${app.id}`}
            >
              <Calendar className="h-3 w-3 mr-2 text-amber-500" />
              Schedule Interview
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs"
              onClick={onOffer}
              data-testid={`create-offer-${app.id}`}
            >
              <DollarSign className="h-3 w-3 mr-2 text-emerald-500" />
              Create Offer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {app.candidateId && (
              <DropdownMenuItem className="text-xs" asChild>
                <Link href={`/candidates/${app.candidateId}`}>
                  <ExternalLink className="h-3 w-3 mr-2" />
                  View Profile
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {app.candidate?.phone && (
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
          <Phone className="h-3 w-3 shrink-0" />{app.candidate.phone}
        </p>
      )}
      {app.candidate?.referredBy && (
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
          <Users className="h-3 w-3 shrink-0" />{app.candidate.referredBy}
        </p>
      )}
      <div className="flex items-center justify-between mt-2 mb-0.5">
        <ScoreBadge score={app.score} size="sm" showLabel />
      </div>

      {app.candidate?.tags && app.candidate.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {app.candidate.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <span className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(new Date(app.appliedAt!), { addSuffix: true })}
        </span>
        <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[9px] font-bold">
          {app.candidate?.name?.slice(0, 2).toUpperCase()}
        </div>
      </div>

      {stage === "documents" && (
        <button
          className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold py-1.5 transition-colors disabled:opacity-50"
          disabled={completingHiring}
          data-testid={`btn-complete-hiring-${app.id}`}
          onClick={onCompleteHiring}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          İşe Alımı Tamamla
        </button>
      )}
    </motion.div>
  );
}

// ─── Drag overlay preview ──────────────────────────────────────────────────────

function CardDragPreview({ app }: { app: ApplicationWithRelations }) {
  return (
    <div className="bg-card p-3 rounded-lg border border-primary/40 shadow-2xl w-[210px] rotate-2 opacity-95 pointer-events-none">
      <div className="flex items-center gap-1.5 mb-1">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
        <p className="font-semibold text-sm text-foreground leading-tight truncate flex-1">
          {app.candidate?.name}
        </p>
      </div>
      {app.candidate?.phone && (
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
          <Phone className="h-3 w-3 shrink-0" />{app.candidate.phone}
        </p>
      )}
      <div className="mt-1.5">
        <ScoreBadge score={app.score} size="sm" showLabel />
      </div>
    </div>
  );
}

// ─── Sub-dialogs ───────────────────────────────────────────────────────────────

function RateNoteDialog({ app, open, onOpenChange }: { app: ApplicationWithRelations; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [score, setScore] = useState<number>(app.score ?? 0);
  const [note, setNote] = useState("");
  const [expectedStartMonth, setExpectedStartMonth] = useState(app.candidate?.expectedStartMonth ?? "");
  const { data: assistants = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/assistants"],
  });

  const { mutate: saveScore, isPending: savingScore } = useMutation({
    mutationFn: (s: number) => apiRequest("PATCH", `/api/applications/${app.id}/score`, { score: s }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/applications"] });
    },
  });

  const { mutate: saveNote, isPending: savingNote } = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/candidates/${app.candidateId}/notes`, { content, authorName: "Hiring Manager" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/candidates", app.candidateId, "notes"] });
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const { mutate: saveStartMonth, isPending: savingStartMonth } = useMutation({
    mutationFn: ({ candidateId, month }: { candidateId: number; month: string }) =>
      apiRequest("PUT", `/api/candidates/${candidateId}`, { expectedStartMonth: month }),
    onSuccess: (_, { candidateId }) => {
      qc.invalidateQueries({ queryKey: ["/api/candidates"] });
      qc.invalidateQueries({ queryKey: ["/api/candidates", String(candidateId)] });
      qc.invalidateQueries({ queryKey: ["/api/applications"] });
    },
  });

  const handleSubmit = () => {
    saveScore(score);
    if (note.trim()) saveNote(note.trim());
    if (expectedStartMonth && expectedStartMonth !== (app.candidate?.expectedStartMonth ?? "")) {
      saveStartMonth({ candidateId: app.candidateId, month: expectedStartMonth });
    }
    toast({ title: score > 0 ? `Puan: ${score}/10` : "Puan güncellendi", description: note.trim() ? "Not adaya eklendi." : undefined });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" aria-describedby="rate-note-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" fill="currentColor" />
            Rate &amp; Note — {app.candidate?.name}
          </DialogTitle>
          <p id="rate-note-desc" className="text-sm text-muted-foreground">{app.job?.title}</p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div>
            <Label className="text-xs mb-2 block">Score (1–10)</Label>
            <StarPicker value={score} onChange={setScore} />
            {score > 0 && (
              <p className="text-xs text-muted-foreground mt-1.5">
                {score}/10 — {["", "Çok Düşük", "Düşük", "Ortanın Altı", "Orta", "Ortalama", "İyi", "Güçlü", "Çok Güçlü", "Mükemmel", "Olağanüstü"][score]}
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
              data-testid="input-expected-start-month"
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
              data-testid="input-rate-note"
            />
            <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
              Asistan atamak için <code className="bg-muted px-1 rounded font-mono">@isim</code> kullanın
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>İptal</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={savingScore || savingNote || savingStartMonth} data-testid="btn-submit-rate">
              {(savingScore || savingNote || savingStartMonth) ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuickInterviewDialog({ app, open, onOpenChange }: { app: ApplicationWithRelations; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "Randevu", date: "", startTime: "", endTime: "", location: "" });

  const { mutate, isPending } = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/interviews", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/interviews"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
      toast({ title: "Randevu oluşturuldu!" });
      onOpenChange(false);
    },
  });

  const toTurkeyISO = (d: string, t: string) => d && t ? `${d}T${t}:00+03:00` : "";

  const handleSubmit = () => {
    if (!form.date || !form.startTime || !form.endTime) {
      toast({ title: "Eksik alan", description: "Tarih ve saatleri seçin.", variant: "destructive" });
      return;
    }
    mutate({
      applicationId: app.id, jobId: app.jobId, candidateId: app.candidateId,
      title: form.title || "Randevu",
      startTime: toTurkeyISO(form.date, form.startTime),
      endTime: toTurkeyISO(form.date, form.endTime),
      location: form.location || null, status: "scheduled",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby="quick-interview-desc">
        <DialogHeader>
          <DialogTitle>Randevu Planla — {app.candidate?.name}</DialogTitle>
          <p id="quick-interview-desc" className="text-sm text-muted-foreground">{app.job?.title}</p>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label className="text-xs mb-1 block">Başlık</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Randevu başlığı" />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Tarih *</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs mb-1 block">Başlangıç *</Label>
              <Select value={form.startTime} onValueChange={(v) => setForm((f) => ({ ...f, startTime: v }))}>
                <SelectTrigger><SelectValue placeholder="Saat seçin" /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Bitiş *</Label>
              <Select value={form.endTime} onValueChange={(v) => setForm((f) => ({ ...f, endTime: v }))}>
                <SelectTrigger><SelectValue placeholder="Saat seçin" /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Konum / Link</Label>
            <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Zoom, toplantı odası..." />
          </div>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? "Kaydediliyor..." : "Randevu Oluştur"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuickOfferDialog({ app, open, onOpenChange }: { app: ApplicationWithRelations; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");

  const { mutate, isPending } = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/offers", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/offers"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
      toast({ title: "Offer created!" });
      onOpenChange(false);
    },
  });

  const handleSubmit = () => {
    if (!amount) { toast({ title: "Enter an amount", variant: "destructive" }); return; }
    mutate({ applicationId: app.id, jobId: app.jobId, candidateId: app.candidateId, amount: parseInt(amount), currency, status: "draft" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" aria-describedby="quick-offer-desc">
        <DialogHeader>
          <DialogTitle>Create Offer — {app.candidate?.name}</DialogTitle>
          <p id="quick-offer-desc" className="text-sm text-muted-foreground">{app.job?.title}</p>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs mb-1 block">Amount *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="120000" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD", "EUR", "GBP", "CAD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={isPending} className="w-full">
            {isPending ? "Creating..." : "Create Draft Offer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddCandidateDialog({ open, onOpenChange, jobId }: { open: boolean; onOpenChange: (v: boolean) => void; jobId: number }) {
  const { data: allCandidates } = useCandidates();
  const { data: allApplications } = useApplications();
  const { mutate, isPending } = useCreateApplication();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { toast } = useToast();

  // Build set of candidateIds already assigned to any job
  const assignedIds = useMemo(() => {
    const s = new Set<number>();
    allApplications?.forEach((a) => s.add(a.candidateId));
    return s;
  }, [allApplications]);

  const unassigned = useMemo(() =>
    (allCandidates ?? []).filter((c) => !assignedIds.has(c.id)),
    [allCandidates, assignedIds]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unassigned;
    return unassigned.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q)
    );
  }, [unassigned, search]);

  const handleSelect = (c: { id: number; name: string }) => {
    setSelectedId(c.id);
    setSearch(c.name);
    setDropdownOpen(false);
  };

  const handleAdd = () => {
    if (!selectedId) return;
    mutate({ jobId, candidateId: selectedId, status: "applied", notes: "Added via admin panel" }, {
      onSuccess: () => {
        onOpenChange(false);
        setSelectedId(null);
        setSearch("");
        toast({ title: "Aday eklendi", description: "Başvuru oluşturuldu." });
      },
      onError: (err: Error) => toast({ title: "Aday eklenemedi", description: err.message, variant: "destructive" }),
    });
  };

  // Reset when dialog closes
  useEffect(() => {
    if (!open) { setSelectedId(null); setSearch(""); setDropdownOpen(false); }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="add-candidate-desc">
        <DialogHeader>
          <DialogTitle>Aday Ekle</DialogTitle>
          <p id="add-candidate-desc" className="text-sm text-muted-foreground">
            Henüz bir ilana atanmamış adaylardan seçin.
          </p>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="relative">
            <input
              type="text"
              value={search}
              placeholder="İsim veya telefon ile ara..."
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedId(null);
                setSelectedName("");
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              data-testid="input-candidate-search"
            />
            {dropdownOpen && filtered.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-md shadow-lg max-h-56 overflow-y-auto">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2"
                    onMouseDown={() => handleSelect(c)}
                  >
                    <span className="font-medium">{c.name}</span>
                    {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
            {dropdownOpen && search.trim() && filtered.length === 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-md shadow-lg px-3 py-2 text-sm text-muted-foreground">
                Aday bulunamadı
              </div>
            )}
          </div>
          <Button onClick={handleAdd} disabled={!selectedId || isPending} className="w-full" data-testid="btn-confirm-add-candidate">
            {isPending ? "Ekleniyor..." : "Pipeline'a Ekle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
