import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
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
  RefreshCw, MessageSquare, Link2, Bell, BellOff, Mail, Trash2, ArrowUp, ArrowDown, ArrowUpDown, X,
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
  noAgreementAt: string | null;
  passiveAt: string | null;
}

interface Summary {
  totalActive: number; totalPassive: number; matchedActive: number;
  needsAgreement: number; needsReason: number; soldPassive: number; noAgreement: number;
}

type MainTab = "listings" | "unmatched" | "notifications";
type ListFilter = "needsAgreement" | "hasAgreement" | "needsReason" | "hasReason" | "missingPhone" | "missingEmail" | "all";

interface NotifyStatusRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  totalPending: number;
  activePending: number;
  passivePending: number;
  lastNotifiedAt: string | null;
  notifyMsgId: string | null;
  lastEmailNotifiedAt: string | null;
}

// ── Sortable table header ───────────────────────────────────────────────────────

function SortableTh<K extends string>({
  label, sortKey, activeKey, dir, onClick, align,
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  dir: "asc" | "desc";
  onClick: (k: K) => void;
  align?: "left" | "center" | "right";
}) {
  const isActive = sortKey === activeKey;
  const alignCls = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
  return (
    <th className={`px-3 py-2.5 font-medium ${alignCls}`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${isActive ? "text-foreground" : ""}`}
      >
        {label}
        {isActive
          ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

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

// ── Unmatched advisor assignment row (isolated search state) ─────────────────
const UnmatchedAssignRow = memo(function UnmatchedAssignRow({
  advisorName, count, suggestions, selectedId, isAssigning, activeEmployees, onSelect, onAssign,
}: {
  advisorName: string;
  count: number;
  suggestions: { id: number; name: string; reason: string }[];
  selectedId: number | undefined;
  isAssigning: boolean;
  activeEmployees: any[];
  onSelect: (advisorName: string, empId: number) => void;
  onAssign: (advisorName: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => search.trim()
      ? activeEmployees.filter((e: any) => (e.candidate?.name ?? "").toLowerCase().includes(search.toLowerCase()))
      : [],
    [search, activeEmployees],
  );
  const hasSuggestion = suggestions.length > 0;
  return (
    <tr className={`border-b border-amber-50 last:border-0 ${hasSuggestion ? "bg-yellow-50" : ""}`}>
      <td className="px-3 py-2 text-xs">
        <div className="font-medium">{advisorName}</div>
        {hasSuggestion && (
          <div className="flex flex-wrap gap-1 mt-1">
            {suggestions.map((s) => (
              <button key={s.id} onClick={() => onSelect(advisorName, s.id)} title={s.reason}
                className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-200 text-yellow-800 hover:bg-yellow-300">
                💡 {s.name}
              </button>
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 min-w-[24px]">{count}</span>
      </td>
      <td className="px-3 py-2">
        <div className="relative w-52">
          <input
            type="text"
            placeholder={selectedId ? (activeEmployees.find((e: any) => e.id === selectedId)?.candidate?.name ?? "Seçildi") : "Ara veya seç…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full h-7 text-xs border rounded px-2 ${selectedId && !search ? "border-primary bg-primary/5" : "border-input bg-background"}`}
          />
          {search && (
            <div className="absolute z-20 top-8 left-0 w-52 max-h-48 overflow-y-auto rounded-lg border border-border bg-white shadow-lg">
              {filtered.length === 0
                ? <div className="px-3 py-2 text-xs text-muted-foreground">Sonuç yok</div>
                : filtered.map((e: any) => (
                  <button key={e.id} className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted"
                    onClick={() => { onSelect(advisorName, e.id); setSearch(""); }}>
                    {e.candidate?.name ?? `#${e.id}`}
                  </button>
                ))
              }
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" className="h-7 text-xs px-3"
          disabled={!selectedId || isAssigning}
          onClick={() => onAssign(advisorName)}>
          {isAssigning ? "Atanıyor…" : "Ata"}
        </Button>
      </td>
    </tr>
  );
});

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
  const [mainTab, setMainTab] = useState<MainTab>("listings");
  const [listFilter, setListFilter] = useState<ListFilter>("needsAgreement");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [notify, setNotify] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const stopBulkRef = useRef(false);
  const [bulkEmailSending, setBulkEmailSending] = useState(false);
  const stopBulkEmailRef = useRef(false);
  const [bulkEmailStatus, setBulkEmailStatus] = useState<{
    active: boolean; total: number; sent: number; skipped: number;
    failed: number; current: string | null; done: boolean; stopped?: boolean;
  } | null>(null);
  const [assigningIds, setAssigningIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<{
    active: boolean; total: number; sent: number; skipped: number;
    failed: number; current: string | null; done: boolean; stopped?: boolean;
  } | null>(null);
  const [viewer, setViewer] = useState<Listing | null>(null);
  const [viewerFiles, setViewerFiles] = useState<{ id: number; name: string; mime: string }[]>([]);
  const [viewerFilesLoading, setViewerFilesLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ id: number; name: string; mime: string } | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<number | null>(null);
  const [clearingAgreementId, setClearingAgreementId] = useState<number | null>(null);
  const [editingPassiveAtId, setEditingPassiveAtId] = useState<number | null>(null);
  const [editingPassiveAtVal, setEditingPassiveAtVal] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [nameAssignments, setNameAssignments] = useState<Record<string, number>>({});
  const nameAssignmentsRef = useRef<Record<string, number>>({});
  const [assigningNames, setAssigningNames] = useState<Set<string>>(new Set());
  const [sendingIds, setSendingIds] = useState<Set<number>>(new Set());
  const [linkLoadingIds, setLinkLoadingIds] = useState<Set<number>>(new Set());
  const [wpCheckingIds, setWpCheckingIds] = useState<Set<number>>(new Set());
  const [wpStatuses, setWpStatuses] = useState<Record<number, string | null>>({});
  const [notifyFilter, setNotifyFilter] = useState<"overdue" | "all">("overdue");
  const [cooldownDays, setCooldownDays] = useState(5);
  const [notifyChannelFilter, setNotifyChannelFilter] = useState<"wa" | "email" | "both">("both");
  const [notifyNameFilter, setNotifyNameFilter] = useState("");
  type NotifySortKey = "name" | "totalPending" | "activePending" | "passivePending" | "lastNotifiedAt" | "lastEmailNotifiedAt";
  const [notifySortKey, setNotifySortKey] = useState<NotifySortKey>("totalPending");
  const [notifySortDir, setNotifySortDir] = useState<"asc" | "desc">("desc");
  const toggleNotifySort = (key: NotifySortKey) => {
    if (notifySortKey === key) {
      setNotifySortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setNotifySortKey(key);
      setNotifySortDir(key === "name" ? "asc" : "desc");
    }
  };
  const [emailSendingIds, setEmailSendingIds] = useState<Set<number>>(new Set());

  const NOTIFY_COOLDOWN_MS = cooldownDays * 24 * 60 * 60 * 1000;

  // ── Viewer files effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!viewer) { setViewerFiles([]); setPreviewFile(null); return; }
    setViewerFilesLoading(true);
    fetch(`/api/listings/${viewer.id}/agreement-files`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((files) => { setViewerFiles(files); setPreviewFile(files[0] ?? null); })
      .catch(() => {})
      .finally(() => setViewerFilesLoading(false));
  }, [viewer]);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: summary } = useQuery<Summary>({
    queryKey: ["/api/listings/summary"],
    queryFn: () => fetch("/api/listings/summary", { credentials: "include" }).then((r) => r.json()),
  });

  const listQuery = (() => {
    const params = new URLSearchParams();
    if (mainTab === "unmatched") {
      params.set("onlyUnmatched", "1");
    } else {
      if (listFilter === "needsAgreement") { params.set("needsAgreement", "1"); params.set("onlyMatched", "1"); }
      else if (listFilter === "hasAgreement") { params.set("hasAgreement", "1"); params.set("onlyMatched", "1"); }
      else if (listFilter === "needsReason") { params.set("needsReason", "1"); params.set("onlyMatched", "1"); }
      else if (listFilter === "hasReason") { params.set("hasReason", "1"); params.set("onlyMatched", "1"); }
      else if (listFilter === "missingPhone") params.set("missingPhone", "1");
      else if (listFilter === "missingEmail") params.set("missingEmail", "1");
    }
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  })();

  const { data: rowsRaw, isLoading } = useQuery<Listing[]>({
    queryKey: ["/api/listings", listQuery],
    queryFn: () => fetch(`/api/listings?${listQuery}`, { credentials: "include" }).then((r) => r.ok ? r.json() : []),
  });
  const rows: Listing[] = Array.isArray(rowsRaw) ? rowsRaw : [];

  const { data: employeesRaw } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    queryFn: () => fetch("/api/employees", { credentials: "include" }).then((r) => r.ok ? r.json() : []),
  });
  const employees: any[] = Array.isArray(employeesRaw) ? employeesRaw : [];
  const activeEmployees = employees.filter((e: any) => e.status === "active");

  const { data: unmatchedAdvisors = [], refetch: refetchUnmatched } = useQuery<{ advisorName: string; count: number }[]>({
    queryKey: ["/api/listings/unmatched-advisors"],
    queryFn: () => fetch("/api/listings/unmatched-advisors", { credentials: "include" }).then((r) => r.json()),
    enabled: mainTab === "unmatched",
    staleTime: 2 * 60 * 1000,
  });

  const { data: fuzzySuggestions = [] } = useQuery<{ advisorName: string; suggestions: { id: number; name: string; reason: string }[] }[]>({
    queryKey: ["/api/listings/fuzzy-suggestions"],
    queryFn: () => fetch("/api/listings/fuzzy-suggestions", { credentials: "include" }).then((r) => r.json()),
    enabled: mainTab === "unmatched",
    staleTime: 5 * 60 * 1000,
  });

  const EMPTY_SUGGESTIONS: { id: number; name: string; reason: string }[] = useMemo(() => [], []);

  const fuzzyMap = useMemo(
    () => Object.fromEntries(fuzzySuggestions.map((f) => [f.advisorName, f.suggestions])),
    [fuzzySuggestions],
  );

  const { data: notifyStatusRows = [], refetch: refetchNotifyStatus } = useQuery<NotifyStatusRow[]>({
    queryKey: ["/api/employees/notify-status"],
    queryFn: () => fetch("/api/employees/notify-status", { credentials: "include" }).then((r) => r.ok ? r.json() : []),
    enabled: mainTab === "notifications",
  });

  // ── Derived ──────────────────────────────────────────────────────────────────

  // Client-side date filter
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
  useEffect(() => { setPage(0); }, [mainTab, listFilter, search, dateFrom, dateTo]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const filteredNotifyRows = (() => {
    const nameQ = notifyNameFilter.trim().toLowerCase();
    const filtered = notifyStatusRows.filter((r) => {
      if (r.totalPending === 0) return false;
      if (nameQ && !r.name.toLowerCase().includes(nameQ)) return false;
      if (notifyFilter === "overdue") {
        const waOverdue = !r.lastNotifiedAt || (Date.now() - new Date(r.lastNotifiedAt).getTime()) > NOTIFY_COOLDOWN_MS;
        const emailOverdue = !r.lastEmailNotifiedAt || (Date.now() - new Date(r.lastEmailNotifiedAt).getTime()) > NOTIFY_COOLDOWN_MS;
        if (notifyChannelFilter === "wa") return waOverdue;
        if (notifyChannelFilter === "email") return emailOverdue;
        return waOverdue || emailOverdue;
      }
      return true;
    });
    const dir = notifySortDir === "asc" ? 1 : -1;
    const cmp = (a: NotifyStatusRow, b: NotifyStatusRow) => {
      const key = notifySortKey;
      if (key === "name") return a.name.localeCompare(b.name, "tr") * dir;
      if (key === "totalPending" || key === "activePending" || key === "passivePending") {
        return ((a[key] ?? 0) - (b[key] ?? 0)) * dir;
      }
      // date fields — null goes to bottom regardless of direction
      const av = a[key] ? new Date(a[key] as string).getTime() : null;
      const bv = b[key] ? new Date(b[key] as string).getTime() : null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    };
    return [...filtered].sort(cmp);
  })();

  const uniqueAdvisorIds = [...new Set(filteredRows.filter((l) => !!l.employeeId).map((l) => l.employeeId!))];
  const bulkNotifyCount = uniqueAdvisorIds.length;
  const unmatchedBadge = unmatchedAdvisors.length;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/listings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/listings/summary"] });
  };

  const deleteViewerFile = async (fileId: number) => {
    if (!viewer) return;
    setDeletingFileId(fileId);
    try {
      await fetch(`/api/listings/${viewer.id}/agreement-files/${fileId}`, { method: "DELETE", credentials: "include" });
      setViewerFiles((prev) => {
        const next = prev.filter((f) => f.id !== fileId);
        setPreviewFile(next[0] ?? null);
        if (next.length === 0) {
          refresh();
        }
        return next;
      });
    } finally {
      setDeletingFileId(null);
    }
  };

  const savePassiveAt = async (listingId: number, val: string) => {
    setEditingPassiveAtId(null);
    try {
      await fetch(`/api/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ passiveAt: val || null }),
      });
      refresh();
    } catch {
      toast({ title: "Hata", description: "Tarih kaydedilemedi.", variant: "destructive" });
    }
  };

  const clearAgreement = async (listingId: number) => {
    if (!window.confirm("Bu ilanın sözleşmesi silinecek ve 'Sözleşme Bekleyen' statüsüne dönecek. Emin misiniz?")) return;
    setClearingAgreementId(listingId);
    try {
      const res = await fetch(`/api/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ clearAgreement: true }),
      });
      if (!res.ok) { toast({ title: "Hata", description: "Sözleşme silinemedi.", variant: "destructive" }); return; }
      toast({ title: "Sıfırlandı", description: "Sözleşme silindi, ilan sözleşme bekleniyor statüsüne alındı." });
      if (viewer?.id === listingId) setViewer(null);
      refresh();
    } catch {
      toast({ title: "Hata", description: "Sözleşme silinemedi.", variant: "destructive" });
    } finally {
      setClearingAgreementId(null);
    }
  };

  const handleAdvisorSelect = useCallback((advisorName: string, empId: number) => {
    nameAssignmentsRef.current = { ...nameAssignmentsRef.current, [advisorName]: empId };
    setNameAssignments(nameAssignmentsRef.current);
  }, []);

  const assignByName = useCallback(async (advisorName: string) => {
    const employeeId = nameAssignmentsRef.current[advisorName];
    if (!employeeId) return;
    setAssigningNames((prev) => new Set(prev).add(advisorName));
    try {
      const res = await fetch("/api/listings/assign-by-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ advisorName, employeeId }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast({ title: "Hata", description: d.message, variant: "destructive" });
        return;
      }
      const { updated } = await res.json();
      const empName = (employees as any[]).find((e: any) => e.id === employeeId)?.candidate?.name ?? "danışman";
      toast({ title: "Atandı", description: `${updated} ilan ${empName}'a atandı.` });
      nameAssignmentsRef.current = { ...nameAssignmentsRef.current };
      delete nameAssignmentsRef.current[advisorName];
      setNameAssignments(nameAssignmentsRef.current);
      refresh();
      refetchUnmatched();
    } catch {
      toast({ title: "Hata", description: "Atama yapılamadı.", variant: "destructive" });
    } finally {
      setAssigningNames((prev) => { const s = new Set(prev); s.delete(advisorName); return s; });
    }
  }, [toast, refresh, refetchUnmatched, employees]);

  const assignEmployee = async (listingId: number, employeeId: number | null) => {
    setAssigningIds((prev) => new Set(prev).add(listingId));
    try {
      const res = await fetch(`/api/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ employeeId }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast({ title: "Hata", description: d.message, variant: "destructive" });
        return;
      }
      refresh();
    } catch {
      toast({ title: "Hata", description: "Atama yapılamadı.", variant: "destructive" });
    } finally {
      setAssigningIds((prev) => { const s = new Set(prev); s.delete(listingId); return s; });
    }
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

  const checkWpStatus = async (empId: number, phone: string | null, msgId: string | null) => {
    if (!phone || !msgId || wpCheckingIds.has(empId)) return;
    setWpCheckingIds((prev) => new Set(prev).add(empId));
    try {
      const res = await fetch(`/api/employees/${empId}/check-wp-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setWpStatuses((prev) => ({ ...prev, [empId]: data.status ?? null }));
    } catch {
      setWpStatuses((prev) => ({ ...prev, [empId]: "failed" }));
    } finally {
      setWpCheckingIds((prev) => { const s = new Set(prev); s.delete(empId); return s; });
    }
  };

  const handleNotifyBulkSend = async () => {
    const toSend = filteredNotifyRows;
    if (!toSend.length || bulkSending) return;
    stopBulkRef.current = false;
    setBulkSending(true);
    setBulkStatus({ active: true, total: toSend.length, sent: 0, skipped: 0, failed: 0, current: null, done: false, stopped: false });
    let sent = 0, skipped = 0, failed = 0;
    for (let i = 0; i < toSend.length; i++) {
      if (stopBulkRef.current) break;
      const row = toSend[i];
      setBulkStatus((s) => s ? { ...s, current: row.name } : s);
      try {
        const res = await fetch(`/api/listings/notify-advisor/${row.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        if (res.ok) sent++;
        else if (res.status === 400) skipped++;
        else failed++;
      } catch { failed++; }
      setBulkStatus((s) => s ? { ...s, sent, skipped, failed } : s);
      if (i < toSend.length - 1 && !stopBulkRef.current) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    const wasStopped = stopBulkRef.current;
    setBulkSending(false);
    setBulkStatus((s) => s ? { ...s, active: false, done: true, current: null, stopped: wasStopped } : s);
    toast({
      title: wasStopped ? "Toplu bildirim durduruldu" : "Toplu bildirim tamamlandı",
      description: `${sent} gönderildi, ${skipped} atlandı, ${failed} başarısız`,
    });
    refetchNotifyStatus();
  };

  const handleNotifyBulkEmailSend = async () => {
    const toSend = filteredNotifyRows;
    if (!toSend.length || bulkEmailSending) return;
    stopBulkEmailRef.current = false;
    setBulkEmailSending(true);
    setBulkEmailStatus({ active: true, total: toSend.length, sent: 0, skipped: 0, failed: 0, current: null, done: false, stopped: false });
    let sent = 0, skipped = 0, failed = 0;
    for (let i = 0; i < toSend.length; i++) {
      if (stopBulkEmailRef.current) break;
      const row = toSend[i];
      setBulkEmailStatus((s) => s ? { ...s, current: row.name } : s);
      try {
        const res = await fetch(`/api/listings/notify-advisor/${row.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ channel: "email" }),
        });
        if (res.ok) sent++;
        else if (res.status === 400) skipped++;
        else failed++;
      } catch { failed++; }
      setBulkEmailStatus((s) => s ? { ...s, sent, skipped, failed } : s);
      if (i < toSend.length - 1 && !stopBulkEmailRef.current) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    const wasStopped = stopBulkEmailRef.current;
    setBulkEmailSending(false);
    setBulkEmailStatus((s) => s ? { ...s, active: false, done: true, current: null, stopped: wasStopped } : s);
    toast({
      title: wasStopped ? "Toplu email durduruldu" : "Toplu email tamamlandı",
      description: `${sent} gönderildi, ${skipped} atlandı, ${failed} başarısız`,
    });
    refetchNotifyStatus();
  };

  const handleBulkNotify = async () => {
    if (!bulkNotifyCount || bulkSending) return;
    stopBulkRef.current = false;
    setBulkSending(true);
    setBulkStatus({ active: true, total: bulkNotifyCount, sent: 0, skipped: 0, failed: 0, current: null, done: false, stopped: false });

    let sent = 0, skipped = 0, failed = 0;
    for (let i = 0; i < uniqueAdvisorIds.length; i++) {
      if (stopBulkRef.current) break;
      const empId = uniqueAdvisorIds[i];
      const name = filteredRows.find((l) => l.employeeId === empId)?.employeeName ?? String(empId);
      setBulkStatus((s) => s ? { ...s, current: name } : s);
      try {
        const res = await fetch(`/api/listings/notify-advisor/${empId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        if (res.ok) sent++;
        else if (res.status === 400) skipped++;
        else failed++;
      } catch {
        failed++;
      }
      setBulkStatus((s) => s ? { ...s, sent, skipped, failed } : s);
      if (i < uniqueAdvisorIds.length - 1 && !stopBulkRef.current) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    const wasStopped = stopBulkRef.current;
    setBulkSending(false);
    setBulkStatus((s) => s ? { ...s, active: false, done: true, current: null, stopped: wasStopped } : s);
    toast({
      title: wasStopped ? "Toplu bildirim durduruldu" : "Toplu bildirim tamamlandı",
      description: `${sent} gönderildi, ${skipped} atlandı, ${failed} başarısız`,
    });
    refresh();
  };

  const stopBulkNotify = () => {
    stopBulkRef.current = true;
    setBulkStatus((s) => s ? { ...s, current: "Durduruluyor…" } : s);
  };

  const stopBulkEmailNotify = () => {
    stopBulkEmailRef.current = true;
    setBulkEmailStatus((s) => s ? { ...s, current: "Durduruluyor…" } : s);
  };

  const handleBulkEmailNotify = async () => {
    if (!bulkNotifyCount || bulkEmailSending) return;
    stopBulkEmailRef.current = false;
    setBulkEmailSending(true);
    setBulkEmailStatus({ active: true, total: bulkNotifyCount, sent: 0, skipped: 0, failed: 0, current: null, done: false, stopped: false });

    let sent = 0, skipped = 0, failed = 0;
    for (let i = 0; i < uniqueAdvisorIds.length; i++) {
      if (stopBulkEmailRef.current) break;
      const empId = uniqueAdvisorIds[i];
      const name = filteredRows.find((l) => l.employeeId === empId)?.employeeName ?? String(empId);
      setBulkEmailStatus((s) => s ? { ...s, current: name } : s);
      try {
        const res = await fetch(`/api/listings/notify-advisor/${empId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ channel: "email" }),
        });
        if (res.ok) sent++;
        else if (res.status === 400) skipped++;
        else failed++;
      } catch {
        failed++;
      }
      setBulkEmailStatus((s) => s ? { ...s, sent, skipped, failed } : s);
      if (i < uniqueAdvisorIds.length - 1 && !stopBulkEmailRef.current) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    const wasStopped = stopBulkEmailRef.current;
    setBulkEmailSending(false);
    setBulkEmailStatus((s) => s ? { ...s, active: false, done: true, current: null, stopped: wasStopped } : s);
    toast({
      title: wasStopped ? "Toplu email durduruldu" : "Toplu email tamamlandı",
      description: `${sent} gönderildi, ${skipped} atlandı, ${failed} başarısız`,
    });
    refresh();
  };

  const sendNotify = async (employeeId: number, channel: "wa" | "email" = "wa") => {
    if (channel === "email") {
      if (emailSendingIds.has(employeeId)) return;
      setEmailSendingIds(prev => new Set(prev).add(employeeId));
      try {
        await apiRequest("POST", `/api/listings/notify-advisor/${employeeId}`, { channel: "email" });
        toast({ title: "Email gönderildi", description: "Danışmana email bildirimi iletildi." });
      } catch (err: any) {
        toast({ title: "Email gönderilemedi", description: err?.message, variant: "destructive" });
      } finally {
        setEmailSendingIds(prev => { const s = new Set(prev); s.delete(employeeId); return s; });
      }
      return;
    }
    if (sendingIds.has(employeeId)) return;
    setSendingIds(prev => new Set(prev).add(employeeId));
    try {
      await apiRequest("POST", `/api/listings/notify-advisor/${employeeId}`, { channel: "wa" });
      toast({ title: "WhatsApp gönderildi", description: "Danışmana tüm bekleyen ilanları içeren tek mesaj gönderildi." });
      refresh();
    } catch (err: any) {
      toast({ title: "Gönderilemedi", description: err?.message, variant: "destructive" });
    } finally {
      setSendingIds(prev => { const s = new Set(prev); s.delete(employeeId); return s; });
    }
  };

  const openAdvisorLink = async (employeeId: number) => {
    if (linkLoadingIds.has(employeeId)) return;
    setLinkLoadingIds(prev => new Set(prev).add(employeeId));
    try {
      const res = await fetch(`/api/listings/advisor-link/${employeeId}`, { credentials: "include" });
      const data = await res.json();
      if (data.link) window.open(data.link, "_blank", "noreferrer");
    } catch {
      toast({ title: "Link alınamadı", variant: "destructive" });
    } finally {
      setLinkLoadingIds(prev => { const s = new Set(prev); s.delete(employeeId); return s; });
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

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
          {(summary?.noAgreement ?? 0) > 0 && (
            <StatCard icon={FileWarning} label="Sözleşme Yok (Danışman)" value={summary?.noAgreement ?? 0} tone="text-slate-400" />
          )}
        </div>

        {/* Main Tab Bar */}
        <div className="flex items-center gap-1 border-b border-border">
          {([
            { key: "listings" as const, label: "İlanlar" },
            { key: "unmatched" as const, label: "Eşleşme", badge: unmatchedBadge },
            { key: "notifications" as const, label: "Bildirimler" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setMainTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                mainTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {"badge" in t && t.badge > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 min-w-[18px] h-[18px]">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: İlanlar ─────────────────────────────────────── */}
        {mainTab === "listings" && (
          <div className="space-y-4">

            {/* Filter chips + search */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  { key: "needsAgreement" as const, label: "Sözleşme Bekleyen", count: summary?.needsAgreement },
                  { key: "hasAgreement" as const, label: "Sözleşme Girilmiş", count: undefined as number | undefined },
                  { key: "needsReason" as const, label: "Kalkış Bekleyen", count: summary?.needsReason },
                  { key: "hasReason" as const, label: "Kalkış Girilmiş", count: undefined as number | undefined },
                  { key: "missingPhone" as const, label: "Telefon Eksik", count: undefined as number | undefined },
                  { key: "missingEmail" as const, label: "Email Eksik", count: undefined as number | undefined },
                  { key: "all" as const, label: "Tümü", count: undefined as number | undefined },
                ]).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setListFilter(f.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      listFilter === f.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}{f.count !== undefined ? ` (${f.count})` : ""}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="İlan no / danışman ara..." className="h-8 pl-8 w-56 text-xs" />
              </div>
            </div>

            {/* Date filter + bulk notify buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Yayın tarihi:</span>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
              <span className="text-xs text-muted-foreground">—</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-36 text-xs" />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-muted-foreground hover:text-foreground underline">Temizle</button>
              )}
              <div className="ml-auto flex gap-2">
                <Button size="sm" className="h-8 text-xs gap-1.5" disabled={bulkSending || bulkNotifyCount === 0} onClick={handleBulkNotify}>
                  {bulkSending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                  Toplu WA ({bulkNotifyCount} danışman)
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50" disabled={bulkEmailSending || bulkNotifyCount === 0} onClick={handleBulkEmailNotify}>
                  {bulkEmailSending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  Toplu Email ({bulkNotifyCount} danışman)
                </Button>
              </div>
            </div>

            {/* Bulk WA progress */}
            {bulkStatus && (bulkStatus.active || bulkStatus.done) && (
              <div className={`rounded-xl border bg-card p-4 space-y-2 ${bulkStatus.stopped ? "border-orange-300" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-2">
                    {bulkStatus.active && !stopBulkRef.current
                      ? <><RefreshCw className="h-4 w-4 animate-spin text-primary" /> WhatsApp gönderimi devam ediyor…</>
                      : bulkStatus.active && stopBulkRef.current
                      ? <><RefreshCw className="h-4 w-4 animate-spin text-orange-500" /> Durduruluyor…</>
                      : bulkStatus.stopped
                      ? <><span className="text-orange-500">⏹</span> Gönderim durduruldu</>
                      : <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Gönderim tamamlandı</>}
                  </span>
                  <div className="flex items-center gap-2">
                    {bulkStatus.active && (
                      <button onClick={stopBulkNotify} disabled={stopBulkRef.current} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 font-medium">Durdur</button>
                    )}
                    {bulkStatus.done && (
                      <button onClick={() => setBulkStatus(null)} className="text-xs text-muted-foreground hover:text-foreground">Kapat</button>
                    )}
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${bulkStatus.stopped ? "bg-orange-400" : "bg-primary"}`}
                    style={{ width: `${bulkStatus.total ? Math.round((bulkStatus.sent + bulkStatus.skipped + bulkStatus.failed) / bulkStatus.total * 100) : 0}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>Toplam: <b>{bulkStatus.total}</b></span>
                  <span className="text-emerald-600">Gönderildi: <b>{bulkStatus.sent}</b></span>
                  <span>Atlandı: <b>{bulkStatus.skipped}</b></span>
                  {bulkStatus.failed > 0 && <span className="text-red-600">Hata: <b>{bulkStatus.failed}</b></span>}
                  {bulkStatus.current && <span className="text-primary">Şu an: <b>{bulkStatus.current}</b></span>}
                </div>
              </div>
            )}

            {/* Bulk email progress */}
            {bulkEmailStatus && (bulkEmailStatus.active || bulkEmailStatus.done) && (
              <div className={`rounded-xl border bg-card p-4 space-y-2 ${bulkEmailStatus.stopped ? "border-orange-300" : "border-blue-200"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-2">
                    {bulkEmailStatus.active && !stopBulkEmailRef.current
                      ? <><RefreshCw className="h-4 w-4 animate-spin text-blue-600" /> Email gönderimi devam ediyor…</>
                      : bulkEmailStatus.active && stopBulkEmailRef.current
                      ? <><RefreshCw className="h-4 w-4 animate-spin text-orange-500" /> Durduruluyor…</>
                      : bulkEmailStatus.stopped
                      ? <><span className="text-orange-500">⏹</span> Gönderim durduruldu</>
                      : <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Email gönderimi tamamlandı</>}
                  </span>
                  <div className="flex items-center gap-2">
                    {bulkEmailStatus.active && (
                      <button onClick={stopBulkEmailNotify} disabled={stopBulkEmailRef.current} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 font-medium">Durdur</button>
                    )}
                    {bulkEmailStatus.done && (
                      <button onClick={() => setBulkEmailStatus(null)} className="text-xs text-muted-foreground hover:text-foreground">Kapat</button>
                    )}
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${bulkEmailStatus.stopped ? "bg-orange-400" : "bg-blue-500"}`}
                    style={{ width: `${bulkEmailStatus.total ? Math.round((bulkEmailStatus.sent + bulkEmailStatus.skipped + bulkEmailStatus.failed) / bulkEmailStatus.total * 100) : 0}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>Toplam: <b>{bulkEmailStatus.total}</b></span>
                  <span className="text-emerald-600">Gönderildi: <b>{bulkEmailStatus.sent}</b></span>
                  <span>Atlandı: <b>{bulkEmailStatus.skipped}</b></span>
                  {bulkEmailStatus.failed > 0 && <span className="text-red-600">Hata: <b>{bulkEmailStatus.failed}</b></span>}
                  {bulkEmailStatus.current && <span className="text-blue-600">Şu an: <b>{bulkEmailStatus.current}</b></span>}
                </div>
              </div>
            )}

            {/* Main listings table */}
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
                      <th className="px-3 py-2.5 font-medium">Yaş</th>
                      <th className="px-3 py-2.5 font-medium">Durum</th>
                      <th className="px-3 py-2.5 font-medium">Pasife Geçiş</th>
                      <th className="px-3 py-2.5 font-medium">Yetki Sözleşmesi</th>
                      <th className="px-3 py-2.5 font-medium">Kalkış Sebebi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">Yükleniyor…</td></tr>
                    ) : filteredRows.length === 0 ? (
                      <tr><td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">Kayıt yok.</td></tr>
                    ) : pageRows.map((l) => (
                      <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2.5 font-mono text-xs">{l.listingNumber}</td>
                        <td className="px-3 py-2.5">
                          {l.employeeId ? (
                            <>
                              <div className="font-medium">{l.employeeName ?? l.advisorName ?? "—"}</div>
                              {l.office && <div className="text-[11px] text-muted-foreground truncate max-w-[160px]">{l.office}</div>}
                              <div className="flex items-center gap-1 mt-1">
                                <button onClick={() => openAdvisorLink(l.employeeId!)} disabled={linkLoadingIds.has(l.employeeId!)} title="Danışman toplu sayfasını aç (/a/token)" className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50">
                                  {linkLoadingIds.has(l.employeeId!) ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <Link2 className="h-2.5 w-2.5" />} Linki Aç
                                </button>
                                <button onClick={() => sendNotify(l.employeeId!, "wa")} disabled={sendingIds.has(l.employeeId!)} title="WhatsApp gönder" className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50">
                                  {sendingIds.has(l.employeeId!) ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />} WA
                                </button>
                                <button onClick={() => sendNotify(l.employeeId!, "email")} disabled={emailSendingIds.has(l.employeeId!)} title="Email gönder" className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                                  {emailSendingIds.has(l.employeeId!) ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <Mail className="h-2.5 w-2.5" />} Mail
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="space-y-1">
                              {l.advisorName && <div className="text-[11px] text-muted-foreground">{l.advisorName}</div>}
                              <Select value="" onValueChange={(v) => assignEmployee(l.id, v === "none" ? null : Number(v))} disabled={assigningIds.has(l.id)}>
                                <SelectTrigger className="h-7 text-xs w-40">
                                  <SelectValue placeholder={assigningIds.has(l.id) ? "Atanıyor…" : "Danışman ata…"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {activeEmployees.map((e: any) => (
                                    <SelectItem key={e.id} value={String(e.id)} className="text-xs">{e.candidate?.name ?? `#${e.id}`}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                          {l.employeePhone ? <a href={`tel:${l.employeePhone}`} className="text-primary hover:underline">{l.employeePhone}</a> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{fmtPrice(l.price)}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{l.publishedDate ?? "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {l.publishedDate ? (() => {
                            const d = new Date(l.publishedDate);
                            if (isNaN(d.getTime())) return <span className="text-xs text-muted-foreground">—</span>;
                            const age = Math.floor((Date.now() - d.getTime()) / 86400000);
                            if (age < 0) return <span className="text-xs text-muted-foreground">—</span>;
                            const cls = age > 90 ? "text-red-600 font-bold" : age > 60 ? "text-red-500 font-semibold" : age > 30 ? "text-orange-500 font-medium" : "text-muted-foreground";
                            return <span className={`text-xs ${cls}`}>{age}g</span>;
                          })() : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {l.status === "active"
                            ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Aktif</span>
                            : <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Pasif</span>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                          {editingPassiveAtId === l.id ? (
                            <input
                              type="date"
                              autoFocus
                              className="border border-input rounded px-1 py-0.5 text-xs w-32"
                              value={editingPassiveAtVal}
                              onChange={(e) => setEditingPassiveAtVal(e.target.value)}
                              onBlur={() => savePassiveAt(l.id, editingPassiveAtVal)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") savePassiveAt(l.id, editingPassiveAtVal);
                                if (e.key === "Escape") setEditingPassiveAtId(null);
                              }}
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setEditingPassiveAtId(l.id);
                                setEditingPassiveAtVal(l.passiveAt ? l.passiveAt.slice(0, 10) : "");
                              }}
                              className="text-muted-foreground hover:text-foreground hover:underline"
                            >
                              {l.passiveAt ? new Date(l.passiveAt).toLocaleDateString("tr-TR") : "—"}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {l.agreementUploadedAt ? (
                            <div className="flex items-center gap-1">
                              {l.agreementFileName === "elden-teslim" ? (
                                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                  <FileCheck2 className="h-3 w-3" /> Elden Teslim
                                </span>
                              ) : (
                                <button onClick={() => setViewer(l)} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                                  <FileCheck2 className="h-3 w-3" /> Görüntüle
                                </button>
                              )}
                              <button
                                onClick={() => clearAgreement(l.id)}
                                disabled={clearingAgreementId === l.id}
                                title="Sözleşmeyi sil ve sözleşme bekleniyor'a al"
                                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                              >
                                {clearingAgreementId === l.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </button>
                            </div>
                          ) : l.noAgreementAt ? (
                            <div className="flex items-center gap-1">
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Sözleşme Yok</span>
                              <button
                                onClick={() => clearAgreement(l.id)}
                                disabled={clearingAgreementId === l.id}
                                title="Sıfırla ve sözleşme bekleniyor'a al"
                                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                              >
                                {clearingAgreementId === l.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </button>
                            </div>
                          ) : l.agreementRequestedAt ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"><Clock className="h-3 w-3" /> İstendi</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {l.closeReasonSubmittedAt ? (
                            <div>
                              <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${l.closeReason === "Satıldı" || l.closeReason === "Kiralandı" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{l.closeReason}</span>
                              {l.closeReasonNote && <div className="text-[11px] text-muted-foreground mt-0.5 max-w-[180px] truncate">{l.closeReasonNote}</div>}
                            </div>
                          ) : l.status === "passive" ? (
                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700"><Clock className="h-3 w-3" /> Bekliyor</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > PAGE_SIZE && (
                <div className="flex items-center justify-between px-3 py-2.5 border-t border-border text-xs text-muted-foreground">
                  <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredRows.length)} / {filteredRows.length}</span>
                  <div className="flex items-center gap-1">
                    <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                    <span className="px-2">{page + 1} / {pageCount}</span>
                    <button disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Eşleşme ──────────────────────────────────── */}
        {mainTab === "unmatched" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">CSV'den gelen ama sisteme eşleşemeyen danışman isimleri. Sarı satırlar fuzzy eşleşme öneren danışmanları gösterir.</p>
            {unmatchedAdvisors.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div className="text-sm font-semibold text-amber-800">İsim Bazlı Toplu Atama</div>
                <p className="text-xs text-amber-700">Her danışman adı için bir çalışan seçip "Ata" butonuna basın. Sarı öneri satırları fuzzy eşleşme bulunanları gösterir.</p>
                <div className="rounded-lg border border-amber-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-amber-100 bg-amber-50/60 text-left text-xs text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Danışman Adı (CSV)</th>
                        <th className="px-3 py-2 font-medium text-center">İlan</th>
                        <th className="px-3 py-2 font-medium">Atanacak Çalışan</th>
                        <th className="px-3 py-2 font-medium text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unmatchedAdvisors.map((row) => (
                        <UnmatchedAssignRow
                          key={row.advisorName}
                          advisorName={row.advisorName}
                          count={row.count}
                          suggestions={fuzzyMap[row.advisorName] ?? EMPTY_SUGGESTIONS}
                          selectedId={nameAssignments[row.advisorName]}
                          isAssigning={assigningNames.has(row.advisorName)}
                          activeEmployees={activeEmployees}
                          onSelect={handleAdvisorSelect}
                          onAssign={assignByName}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                Eşleşmeyen danışman yok.
              </div>
            )}
            {/* Unmatched listings table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">İlan No</th>
                      <th className="px-3 py-2.5 font-medium">Danışman (CSV)</th>
                      <th className="px-3 py-2.5 font-medium">Fiyat</th>
                      <th className="px-3 py-2.5 font-medium">Yayın</th>
                      <th className="px-3 py-2.5 font-medium">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Yükleniyor…</td></tr>
                    ) : filteredRows.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Eşleşmeyen ilan yok.</td></tr>
                    ) : pageRows.map((l) => (
                      <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2.5 font-mono text-xs">{l.listingNumber}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">{l.advisorName ?? "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{fmtPrice(l.price)}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{l.publishedDate ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          {l.status === "active"
                            ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Aktif</span>
                            : <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Pasif</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRows.length > PAGE_SIZE && (
                <div className="flex items-center justify-between px-3 py-2.5 border-t border-border text-xs text-muted-foreground">
                  <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredRows.length)} / {filteredRows.length}</span>
                  <div className="flex items-center gap-1">
                    <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                    <span className="px-2">{page + 1} / {pageCount}</span>
                    <button disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Bildirimler ──────────────────────────────── */}
        {mainTab === "notifications" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Channel filter */}
                    <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
                      {([
                        { key: "both" as const, label: "WA & Email" },
                        { key: "wa" as const, label: "WhatsApp" },
                        { key: "email" as const, label: "Email" },
                      ]).map((c) => (
                        <button key={c.key} onClick={() => setNotifyChannelFilter(c.key)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${notifyChannelFilter === c.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                    {/* Cooldown days */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Son</span>
                      <input
                        type="number" min={1} max={90} value={cooldownDays}
                        onChange={(e) => setCooldownDays(Math.max(1, Math.min(90, Number(e.target.value))))}
                        className="w-14 h-7 text-xs border border-input rounded px-2 text-center bg-background"
                      />
                      <span className="text-xs text-muted-foreground">günde bildirim gitmeyenler</span>
                    </div>
                    {/* Overdue/All toggle */}
                    <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
                      <button onClick={() => setNotifyFilter("overdue")}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${notifyFilter === "overdue" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                        Gecikmiş ({filteredNotifyRows.length})
                      </button>
                      <button onClick={() => setNotifyFilter("all")}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${notifyFilter === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                        Tümü ({notifyStatusRows.filter((r) => r.totalPending > 0).length})
                      </button>
                    </div>
                    {/* Name filter */}
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={notifyNameFilter}
                        onChange={(e) => setNotifyNameFilter(e.target.value)}
                        placeholder="Danışman adı ara..."
                        className="h-7 pl-7 pr-7 text-xs border border-input rounded bg-background w-52"
                      />
                      {notifyNameFilter && (
                        <button
                          onClick={() => setNotifyNameFilter("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="Temizle"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => { refetchNotifyStatus(); setWpStatuses({}); }}>
                      <RefreshCw className="h-3 w-3" /> Yenile
                    </Button>
                    <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleNotifyBulkSend} disabled={bulkSending || filteredNotifyRows.length === 0}>
                      {bulkSending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                      Toplu WA ({filteredNotifyRows.length})
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50" onClick={handleNotifyBulkEmailSend} disabled={bulkEmailSending || filteredNotifyRows.length === 0}>
                      {bulkEmailSending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                      Toplu Email ({filteredNotifyRows.length})
                    </Button>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <SortableTh label="Danışman" sortKey="name"                 activeKey={notifySortKey} dir={notifySortDir} onClick={toggleNotifySort} />
                      <th className="px-3 py-2.5 font-medium">Telefon</th>
                      <th className="px-3 py-2.5 font-medium">Email</th>
                      <SortableTh label="Bekleyen İlan" sortKey="totalPending"    activeKey={notifySortKey} dir={notifySortDir} onClick={toggleNotifySort} align="center" />
                      <SortableTh label="Son WA Bildirimi" sortKey="lastNotifiedAt"      activeKey={notifySortKey} dir={notifySortDir} onClick={toggleNotifySort} />
                      <SortableTh label="Son Email Bildirimi" sortKey="lastEmailNotifiedAt" activeKey={notifySortKey} dir={notifySortDir} onClick={toggleNotifySort} />
                      <th className="px-3 py-2.5 font-medium">WP Durumu</th>
                      <th className="px-3 py-2.5 font-medium text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNotifyRows.length === 0 ? (
                      <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                        {notifyFilter === "overdue" ? `Son ${cooldownDays} gün içinde bildirim gönderilmemiş danışman yok.` : "Bekleyen ilan bulunamadı."}
                      </td></tr>
                    ) : filteredNotifyRows.map((row) => {
                      const wpStatus = wpStatuses[row.id];
                      const isChecking = wpCheckingIds.has(row.id);
                      const notified = !!row.lastNotifiedAt;
                      const hasMsgId = !!row.notifyMsgId;
                      const wpBadge = () => {
                        if (isChecking) return <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"><RefreshCw className="h-2.5 w-2.5 animate-spin" />Sorgulanıyor</span>;
                        if (!hasMsgId) return <span className="text-[11px] text-muted-foreground">—</span>;
                        if (wpStatus === null || wpStatus === undefined) return <span className="text-[11px] text-muted-foreground italic">Sorgulanmadı</span>;
                        const wpMap: Record<string, { label: string; cls: string }> = {
                          pending: { label: "Bekliyor", cls: "bg-yellow-100 text-yellow-700" },
                          sent: { label: "Gönderildi", cls: "bg-blue-100 text-blue-700" },
                          delivered: { label: "İletildi", cls: "bg-emerald-100 text-emerald-700" },
                          read: { label: "Okundu", cls: "bg-emerald-200 text-emerald-800" },
                          played: { label: "Oynatıldı", cls: "bg-emerald-200 text-emerald-800" },
                          failed: { label: "Başarısız", cls: "bg-red-100 text-red-700" },
                        };
                        const m = wpMap[wpStatus] ?? { label: wpStatus, cls: "bg-slate-100 text-slate-600" };
                        return <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
                      };
                      return (
                        <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-3 py-2.5"><div className="font-medium text-sm">{row.name}</div></td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.phone ?? <span className="text-red-500 font-medium">Eksik</span>}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.email ? <span className="truncate max-w-[160px] block">{row.email}</span> : <span className="text-red-500 font-medium">Eksik</span>}</td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              {row.activePending > 0 && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{row.activePending} sözleşme</span>}
                              {row.passivePending > 0 && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{row.passivePending} kapanış</span>}
                              {row.totalPending === 0 && <span className="text-[11px] text-muted-foreground">—</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {notified
                              ? <div className="flex items-center gap-1.5"><Bell className="h-3.5 w-3.5 text-emerald-600 shrink-0" /><span className="text-xs">{new Date(row.lastNotifiedAt!).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
                              : <div className="flex items-center gap-1.5"><BellOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="text-xs text-muted-foreground">—</span></div>}
                          </td>
                          <td className="px-3 py-2.5">
                            {row.lastEmailNotifiedAt
                              ? <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" /><span className="text-xs">{new Date(row.lastEmailNotifiedAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>
                              : <div className="flex items-center gap-1.5"><BellOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="text-xs text-muted-foreground">—</span></div>}
                          </td>
                          <td className="px-3 py-2.5">{wpBadge()}</td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {hasMsgId && (
                                <button onClick={() => checkWpStatus(row.id, row.phone, row.notifyMsgId)} disabled={isChecking}
                                  className="inline-flex items-center gap-0.5 text-[10px] px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50">
                                  {isChecking ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />} Durumu Sorgula
                                </button>
                              )}
                              {row.totalPending > 0 && (
                                <button onClick={() => sendNotify(row.id)} disabled={sendingIds.has(row.id)}
                                  className="inline-flex items-center gap-0.5 text-[10px] px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50">
                                  {sendingIds.has(row.id) ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />}
                                  {notified ? "Tekrar Gönder" : "Bildir"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

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
              {viewerFilesLoading && (
                <div className="flex justify-center py-6"><div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
              )}
              {!viewerFilesLoading && viewerFiles.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Dosya bulunamadı.</p>
              )}
              {!viewerFilesLoading && viewerFiles.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {viewerFiles.map((f) => (
                      <div key={f.id} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${previewFile?.id === f.id ? "border-primary bg-primary/5 text-primary font-medium" : "border-border bg-muted/30 hover:bg-muted"}`}>
                        <span onClick={() => setPreviewFile(f)} className="truncate max-w-[140px]">{f.name}</span>
                        <a
                          href={`/api/listings/${viewer.id}/agreement-files/${f.id}`}
                          download={f.name}
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground ml-0.5"
                          title="İndir"
                        >
                          <Download className="h-3 w-3" />
                        </a>
                        <button
                          disabled={deletingFileId === f.id}
                          onClick={(e) => { e.stopPropagation(); deleteViewerFile(f.id); }}
                          className="text-destructive hover:text-destructive/80 disabled:opacity-40"
                          title="Sil"
                        >
                          {deletingFileId === f.id ? <div className="h-3 w-3 rounded-full border border-destructive border-t-transparent animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      </div>
                    ))}
                  </div>
                  {previewFile && (
                    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
                      {previewFile.mime.startsWith("image/") ? (
                        <img
                          src={`/api/listings/${viewer.id}/agreement-files/${previewFile.id}`}
                          alt={previewFile.name}
                          className="max-h-[65vh] w-full object-contain bg-black/5"
                        />
                      ) : (
                        <iframe
                          src={`/api/listings/${viewer.id}/agreement-files/${previewFile.id}`}
                          title={previewFile.name}
                          className="w-full h-[65vh]"
                        />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
