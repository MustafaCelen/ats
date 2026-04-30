import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Trash2, User, Shield, Briefcase, KeyRound, X, Check, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import type { PublicUser } from "@shared/schema";
import { useJobs } from "@/hooks/use-jobs";
import { formatDistanceToNow } from "date-fns";

function useUsers() {
  return useQuery<PublicUser[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetch("/api/users", { credentials: "include" }).then((r) => r.json()),
  });
}

function useJobAssignees(jobId: number) {
  return useQuery<PublicUser[]>({
    queryKey: ["/api/jobs", jobId, "assignees"],
    queryFn: () => fetch(`/api/jobs/${jobId}/assignees`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!jobId,
  });
}

export default function Users() {
  const { data: currentUser } = useAuth();
  const { data: users, isLoading } = useUsers();
  const { data: jobs } = useJobs();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicUser | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);

  if (currentUser?.role !== "admin") {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">Bu sayfaya erişim yetkiniz yok.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Kullanıcı Yönetimi</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Kullanıcıları ve iş ilanı atamalarını yönetin</p>
          </div>
          <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
        </div>

        {/* Users Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_2fr_120px_140px_100px] gap-4 px-5 py-3 bg-muted/30 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <div>Kullanıcı</div><div>E-posta</div><div>Rol</div><div>Üyelik</div><div></div>
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Yükleniyor...</div>
          ) : !users?.length ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Kullanıcı bulunamadı.</div>
          ) : (
            <div className="divide-y divide-border">
              {users.map((user) => (
                <div key={user.id} className="grid grid-cols-1 md:grid-cols-[2fr_2fr_120px_140px_100px] gap-4 px-5 py-4 items-center hover:bg-muted/10 transition-colors" data-testid={`row-user-${user.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <p className="font-medium text-sm">{user.name}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <RoleBadge role={user.role} />
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {user.createdAt ? formatDistanceToNow(new Date(user.createdAt), { addSuffix: true }) : "—"}
                  </p>
                  <div className="flex items-center gap-1">
                    {(user.role === "hiring_manager" || user.role === "assistant") && (
                      <Button
                        size="sm" variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setSelectedJobId(selectedJobId === user.id ? null : user.id)}
                        data-testid={`btn-assign-jobs-${user.id}`}
                      >
                        <Briefcase className="h-3 w-3 mr-1" /> Jobs
                      </Button>
                    )}
                    {user.id !== currentUser?.id && (
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                        onClick={() => setDeleteTarget(user)}
                        data-testid={`btn-delete-user-${user.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Job Assignment Panel */}
        {selectedJobId !== null && jobs && (
          <JobAssignmentPanel
            userId={selectedJobId}
            userName={users?.find((u) => u.id === selectedJobId)?.name ?? ""}
            jobs={jobs}
            onClose={() => setSelectedJobId(null)}
          />
        )}

        {/* Delete confirm */}
        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kullanıcıyı sil</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleteTarget?.name}</strong> adlı kullanıcı silinecek. Bu işlem geri alınamaz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>İptal</AlertDialogCancel>
              <DeleteUserConfirm user={deleteTarget} onDone={() => setDeleteTarget(null)} />
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}

// ─── Job Assignment Panel ─────────────────────────────────────────────────────

