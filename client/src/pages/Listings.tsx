import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2, Upload, Search, FileCheck2, FileWarning, HelpCircle,
  CheckCircle2, Clock, Send, ExternalLink, ChevronLeft, ChevronRight, Download, Plus,
  RefreshCw, MessageSquare,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Listing {
  id: number;
  listingNumber: string;
  price: string | null;
  publishedDate: string | null;
  removedDate: string | null;
  durationDays: number | null;
  advisorName: string | null;
  employeeId: number | null;
  employeeName?: string;
  employeePhone?: string;
  office: string | null;
  store: string | null;
  status: "active" | "passive";
  agreementUploadedAt: string | null;
  agreementRequestedAt: string | null;
  agreementFileMime?: string | null;
  agreementFileName?: string | null;
  closeReason: string | null;
  closeReasonNote: string | null;
  closeReasonSubmittedAt: string | null;
  publicToken: string;
  notifiedNewAt: string | null;
  notifiedPassiveAt: string | null;
  notifyMsgIdNew: string | null;
  notifyMsgIdPassive: string | null;
}

interface Summary {
  totalActive: number; totalPassive: number; matchedActive: number;
  needsAgreement: number; needsReason: number; soldPassive: number;
}

type FilterTab = "all" | "needsAgreement" | "needsReason" | "passive";

// ── CSV helpers ─────────────────────────────────────────────────────────────────

function deaccent(s: string): string {
  return s
    .replace(/[İıİ]/g, "i").replace(/[Şş]/g, "s").replace(/[Ğğ]/g, "g")
    .replace(/[Üü]/g, "u").replace(/[Öö]/g, "o").replace(/[Çç]/g, "c")
    .toLowerCase();
}

/** Map a CSV header to a normalized listing field key. */
function headerToKey(header: string): string | null {
  const h = deaccent(header.trim().replace(/\s+/g, " "));
  if (h.includes("kaldir") || h.includes("yayindan")) return "removedDate"; // before "yayin..."
  if (h.includes("numara")) return "listingNumber";
  if (h === "fiyat" || h.includes("fiyat")) return "price";
  if (h.includes("yayinlanma")) return "publishedDate";
  if (h === "sure" || h.includes("sure")) return "durationDays";
  if (h.includes("danisman")) return "advisorName";
  if (h === "ofis" || h.includes("ofis")) return "office";
  if (h.includes("magaza")) return "store";
  return null;
}

function parseListingCsv(raw: string): Record<string, any>[] {
  let cleaned = raw.replace(/^﻿/, "");
  // flatten newlines inside quoted fields
  {
    let out = "", inQ = false;
    for (let i = 0; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (c === '"') { inQ = !inQ; out += c; }
      else if (inQ && (c === "\r" || c === "\n")) out += " ";
      else out += c;
    }
    cleaned = out;
  }
  const lines = cleaned.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const res: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) { res.push(cur); cur = ""; }
      else cur += ch;
    }
    res.push(cur);
    return res;
  };

  const keys = parseRow(lines[0]).map(headerToKey);

  return lines.slice(1).map((line) => {
    const vals = parseRow(line);
    const obj: Record<string, any> = {};
    keys.forEach((k, i) => {
      if (!k) return;
      let v = (vals[i] ?? "").trim();
      if (v === "" || v === "null" || v === "#VALUE!" || v === "#REF!") {
        obj[k] = null; return;
      }
      if (k === "durationDays") {
        const n = parseInt(v, 10);
        obj[k] = isNaN(n) ? null : n;
      } else if (k === "price") {
        const n = v.replace(/[^0-9.]/g, "");
        obj[k] = n || null;
      } else {
        obj[k] = v;
      }
    });
    return obj;
  }).filter((r) => r.listingNumber);
}

