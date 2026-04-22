import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Link } from "wouter";
import { useCandidates, useCreateCandidate } from "@/hooks/use-candidates";
import { useJobs, useAllJobs } from "@/hooks/use-jobs";
import { useApplications, useCreateApplication } from "@/hooks/use-applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Search, Mail, Phone, Briefcase, ExternalLink, MapPin, Building2,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  CANDIDATE_CATEGORIES, TURKEY_CITIES, REAL_ESTATE_BRANDS, type InsertCandidate,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// ─── Category display meta ────────────────────────────────────────────────────

const CATEGORY_META = {
  K0: { label: "K0", desc: "Yeni",            color: "bg-slate-100 text-slate-700 ring-1 ring-slate-300" },
  K1: { label: "K1", desc: "Sınırlı Satış",   color: "bg-amber-100 text-amber-800 ring-1 ring-amber-300" },
  K2: { label: "K2", desc: "Aktif Satış",     color: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" },
};

const SPECIALIZATIONS = ["Konut", "Ticari", "Arsa", "Lüks", "Yatırım", "Kiralık"];
const LANGUAGES = ["Türkçe", "İngilizce", "Arapça", "Rusça", "Almanca", "Fransızca"];

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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Candidates() {
  const { data: candidates, isLoading } = useCandidates();
  const { data: allApplications } = useApplications();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Build a map: candidateId -> list of jobs they applied to
  const candidateJobsMap = new Map<number, { jobId: number; jobTitle: string; status: string }[]>();
  for (const app of allApplications ?? []) {
    const existing = candidateJobsMap.get(app.candidateId) ?? [];
    if (app.job) {
      existing.push({ jobId: app.jobId, jobTitle: app.job.title, status: app.status });
    }
    candidateJobsMap.set(app.candidateId, existing);
  }

  const filtered = candidates?.filter((c) => {
    const jobs = candidateJobsMap.get(c.id) ?? [];
    const jobTitles = jobs.map((j) => j.jobTitle).join(" ");
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.currentBrand ?? "").toLowerCase().includes(search.toLowerCase()) ||
      jobTitles.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || c.category === filterCat;
    return matchSearch && matchCat;
  });

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Talent Pool</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Keller Williams Platin & Karma — Aday Havuzu</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="İsim, şehir, marka..."
                className="pl-8 w-52 h-9 text-sm bg-card"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-candidate-search"
              />
            </div>
            <CreateCandidateDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} />
          </div>
        </div>

        {/* Category filter tabs */}
        <div className="flex gap-1">
          {[
            { key: "all", label: "Tümü", count: candidates?.length },
            ...CANDIDATE_CATEGORIES.map((c) => ({
              key: c,
              label: `${c} — ${CATEGORY_META[c].desc}`,
              count: candidates?.filter((x) => x.category === c).length,
            })),
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilterCat(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filterCat === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
              data-testid={`filter-cat-${key}`}
            >
              {label} {count !== undefined && <span className="opacity-60 ml-1">({count})</span>}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[56px_2fr_180px_1.5fr_100px_72px_160px] gap-4 px-5 py-3 bg-muted/30 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <div>Kat.</div>
            <div>Aday</div>
            <div>İletişim</div>
            <div>Pozisyon</div>
            <div>Konum</div>
            <div>Exp</div>
            <div className="text-right">Eylemler</div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 px-5 animate-pulse flex items-center gap-4">
                  <div className="h-7 w-7 rounded-full bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 bg-muted rounded" /><div className="h-2 w-20 bg-muted/50 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered?.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              <p>Aday bulunamadı.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered?.map((candidate, idx) => {
                const cat = candidate.category as keyof typeof CATEGORY_META;
                const catMeta = CATEGORY_META[cat] ?? CATEGORY_META.K0;
                const candidateJobs = candidateJobsMap.get(candidate.id) ?? [];
                return (
                  <motion.div
                    key={candidate.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    className="grid grid-cols-1 md:grid-cols-[56px_2fr_180px_1.5fr_100px_72px_160px] gap-4 px-5 py-3 items-start hover:bg-muted/20 transition-colors group"
                    data-testid={`row-candidate-${candidate.id}`}
                  >
                    {/* Category badge */}
                    <div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${catMeta.color}`} data-testid={`badge-category-${candidate.id}`}>
                        {catMeta.label}
                      </span>
                    </div>

                    {/* Name + brand */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#CC0000] to-[#8B0000] flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {(candidate.name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{candidate.name || <span className="italic text-muted-foreground">İsimsiz</span>}</p>
                        {candidate.currentBrand && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Building2 className="h-2.5 w-2.5" />{candidate.currentBrand}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="space-y-0.5 min-w-0 overflow-hidden">
                      {candidate.email && (
                        <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate text-xs">{candidate.email}</span>
                        </div>
                      )}
                      {candidate.phone && (
                        <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                          <Phone className="h-3 w-3 shrink-0" />
                          <span className="truncate text-xs">{candidate.phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Assigned jobs */}
                    <div className="flex flex-wrap gap-1" data-testid={`jobs-candidate-${candidate.id}`}>
                      {candidateJobs.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      ) : (
                        candidateJobs.slice(0, 2).map((j) => (
                          <Link key={j.jobId} href={`/jobs/${j.jobId}`}>
                            <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 hover:bg-blue-100 transition-colors cursor-pointer truncate max-w-[140px]" title={j.jobTitle}>
                              <Briefcase className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{j.jobTitle}</span>
                            </span>
                          </Link>
                        ))
                      )}
                      {candidateJobs.length > 2 && (
                        <span className="text-xs text-muted-foreground">+{candidateJobs.length - 2}</span>
                      )}
                    </div>

                    {/* City */}
                    <div className="text-xs text-muted-foreground flex items-center gap-1 min-w-0 overflow-hidden">
                      {candidate.city ? <><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{candidate.city}</span></> : "—"}
                    </div>

                    {/* Experience */}
                    <div className="text-sm font-medium text-foreground whitespace-nowrap">
                      {candidate.experience ?? 0} yıl
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/candidates/${candidate.id}`}>
                        <Button size="sm" variant="outline" className="h-8 text-xs" data-testid={`btn-view-candidate-${candidate.id}`}>
                          <ExternalLink className="mr-1 h-3 w-3" /> Profil
                        </Button>
                      </Link>
                      <ApplyToJobDialog candidateId={candidate.id} candidateName={candidate.name} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

// ─── Create Candidate Dialog ──────────────────────────────────────────────────

function CreateCandidateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { mutate, isPending } = useCreateCandidate();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "", email: "", phone: "", category: "" as string,
    currentBrand: "", licenseStatus: "unlicensed", licenseNumber: "",
    city: "", district: "", experience: "0",
    referredBy: "", socialMedia: "", resumeText: "",
    office: "",
  });
  const [specialization, setSpecialization] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(["Türkçe"]);
  const f = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = () => {
    if (!form.name.trim()) { toast({ title: "Ad zorunludur", variant: "destructive" }); return; }
    if (!form.category) { toast({ title: "Kategori (K0/K1/K2) zorunludur", variant: "destructive" }); return; }
    if (form.phone && !/^05\d{9}$/.test(form.phone)) {
      toast({ title: "Geçersiz telefon formatı", description: "05xxxxxxxxx formatında giriniz (11 haneli)", variant: "destructive" }); return;
    }

    mutate({
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone || undefined,
      category: form.category,
      currentBrand: form.currentBrand || undefined,
      licenseStatus: form.licenseStatus,
      licenseNumber: form.licenseNumber || undefined,
      city: form.city || undefined,
      district: form.district || undefined,
      office: form.office || undefined,
      specialization,
      languages,
      experience: parseInt(form.experience) || 0,
      referredBy: form.referredBy || undefined,
      socialMedia: form.socialMedia || undefined,
      resumeText: form.resumeText || undefined,
      tags: [],
    } as InsertCandidate, {
      onSuccess: () => {
        onOpenChange(false);
        setForm({ name: "", email: "", phone: "", category: "", currentBrand: "", licenseStatus: "unlicensed", licenseNumber: "", city: "", district: "", experience: "0", referredBy: "", socialMedia: "", resumeText: "", office: "" });
        setSpecialization([]); setLanguages(["Türkçe"]);
        toast({ title: "Aday eklendi" });
      },
      onError: (err: any) => toast({ title: "Hata", description: err?.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 shadow-sm" data-testid="btn-add-candidate">
          <Plus className="mr-1.5 h-4 w-4" /> Aday Ekle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="create-candidate-desc">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Yeni Aday Ekle</DialogTitle>
          <p id="create-candidate-desc" className="text-sm text-muted-foreground">Keller Williams Platin & Karma aday havuzuna ekleyin</p>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* KW Category — REQUIRED */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              KW Kategori <span className="text-red-500">*</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {CANDIDATE_CATEGORIES.map((cat) => {
                const m = CATEGORY_META[cat];
                return (
                  <button
                    key={cat} type="button"
                    onClick={() => f("category", cat)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      form.category === cat ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
                    }`}
                    data-testid={`category-option-${cat}`}
                  >
                    <p className="text-sm font-bold text-foreground">{m.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</p>
                  </button>
                );
              })}
            </div>
            {!form.category && <p className="text-xs text-red-500 mt-1">Bir kategori seçmelisiniz</p>}
          </div>

          {/* Personal */}
          <Section title="Kişisel Bilgiler">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ad Soyad *">
                <Input value={form.name} onChange={(e) => f("name", e.target.value)} placeholder="Ahmet Yılmaz" data-testid="input-candidate-name" />
              </Field>
              <Field label="Telefon">
                <Input value={form.phone} onChange={(e) => f("phone", e.target.value)} placeholder="05xxxxxxxxx" data-testid="input-candidate-phone" />
              </Field>
              <Field label="E-posta">
                <Input type="email" value={form.email} onChange={(e) => f("email", e.target.value)} placeholder="ahmet@example.com" data-testid="input-candidate-email" />
              </Field>
              <Field label="Sosyal Medya / LinkedIn">
                <Input value={form.socialMedia} onChange={(e) => f("socialMedia", e.target.value)} placeholder="https://linkedin.com/in/..." />
              </Field>
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
                <Input type="number" min={0} value={form.experience} onChange={(e) => f("experience", e.target.value)} data-testid="input-candidate-experience" />
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
          <Section title="Konum (Türkiye)">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="KW Ofis">
                  <Select value={form.office} onValueChange={(v) => f("office", v)}>
                    <SelectTrigger><SelectValue placeholder="Ofis seçin..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Akatlar">Akatlar</SelectItem>
                      <SelectItem value="Zekeriyaköy">Zekeriyaköy</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Şehir">
                <Select value={form.city} onValueChange={(v) => f("city", v)}>
                  <SelectTrigger><SelectValue placeholder="Şehir seçin..." /></SelectTrigger>
                  <SelectContent>{TURKEY_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="İlçe">
                <Input value={form.district} onChange={(e) => f("district", e.target.value)} placeholder="Kadıköy, Çankaya..." />
              </Field>
            </div>
          </Section>

          {/* Other */}
          <Section title="Diğer">
            <div className="space-y-3">
              <Field label="Referans (kim tanıttı?)">
                <Input value={form.referredBy} onChange={(e) => f("referredBy", e.target.value)} placeholder="Ad Soyad veya kaynak" />
              </Field>
              <Field label="Notlar / Özet">
                <Textarea value={form.resumeText} onChange={(e) => f("resumeText", e.target.value)} rows={2} placeholder="Ek bilgiler..." data-testid="textarea-candidate-resume" />
              </Field>
            </div>
          </Section>

          <Button onClick={handleSubmit} disabled={isPending} className="w-full" data-testid="btn-submit-candidate">
            {isPending ? "Ekleniyor..." : "Adayı Ekle"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Apply to Job Dialog ──────────────────────────────────────────────────────

const ACTIVE_STATUSES = ["applied", "interview", "offer", "hired", "myk_training", "account_setup", "documents"];

function ApplyToJobDialog({ candidateId, candidateName }: { candidateId: number; candidateName: string }) {
  const [open, setOpen] = useState(false);
  const { data: jobs } = useAllJobs();
  const { data: existingApps } = useApplications(undefined, candidateId);
  const { mutate, isPending } = useCreateApplication();
  const { toast } = useToast();
  const [selectedJob, setSelectedJob] = useState("");

  const activeApp = existingApps?.find((a) => ACTIVE_STATUSES.includes(a.status));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline" size="sm"
          className="h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid={`btn-assign-job-${candidateId}`}
        >
          <Briefcase className="mr-1.5 h-3 w-3" /> İlan
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby="assign-job-desc">
        <DialogHeader>
          <DialogTitle>{candidateName} — İlana Ata</DialogTitle>
          <p id="assign-job-desc" className="text-sm text-muted-foreground">Adayı bir pozisyona ekleyin.</p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {activeApp ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              Bu aday zaten <strong>{activeApp.job?.title ?? "bir pozisyonda"}</strong> aktif süreçte.
              Yeni bir ilana atamadan önce mevcut sürecin sonuçlandırılması gerekir.
            </div>
          ) : (
            <>
              <Select value={selectedJob} onValueChange={setSelectedJob}>
                <SelectTrigger data-testid="select-assign-job"><SelectValue placeholder="Pozisyon seçin..." /></SelectTrigger>
                <SelectContent>
                  {jobs?.filter((j) => j.status === "open").map((job) => (
                    <SelectItem key={job.id} value={job.id.toString()}>{job.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => {
                  if (!selectedJob) return;
                  mutate({ jobId: parseInt(selectedJob), candidateId, status: "applied", notes: "Applied via admin panel" }, {
                    onSuccess: () => setOpen(false),
                    onError: (err: Error) => toast({ title: "Atama yapılamadı", description: err.message, variant: "destructive" }),
                  });
                }}
                disabled={!selectedJob || isPending}
                className="w-full"
                data-testid="btn-confirm-assign"
              >
                {isPending ? "Atanıyor..." : "Onayla"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
