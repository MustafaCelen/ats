import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useApplications, useUpdateApplicationStatus, type ApplicationWithRelations } from "@/hooks/use-applications";
import { useCompleteHiring } from "@/hooks/use-employees";
import { STAGE_LABELS } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, GripVertical, CalendarDays, CheckCircle2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BOARD_STAGES = ["hired", "myk_training", "account_setup", "documents"] as const;

const COLUMN_META: Record<string, { color: string; bg: string; dot: string; border: string }> = {
  hired:        { color: "text-emerald-700", bg: "bg-emerald-50",  dot: "bg-emerald-500", border: "border-emerald-200" },
  myk_training: { color: "text-cyan-700",    bg: "bg-cyan-50",     dot: "bg-cyan-500",    border: "border-cyan-200"    },
  account_setup:{ color: "text-indigo-700",  bg: "bg-indigo-50",   dot: "bg-indigo-500",  border: "border-indigo-200"  },
  documents:    { color: "text-violet-700",  bg: "bg-violet-50",   dot: "bg-violet-500",  border: "border-violet-200"  },
};

function DroppableColumn({
  stage,
  apps,
  isDraggingActive,
  completingHiring,
  onCompleteHiring,
}: {
  stage: string;
  apps: ApplicationWithRelations[];
  isDraggingActive: boolean;
  completingHiring: boolean;
  onCompleteHiring: (app: ApplicationWithRelations) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const meta = COLUMN_META[stage];

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border-2 transition-all duration-150 min-w-[220px] flex-1 ${
        isOver
          ? "border-primary/60 bg-primary/5 shadow-inner"
          : `${meta.border} bg-muted/20`
      }`}
      style={{ maxHeight: "calc(100vh - 260px)", minHeight: 220 }}
    >
      <div className={`flex items-center justify-between px-3 py-2.5 border-b ${meta.border} sticky top-0 ${meta.bg} rounded-t-xl z-10`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          <span className={`text-xs font-semibold ${meta.color}`}>{STAGE_LABELS[stage] ?? stage}</span>
        </div>
        <span className="text-xs font-bold bg-background border border-border px-1.5 py-0.5 rounded-full text-muted-foreground">
          {apps.length}
        </span>
      </div>

      <div className="p-2 space-y-2 overflow-y-auto flex-1">
        <AnimatePresence>
          {apps.length === 0 && !isDraggingActive && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-muted-foreground text-center py-8 select-none"
            >
              Bu aşamada aday yok
            </motion.p>
          )}
          {apps.map((app) => (
            <DraggableCard
              key={app.id}
              app={app}
              stage={stage}
              completingHiring={completingHiring}
              onCompleteHiring={() => onCompleteHiring(app)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DraggableCard({
  app,
  stage,
  completingHiring,
  onCompleteHiring,
}: {
  app: ApplicationWithRelations;
  stage: string;
  completingHiring: boolean;
  onCompleteHiring: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: app.id,
    data: { app, stage },
  });

  return (
    <motion.div
      ref={setNodeRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.25 : 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.15 }}
      className="bg-card border border-border rounded-lg shadow-sm hover:shadow-md transition-shadow"
      data-testid={`onboarding-card-${app.id}`}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <div
            {...listeners}
            {...attributes}
            className="text-muted-foreground/40 hover:text-muted-foreground mt-0.5 shrink-0 touch-none cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <Link
              href={`/candidates/${app.candidateId}`}
              className="group inline-flex items-center gap-1 hover:underline"
              data-testid={`link-candidate-profile-${app.id}`}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {app.candidate?.name ?? "—"}
              </span>
              <ExternalLink className="h-3 w-3 text-muted-foreground/60 group-hover:text-primary shrink-0 transition-colors" />
            </Link>
            {app.job && (
              <div className="flex items-center gap-1 mt-1">
                <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground truncate">{app.job.title}</span>
              </div>
            )}
            {app.appliedAt && (
              <div className="flex items-center gap-1 mt-1">
                <CalendarDays className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  {format(new Date(app.appliedAt), "dd MMM yyyy")}
                </span>
              </div>
            )}
          </div>
        </div>

        {stage === "documents" && (
          <button
            className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold py-1.5 transition-colors disabled:opacity-50"
            disabled={completingHiring}
            data-testid={`btn-complete-hiring-${app.id}`}
            onClick={onCompleteHiring}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            İşe Alımı Tamamla
          </button>
        )}
      </div>
    </motion.div>
  );
}

function OverlayCard({ app }: { app: ApplicationWithRelations }) {
  return (
    <div className="bg-card border border-primary/40 rounded-lg shadow-xl p-3 w-56 rotate-2 opacity-95">
      <p className="text-sm font-semibold text-foreground truncate">{app.candidate?.name ?? "—"}</p>
      {app.job && <p className="text-xs text-muted-foreground truncate mt-0.5">{app.job.title}</p>}
    </div>
  );
}

export default function OnboardingBoard() {
  const { data: allApplications, isLoading } = useApplications();
  const { mutate: updateStatus } = useUpdateApplicationStatus();
  const { mutate: completeHiring, isPending: completingHiring } = useCompleteHiring();
  const { toast } = useToast();
  const [activeApp, setActiveApp] = useState<ApplicationWithRelations | null>(null);
  const [pendingHireApp, setPendingHireApp] = useState<ApplicationWithRelations | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const boardApps = (allApplications ?? []).filter((a) =>
    (BOARD_STAGES as readonly string[]).includes(a.status)
  );

  const byStage = Object.fromEntries(
    BOARD_STAGES.map((s) => [s, boardApps.filter((a) => a.status === s)])
  );

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveApp(active.data.current?.app ?? null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const { app, stage } = active.data.current as { app: ApplicationWithRelations; stage: string };
    if (over && over.id !== stage) {
      const newStage = over.id as string;
      updateStatus(
        { id: app.id, status: newStage },
        {
          onSuccess: () => {
            toast({
              title: "Aşama güncellendi",
              description: `${app.candidate?.name ?? "Aday"} → ${STAGE_LABELS[newStage] ?? newStage}`,
            });
          },
          onError: () => {
            toast({ title: "Hata", description: "Aşama güncellenemedi.", variant: "destructive" });
          },
        }
      );
    }
    setActiveApp(null);
  };

  const handleCompleteHiring = () => {
    if (!pendingHireApp) return;
    completeHiring(
      {
        candidateId: pendingHireApp.candidateId,
        jobId: pendingHireApp.jobId,
        applicationId: pendingHireApp.id,
        title: pendingHireApp.job?.title ?? undefined,
      },
      {
        onSuccess: () => {
          toast({
            title: "İşe alım tamamlandı! 🎉",
            description: `${pendingHireApp.candidate?.name} çalışan listesine eklendi.`,
          });
          setPendingHireApp(null);
        },
        onError: (err: any) => {
          const msg = err?.message ?? "";
          toast({
            title: msg.includes("already") ? "Zaten çalışan listesinde" : "Hata oluştu",
            variant: "destructive",
            description: msg.includes("already")
              ? "Bu aday zaten çalışan olarak kayıtlı."
              : "Lütfen tekrar deneyin.",
          });
          setPendingHireApp(null);
        },
      }
    );
  };

  return (
    <Layout>
      <div className="flex flex-col h-full gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Onboarding Panosu</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sözleşme imzalanan adayları işe alım süreçlerinde takip edin
          </p>
        </div>

        {isLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {BOARD_STAGES.map((s) => (
              <div key={s} className="min-w-[220px] flex-1 rounded-xl bg-muted/30 border border-border h-64 animate-pulse" />
            ))}
          </div>
        ) : boardApps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
            <Briefcase className="h-10 w-10 opacity-30" />
            <p className="text-sm">Henüz sözleşme imzalayan aday yok</p>
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-4">
              {BOARD_STAGES.map((stage) => (
                <DroppableColumn
                  key={stage}
                  stage={stage}
                  apps={byStage[stage] ?? []}
                  isDraggingActive={!!activeApp}
                  completingHiring={completingHiring}
                  onCompleteHiring={setPendingHireApp}
                />
              ))}
            </div>
            <DragOverlay>
              {activeApp ? <OverlayCard app={activeApp} /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Complete Hiring Confirmation Dialog */}
      <AlertDialog open={!!pendingHireApp} onOpenChange={(open) => !open && setPendingHireApp(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>İşe Alımı Tamamla</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{pendingHireApp?.candidate?.name}</strong> adayı çalışan listesine eklenecek
              ve başvurusu tamamlandı olarak işaretlenecek. Bu işlemi onaylıyor musunuz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleCompleteHiring}
            >
              Evet, Tamamla
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
