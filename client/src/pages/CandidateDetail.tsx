import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCandidate, useUpdateCandidate } from "@/hooks/use-candidates";
import { useUpdateEmployee } from "@/hooks/use-employees";
import { useApplications } from "@/hooks/use-applications";
import { StatusBadge } from "@/components/StatusBadge";
import { ScoreBadge, ScoreBar } from "@/components/ScoreBadge";
import { MentionTextarea } from "@/components/MentionTextarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, Mail, Phone, Briefcase, MessageSquare,
  Trash2, Send, User, Pencil, MapPin, Building2,
  FileCheck, Globe, Star, Award, Users, TrendingUp,
  ExternalLink, Calendar, FileText, CheckCircle2, Circle, AtSign, History, Clock,
  Key, UserCheck, BadgeCheck,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import {
  CANDIDATE_CATEGORIES, LICENSE_STATUSES, TURKEY_CITIES, REAL_ESTATE_BRANDS,
  REQUIRED_DOCUMENTS, STAGE_LABELS, CONTRACT_TYPES, URETKENLIK_ORANLAR,
  type Candidate, type InsertCandidate, type CandidateNote,
  type PublicUser,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_META = {
  K0: { label: "K0", desc: "New to Real Estate", color: "bg-slate-100 text-slate-700 ring-slate-300", dot: "bg-slate-400" },
  K1: { label: "K1", desc: "Licensed — Limited Sales", color: "bg-amber-100 text-amber-800 ring-amber-300", dot: "bg-amber-500" },
  K2: { label: "K2", desc: "Productive Agent", color: "bg-emerald-100 text-emerald-800 ring-emerald-300", dot: "bg-emerald-500" },
};

const LICENSE_META = {
  unlicensed: { label: "Unlicensed", color: "text-red-600 bg-red-50" },
  pending:    { label: "License Pending", color: "text-amber-600 bg-amber-50" },
  licensed:   { label: "Licensed", color: "text-emerald-700 bg-emerald-50" },
};

const SPECIALIZATIONS = ["Konut", "Ticari", "Arsa", "Lüks", "Yatırım", "Kiralık"];
const LANGUAGES = ["Türkçe", "İngilizce", "Arapça", "Rusça", "Almanca", "Fransızca"];

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useCandidateNotes(candidateId: number) {
  return useQuery<CandidateNote[]>({
    queryKey: ["/api/candidates", candidateId, "notes"],
    queryFn: () => fetch(`/api/candidates/${candidateId}/notes`).then((r) => r.json()),
  });
}

function useCreateNote(candidateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/candidates/${candidateId}/notes`, { content, authorName: "Recruiter" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "notes"] });
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });
}

function useDeleteNote(candidateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: number) => apiRequest("DELETE", `/api/notes/${noteId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/candidates", candidateId, "notes"] }),
  });
}

function useAssistants() {
  return useQuery<PublicUser[]>({
    queryKey: ["/api/assistants"],
    queryFn: () => fetch("/api/assistants").then((r) => r.json()),
  });
}

function useHistory(candidateId: number) {
  return useQuery<{ id: number; applicationId: number; jobId: number; jobTitle: string | null; fromStatus: string | null; toStatus: string; enteredAt: string }[]>({
    queryKey: ["/api/candidates", candidateId, "history"],
    queryFn: () => fetch(`/api/candidates/${candidateId}/history`).then((r) => r.json()),
  });
}


// ── Note content renderer with @mention highlights ─────────────────────────────

