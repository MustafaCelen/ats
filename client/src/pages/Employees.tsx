import { useState, useRef } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useEmployees, useUpdateEmployee, useDeleteEmployee, useImportEmployees } from "@/hooks/use-employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Users, Search, Phone, Mail, MapPin, Award, Building2,
  MoreHorizontal, ExternalLink, CheckCircle2, XCircle, Briefcase, CalendarDays,
  Upload, Download, Pencil, Key, AtSign, AlertCircle, FileText, UserCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CONTRACT_TYPES, URETKENLIK_ORANLAR, type PublicUser } from "@shared/schema";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

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

// Simple CSV parser (handles quoted fields)
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let val = "";
        i++;
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else { val += line[i++]; }
        }
        fields.push(val);
        if (line[i] === ",") i++;
      } else {
        const end = line.indexOf(",", i);
        if (end === -1) { fields.push(line.slice(i)); break; }
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
    return fields;
  };

  // Strip BOM if present
  const rawHeader = lines[0].startsWith("\uFEFF") ? lines[0].slice(1) : lines[0];
  const headers = parseRow(rawHeader);
  return lines.slice(1).map((line) => {
    const vals = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? "").trim(); });
    return obj;
  }).filter((row) => Object.values(row).some((v) => v));
}

// Edit Employee Dialog
function EditEmployeeDialog({ emp, open, onOpenChange }: { emp: any; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { mutate: updateEmployee, isPending } = useUpdateEmployee();
  const { toast } = useToast();
  const { data: hiringManagers = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/hiring-managers"],
    queryFn: () => fetch("/api/hiring-managers").then((r) => r.json()),
  });

  const [kwuid, setKwuid] = useState(emp.kwuid ?? "");
  const [kwMail, setKwMail] = useState(emp.kwMail ?? "");
  const [title, setTitle] = useState(emp.title ?? "");
  const [startDate, setStartDate] = useState(
    emp.startDate ? new Date(emp.startDate).toISOString().split("T")[0] : ""
  );
  const [contractType, setContractType] = useState<string>(emp.contractType ?? "");
  const [uretkenlikKoclugu, setUretkenlikKoclugu] = useState<boolean>(emp.uretkenlikKoclugu ?? false);
  const [uretkenlikManagerId, setUretkenlikManagerId] = useState<string>(
    emp.uretkenlikKocluguManagerId ? String(emp.uretkenlikKocluguManagerId) : ""
  );
  const [uretkenlikOran, setUretkenlikOran] = useState<string>(emp.uretkenlikKocluguOran ?? "");

  const defaultCapMonth = (() => {
    if (emp.capMonth) return emp.capMonth;
    if (emp.startDate) {
      const d = new Date(emp.startDate);
      d.setMonth(d.getMonth() + 1);
      return MONTHS_TR[d.getMonth()];
    }
    return "";
  })();
  const [capMonth, setCapMonth] = useState(defaultCapMonth);
  const [capValue, setCapValue] = useState(emp.capValue ?? "");

  const handleSave = () => {
    updateEmployee(
      {
        id: emp.id,
        kwuid: kwuid || undefined,
        kwMail: kwMail || undefined,
        title: title || undefined,
        startDate: startDate || undefined,
        contractType: contractType || null,
        uretkenlikKoclugu,
        uretkenlikKocluguManagerId: uretkenlikKoclugu && uretkenlikManagerId ? Number(uretkenlikManagerId) : null,
        uretkenlikKocluguOran: uretkenlikKoclugu && uretkenlikOran ? uretkenlikOran : null,
        capMonth: capMonth || undefined,
        capValue: capValue || undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Çalışan bilgileri güncellendi" });
          onOpenChange(false);
        },
        onError: () => toast({ title: "Güncelleme başarısız", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby="edit-emp-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" /> Çalışan Bilgilerini Düzenle
          </DialogTitle>
          <p id="edit-emp-desc" className="text-sm text-muted-foreground">{emp.candidate?.name}</p>
        </DialogHeader>
        <div className="space-y-3 pt-1 max-h-[70vh] overflow-y-auto pr-1">

          {/* KW Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">KWUID</Label>
              <Input value={kwuid} onChange={(e) => setKwuid(e.target.value)} placeholder="KWUID girin" data-testid="input-kwuid" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">KW E-posta</Label>
              <Input value={kwMail} onChange={(e) => setKwMail(e.target.value)} placeholder="isim@kw.com.tr" type="email" data-testid="input-kwmail" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Ünvan</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Danışman" data-testid="input-emp-title" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Başlangıç Tarihi</Label>
              <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" data-testid="input-startdate" />
            </div>
          </div>

          {/* Contract Type */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground mb-1 block flex items-center gap-1">
              <FileText className="h-3 w-3" /> Sözleşme Türü
            </Label>
            <Select value={contractType} onValueChange={setContractType}>
              <SelectTrigger data-testid="select-contract-type">
                <SelectValue placeholder="Seçiniz..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Seçilmedi —</SelectItem>
                {CONTRACT_TYPES.map((ct) => (
                  <SelectItem key={ct} value={ct}>{ct}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cap Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Cap Ayı</Label>
              <Select value={capMonth} onValueChange={setCapMonth}>
                <SelectTrigger data-testid="select-cap-month">
                  <SelectValue placeholder="Ay seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS_TR.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Cap Değeri</Label>
              <Input
                value={capValue}
                onChange={(e) => setCapValue(e.target.value)}
                placeholder="Cap miktarı"
                data-testid="input-cap-value"
              />
            </div>
          </div>

          {/* Üretkenlik Koçluğu */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="uretkenlik-koclugu"
                checked={uretkenlikKoclugu}
                onCheckedChange={(v) => setUretkenlikKoclugu(Boolean(v))}
                data-testid="checkbox-uretkenlik"
              />
              <Label htmlFor="uretkenlik-koclugu" className="text-sm font-medium cursor-pointer">
                Üretkenlik Koçluğu
              </Label>
            </div>

            {uretkenlikKoclugu && (
              <div className="space-y-2 pl-6">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block flex items-center gap-1">
                    <UserCheck className="h-3 w-3" /> Koç (Hiring Manager)
                  </Label>
                  <Select value={uretkenlikManagerId} onValueChange={setUretkenlikManagerId}>
                    <SelectTrigger data-testid="select-uretkenlik-manager">
                      <SelectValue placeholder="Yönetici seçin..." />
                    </SelectTrigger>
                    <SelectContent>
                      {hiringManagers.map((hm) => (
                        <SelectItem key={hm.id} value={String(hm.id)}>{hm.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground mb-1 block">
                    Üretkenlik Koçluğu Paylaşım Oranı
                  </Label>
                  <Select value={uretkenlikOran} onValueChange={setUretkenlikOran}>
                    <SelectTrigger data-testid="select-uretkenlik-oran">
                      <SelectValue placeholder="Oran seçin..." />
                    </SelectTrigger>
                    <SelectContent>
                      {URETKENLIK_ORANLAR.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => onOpenChange(false)}>İptal</Button>
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={isPending} data-testid="btn-save-employee">
              Kaydet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
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
  const [detailEmployee, setDetailEmployee] = useState<any | null>(null);
  const [editEmployee, setEditEmployee] = useState<any | null>(null);
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
    return matchesSearch && matchesStatus;
  });

  const activeCount = (employees ?? []).filter((e: any) => e.status === "active").length;
  const inactiveCount = (employees ?? []).filter((e: any) => e.status === "inactive").length;

  const handleToggleStatus = (emp: any) => {
    const newStatus = emp.status === "active" ? "inactive" : "active";
    updateEmployee({ id: emp.id, status: newStatus }, {
      onSuccess: () => {
        toast({ title: `${emp.candidate?.name} — ${newStatus === "active" ? "Aktif yapıldı" : "Pasif yapıldı"}` });
      },
    });
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
              accept=".csv"
              className="hidden"
              onChange={handleImportFile}
              data-testid="input-import-csv"
            />
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={statusFilter === "all" ? "default" : "outline"} onClick={() => setStatusFilter("all")} data-testid="filter-all">
            Tümü ({(employees ?? []).length})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "active" ? "default" : "outline"}
            onClick={() => setStatusFilter("active")}
            data-testid="filter-active"
            className={statusFilter !== "active" ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : ""}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aktif ({activeCount})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "inactive" ? "default" : "outline"}
            onClick={() => setStatusFilter("inactive")}
            data-testid="filter-inactive"
            className={statusFilter !== "inactive" ? "border-gray-200 text-gray-600 hover:bg-gray-50" : ""}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" /> Pasif ({inactiveCount})
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
            <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <div>Çalışan</div>
              <div>İletişim</div>
              <div>Pozisyon</div>
              <div>Kategori</div>
              <div>KWUID</div>
              <div>Başlangıç</div>
              <div>Durum</div>
              <div />
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {filtered.map((emp: any) => {
                const cand = emp.candidate;
                const job  = emp.job;
                const initials = cand?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() ?? "??";

                return (
                  <div
                    key={emp.id}
                    className="grid grid-cols-[2fr_2fr_1.5fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors group"
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

            {/* Footer count */}
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
              {filtered.length} çalışan gösteriliyor
              {filtered.length !== (employees ?? []).length && ` (toplam ${(employees ?? []).length})`}
            </div>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      {detailEmployee && (
        <Dialog open={!!detailEmployee} onOpenChange={(v) => { if (!v) setDetailEmployee(null); }}>
          <DialogContent className="max-w-md" aria-describedby="emp-detail-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                {detailEmployee.candidate?.name}
              </DialogTitle>
              <p id="emp-detail-desc" className="text-sm text-muted-foreground">{detailEmployee.title ?? detailEmployee.job?.title ?? "Danışman"}</p>
            </DialogHeader>
            <div className="space-y-3 text-sm pt-1">
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
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                        Aktif
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
                {detailEmployee.uretkenlikKoclugu && (
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-primary/10">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Koç</p>
                      <p className="text-sm">
                        {hiringManagers.find((hm) => hm.id === detailEmployee.uretkenlikKocluguManagerId)?.name || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-0.5">Paylaşım Oranı</p>
                      <p className="text-sm font-semibold">{detailEmployee.uretkenlikKocluguOran || "—"}</p>
                    </div>
                  </div>
                )}
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
                  onClick={() => {
                    handleToggleStatus(detailEmployee);
                    setDetailEmployee({ ...detailEmployee, status: detailEmployee.status === "active" ? "inactive" : "active" });
                  }}
                  disabled={updating}
                  data-testid="btn-detail-toggle-status"
                >
                  {detailEmployee.status === "active" ? "Pasife Al" : "Aktifleştir"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit dialog */}
      {editEmployee && (
        <EditEmployeeDialog
          emp={editEmployee}
          open={!!editEmployee}
          onOpenChange={(v) => { if (!v) setEditEmployee(null); }}
        />
      )}
    </Layout>
  );
}
