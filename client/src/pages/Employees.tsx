import { useState, useRef } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useEmployees, useUpdateEmployee, useDeleteEmployee, useImportEmployees } from "@/hooks/use-employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Users, Search, Phone, Mail, MapPin, Award, Building2,
  MoreHorizontal, ExternalLink, CheckCircle2, XCircle, Briefcase, CalendarDays,
  Upload, Download, Pencil, Key, AtSign, AlertCircle, FileText, UserCheck, HandCoins,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { type PublicUser } from "@shared/schema";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { EmployeeEditDialog } from "@/components/EmployeeEditDialog";


function StatusPill({ status }: { status: string }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Aktif
      </span>
    );
  }
return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 ring-1 ring-gray-200">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      Pasif
    </span>
  );
}

function CategoryBadge({ category }: { category?: string }) {
  const colors: Record<string, string> = {
    K0: "bg-blue-50 text-blue-700 ring-blue-200",
    K1: "bg-amber-50 text-amber-700 ring-amber-200",
    K2: "bg-purple-50 text-purple-700 ring-purple-200",
  };
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ring-1 ${colors[category ?? "K0"] ?? colors.K0}`}>
      {category ?? "K0"}
    </span>
  );
}

// CSV parser \u2014 single-pass stateful, correctly handles quoted fields with embedded newlines
function parseCsv(text: string): Record<string, string>[] {
  // Normalize line endings and strip BOM
  const input = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");

  // Detect delimiter from the first unquoted line (the header)
  let headerEnd = input.length;
  let inQ = false;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '"') inQ = !inQ;
    if (input[i] === "\n" && !inQ) { headerEnd = i; break; }
  }
  const headerLine = input.slice(0, headerEnd);
  const tabCount = (headerLine.match(/\t/g) ?? []).length;
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const delim = tabCount > 0 && tabCount >= commaCount ? "\t" : ",";

  // Single-pass parse
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  inQ = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQ) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQ = false;                                  // end of quoted field
      } else if (ch === "\n") {
        field += " "; // flatten embedded newlines to a space
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQ = true;
      } else if (ch === delim) {
        row.push(field.trim());
        field = "";
      } else if (ch === "\n") {
        row.push(field.trim());
        field = "";
        if (row.some((f) => f)) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }
  // Flush last field/row
  row.push(field.trim());
  if (row.some((f) => f)) rows.push(row);

  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map((vals) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h.trim()] = vals[idx] ?? ""; });
    return obj;
  }).filter((row) => Object.values(row).some((v) => v));
}


export default function Employees() {
  const { data: employees, isLoading } = useEmployees();
  const { mutate: updateEmployee, isPending: updating } = useUpdateEmployee();
  const { mutate: deleteEmployee } = useDeleteEmployee();
  const { mutate: importEmployees, isPending: importing } = useImportEmployees();
  const { data: hiringManagers = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/hiring-managers"],
    queryFn: () => fetch("/api/hiring-managers").then((r) => r.json()),
  });
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [officeFilter, setOfficeFilter] = useState<"all" | "Akatlar" | "Zekeriyaköy">("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [detailEmployee, setDetailEmployee] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState<"profil" | "islemler">("profil");
  const [editEmployee, setEditEmployee] = useState<any | null>(null);
  const [pendingPassiveEmp, setPendingPassiveEmp] = useState<any | null>(null);
  const [passiveDateInput, setPassiveDateInput] = useState("");

  const { data: employeeClosings = [], isFetching: closingsFetching } = useQuery<any[]>({
    queryKey: ["/api/employees", detailEmployee?.id, "closings"],
    queryFn: () => fetch(`/api/employees/${detailEmployee!.id}/closings`).then((r) => r.json()),
    enabled: !!detailEmployee && detailTab === "islemler",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = (employees ?? []).filter((e: any) => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      e.candidate?.name?.toLowerCase().includes(q) ||
      e.candidate?.email?.toLowerCase().includes(q) ||
      e.candidate?.city?.toLowerCase().includes(q) ||
      e.job?.title?.toLowerCase().includes(q) ||
      e.kwuid?.toLowerCase().includes(q) ||
      e.kwMail?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    const matchesOffice = officeFilter === "all" || (e as any).candidate?.office === officeFilter;
    return matchesSearch && matchesStatus && matchesOffice;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const activeCount = (employees ?? []).filter((e: any) => e.status === "active").length;
  const inactiveCount = (employees ?? []).filter((e: any) => e.status === "inactive").length;

  const handleToggleStatus = (emp: any) => {
    if (emp.status === "active") {
      setPassiveDateInput(new Date().toISOString().slice(0, 10));
      setPendingPassiveEmp(emp);
    } else {
      updateEmployee({ id: emp.id, status: "active", passiveAt: null }, {
        onSuccess: () => toast({ title: `${emp.candidate?.name} — Aktif yapıldı` }),
      });
    }
  };

  const confirmPassive = () => {
    if (!pendingPassiveEmp) return;
    updateEmployee(
      { id: pendingPassiveEmp.id, status: "inactive", passiveAt: passiveDateInput || undefined },
      {
        onSuccess: () => {
          toast({ title: `${pendingPassiveEmp.candidate?.name} — Pasif yapıldı` });
          if (detailEmployee?.id === pendingPassiveEmp.id) {
            setDetailEmployee((prev: any) => prev ? { ...prev, status: "inactive" } : null);
          }
          setPendingPassiveEmp(null);
        },
      }
    );
  };

  const handleDelete = (emp: any) => {
    if (!confirm(`${emp.candidate?.name} çalışan listesinden çıkarılsın mı?`)) return;
    deleteEmployee(emp.id, {
      onSuccess: () => toast({ title: "Çalışan listeden kaldırıldı" }),
    });
  };

  const handleExport = () => {
    window.open("/api/employees/export", "_blank");
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast({ title: "CSV dosyası boş veya geçersiz format", variant: "destructive" });
        return;
      }
      importEmployees(rows, {
        onSuccess: (data: any) => {
          toast({
            title: `İçe aktarma tamamlandı`,
            description: `${data.created} yeni, ${data.updated} güncellendi${data.errors?.length ? `, ${data.errors.length} hata` : ""}`,
          });
          if (data.errors?.length) {
            console.warn("Import errors:", data.errors);
          }
        },
        onError: () => toast({ title: "İçe aktarma başarısız", variant: "destructive" }),
      });
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Çalışanlar</h1>
            <p className="text-sm text-muted-foreground mt-0.5">İşe alım sürecini tamamlamış aktif danışmanlar</p>
          </div>

          {/* Action buttons row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={handleExport} data-testid="btn-export-employees" className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Dışa Aktar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              data-testid="btn-import-employees"
              className="gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              {importing ? "Aktarılıyor..." : "İçe Aktar"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={handleImportFile}
              data-testid="input-import-csv"
            />
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => { setStatusFilter("all"); setPage(0); }} data-testid="filter-all">
            Tümü ({(employees ?? []).length})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "active" ? "default" : "outline"}
            onClick={() => { setStatusFilter("active"); setPage(0); }}
            data-testid="filter-active"
            className={statusFilter !== "active" ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : ""}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aktif ({activeCount})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "inactive" ? "default" : "outline"}
            onClick={() => { setStatusFilter("inactive"); setPage(0); }}
            data-testid="filter-inactive"
            className={statusFilter !== "inactive" ? "border-gray-200 text-gray-600 hover:bg-gray-50" : ""}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" /> Pasif ({inactiveCount})
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          {(["all", "Akatlar", "Zekeriyaköy"] as const).map((o) => (
            <Button
              key={o}
              size="sm"
              variant={officeFilter === o ? "default" : "outline"}
              onClick={() => { setOfficeFilter(o); setPage(0); }}
            >
              {o === "all" ? "Tüm Ofisler" : o}
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="İsim, e-posta, şehir, KWUID veya KW e-posta ara..."
            className="pl-9"
            data-testid="input-search-employees"
          />
        </div>

        {/* Import hint */}
        <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            CSV içe aktarma için sütunlar: <strong>Ad Soyad, E-posta, Telefon, Şehir, Kategori, KWUID, KW E-posta, Ünvan, Başlangıç Tarihi, Durum</strong>.
            Mevcut çalışan e-postasıyla eşleşen satırlar güncellenir, yeniler oluşturulur.
          </span>
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="divide-y divide-border">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                  <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-36 bg-muted rounded" />
                    <div className="h-3 w-48 bg-muted/60 rounded" />
                  </div>
                  <div className="h-3 w-24 bg-muted/40 rounded" />
                  <div className="h-3 w-20 bg-muted/40 rounded" />
                  <div className="h-3 w-16 bg-muted/40 rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty */}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              {search || statusFilter !== "all" ? "Sonuç bulunamadı" : "Henüz aktif çalışan yok"}
            </p>
            <p className="text-xs text-muted-foreground">
              {search || statusFilter !== "all"
                ? "Farklı bir arama veya filtre deneyin."
                : "İş sürecini tamamlayan adaylar burada görünecek."}
            </p>
          </div>
        )}

        {/* List table */}
        {!isLoading && filtered.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <div>Çalışan</div>
              <div>İletişim</div>
              <div>Üretim Bandı</div>
              <div>Kategori</div>
              <div>Ofis</div>
              <div>KWUID</div>
              <div>Başlangıç</div>
              <div>Durum</div>
              <div />
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {paginated.map((emp: any) => {
                const cand = emp.candidate;
                const job  = emp.job;
                const initials = cand?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() ?? "??";

                return (
                  <div
                    key={emp.id}
                    className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors group"
                    data-testid={`row-employee-${emp.id}`}
                  >
                    {/* Name + avatar */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground leading-tight truncate">{cand?.name ?? "—"}</p>
                        {cand?.city && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{cand.city}{cand.district ? `, ${cand.district}` : ""}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Contact */}
                    <div className="min-w-0 space-y-0.5">
                      {cand?.email && (
                        <a href={`mailto:${cand.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{cand.email}</span>
                        </a>
                      )}
                      {cand?.phone && (
                        <a href={`tel:${cand.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <Phone className="h-3 w-3 shrink-0" />
                          <span>{cand.phone}</span>
                        </a>
                      )}
                      {emp.kwMail && (
                        <p className="flex items-center gap-1.5 text-xs text-primary/80 truncate">
                          <AtSign className="h-3 w-3 shrink-0" />
                          <span className="truncate">{emp.kwMail}</span>
                        </p>
                      )}
                    </div>

                    {/* Position */}
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{emp.title ?? job?.title ?? "Danışman"}</p>
                      {job?.company && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{job.company}</span>
                        </p>
                      )}
                    </div>

                    {/* Category */}
                    <div className="flex items-center gap-1.5">
                      <CategoryBadge category={cand?.category} />
                      {cand?.licenseStatus === "licensed" && (
                        <span title="Lisanslı">
                          <Award className="h-3.5 w-3.5 text-teal-600" />
                        </span>
                      )}
                    </div>

                    {/* Office */}
                    <div>
                      {cand?.office ? (
                        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${
                          cand.office === "Akatlar"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-violet-50 text-violet-700 border-violet-200"
                        }`}>
                          {cand.office}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </div>

                    {/* KWUID */}
                    <div className="min-w-0">
                      {emp.kwuid ? (
                        <span className="inline-flex items-center gap-1 text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">
                          <Key className="h-3 w-3 text-muted-foreground" />
                          {emp.kwuid}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </div>

                    {/* Start date */}
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      {emp.startDate ? (
                        <>
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                          {format(new Date(emp.startDate), "dd MMM yyyy")}
                        </>
                      ) : "—"}
                    </div>

                    {/* Status */}
                    <div>
                      <StatusPill status={emp.status} />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors opacity-0 group-hover:opacity-100"
                            data-testid={`menu-employee-${emp.id}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => setDetailEmployee(emp)} data-testid={`view-employee-${emp.id}`}>
                            <ExternalLink className="h-3.5 w-3.5 mr-2" /> Detaylar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditEmployee(emp)} data-testid={`edit-employee-${emp.id}`}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Düzenle
                          </DropdownMenuItem>
                          {cand?.id && (
                            <DropdownMenuItem asChild>
                              <Link href={`/candidates/${cand.id}`}>
                                <ExternalLink className="h-3.5 w-3.5 mr-2" /> Aday Profili
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleToggleStatus(emp)} disabled={updating} data-testid={`toggle-status-${emp.id}`}>
                            {emp.status === "active"
                              ? <><XCircle className="h-3.5 w-3.5 mr-2 text-gray-500" /> Pasife Al</>
                              : <><CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-500" /> Aktifleştir</>}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(emp)} data-testid={`delete-employee-${emp.id}`}>
                            Listeden Kaldır
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer / pagination */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              <span>
                {filtered.length} çalışandan {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} gösteriliyor
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => p - 1)}
                    disabled={page === 0}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="font-medium">{page + 1} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= totalPages - 1}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      {detailEmployee && (
        <Dialog open={!!detailEmployee} onOpenChange={(v) => { if (!v) { setDetailEmployee(null); setDetailTab("profil"); } }}>
          <DialogContent className="max-w-2xl" aria-describedby="emp-detail-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                {detailEmployee.candidate?.name}
              </DialogTitle>
              <p id="emp-detail-desc" className="text-sm text-muted-foreground">{detailEmployee.title ?? detailEmployee.job?.title ?? "Danışman"}</p>
            </DialogHeader>

            {/* Tab bar */}
            <div className="flex border-b border-border -mx-6 px-6 gap-4">
              <button
                onClick={() => setDetailTab("profil")}
                className={`pb-2 text-sm font-medium transition-colors border-b-2 -mb-px ${detailTab === "profil" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                Profil
              </button>
              <button
                onClick={() => setDetailTab("islemler")}
                className={`pb-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${detailTab === "islemler" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <HandCoins className="h-3.5 w-3.5" /> İşlemler
              </button>
            </div>

            {detailTab === "profil" && (
            <div className="space-y-3 text-sm pt-1 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">Kategori</p>
                  <CategoryBadge category={detailEmployee.candidate?.category} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">Durum</p>
                  <StatusPill status={detailEmployee.status} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">Başlangıç Tarihi</p>
                  <p>{detailEmployee.startDate ? format(new Date(detailEmployee.startDate), "dd MMM yyyy") : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">Deneyim</p>
                  <p>{detailEmployee.candidate?.experience ?? 0} yıl</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">Lisans No</p>
                  <p>{detailEmployee.candidate?.licenseNumber ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">Şehir</p>
                  <p>{detailEmployee.candidate?.city ?? "—"}</p>
                </div>
              </div>

              {/* KW-specific fields */}
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-2">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">KW Bilgileri</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
                      <Key className="h-3 w-3" /> KWUID
                    </p>
                    <p className="font-mono text-sm">{detailEmployee.kwuid || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
                      <AtSign className="h-3 w-3" /> KW E-posta
                    </p>
                    {detailEmployee.kwMail ? (
                      <a href={`mailto:${detailEmployee.kwMail}`} className="text-primary hover:underline text-sm truncate block">
                        {detailEmployee.kwMail}
                      </a>
                    ) : <p>—</p>}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Sözleşme Türü
                    </p>
                    <p className="text-sm font-semibold">{detailEmployee.contractType || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5 flex items-center gap-1">
                      <UserCheck className="h-3 w-3" /> Üretkenlik Koçluğu
                    </p>
                    {detailEmployee.uretkenlikKoclugu ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">ÜK</span>
                    ) : detailEmployee.uretkenlikKocluguManagerId ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-200">DÜA</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
                {(detailEmployee.uretkenlikKoclugu || detailEmployee.uretkenlikKocluguManagerId) && (
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-primary/10">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Koç</p>
                      <p className="text-sm">
                        {hiringManagers.find((hm) => hm.id === detailEmployee.uretkenlikKocluguManagerId)?.name || "—"}
                      </p>
                    </div>
                    {detailEmployee.uretkenlikKoclugu && (
                      <div>
                        <p className="text-xs text-muted-foreground font-medium mb-0.5">Paylaşım Oranı</p>
                        <p className="text-sm font-semibold">{detailEmployee.uretkenlikKocluguOran || "—"}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Billing info — always shown as its own section */}
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-200 bg-blue-50">
                  <FileText className="h-3.5 w-3.5 text-blue-600" />
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Fatura &amp; Vergi Bilgileri</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm p-3">
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">Şirket / Şahıs İsmi</p>
                    <p className="font-semibold">{detailEmployee.billingName || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">Fatura Adresi</p>
                    <p>{detailEmployee.billingAddress || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">İlçe</p>
                    <p>{detailEmployee.billingDistrict || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">İl</p>
                    <p>{detailEmployee.billingCity || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">Ülke</p>
                    <p>{detailEmployee.billingCountry || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">Vergi Dairesi</p>
                    <p>{detailEmployee.taxOffice || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">Vergi / TCK No</p>
                    <p className="font-mono">{detailEmployee.taxId || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-0.5">Doğum Tarihi</p>
                    <p>{detailEmployee.birthDate || "—"}</p>
                  </div>
                </div>
              </div>

              {detailEmployee.candidate?.specialization?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Uzmanlık</p>
                  <div className="flex flex-wrap gap-1">
                    {detailEmployee.candidate.specialization.map((s: string) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {detailEmployee.candidate?.languages?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-1">Diller</p>
                  <div className="flex flex-wrap gap-1">
                    {detailEmployee.candidate.languages.map((l: string) => (
                      <Badge key={l} variant="outline" className="text-xs">{l}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {detailEmployee.notes && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-0.5">Notlar</p>
                  <p className="text-sm text-foreground bg-muted/40 rounded-lg p-2">{detailEmployee.notes}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {detailEmployee.candidate?.id && (
                  <Button variant="outline" size="sm" asChild className="flex-1">
                    <Link href={`/candidates/${detailEmployee.candidate.id}`}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Aday Profili
                    </Link>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setDetailEmployee(null); setEditEmployee(detailEmployee); }}
                  data-testid="btn-detail-edit"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Düzenle
                </Button>
                <Button
                  size="sm"
                  variant={detailEmployee.status === "active" ? "outline" : "default"}
                  className="flex-1"
                  onClick={() => handleToggleStatus(detailEmployee)}
                  disabled={updating}
                  data-testid="btn-detail-toggle-status"
                >
                  {detailEmployee.status === "active" ? "Pasife Al" : "Aktifleştir"}
                </Button>
              </div>
            </div>
            )}

            {detailTab === "islemler" && (
              <div className="pt-2 max-h-[70vh] overflow-y-auto">
                {closingsFetching ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Yükleniyor…</p>
                ) : employeeClosings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <HandCoins className="h-8 w-8 opacity-30" />
                    <p className="text-sm">Henüz işlem kaydı yok.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-xs text-muted-foreground font-medium">
                          <th className="text-left px-3 py-2">Mülk</th>
                          <th className="text-left px-3 py-2">Tür</th>
                          <th className="text-right px-3 py-2">Satış Bedeli</th>
                          <th className="text-right px-3 py-2">Net Kazanç</th>
                          <th className="text-left px-3 py-2">Taraf</th>
                          <th className="text-left px-3 py-2">Tarih</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {employeeClosings.map((c: any) => (
                          <tr key={`${c.closingId}-${c.sideType}`} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 max-w-[140px] truncate" title={c.propertyAddress}>{c.propertyAddress || "—"}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="text-xs">{c.dealCategory} · {c.dealType}</span>
                            </td>
                            <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                              {parseFloat(c.saleValue).toLocaleString("tr-TR")} ₺
                            </td>
                            <td className="px-3 py-2 text-right font-mono whitespace-nowrap font-semibold text-emerald-700">
                              {parseFloat(c.employeeNet).toLocaleString("tr-TR")} ₺
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${c.sideType === "buyer" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                                {c.sideType === "buyer" ? "Alıcı" : "Satıcı"}
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                              {c.closingDate ? format(new Date(c.closingDate), "dd MMM yyyy") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/40 font-semibold text-xs">
                          <td colSpan={3} className="px-3 py-2 text-muted-foreground">{employeeClosings.length} işlem</td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-700">
                            {employeeClosings.reduce((s: number, c: any) => s + parseFloat(c.employeeNet || "0"), 0).toLocaleString("tr-TR")} ₺
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Edit dialog */}
      {editEmployee && (
        <EmployeeEditDialog
          emp={editEmployee}
          open={!!editEmployee}
          onOpenChange={(v) => { if (!v) setEditEmployee(null); }}
        />
      )}

      {/* Pasife Al — tarih seçimi */}
      <Dialog open={!!pendingPassiveEmp} onOpenChange={(v) => { if (!v) setPendingPassiveEmp(null); }}>
        <DialogContent className="max-w-sm" aria-describedby="passive-date-desc">
          <DialogHeader>
            <DialogTitle>Pasife Al — {pendingPassiveEmp?.candidate?.name}</DialogTitle>
            <p id="passive-date-desc" className="text-sm text-muted-foreground">Çalışanın pasife alınma tarihini seçin.</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Pasife Alınma Tarihi</label>
              <input
                type="date"
                value={passiveDateInput}
                onChange={(e) => setPassiveDateInput(e.target.value)}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPendingPassiveEmp(null)}>
                İptal
              </Button>
              <Button className="flex-1" onClick={confirmPassive} disabled={updating || !passiveDateInput}>
                {updating ? "Kaydediliyor…" : "Pasife Al"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