// ── Small UI bits ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, tone }: {
  icon: React.ElementType; label: string; value: number; tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${tone}`} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold mt-1.5">{value.toLocaleString("tr-TR")}</p>
    </div>
  );
}

function fmtPrice(p: string | null): string {
  if (!p) return "—";
  return Number(p).toLocaleString("tr-TR") + " ₺";
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── WhatsApp notify status cell ───────────────────────────────────────────────

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Kuyrukta",  cls: "bg-yellow-100 text-yellow-700" },
  sent:      { label: "Gönderildi", cls: "bg-blue-100 text-blue-700" },
  delivered: { label: "İletildi",  cls: "bg-emerald-100 text-emerald-700" },
  read:      { label: "Okundu",    cls: "bg-emerald-200 text-emerald-800" },
  played:    { label: "Oynatıldı", cls: "bg-emerald-200 text-emerald-800" },
  failed:    { label: "Başarısız", cls: "bg-red-100 text-red-700" },
};

function NotifyStatusCell({ listing, kind }: { listing: Listing; kind: "new" | "passive" }) {
  const { toast } = useToast();
  const notifiedAt  = kind === "new" ? listing.notifiedNewAt    : listing.notifiedPassiveAt;
  const msgId       = kind === "new" ? listing.notifyMsgIdNew   : listing.notifyMsgIdPassive;
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (!notifiedAt) return <span className="text-[11px] text-muted-foreground">—</span>;

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/listings/${listing.id}/notify-status?kind=${kind}`, { credentials: "include" });
      const data = await res.json();
      setStatus(data.status ?? "unknown");
      if (data.note) toast({ title: data.note });
    } catch {
      toast({ title: "Durum sorgulanamadı", variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const meta = status ? (STATUS_LABEL[status] ?? { label: status, cls: "bg-muted text-muted-foreground" }) : null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {meta ? (
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${meta.cls}`}>{meta.label}</span>
      ) : (
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          {msgId ? "Gönderildi" : "WA Gönderildi"}
        </span>
      )}
      {msgId && (
        <button
          onClick={checkStatus}
          disabled={checking}
          title="Teslimat durumunu sorgula"
          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}

// ── Manual add dialog ─────────────────────────────────────────────────────────

function AddListingDialog({ open, onOpenChange, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [listingNumber, setListingNumber] = useState("");
  const [price, setPrice] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [office, setOffice] = useState("");
  const [status, setStatus] = useState<"active" | "passive">("active");

  const { data: emps = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    queryFn: () => fetch("/api/employees", { credentials: "include" }).then(r => r.json()),
    enabled: open,
  });

  const reset = () => {
    setListingNumber(""); setPrice(""); setPublishedDate("");
    setEmployeeId(""); setOffice(""); setStatus("active");
  };

  const handleSave = async () => {
    if (!listingNumber.trim()) {
      toast({ title: "İlan numarası zorunludur", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          listingNumber: listingNumber.trim(),
          price: price || null,
          publishedDate: publishedDate || null,
          employeeId: employeeId ? Number(employeeId) : null,
          office: office || null,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Hata", description: data.message, variant: "destructive" }); return; }
      toast({ title: "İlan eklendi" });
      reset();
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" /> Manuel İlan Ekle
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">İlan Numarası *</Label>
            <Input value={listingNumber} onChange={e => setListingNumber(e.target.value)} placeholder="örn. 1234567" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Danışman</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Danışman seçin…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Seçilmedi —</SelectItem>
                {emps.filter((e: any) => e.status === "active").map((e: any) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.candidate?.name ?? `#${e.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Fiyat (₺)</Label>
              <Input value={price} onChange={e => setPrice(e.target.value)} placeholder="5000000" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Yayın Tarihi</Label>
              <Input type="date" value={publishedDate} onChange={e => setPublishedDate(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Ofis</Label>
              <Select value={office} onValueChange={setOffice}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seçin…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seçilmedi —</SelectItem>
                  <SelectItem value="Akatlar">Akatlar</SelectItem>
                  <SelectItem value="Zekeriyaköy">Zekeriyaköy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Durum</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="passive">Pasif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => { reset(); onOpenChange(false); }}>İptal</Button>
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Listings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<FilterTab>("needsAgreement");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [notify, setNotify] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [viewer, setViewer] = useState<Listing | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data: summary } = useQuery<Summary>({
    queryKey: ["/api/listings/summary"],
    queryFn: () => fetch("/api/listings/summary", { credentials: "include" }).then((r) => r.json()),
  });

  const listQuery = (() => {
    const params = new URLSearchParams();
    if (tab === "needsAgreement") { params.set("needsAgreement", "1"); params.set("onlyMatched", "1"); }
    else if (tab === "needsReason") { params.set("needsReason", "1"); params.set("onlyMatched", "1"); }
    else if (tab === "passive") params.set("status", "passive");
    else params.set("onlyMatched", "1");
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  })();

  const { data: rows = [], isLoading } = useQuery<Listing[]>({
    queryKey: ["/api/listings", listQuery],
    queryFn: () => fetch(`/api/listings?${listQuery}`, { credentials: "include" }).then((r) => r.json()),
  });

  // Client-side date filter on publishedDate
  const filteredRows = rows.filter((l) => {
    if (!dateFrom && !dateTo) return true;
    if (!l.publishedDate) return false;
    const d = new Date(l.publishedDate);
    if (isNaN(d.getTime())) return false;
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  // Reset to first page whenever the filter/search/date changes
  useEffect(() => { setPage(0); }, [tab, search, dateFrom, dateTo]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/listings/summary"] });
  };

  const handleImport = (type: "active" | "passive") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const parsed = parseListingCsv(await file.text());
      if (parsed.length === 0) {
        toast({ title: "Hata", description: "CSV boş veya sütunlar tanınamadı.", variant: "destructive" });
        return;
      }
      const res = await fetch("/api/listings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, rows: parsed, notify }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Hata", description: data.message, variant: "destructive" }); return; }
      refresh();
      const notifyCount = type === "active" ? data.newActive : data.newlyPassive;
      toast({
        title: "İçe aktarıldı",
        description: `${data.created} yeni, ${data.updated} güncellendi.` +
          (notify ? ` ${notifyCount} danışmana bildirim gönderildi.` : ` ${notifyCount} bildirim adayı (bildirim kapalı).`),
      });
    } catch {
      toast({ title: "Hata", description: "Dosya işlenemedi.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const [sendingIds, setSendingIds] = useState<Set<number>>(new Set());

  const sendNotify = async (id: number) => {
    if (sendingIds.has(id)) return;
    setSendingIds(prev => new Set(prev).add(id));
    try {
      await apiRequest("POST", `/api/listings/${id}/notify`, {});
      toast({ title: "Bildirim gönderildi" });
      refresh();
    } catch (err: any) {
      toast({ title: "Gönderilemedi", description: err?.message, variant: "destructive" });
    } finally {
      setSendingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };


  const bulkNotifyCount = filteredRows.filter((l) => !!l.employeeId).length;

  const handleBulkNotify = async () => {
    if (!bulkNotifyCount || bulkSending) return;
    const ids = filteredRows.filter((l) => !!l.employeeId).map((l) => l.id);
    setBulkSending(true);
    try {
      const res = await fetch("/api/listings/notify-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: "Hata", description: data.message, variant: "destructive" }); return; }
      toast({ title: "Bildirim kuyruğa alındı", description: `${data.queued} ilana sırayla gönderilecek (45–60 sn aralıkla).` });
    } catch {
      toast({ title: "Hata", description: "İstek gönderilemedi.", variant: "destructive" });
    } finally {
      setBulkSending(false);
    }
  };

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: "needsAgreement", label: "Yetki Sözleşmesi Bekleyen", count: summary?.needsAgreement },
    { key: "needsReason", label: "Kalkış Sebebi Bekleyen", count: summary?.needsReason },
    { key: "passive", label: "Pasif İlanlar", count: summary?.totalPassive },
    { key: "all", label: "Tüm Eşleşen İlanlar", count: summary?.matchedActive },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              Portal İlanları
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              KW Platin &amp; Karma ilan raporlarını içe aktarın, yetki sözleşmesi ve kalkış sebeplerini takip edin
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Manuel Ekle
            </Button>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mr-1 select-none cursor-pointer">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-primary" />
              Danışmanlara WhatsApp gönder
            </label>
            <label className="cursor-pointer">
              <input type="file" accept=".csv" className="hidden" disabled={importing} onChange={handleImport("active")} />
              <span className="inline-flex items-center gap-1.5 text-xs h-8 px-3 rounded-md border border-input bg-background hover:bg-muted transition-colors font-medium">
                <Upload className="h-3.5 w-3.5" /> Aktif İlanlar
              </span>
            </label>
            <label className="cursor-pointer">
              <input type="file" accept=".csv" className="hidden" disabled={importing} onChange={handleImport("passive")} />
              <span className="inline-flex items-center gap-1.5 text-xs h-8 px-3 rounded-md border border-input bg-background hover:bg-muted transition-colors font-medium">
                <Upload className="h-3.5 w-3.5" /> Pasif İlanlar
              </span>
            </label>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={FileWarning} label="Yetki Sözleşmesi Bekleyen" value={summary?.needsAgreement ?? 0} tone="text-amber-500" />
          <StatCard icon={HelpCircle} label="Kalkış Sebebi Bekleyen" value={summary?.needsReason ?? 0} tone="text-violet-500" />
          <StatCard icon={CheckCircle2} label="Satılan / Kiralanan" value={summary?.soldPassive ?? 0} tone="text-emerald-500" />
          <StatCard icon={FileCheck2} label="Eşleşen Aktif İlan" value={summary?.matchedActive ?? 0} tone="text-primary" />
        </div>

        {/* Tabs + search */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İlan no / danışman ara..."
              className="h-8 pl-8 w-56 text-xs"
            />
          </div>
        </div>

        {/* Date filter + bulk notify */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Yayın tarihi:</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-36 text-xs"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-36 text-xs"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Temizle
            </button>
          )}
          <div className="ml-auto">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={bulkSending || bulkNotifyCount === 0}
              onClick={handleBulkNotify}
            >
              {bulkSending
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <MessageSquare className="h-3.5 w-3.5" />}
              Toplu WA Gönder ({bulkNotifyCount})
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">İlan No</th>
                  <th className="px-3 py-2.5 font-medium">Danışman</th>
                  <th className="px-3 py-2.5 font-medium">Telefon</th>
                  <th className="px-3 py-2.5 font-medium">Fiyat</th>
                  <th className="px-3 py-2.5 font-medium">Yayın</th>
                  <th className="px-3 py-2.5 font-medium">Durum</th>
                  <th className="px-3 py-2.5 font-medium">Yetki Sözleşmesi</th>
                  <th className="px-3 py-2.5 font-medium">Kalkış Sebebi</th>
                  <th className="px-3 py-2.5 font-medium">WA Bildirim</th>
                  <th className="px-3 py-2.5 font-medium text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">Yükleniyor…</td></tr>
                ) : filteredRows.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">Kayıt yok.</td></tr>
                ) : pageRows.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-mono text-xs">{l.listingNumber}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{l.employeeName ?? l.advisorName ?? "—"}</div>
                      {l.office && <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">{l.office}</div>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {l.employeePhone ? (
                        <a href={`tel:${l.employeePhone}`} className="text-primary hover:underline">{l.employeePhone}</a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtPrice(l.price)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{l.publishedDate ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      {l.status === "active" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Aktif</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Pasif</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.agreementUploadedAt ? (
                        <button
                          onClick={() => setViewer(l)}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        >
                          <FileCheck2 className="h-3 w-3" /> Görüntüle
                        </button>
                      ) : l.agreementRequestedAt ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          <Clock className="h-3 w-3" /> İstendi
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.closeReasonSubmittedAt ? (
                        <div>
                          <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${
                            l.closeReason === "Satıldı" || l.closeReason === "Kiralandı"
                              ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                          }`}>{l.closeReason}</span>
                          {l.closeReasonNote && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[180px] truncate">{l.closeReasonNote}</div>}
                        </div>
                      ) : l.status === "passive" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                          <Clock className="h-3 w-3" /> Bekliyor
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <NotifyStatusCell listing={l} kind={l.status === "active" ? "new" : "passive"} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/l/${l.publicToken}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Danışman bağlantısını aç"
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        {l.employeeId && (
                          <button
                            onClick={() => sendNotify(l.id)}
                            disabled={sendingIds.has(l.id)}
                            title="WhatsApp bildirimi gönder"
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-40"
                          >
                            {sendingIds.has(l.id)
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <Send className="h-3.5 w-3.5" />
                            }
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pager */}
          {filteredRows.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-3 py-2.5 border-t border-border text-xs text-muted-foreground">
              <span>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredRows.length)} / {filteredRows.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2">{page + 1} / {pageCount}</span>
                <button
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddListingDialog open={addOpen} onOpenChange={setAddOpen} onSaved={refresh} />

      {/* Agreement viewer */}
      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileCheck2 className="h-4 w-4 text-emerald-600" />
              Yetki Sözleşmesi — {viewer?.listingNumber}
            </DialogTitle>
          </DialogHeader>
          {viewer && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
                {(viewer.agreementFileMime ?? "").startsWith("image/") ? (
                  <img
                    src={`/api/listings/${viewer.id}/agreement`}
                    alt="Yetki Sözleşmesi"
                    className="max-h-[70vh] w-full object-contain bg-black/5"
                  />
                ) : (
                  <iframe
                    src={`/api/listings/${viewer.id}/agreement`}
                    title="Yetki Sözleşmesi"
                    className="w-full h-[70vh]"
                  />
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate max-w-[60%]">
                  {viewer.agreementFileName ?? "yetki-sozlesmesi"}
                </span>
                <a
                  href={`/api/listings/${viewer.id}/agreement`}
                  download={viewer.agreementFileName ?? "yetki-sozlesmesi"}
                  className="inline-flex items-center gap-1.5 text-xs h-8 px-3 rounded-md border border-input bg-background hover:bg-muted font-medium"
                >
                  <Download className="h-3.5 w-3.5" /> İndir
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
