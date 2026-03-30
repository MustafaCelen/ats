import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, CalendarDays, User, ClipboardList, UserCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { PublicUser } from "@shared/schema";
import { format, isPast, parseISO } from "date-fns";
import { tr } from "date-fns/locale";

type TaskStatus = "pending" | "in_progress" | "done";

interface TaskWithRelations {
  id: number;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  status: TaskStatus;
  assignedToUserId: number;
  createdByUserId: number;
  jobId?: number | null;
  candidateId?: number | null;
  createdAt?: string | null;
  assignedTo?: PublicUser;
  createdBy?: PublicUser;
  candidate?: { id: number; name: string };
}

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending:     { label: "Bekliyor",       color: "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300" },
  in_progress: { label: "Devam Ediyor",   color: "bg-blue-100 text-blue-800 ring-1 ring-blue-300" },
  done:        { label: "Tamamlandı",     color: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" },
};

const NEXT_STATUS: Record<TaskStatus, TaskStatus | null> = {
  pending:     "in_progress",
  in_progress: "done",
  done:        null,
};

function useTasks() {
  return useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks"],
  });
}

function useAssistants(enabled = true) {
  return useQuery<PublicUser[]>({
    queryKey: ["/api/assistants"],
    queryFn: async () => {
      const res = await fetch("/api/assistants", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    staleTime: 0,
    gcTime: 0,
    enabled,
  });
}

export default function Tasks() {
  const { data: user } = useAuth();
  const { data: tasks, isLoading } = useTasks();
  const isAssistant = user?.role === "assistant";
  const isAdmin = user?.role === "admin";
  const isHiringManager = user?.role === "hiring_manager";
  const canCreate = isAdmin || isHiringManager;

  const { data: assistants, isLoading: assistantsLoading } = useAssistants(canCreate);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaskWithRelations | null>(null);

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Görevler</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isAssistant
                ? "Size atanmış görevler"
                : isAdmin
                  ? "Sistemdeki tüm görevler"
                  : "Oluşturduğunuz görevler"}
            </p>
          </div>
          {canCreate && (
            <NewTaskDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              assistants={assistants}
              assistantsLoading={assistantsLoading}
            />
          )}
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1.5fr_1fr_220px] gap-4 px-5 py-3 bg-muted/30 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <div>Görev</div>
            <div>Atanan</div>
            <div>Aday</div>
            <div>Oluşturan</div>
            <div>Son Tarih</div>
            <div>Durum</div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Yükleniyor...</div>
          ) : !tasks?.length ? (
            <div className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <ClipboardList className="h-8 w-8 opacity-30" />
              <p>Henüz görev yok.</p>
              {canCreate && (
                <p className="text-xs">Yeni bir görev oluşturun ve bir asistana atayın.</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isAssistant={isAssistant}
                  canDelete={canCreate}
                  onDelete={() => setDeleteTarget(task)}
                />
              ))}
            </div>
          )}
        </div>

        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Görevi sil</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleteTarget?.title}</strong> görevi silinecek. Bu işlem geri alınamaz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>İptal</AlertDialogCancel>
              <DeleteTaskConfirm task={deleteTarget} onDone={() => setDeleteTarget(null)} />
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}