function NoteContent({ content }: { content: string }) {
  const parts = content.split(/(@\w+)/g);
  return (
    <p className="text-sm leading-relaxed">
      {parts.map((part, i) =>
        /^@\w+/.test(part) ? (
          <span key={i} className="inline-flex items-center gap-0.5 text-primary font-semibold bg-primary/10 rounded px-1">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

function useApplicationDocuments(applicationId: number) {
  return useQuery<{ applicationId: number; receivedDocs: string[] }>({
    queryKey: ["/api/applications", applicationId, "documents"],
    queryFn: () => fetch(`/api/applications/${applicationId}/documents`).then((r) => r.json()),
  });
}

function useUpdateApplicationDocuments(applicationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (receivedDocs: string[]) =>
      apiRequest("PATCH", `/api/applications/${applicationId}/documents`, { receivedDocs }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/applications", applicationId, "documents"] }),
  });
}

function DocumentChecklist({ applicationId }: { applicationId: number }) {
  const { data, isLoading } = useApplicationDocuments(applicationId);
  const { mutate: updateDocs } = useUpdateApplicationDocuments(applicationId);
  const received = data?.receivedDocs ?? [];

  const toggle = (key: string) => {
    const next = received.includes(key)
      ? received.filter((k) => k !== key)
      : [...received, key];
    updateDocs(next);
  };

  const doneCount = received.length;
  const total = REQUIRED_DOCUMENTS.length;

  if (isLoading) return <div className="h-6 bg-muted/40 rounded animate-pulse mt-2" />;

  return (
    <div className="mt-3 pt-3 border-t border-border/60">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold flex items-center gap-1.5 text-violet-700">
          <FileText className="h-3.5 w-3.5" /> Belgeler
        </span>
        <span className="text-[11px] font-bold text-muted-foreground">{doneCount}/{total}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {REQUIRED_DOCUMENTS.map((doc) => {
          const done = received.includes(doc.key);
          return (
            <button
              key={doc.key}
              onClick={() => toggle(doc.key)}
              data-testid={`doc-toggle-${doc.key}-${applicationId}`}
              className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all ${
                done
                  ? "bg-violet-50 border-violet-200 text-violet-700"
                  : "bg-muted/30 border-border text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              {done
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                : <Circle className="h-3.5 w-3.5 shrink-0" />
              }
              <span className={done ? "font-medium" : ""}>{doc.label}</span>
            </button>
          );
        })}
      </div>
      {doneCount === total && (
        <p className="text-[11px] text-violet-700 font-semibold mt-2 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> Tüm belgeler tamamlandı
        </p>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function CandidateDetail() {
  const [, params] = useRoute("/candidates/:id");
  const candidateId = params ? parseInt(params.id) : 0;

  const { data: candidate, isLoading } = useCandidate(candidateId);
  const { data: applications } = useApplications(undefined, candidateId);
  const { data: notes } = useCandidateNotes(candidateId);
  const { mutate: createNote, isPending: isNoting } = useCreateNote(candidateId);
  const { mutate: deleteNote } = useDeleteNote(candidateId);
  const { data: assistants = [] } = useAssistants();
  const { data: history = [] } = useHistory(candidateId);
  const { data: employeeRecord } = useQuery<any>({
    queryKey: ["/api/candidates", candidateId, "employee"],
    queryFn: () => fetch(`/api/candidates/${candidateId}/employee`).then((r) => r.json()),
    enabled: !!candidateId,
  });

  const [noteText, setNoteText] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "applications" | "notes" | "history">("overview");
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4 animate-pulse max-w-4xl">
          <div className="h-8 w-48 rounded bg-muted/40" />
          <div className="h-48 rounded-xl bg-muted/30" />
        </div>
      </Layout>
    );
  }

  if (!candidate) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Aday bulunamadı.</p>
          <Link href="/candidates"><Button variant="outline" className="mt-4">Adaylara Dön</Button></Link>
        </div>
      </Layout>
    );
  }

  const catMeta = CATEGORY_META[candidate.category as keyof typeof CATEGORY_META] ?? CATEGORY_META.K0;
  const licMeta = LICENSE_META[candidate.licenseStatus as keyof typeof LICENSE_META] ?? LICENSE_META.unlicensed;

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    createNote(noteText, { onSuccess: () => setNoteText("") });
  };

  return (
    <Layout>
      <div className="space-y-5 max-w-4xl">
        <div className="flex items-center justify-between">
          <Link href="/candidates" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Adaylara Dön
          </Link>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} data-testid="btn-edit-candidate">
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Profili Düzenle
          </Button>
        </div>

        {/* ── Hero Profile Card ── */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {/* KW Brand bar */}
          <div className="h-1.5 bg-gradient-to-r from-[#B40101] via-[#CC0000] to-[#8B0000]" />

          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-5">
              {/* Avatar + category */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-[#CC0000] to-[#8B0000] flex items-center justify-center text-white text-2xl font-bold shadow-sm">
                  {(candidate.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${catMeta.color}`} data-testid="category-badge">
                  {catMeta.label}
                </span>
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h1 className="text-xl font-display font-bold text-foreground">{candidate.name}</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">{catMeta.desc}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${licMeta.color}`}>
                    {licMeta.label}
                  </span>
                </div>

                {/* Contact row */}
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-sm text-muted-foreground">
                  {candidate.email && (
                    <a href={`mailto:${candidate.email}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                      <Mail className="h-3.5 w-3.5 shrink-0" />{candidate.email}
                    </a>
                  )}
                  {candidate.phone && (
                    <a href={`tel:${candidate.phone}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                      <Phone className="h-3.5 w-3.5 shrink-0" />{candidate.phone}
                    </a>
                  )}
                  {candidate.city && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {candidate.city}{candidate.district ? ` / ${candidate.district}` : ""}
                    </span>
                  )}
                  {candidate.socialMedia && (
                    <a href={candidate.socialMedia} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-foreground transition-colors text-blue-600">
                      <Globe className="h-3.5 w-3.5 shrink-0" /> Profil
                    </a>
                  )}
                </div>

                {/* Tags */}
                {candidate.tags && candidate.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {candidate.tags.map((tag) => (
                      <span key={tag} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border/60">
              <StatPill icon={<Briefcase className="h-3.5 w-3.5" />} label="Deneyim" value={`${candidate.experience ?? 0} yıl`} />
              <StatPill icon={<Building2 className="h-3.5 w-3.5" />} label="Mevcut Marka" value={candidate.currentBrand ?? "—"} />
              <StatPill icon={<FileCheck className="h-3.5 w-3.5" />} label="Lisans No" value={candidate.licenseNumber ?? "—"} />
              <StatPill icon={<Users className="h-3.5 w-3.5" />} label="Referans" value={candidate.referredBy ?? "—"} />
            </div>
            {candidate.expectedStartMonth && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
                <div className="flex items-center gap-2 bg-primary/10 text-primary rounded-lg px-3 py-2 text-sm font-medium">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span className="text-xs text-muted-foreground font-normal mr-1">Beklenen Başlangıç:</span>
                  <span data-testid="text-expected-start-month">{formatStartMonth(candidate.expectedStartMonth)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 border-b border-border">
          {(["overview", "applications", "notes", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${tab}`}
            >
              {tab === "overview" ? "Profil" : tab === "applications" ? "Başvurular" : tab === "notes" ? "Notlar" : "Geçmiş"}
              {tab === "applications" && applications && (
                <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full">{applications.length}</span>
              )}
              {tab === "notes" && notes && notes.length > 0 && (
                <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full">{notes.length}</span>
              )}
              {tab === "history" && history.length > 0 && (
                <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded-full">{history.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ── */}
        {activeTab === "overview" && (
          <div className="space-y-4">

          {/* ── Employment Info (only shown when candidate is an employee) ── */}
          {employeeRecord && (
            <div className="rounded-xl border-2 border-[#CC0000]/30 bg-gradient-to-r from-[#CC0000]/5 to-transparent shadow-sm overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-[#B40101] via-[#CC0000] to-[#8B0000]" />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BadgeCheck className="h-5 w-5 text-[#CC0000]" />
                  <h2 className="text-sm font-bold text-[#CC0000] uppercase tracking-wide">KW Çalışan Bilgileri</h2>
                  <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                    <CheckCircle2 className="h-3 w-3" />
                    {employeeRecord.status === "active" ? "Aktif Çalışan" : "Pasif"}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1">
                      <Key className="h-3 w-3" /> KWUID
                    </p>
                    <p className="font-mono text-sm font-semibold">{employeeRecord.kwuid || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1">
                      <AtSign className="h-3 w-3" /> KW E-posta
                    </p>
                    {employeeRecord.kwMail ? (
                      <a href={`mailto:${employeeRecord.kwMail}`} className="text-primary hover:underline text-sm truncate block">
                        {employeeRecord.kwMail}
                      </a>
                    ) : <p className="text-sm">—</p>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1">
                      <Briefcase className="h-3 w-3" /> Ünvan
                    </p>
                    <p className="text-sm font-semibold">{employeeRecord.title || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Başlangıç Tarihi
                    </p>
                    <p className="text-sm font-semibold">
                      {employeeRecord.startDate ? format(new Date(employeeRecord.startDate), "d MMM yyyy") : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Sözleşme Türü
                    </p>
                    <p className="text-sm font-semibold">{employeeRecord.contractType || "—"}</p>
                  </div>
                  {employeeRecord.job && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1 flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> İş İlanı
                      </p>
                      <p className="text-sm font-semibold truncate">{employeeRecord.job.title}</p>
                    </div>
                  )}
                  {employeeRecord.capMonth && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Cap Ayı</p>
                      <p className="text-sm font-semibold">{employeeRecord.capMonth}</p>
                    </div>
                  )}
                  {employeeRecord.capValue && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Cap Değeri</p>
                      <p className="text-sm font-semibold">{employeeRecord.capValue}</p>
                    </div>
                  )}
                </div>

                {employeeRecord.uretkenlikKoclugu && (
                  <div className="mt-4 pt-4 border-t border-[#CC0000]/15">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5" /> Üretkenlik Koçluğu
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Durum</p>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Aktif</span>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Koç</p>
                        <p className="text-sm font-semibold">{employeeRecord.uretkenlikKocluguManagerName || "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Paylaşım Oranı</p>
                        <p className="text-sm font-semibold">{employeeRecord.uretkenlikKocluguOran || "—"}</p>
                      </div>
                    </div>
                  </div>
                )}

                {employeeRecord.notes && (
                  <div className="mt-4 pt-4 border-t border-[#CC0000]/15">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Notlar</p>
                    <p className="text-sm text-foreground/80">{employeeRecord.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Billing / Tax Info (separate card, only for employees) ── */}
          {employeeRecord && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-blue-200 bg-blue-50">
                <FileText className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-bold text-blue-700 uppercase tracking-wide">Fatura &amp; Vergi Bilgileri</h2>
              </div>
              <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Şirket / Şahıs İsmi</p>
                  <p className="font-semibold">{employeeRecord.billingName || "—"}</p>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Fatura Adresi</p>
                  <p>{employeeRecord.billingAddress || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">İlçe</p>
                  <p>{employeeRecord.billingDistrict || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">İl</p>
                  <p>{employeeRecord.billingCity || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Ülke</p>
                  <p>{employeeRecord.billingCountry || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Vergi Dairesi</p>
                  <p>{employeeRecord.taxOffice || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Vergi / TCK No</p>
                  <p className="font-mono">{employeeRecord.taxId || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Doğum Tarihi</p>
                  <p>{employeeRecord.birthDate || "—"}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Application Score Summary ── */}
          {applications && applications.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Star className="h-4 w-4 text-primary" />Başvuru Puanları
              </h2>
              <div className="space-y-2">
                {applications.map((app) => (
                  <div key={app.id} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-border/40 last:border-0" data-testid={`overview-score-app-${app.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{app.job?.title ?? `Başvuru #${app.id}`}</span>
                      <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{app.stage}</span>
                    </div>
                    <ScoreBadge score={app.score} size="sm" showLabel data-testid={`overview-score-val-${app.id}`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Realtor profile */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Award className="h-4 w-4 text-primary" />Gayrimenkul Profili</h2>

              <InfoRow icon={<TrendingUp className="h-3.5 w-3.5" />} label="Kategori">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${catMeta.color}`}>{catMeta.label} — {catMeta.desc}</span>
              </InfoRow>

              {candidate.currentBrand && (
                <InfoRow icon={<Building2 className="h-3.5 w-3.5" />} label="Mevcut Marka / Ofis">
                  {candidate.currentBrand}
                </InfoRow>
              )}

              <InfoRow icon={<FileCheck className="h-3.5 w-3.5" />} label="Lisans Durumu">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${licMeta.color}`}>{licMeta.label}</span>
                {candidate.licenseNumber && <span className="text-xs text-muted-foreground ml-2">#{candidate.licenseNumber}</span>}
              </InfoRow>

              <InfoRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Deneyim">
                {candidate.experience ?? 0} yıl
              </InfoRow>

              {candidate.specialization && candidate.specialization.length > 0 && (
                <InfoRow icon={<Star className="h-3.5 w-3.5" />} label="Uzmanlık">
                  <div className="flex flex-wrap gap-1">
                    {candidate.specialization.map((s) => (
                      <span key={s} className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">{s}</span>
                    ))}
                  </div>
                </InfoRow>
              )}

              {candidate.languages && candidate.languages.length > 0 && (
                <InfoRow icon={<Globe className="h-3.5 w-3.5" />} label="Dil">
                  <div className="flex flex-wrap gap-1">
                    {candidate.languages.map((l) => (
                      <span key={l} className="text-[11px] bg-muted text-foreground px-2 py-0.5 rounded font-medium">{l}</span>
                    ))}
                  </div>
                </InfoRow>
              )}
            </div>

            {/* Location & contact */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
                <h2 className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />Konum</h2>
                {candidate.city ? (
                  <>
                    <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Şehir">{candidate.city}</InfoRow>
                    {candidate.district && <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="İlçe">{candidate.district}</InfoRow>}
                    {(candidate as any).address && <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Açık Adres">{(candidate as any).address}</InfoRow>}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Konum belirtilmemiş</p>
                )}
              </div>

              {((candidate as any).emergencyContactName || (candidate as any).emergencyContactPhone) && (
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
                  <h2 className="text-sm font-semibold flex items-center gap-2"><Phone className="h-4 w-4 text-primary" />Acil Durum İletişim</h2>
                  {(candidate as any).emergencyContactName && (
                    <InfoRow icon={<User className="h-3.5 w-3.5" />} label="Ad Soyad">{(candidate as any).emergencyContactName}</InfoRow>
                  )}
                  {(candidate as any).emergencyContactPhone && (
                    <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefon">
                      <a href={`tel:${(candidate as any).emergencyContactPhone}`} className="hover:text-foreground transition-colors">
                        {(candidate as any).emergencyContactPhone}
                      </a>
                    </InfoRow>
                  )}
                </div>
              )}

              {(candidate.referredBy || candidate.socialMedia) && (
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
                  <h2 className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Diğer</h2>
                  {candidate.referredBy && (
                    <InfoRow icon={<Users className="h-3.5 w-3.5" />} label="Referans">{candidate.referredBy}</InfoRow>
                  )}
                  {candidate.socialMedia && (
                    <InfoRow icon={<Globe className="h-3.5 w-3.5" />} label="Sosyal Medya">
                      <a href={candidate.socialMedia} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1 text-xs">
                        Profili Görüntüle <ExternalLink className="h-3 w-3" />
                      </a>
                    </InfoRow>
                  )}
                </div>
              )}

              {candidate.resumeText && (
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <h2 className="text-sm font-semibold mb-2">Notlar / Özet</h2>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{candidate.resumeText}</p>
                </div>
              )}
            </div>
          </div>
          </div>
        )}

        {/* ── Applications Tab ── */}
        {activeTab === "applications" && (
          <div className="space-y-3">
            {!applications?.length ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Henüz başvuru yok.</div>
            ) : (
              applications.map((app) => (
                <div key={app.id} className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3" data-testid={`app-row-${app.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{app.job?.title ?? "Bilinmeyen İlan"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{app.job?.company} · {app.job?.location}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {app.appliedAt ? formatDistanceToNow(new Date(app.appliedAt), { addSuffix: true }) : ""} başvurdu
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ScoreBadge score={app.score} size="md" showLabel />
                      <StatusBadge status={app.status} />
                      {app.job && (
                        <Link href={`/jobs/${app.job.id}`}>
                          <Button size="sm" variant="outline" className="text-xs h-7">İlanı Gör</Button>
                        </Link>
                      )}
                    </div>
                  </div>
                  <ScoreBar score={app.score} />
                  {app.status === "documents" && (
                    <DocumentChecklist applicationId={app.id} />
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Notes Tab ── */}
        {activeTab === "notes" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" /> Not Ekle
              </h3>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <AtSign className="h-3 w-3" /> Asistan atamak için <code className="bg-muted px-1 rounded font-mono">@isim</code> kullanın — 48 saat içinde görev oluşturulur
              </p>
              <MentionTextarea
                value={noteText}
                onChange={setNoteText}
                assistants={assistants}
                placeholder="Bu aday hakkında not ekleyin... @asistan ile görev atayın"
                rows={3}
                className="mb-2"
                data-testid="input-candidate-note"
              />
              <Button size="sm" onClick={handleAddNote} disabled={isNoting || !noteText.trim()} data-testid="btn-add-note">
                <Send className="mr-1.5 h-3.5 w-3.5" />
                {isNoting ? "Ekleniyor..." : "Not Ekle"}
              </Button>
            </div>

            {!notes?.length ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Henüz not yok.</div>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-xl border border-border bg-card p-4 shadow-sm" data-testid={`note-${note.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <span className="text-xs font-medium">{note.authorName}</span>
                          <span className="text-xs text-muted-foreground">
                            {note.createdAt ? formatDistanceToNow(new Date(note.createdAt), { addSuffix: true }) : ""}
                          </span>
                        </div>
                        <NoteContent content={note.content} />
                      </div>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 shrink-0"
                        onClick={() => deleteNote(note.id)}
                        data-testid={`btn-delete-note-${note.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── History Tab ── */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {history.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Henüz geçmiş kaydı yok.
              </div>
            ) : (() => {
              // Group entries by applicationId
              const groups = history.reduce<Record<number, typeof history>>((acc, entry) => {
                (acc[entry.applicationId] ??= []).push(entry);
                return acc;
              }, {});

              return Object.entries(groups).map(([appId, entries]) => {
                const jobTitle = entries[0]?.jobTitle ?? "Bilinmeyen İlan";
                const firstAt = entries[0]?.enteredAt;
                const lastEntry = entries[entries.length - 1];
                const isCompleted = lastEntry?.toStatus === "employed";
                const isRejected = lastEntry?.toStatus === "rejected";

                return (
                  <div key={appId} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                    {/* Job header */}
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/30 border-b border-border">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm text-foreground">{jobTitle}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isCompleted && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">İşe Alındı</span>
                        )}
                        {isRejected && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600 ring-1 ring-red-200">Reddedildi</span>
                        )}
                        {firstAt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(firstAt), "dd MMM yyyy")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Timeline entries */}
                    <div className="px-4 py-3 space-y-0">
                      {entries.map((entry, i) => {
                        const isLast = i === entries.length - 1;
                        const toLabel = STAGE_LABELS[entry.toStatus] ?? entry.toStatus;
                        const fromLabel = entry.fromStatus ? (STAGE_LABELS[entry.fromStatus] ?? entry.fromStatus) : null;

                        const dotColor =
                          entry.toStatus === "employed" ? "bg-emerald-500" :
                          entry.toStatus === "rejected" ? "bg-red-500" :
                          entry.toStatus === "hired" ? "bg-violet-500" :
                          entry.toStatus === "offer" ? "bg-amber-500" :
                          entry.toStatus === "interview" ? "bg-blue-500" :
                          "bg-primary/60";

                        return (
                          <div key={entry.id} className="flex gap-3">
                            {/* Connector line + dot */}
                            <div className="flex flex-col items-center">
                              <div className={`h-3 w-3 rounded-full mt-1 shrink-0 ring-2 ring-background ${dotColor}`} />
                              {!isLast && <div className="w-px flex-1 bg-border mt-1 mb-1" />}
                            </div>

                            {/* Content */}
                            <div className={`pb-3 min-w-0 flex-1 ${isLast ? "" : ""}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                {fromLabel && (
                                  <>
                                    <span className="text-xs text-muted-foreground">{fromLabel}</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                  </>
                                )}
                                <span className="text-xs font-semibold text-foreground">{toLabel}</span>
                              </div>
                              {entry.enteredAt && (
                                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5" />
                                  {format(new Date(entry.enteredAt), "dd MMM yyyy, HH:mm")}
                                  <span className="ml-1 opacity-70">({formatDistanceToNow(new Date(entry.enteredAt), { addSuffix: true })})</span>
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {candidate && (
        <EditCandidateDialog candidate={candidate} employeeRecord={employeeRecord ?? null} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </Layout>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatStartMonth(ym: string | null | undefined): string {
  if (!ym) return "—";
  try {
    const [y, m] = ym.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("tr-TR", { year: "numeric", month: "long" });
  } catch {
    return ym;
  }
}

// ─── Helper components ────────────────────────────────────────────────────────

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{icon}<span className="text-[10px] font-medium uppercase tracking-wide">{label}</span></div>
      <p className="text-sm font-semibold text-foreground truncate">{value}</p>
    </div>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
        <div className="text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

// ─── Chip toggle ─────────────────────────────────────────────────────────────

function ChipToggle({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) =>
    value.includes(opt) ? onChange(value.filter((x) => x !== opt)) : onChange([...value, opt]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt} type="button"
          onClick={() => toggle(opt)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            value.includes(opt)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:border-primary"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ─── Edit Dialog ─────────────────────────────────────────────────────────────

function EditCandidateDialog({ candidate, employeeRecord, open, onOpenChange }: { candidate: Candidate; employeeRecord: any | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { mutate: update, isPending: savingCand } = useUpdateCandidate();
  const { mutate: updateEmployee, isPending: savingEmp } = useUpdateEmployee();
  const isPending = savingCand || savingEmp;
  const { toast } = useToast();
  const { data: hiringManagers = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/hiring-managers"],
    queryFn: () => fetch("/api/hiring-managers").then((r) => r.json()),
    enabled: !!employeeRecord,
  });

  const [form, setForm] = useState({
    name: candidate.name ?? "",
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
    category: candidate.category ?? "K0",
    currentBrand: candidate.currentBrand ?? "",
    licenseStatus: candidate.licenseStatus ?? "unlicensed",
    licenseNumber: candidate.licenseNumber ?? "",
    city: candidate.city ?? "",
    district: candidate.district ?? "",
    address: (candidate as any).address ?? "",
    emergencyContactName: (candidate as any).emergencyContactName ?? "",
    emergencyContactPhone: (candidate as any).emergencyContactPhone ?? "",
    experience: String(candidate.experience ?? 0),
    referredBy: candidate.referredBy ?? "",
    socialMedia: candidate.socialMedia ?? "",
    resumeText: candidate.resumeText ?? "",
    expectedStartMonth: candidate.expectedStartMonth ?? "",
  });
  const [specialization, setSpecialization] = useState<string[]>(candidate.specialization ?? []);
  const [languages, setLanguages] = useState<string[]>(candidate.languages ?? []);
  const f = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // KW / employee fields (only used when candidate is an employee)
  const [kwuid, setKwuid] = useState(employeeRecord?.kwuid ?? "");
  const [kwMail, setKwMail] = useState(employeeRecord?.kwMail ?? "");
  const [empTitle, setEmpTitle] = useState(employeeRecord?.title ?? "");
  const [startDate, setStartDate] = useState(
    employeeRecord?.startDate ? new Date(employeeRecord.startDate).toISOString().split("T")[0] : ""
  );
  const [contractType, setContractType] = useState(employeeRecord?.contractType ?? "");
  const [uretkenlikKoclugu, setUretkenlikKoclugu] = useState<boolean>(employeeRecord?.uretkenlikKoclugu ?? false);
  const [uretkenlikManagerId, setUretkenlikManagerId] = useState(
    employeeRecord?.uretkenlikKocluguManagerId ? String(employeeRecord.uretkenlikKocluguManagerId) : ""
  );
  const [uretkenlikOran, setUretkenlikOran] = useState(employeeRecord?.uretkenlikKocluguOran ?? "");
  const [capMonth, setCapMonth] = useState(employeeRecord?.capMonth ?? "");
  const [capValue, setCapValue] = useState(employeeRecord?.capValue ?? "");

  const handleSave = () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast({ title: "Ad ve e-posta zorunludur", variant: "destructive" }); return;
    }
    update({
      id: candidate.id,
      data: {
        ...form,
        experience: parseInt(form.experience) || 0,
        specialization,
        languages,
        currentBrand: form.currentBrand || undefined,
        licenseNumber: form.licenseNumber || undefined,
        city: form.city || undefined,
        district: form.district || undefined,
        address: form.address || undefined,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
        referredBy: form.referredBy || undefined,
        socialMedia: form.socialMedia || undefined,
        resumeText: form.resumeText || undefined,
        phone: form.phone || undefined,
        expectedStartMonth: form.expectedStartMonth || undefined,
      } as Partial<InsertCandidate>,
    }, {
      onSuccess: () => {
        if (employeeRecord) {
          updateEmployee({
            id: employeeRecord.id,
            kwuid: kwuid || undefined,
            kwMail: kwMail || undefined,
            title: empTitle || undefined,
            startDate: startDate || undefined,
            contractType: contractType || null,
            uretkenlikKoclugu,
            uretkenlikKocluguManagerId: uretkenlikKoclugu && uretkenlikManagerId ? Number(uretkenlikManagerId) : null,
            uretkenlikKocluguOran: uretkenlikKoclugu && uretkenlikOran ? uretkenlikOran : null,
            capMonth: capMonth || undefined,
            capValue: capValue || undefined,
          }, {
            onSuccess: () => { toast({ title: "Profil güncellendi" }); onOpenChange(false); },
          });
        } else {
          toast({ title: "Profil güncellendi" });
          onOpenChange(false);
        }
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="edit-candidate-desc">
        <DialogHeader>
          <DialogTitle>Profili Düzenle — {candidate.name}</DialogTitle>
          <p id="edit-candidate-desc" className="text-sm text-muted-foreground">Aday bilgilerini güncelleyin</p>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Basic */}
          <Section title="Kişisel Bilgiler">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ad Soyad *"><Input value={form.name} onChange={(e) => f("name", e.target.value)} data-testid="input-edit-name" /></Field>
              <Field label="E-posta *"><Input type="email" value={form.email} onChange={(e) => f("email", e.target.value)} data-testid="input-edit-email" /></Field>
              <Field label="Telefon"><Input value={form.phone} onChange={(e) => f("phone", e.target.value)} data-testid="input-edit-phone" /></Field>
              <Field label="Sosyal Medya / LinkedIn"><Input value={form.socialMedia} onChange={(e) => f("socialMedia", e.target.value)} placeholder="https://linkedin.com/in/..." /></Field>
            </div>
          </Section>

          {/* KW Category */}
          <Section title="KW Kategori">
            <div className="grid grid-cols-3 gap-2">
              {CANDIDATE_CATEGORIES.map((cat) => {
                const m = CATEGORY_META[cat];
                return (
                  <button
                    key={cat} type="button"
                    onClick={() => f("category", cat)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${form.category === cat ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}
                    data-testid={`category-option-${cat}`}
                  >
                    <p className={`text-sm font-bold ${m.color.split(" ")[1]}`}>{m.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</p>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Realtor */}
          <Section title="Gayrimenkul Bilgileri">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mevcut Marka / Ofis">
                <Select value={form.currentBrand} onValueChange={(v) => f("currentBrand", v)}>
                  <SelectTrigger><SelectValue placeholder="Seçin..." /></SelectTrigger>
                  <SelectContent>{REAL_ESTATE_BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Deneyim (yıl)">
                <Input type="number" min={0} value={form.experience} onChange={(e) => f("experience", e.target.value)} />
              </Field>
              <Field label="Lisans Durumu">
                <Select value={form.licenseStatus} onValueChange={(v) => f("licenseStatus", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlicensed">Lisanssız</SelectItem>
                    <SelectItem value="pending">Lisans Bekliyor</SelectItem>
                    <SelectItem value="licensed">Lisanslı</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Lisans No">
                <Input value={form.licenseNumber} onChange={(e) => f("licenseNumber", e.target.value)} placeholder="TKGM-..." />
              </Field>
            </div>
          </Section>

          {/* Specialization */}
          <Section title="Uzmanlık Alanları">
            <ChipToggle options={SPECIALIZATIONS} value={specialization} onChange={setSpecialization} />
          </Section>

          {/* Languages */}
          <Section title="Yabancı Dil">
            <ChipToggle options={LANGUAGES} value={languages} onChange={setLanguages} />
          </Section>

          {/* Location */}
          <Section title="Konum">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Şehir">
                <Select value={form.city} onValueChange={(v) => f("city", v)}>
                  <SelectTrigger><SelectValue placeholder="Şehir seçin..." /></SelectTrigger>
                  <SelectContent>{TURKEY_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="İlçe">
                <Input value={form.district} onChange={(e) => f("district", e.target.value)} placeholder="Kadıköy, Çankaya..." />
              </Field>
              <div className="col-span-2">
                <Field label="Açık Adres">
                  <Input value={form.address} onChange={(e) => f("address", e.target.value)} placeholder="Sokak, bina no, daire..." />
                </Field>
              </div>
            </div>
          </Section>

          {/* Emergency Contact */}
          <Section title="Acil Durum İletişim">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ad Soyad">
                <Input value={form.emergencyContactName} onChange={(e) => f("emergencyContactName", e.target.value)} placeholder="Yakın kişinin adı" />
              </Field>
              <Field label="Telefon">
                <Input value={form.emergencyContactPhone} onChange={(e) => f("emergencyContactPhone", e.target.value)} placeholder="+90..." />
              </Field>
            </div>
          </Section>

          {/* Other */}
          <Section title="Diğer">
            <div className="space-y-3">
              <Field label="Beklenen Başlangıç Ayı">
                <Input
                  type="month"
                  value={form.expectedStartMonth}
                  onChange={(e) => f("expectedStartMonth", e.target.value)}
                  data-testid="input-edit-expected-start-month"
                />
              </Field>
              <Field label="Referans (kim tanıttı?)">
                <Input value={form.referredBy} onChange={(e) => f("referredBy", e.target.value)} placeholder="Ad Soyad veya kaynak" />
              </Field>
              <Field label="Notlar / Özet">
                <Textarea value={form.resumeText} onChange={(e) => f("resumeText", e.target.value)} rows={3} placeholder="Ek bilgiler..." />
              </Field>
            </div>
          </Section>

          {/* KW Info — only shown when candidate is an active employee */}
          {employeeRecord && (
            <Section title="KW Bilgileri">
              <div className="grid grid-cols-2 gap-3">
                <Field label="KWUID">
                  <Input value={kwuid} onChange={(e) => setKwuid(e.target.value)} placeholder="KWUID girin" />
                </Field>
                <Field label="KW E-posta">
                  <Input type="email" value={kwMail} onChange={(e) => setKwMail(e.target.value)} placeholder="isim@kw.com.tr" />
                </Field>
                <Field label="Ünvan">
                  <Input value={empTitle} onChange={(e) => setEmpTitle(e.target.value)} placeholder="Danışman" />
                </Field>
                <Field label="Başlangıç Tarihi">
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </Field>
                <Field label="Sözleşme Türü">
                  <Select value={contractType} onValueChange={setContractType}>
                    <SelectTrigger><SelectValue placeholder="Seçiniz..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Seçilmedi —</SelectItem>
                      {CONTRACT_TYPES.map((ct) => <SelectItem key={ct} value={ct}>{ct}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Cap Ayı">
                  <Input value={capMonth} onChange={(e) => setCapMonth(e.target.value)} placeholder="Ocak" />
                </Field>
                <Field label="Cap Değeri">
                  <Input value={capValue} onChange={(e) => setCapValue(e.target.value)} placeholder="Cap miktarı" />
                </Field>
              </div>
              <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="uretkenlik-cd"
                    checked={uretkenlikKoclugu}
                    onChange={(e) => setUretkenlikKoclugu(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="uretkenlik-cd" className="text-sm font-medium cursor-pointer">Üretkenlik Koçluğu</Label>
                </div>
                {uretkenlikKoclugu && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <Field label="Koç (Hiring Manager)">
                      <Select value={uretkenlikManagerId} onValueChange={setUretkenlikManagerId}>
                        <SelectTrigger><SelectValue placeholder="Yönetici seçin..." /></SelectTrigger>
                        <SelectContent>
                          {hiringManagers.map((hm) => (
                            <SelectItem key={hm.id} value={String(hm.id)}>{hm.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Paylaşım Oranı">
                      <Select value={uretkenlikOran} onValueChange={setUretkenlikOran}>
                        <SelectTrigger><SelectValue placeholder="Oran seçin..." /></SelectTrigger>
                        <SelectContent>
                          {URETKENLIK_ORANLAR.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                )}
              </div>
            </Section>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>İptal</Button>
            <Button className="flex-1" onClick={handleSave} disabled={isPending} data-testid="btn-save-candidate">
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