function JobAssignmentPanel({ userId, userName, jobs, onClose }: {
  userId: number; userName: string; jobs: any[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: assignees } = useJobAssignees(0);

  const [assignedMap, setAssignedMap] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState<number | null>(null);

  const isAssigned = async (jobId: number) => {
    const res = await fetch(`/api/jobs/${jobId}/assignees`, { credentials: "include" });
    const list: PublicUser[] = await res.json();
    return list.some((u) => u.id === userId);
  };

  const toggleAssign = async (jobId: number, currentlyAssigned: boolean) => {
    setLoading(jobId);
    try {
      if (currentlyAssigned) {
        await fetch(`/api/jobs/${jobId}/assign/${userId}`, { method: "DELETE", credentials: "include" });
      } else {
        await fetch(`/api/jobs/${jobId}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
          credentials: "include",
        });
      }
      setAssignedMap((prev) => ({ ...prev, [jobId]: !currentlyAssigned }));
      qc.invalidateQueries({ queryKey: ["/api/jobs", jobId, "assignees"] });
      toast({ title: currentlyAssigned ? "Atama kaldırıldı" : "Atama yapıldı" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <JobAssignPanelContent userId={userId} userName={userName} jobs={jobs} onClose={onClose} />
  );
}

function JobAssignPanelContent({ userId, userName, jobs, onClose }: {
  userId: number; userName: string; jobs: any[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const [localAssigned, setLocalAssigned] = useState<Record<number, boolean | undefined>>({});

  const getAssigned = async (jobId: number): Promise<boolean> => {
    if (localAssigned[jobId] !== undefined) return localAssigned[jobId]!;
    const res = await fetch(`/api/jobs/${jobId}/assignees`, { credentials: "include" });
    const list: PublicUser[] = await res.json();
    return list.some((u) => u.id === userId);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          {userName} — İlan Atamaları
        </h3>
        <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="divide-y divide-border max-h-72 overflow-y-auto">
        {jobs.filter((j) => j.status === "open").map((job) => (
          <JobAssignRow key={job.id} job={job} userId={userId} />
        ))}
        {jobs.filter((j) => j.status === "open").length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Açık ilan yok.</p>
        )}
      </div>
    </div>
  );
}

function JobAssignRow({ job, userId }: { job: any; userId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const { data: assignees, isLoading } = useQuery<PublicUser[]>({
    queryKey: ["/api/jobs", job.id, "assignees"],
    queryFn: () => fetch(`/api/jobs/${job.id}/assignees`, { credentials: "include" }).then((r) => {
      if (!r.ok) throw new Error("Failed to load assignees");
      return r.json();
    }),
  });

  const assigned = Array.isArray(assignees) && assignees.some((u) => u.id === userId);

  const toggle = async () => {
    setBusy(true);
    try {
      if (assigned) {
        await fetch(`/api/jobs/${job.id}/assign/${userId}`, { method: "DELETE", credentials: "include" });
      } else {
        await fetch(`/api/jobs/${job.id}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
          credentials: "include",
        });
      }
      qc.invalidateQueries({ queryKey: ["/api/jobs", job.id, "assignees"] });
      toast({ title: assigned ? "Atama kaldırıldı" : "Atama yapıldı" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div>
        <p className="text-sm font-medium">{job.title}</p>
        <p className="text-xs text-muted-foreground">{job.department}</p>
      </div>
      <Button
        size="sm" variant={assigned ? "default" : "outline"}
        className="h-7 text-xs"
        onClick={toggle}
        disabled={busy || isLoading}
        data-testid={`btn-toggle-assign-${job.id}`}
      >
        {assigned ? <><Check className="h-3 w-3 mr-1" />Atandı</> : "Ata"}
      </Button>
    </div>
  );
}

// ─── Add User Dialog ──────────────────────────────────────────────────────────

function AddUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "hiring_manager" });
  const f = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) { const b = await res.json(); throw new Error(b.message); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      qc.invalidateQueries({ queryKey: ["/api/assistants"] });
      onOpenChange(false);
      setForm({ name: "", email: "", password: "", role: "hiring_manager" });
      toast({ title: "Kullanıcı eklendi" });
    },
    onError: (err) => toast({ title: (err as Error).message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="btn-add-user">
          <Plus className="mr-1.5 h-4 w-4" /> Kullanıcı Ekle
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby="add-user-desc">
        <DialogHeader>
          <DialogTitle>Yeni Kullanıcı</DialogTitle>
          <p id="add-user-desc" className="text-sm text-muted-foreground">Sisteme yeni bir kullanıcı ekleyin.</p>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Field label="Ad Soyad">
            <Input value={form.name} onChange={(e) => f("name", e.target.value)} placeholder="Ayşe Kaya" data-testid="input-user-name" />
          </Field>
          <Field label="E-posta">
            <Input type="email" value={form.email} onChange={(e) => f("email", e.target.value)} placeholder="ayse@kw.com.tr" data-testid="input-user-email" />
          </Field>
          <Field label="Şifre">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="password" value={form.password} onChange={(e) => f("password", e.target.value)} placeholder="En az 8 karakter" className="pl-9" data-testid="input-user-password" />
            </div>
          </Field>
          <Field label="Rol">
            <Select value={form.role} onValueChange={(v) => f("role", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hiring_manager">
                  <div className="flex items-center gap-2"><User className="h-3.5 w-3.5" />Hiring Manager</div>
                </SelectItem>
                <SelectItem value="assistant">
                  <div className="flex items-center gap-2"><ClipboardList className="h-3.5 w-3.5" />Assistant</div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2"><Shield className="h-3.5 w-3.5" />Admin</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>İptal</Button>
            <Button
              className="flex-1"
              onClick={() => mutate(form)}
              disabled={isPending || !form.name || !form.email || !form.password}
              data-testid="btn-submit-user"
            >
              {isPending ? "Ekleniyor..." : "Ekle"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirm button ────────────────────────────────────────────────────

function DeleteUserConfirm({ user, onDone }: { user: PublicUser | null; onDone: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { mutate, isPending } = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const b = await res.json(); throw new Error(b.message); }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      qc.invalidateQueries({ queryKey: ["/api/assistants"] });
      toast({ title: "Kullanıcı silindi" });
      onDone();
    },
    onError: (err) => toast({ title: (err as Error).message, variant: "destructive" }),
  });
  return (
    <AlertDialogAction onClick={() => user && mutate(user.id)} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
      {isPending ? "Siliniyor..." : "Sil"}
    </AlertDialogAction>
  );
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium ring-1 ring-red-200">
        <Shield className="h-3 w-3" />Admin
      </span>
    );
  }
  if (role === "assistant") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium ring-1 ring-violet-200">
        <ClipboardList className="h-3 w-3" />Assistant
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium ring-1 ring-blue-200">
      <User className="h-3 w-3" />Hiring Manager
    </span>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}