function TaskRow({
  task,
  isAssistant,
  canDelete,
  onDelete,
}: {
  task: TaskWithRelations;
  isAssistant: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const nextStatus = NEXT_STATUS[task.status];
  const meta = STATUS_META[task.status];

  const { mutate: advance, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.message); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Görev güncellendi" });
    },
    onError: (err) => toast({ title: (err as Error).message, variant: "destructive" }),
  });

  const dueDateStr = task.dueDate
    ? format(new Date(task.dueDate), "dd MMM yyyy", { locale: tr })
    : null;
  const overdue = task.dueDate && task.status !== "done" && isPast(new Date(task.dueDate));

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1.5fr_1fr_220px] gap-4 px-5 py-4 items-center hover:bg-muted/10 transition-colors"
      data-testid={`row-task-${task.id}`}
    >
      <div>
        <p className="font-medium text-sm">{task.title}</p>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <User className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate text-xs">{task.assignedTo?.name ?? "—"}</span>
      </div>
      <div>
        {task.candidate ? (
          <Link
            href={`/candidates/${task.candidate.id}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium truncate max-w-full"
            data-testid={`link-candidate-task-${task.id}`}
          >
            <UserCircle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{task.candidate.name}</span>
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground truncate">{task.createdBy?.name ?? "—"}</div>
      <div className={`text-xs flex items-center gap-1 ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
        {dueDateStr ? <><CalendarDays className="h-3 w-3 shrink-0" />{dueDateStr}</> : "—"}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}
          data-testid={`status-task-${task.id}`}
        >
          {meta.label}
        </span>
        {nextStatus && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={isPending}
            onClick={() => advance()}
            data-testid={`btn-advance-task-${task.id}`}
          >
            {STATUS_META[nextStatus].label}
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 ml-auto"
            onClick={onDelete}
            data-testid={`btn-delete-task-${task.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function NewTaskDialog({
  open,
  onOpenChange,
  assistants,
  assistantsLoading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  assistants?: PublicUser[];
  assistantsLoading?: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    assignedToUserId: "",
  });
  const f = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: data.title,
          description: data.description || null,
          dueDate: data.dueDate || null,
          assignedToUserId: Number(data.assignedToUserId),
        }),
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.message); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      onOpenChange(false);
      setForm({ title: "", description: "", dueDate: "", assignedToUserId: "" });
      toast({ title: "Görev oluşturuldu" });
    },
    onError: (err) => toast({ title: (err as Error).message, variant: "destructive" }),
  });

  const valid = form.title.trim() && form.assignedToUserId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="btn-new-task">
          <Plus className="mr-1.5 h-4 w-4" /> Yeni Görev
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby="new-task-desc">
        <DialogHeader>
          <DialogTitle>Yeni Görev Oluştur</DialogTitle>
          <p id="new-task-desc" className="text-sm text-muted-foreground">Bir asistana görev atayın.</p>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Field label="Başlık *">
            <Input
              value={form.title}
              onChange={(e) => f("title", e.target.value)}
              placeholder="Görev başlığı"
              data-testid="input-task-title"
            />
          </Field>
          <Field label="Açıklama">
            <Textarea
              value={form.description}
              onChange={(e) => f("description", e.target.value)}
              placeholder="Görev detayları..."
              rows={3}
              data-testid="textarea-task-description"
            />
          </Field>
          <Field label="Son Tarih">
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => f("dueDate", e.target.value)}
              data-testid="input-task-due-date"
            />
          </Field>
          <Field label="Asistan *">
            <Select value={form.assignedToUserId} onValueChange={(v) => f("assignedToUserId", v)}>
              <SelectTrigger data-testid="select-task-assignee">
                <SelectValue placeholder="Asistan seçin..." />
              </SelectTrigger>
              <SelectContent>
                {assistantsLoading ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Yükleniyor...</div>
                ) : assistants && assistants.length > 0 ? (
                  assistants.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-muted-foreground">Asistan bulunamadı</div>
                )}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              İptal
            </Button>
            <Button
              className="flex-1"
              onClick={() => mutate(form)}
              disabled={isPending || !valid}
              data-testid="btn-submit-task"
            >
              {isPending ? "Oluşturuluyor..." : "Oluştur"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTaskConfirm({ task, onDone }: { task: TaskWithRelations | null; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tasks/${task!.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.message); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Görev silindi" });
      onDone();
    },
    onError: (err) => toast({ title: (err as Error).message, variant: "destructive" }),
  });
  return (
    <AlertDialogAction
      onClick={() => task && mutate()}
      disabled={isPending}
      className="bg-destructive hover:bg-destructive/90"
    >
      {isPending ? "Siliniyor..." : "Sil"}
    </AlertDialogAction>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}
