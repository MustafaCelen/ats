import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Receipt, Upload, FileText, CheckSquare, Square, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { INCOME_CATEGORIES, EXPENSE_CATEGORY_GROUPS, BM_PREPAYMENT_CATEGORY } from "@shared/schema";
import { EmployeePicker } from "@/components/EmployeePicker";

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

function fmtTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " ₺";
}

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── File reader: CSV / XLS / XLSX → plain text ────────────────────────────────

function readFileAsCSVText(buf: ArrayBuffer, filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "xls" || ext === "xlsx") {
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_csv(sheet);
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1254").decode(buf); }
}

// ── Bank statement CSV parser ──────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { result.push(cur); cur = ""; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

type ImportRow = {
  uid: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  notes: string;
  included: boolean;
  selected: boolean;
};

function parseGarantiCSV(text: string): ImportRow[] {
  const lines = text.replace(/\r/g, "").split("\n");
  let dataStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Tarih") && lines[i].includes("Tutar")) {
      dataStart = i + 1;
      break;
    }
  }
  if (dataStart === -1) return [];
  const rows: ImportRow[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 4) continue;
    const [dateStr, description, , amountStr] = cols;
    const amount = parseFloat(amountStr.replace(/,/g, ""));
    if (isNaN(amount) || amount >= 0) continue;
    const parts = dateStr.split("/");
    if (parts.length !== 3) continue;
    const date = `${parts[2]}-${parts[1]}-${parts[0]}`;
    rows.push({
      uid: `${i}-${Math.random()}`,
      date,
      description: description.trim(),
      amount: Math.abs(amount),
      category: "",
      notes: description.trim(),
      included: true,
      selected: false,
    });
  }
  return rows;
}

// ── Credit card CSV parser ────────────────────────────────────────────────────

type CreditCardRow = {
  uid: string;
  date: string;
  description: string;
  etiket: string;
  amount: number;
  category: string;
  notes: string;
  included: boolean;
  selected: boolean;
};

function parseTurkishNumber(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function parseCreditCardCSV(text: string): CreditCardRow[] {
  const lines = text.replace(/\r/g, "").split("\n");
  let dataStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Tarih") && lines[i].includes("Tutar")) {
      dataStart = i + 1;
      break;
    }
  }
  if (dataStart === -1) return [];
  const rows: CreditCardRow[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    if (cols.length < 5) continue;
    const [dateStr, description, etiket, , amountStr] = cols;
    const amount = parseTurkishNumber(amountStr.trim());
    if (isNaN(amount) || amount >= 0) continue;
    const parts = dateStr.split("/");
    if (parts.length !== 3) continue;
    const date = `${parts[2]}-${parts[1]}-${parts[0]}`;
    rows.push({
      uid: `cc-${i}-${Math.random()}`,
      date,
      description: description.trim(),
      etiket: etiket?.trim() ?? "",
      amount: Math.abs(amount),
      category: "",
      notes: description.trim(),
      included: true,
      selected: false,
    });
  }
  return rows;
}

// ── Credit Card Import Dialog ──────────────────────────────────────────────────

function CreditCardImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CreditCardRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer;
      const text = readFileAsCSVText(buf, file.name);
      const parsed = parseCreditCardCSV(text);
      setRows(parsed);
      if (parsed.length === 0)
        toast({ title: "İşlem bulunamadı", description: "Negatif tutarlı işlem yok veya format tanınamadı.", variant: "destructive" });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const updateRow = (uid: string, patch: Partial<CreditCardRow>) =>
    setRows((prev) => prev.map((r) => r.uid === uid ? { ...r, ...patch } : r));

  const included = rows.filter((r) => r.included);
  const selectedRows = rows.filter((r) => r.selected);
  const allCategorized = included.length > 0 && included.every((r) => r.category);
  const totalAmount = included.reduce((s, r) => s + r.amount, 0);

  const toggleAll = () => {
    const allOn = rows.every((r) => r.included);
    setRows((prev) => prev.map((r) => ({ ...r, included: !allOn })));
  };

  const toggleSelectAll = () => {
    const allSel = rows.filter((r) => r.included).every((r) => r.selected);
    setRows((prev) => prev.map((r) => r.included ? { ...r, selected: !allSel } : r));
  };

  const applyBulkCategory = () => {
    if (!bulkCategory) return;
    setRows((prev) => prev.map((r) => r.selected ? { ...r, category: bulkCategory, selected: false } : r));
    setBulkCategory("");
  };

  const clearSelection = () => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: false })));
    setBulkCategory("");
  };

  const handleImport = async () => {
    setImporting(true);
    let success = 0;
    for (const row of included) {
      try {
        const res = await fetch("/api/office-expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ type: "expense", category: row.category, amount: String(row.amount), date: row.date, notes: row.notes || null, employeeId: null }),
        });
        if (res.ok) success++;
      } catch {}
    }
    setImporting(false);
    qc.invalidateQueries({ queryKey: ["/api/office-expenses"] });
    qc.invalidateQueries({ queryKey: ["/api/office-expenses/monthly-pl"] });
    toast({ title: `${success} kayıt içe aktarıldı` });
    onOpenChange(false);
    setRows([]);
  };

  const handleClose = (v: boolean) => {
    if (!v) { setRows([]); setBulkCategory(""); }
    onOpenChange(v);
  };

  const allIncludedSelected = included.length > 0 && included.every((r) => r.selected);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-3" aria-describedby="cc-import-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Kredi Kartı Ekstresi Yükle
          </DialogTitle>
          <p id="cc-import-desc" className="text-sm text-muted-foreground">
            Garanti BBVA kredi kartı CSV ekstresi. Negatif tutarlar gider olarak içe aktarılır.
          </p>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-14">
            <div className="rounded-full border-2 border-dashed border-border p-6">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">CSV dosyası seçin</p>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Dosya Seç
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={handleFile} />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{rows.length} gider işlemi bulundu</span>
              <span className="font-semibold">{included.length} dahil — <span className="text-red-700">{fmtTRY(totalAmount)}</span></span>
            </div>

            {/* Bulk assign toolbar */}
            {selectedRows.length > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-blue-700 whitespace-nowrap">{selectedRows.length} satır seçildi</span>
                <div className="flex-1">
                  <Select value={bulkCategory} onValueChange={setBulkCategory}>
                    <SelectTrigger className="h-7 text-xs bg-white">
                      <SelectValue placeholder="Kategori seçin..." />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORY_GROUPS.map((g) => (
                        <SelectGroup key={g.group}>
                          <SelectLabel className="text-xs font-bold text-muted-foreground">{g.group}</SelectLabel>
                          {g.items.map((item) => <SelectItem key={item} value={item} className="text-xs">{item}</SelectItem>)}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="h-7 text-xs" disabled={!bulkCategory} onClick={applyBulkCategory}>
                  Uygula
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection}>
                  Temizle
                </Button>
              </div>
            )}

            <div className="overflow-auto flex-1 border border-border rounded-lg">
              <table className="w-full text-sm min-w-[750px]">
                <thead className="bg-muted/30 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left w-8">
                      <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-blue-600" title="Tümünü seç / bırak">
                        {allIncludedSelected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-left w-8">
                      <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground" title="Tümünü dahil et / çıkar">
                        {rows.every((r) => r.included) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Tarih</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Açıklama</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Etiket</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">Tutar</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-52">Kategori *</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-36">Not</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr
                      key={row.uid}
                      className={`transition-colors hover:bg-muted/10 cursor-pointer ${!row.included ? "opacity-35" : ""} ${row.selected ? "bg-blue-50/60" : ""}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button,select,[role='combobox'],input")) return;
                        if (row.included) updateRow(row.uid, { selected: !row.selected });
                      }}
                    >
                      <td className="px-2 py-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); if (row.included) updateRow(row.uid, { selected: !row.selected }); }}
                          className="text-muted-foreground hover:text-blue-600"
                          disabled={!row.included}
                        >
                          {row.selected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); updateRow(row.uid, { included: !row.included, selected: false }); }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {row.included ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap text-xs">
                        {format(new Date(row.date + "T12:00:00"), "dd.MM.yyyy")}
                      </td>
                      <td className="px-3 py-1.5 max-w-[180px]">
                        <p className="truncate text-xs" title={row.description}>{row.description}</p>
                      </td>
                      <td className="px-3 py-1.5 max-w-[100px]">
                        <p className="truncate text-xs text-muted-foreground" title={row.etiket}>{row.etiket}</p>
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold text-red-700 whitespace-nowrap text-xs">
                        {fmtTRY(row.amount)}
                      </td>
                      <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <Select value={row.category} onValueChange={(v) => updateRow(row.uid, { category: v })}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Seçin..." />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORY_GROUPS.map((g) => (
                              <SelectGroup key={g.group}>
                                <SelectLabel className="text-xs font-bold text-muted-foreground">{g.group}</SelectLabel>
                                {g.items.map((item) => <SelectItem key={item} value={item} className="text-xs">{item}</SelectItem>)}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <Input className="h-7 text-xs" value={row.notes} onChange={(e) => updateRow(row.uid, { notes: e.target.value })} placeholder="Not..." />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!allCategorized && included.length > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Tüm dahil edilen satırlar için kategori seçin.
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>İptal</Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={handleImport}
                disabled={importing || !allCategorized}
              >
                {importing ? "Aktarılıyor..." : `${included.length} Kaydı İçe Aktar`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Bank Statement Import Dialog ───────────────────────────────────────────────

function BankStatementImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result as ArrayBuffer;
      const text = readFileAsCSVText(buf, file.name);
      const parsed = parseGarantiCSV(text);
      setRows(parsed);
      if (parsed.length === 0)
        toast({ title: "İşlem bulunamadı", description: "Negatif tutarlı işlem yok veya format tanınamadı.", variant: "destructive" });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const included = rows.filter((r) => r.included);
  const selectedRows = rows.filter((r) => r.selected);
  const allCategorized = included.length > 0 && included.every((r) => r.category);
  const totalAmount = included.reduce((s, r) => s + r.amount, 0);
  const allIncludedSelected = included.length > 0 && included.every((r) => r.selected);

  const updateRow = (uid: string, patch: Partial<ImportRow>) =>
    setRows((prev) => prev.map((r) => r.uid === uid ? { ...r, ...patch } : r));

  const toggleAll = () => {
    const allOn = rows.every((r) => r.included);
    setRows((prev) => prev.map((r) => ({ ...r, included: !allOn })));
  };

  const toggleSelectAll = () => {
    setRows((prev) => prev.map((r) => r.included ? { ...r, selected: !allIncludedSelected } : r));
  };

  const applyBulkCategory = () => {
    if (!bulkCategory) return;
    setRows((prev) => prev.map((r) => r.selected ? { ...r, category: bulkCategory, selected: false } : r));
    setBulkCategory("");
  };

  const clearSelection = () => {
    setRows((prev) => prev.map((r) => ({ ...r, selected: false })));
    setBulkCategory("");
  };

  const handleImport = async () => {
    setImporting(true);
    let success = 0;
    for (const row of included) {
      try {
        const res = await fetch("/api/office-expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ type: "expense", category: row.category, amount: String(row.amount), date: row.date, notes: row.notes || null, employeeId: null }),
        });
        if (res.ok) success++;
      } catch {}
    }
    setImporting(false);
    qc.invalidateQueries({ queryKey: ["/api/office-expenses"] });
    qc.invalidateQueries({ queryKey: ["/api/office-expenses/monthly-pl"] });
    toast({ title: `${success} kayıt içe aktarıldı` });
    onOpenChange(false);
    setRows([]);
  };

  const handleClose = (v: boolean) => {
    if (!v) { setRows([]); setBulkCategory(""); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-3" aria-describedby="import-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> Banka Ekstresi Yükle
          </DialogTitle>
          <p id="import-desc" className="text-sm text-muted-foreground">
            Garanti BBVA CSV ekstresini yükleyin. Negatif tutarlar (hesaptan çıkan) gider olarak listelenecek.
          </p>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-14">
            <div className="rounded-full border-2 border-dashed border-border p-6">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">CSV dosyası seçin</p>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Dosya Seç
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={handleFile} />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{rows.length} gider işlemi bulundu</span>
              <span className="font-semibold">{included.length} dahil — <span className="text-red-700">{fmtTRY(totalAmount)}</span></span>
            </div>

            {/* Bulk assign toolbar */}
            {selectedRows.length > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-blue-700 whitespace-nowrap">{selectedRows.length} satır seçildi</span>
                <div className="flex-1">
                  <Select value={bulkCategory} onValueChange={setBulkCategory}>
                    <SelectTrigger className="h-7 text-xs bg-white">
                      <SelectValue placeholder="Kategori seçin..." />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORY_GROUPS.map((g) => (
                        <SelectGroup key={g.group}>
                          <SelectLabel className="text-xs font-bold text-muted-foreground">{g.group}</SelectLabel>
                          {g.items.map((item) => <SelectItem key={item} value={item} className="text-xs">{item}</SelectItem>)}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="h-7 text-xs" disabled={!bulkCategory} onClick={applyBulkCategory}>
                  Uygula
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearSelection}>
                  Temizle
                </Button>
              </div>
            )}

            <div className="overflow-auto flex-1 border border-border rounded-lg">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-muted/30 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left w-8">
                      <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-blue-600" title="Tümünü seç / bırak">
                        {allIncludedSelected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-left w-8">
                      <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground" title="Tümünü dahil et / çıkar">
                        {rows.every((r) => r.included) ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Tarih</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Açıklama</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">Tutar</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-52">Kategori *</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-44">Not</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr
                      key={row.uid}
                      className={`transition-colors hover:bg-muted/10 cursor-pointer ${!row.included ? "opacity-35" : ""} ${row.selected ? "bg-blue-50/60" : ""}`}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button,select,[role='combobox'],input")) return;
                        if (row.included) updateRow(row.uid, { selected: !row.selected });
                      }}
                    >
                      <td className="px-2 py-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); if (row.included) updateRow(row.uid, { selected: !row.selected }); }}
                          className="text-muted-foreground hover:text-blue-600"
                          disabled={!row.included}
                        >
                          {row.selected ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); updateRow(row.uid, { included: !row.included, selected: false }); }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {row.included ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap text-xs">
                        {format(new Date(row.date + "T12:00:00"), "dd.MM.yyyy")}
                      </td>
                      <td className="px-3 py-1.5 max-w-[220px]">
                        <p className="truncate text-xs" title={row.description}>{row.description}</p>
                      </td>
                      <td className="px-3 py-1.5 text-right font-semibold text-red-700 whitespace-nowrap text-xs">
                        {fmtTRY(row.amount)}
                      </td>
                      <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <Select value={row.category} onValueChange={(v) => updateRow(row.uid, { category: v })}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Seçin..." />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORY_GROUPS.map((g) => (
                              <SelectGroup key={g.group}>
                                <SelectLabel className="text-xs font-bold text-muted-foreground">{g.group}</SelectLabel>
                                {g.items.map((item) => <SelectItem key={item} value={item} className="text-xs">{item}</SelectItem>)}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <Input className="h-7 text-xs" value={row.notes} onChange={(e) => updateRow(row.uid, { notes: e.target.value })} placeholder="Not..." />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!allCategorized && included.length > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Tüm dahil edilen satırlar için kategori seçin.
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>İptal</Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={handleImport}
                disabled={importing || !allCategorized}
              >
                {importing ? "Aktarılıyor..." : `${included.length} Kaydı İçe Aktar`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Category Select ────────────────────────────────────────────────────────────

function CategorySelect({ type, value, onChange }: { type: "income" | "expense"; value: string; onChange: (v: string) => void }) {
  if (type === "income") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Kategori seçin..." /></SelectTrigger>
        <SelectContent>
          {INCOME_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Kategori seçin..." /></SelectTrigger>
      <SelectContent>
        {EXPENSE_CATEGORY_GROUPS.map((g) => (
          <SelectGroup key={g.group}>
            <SelectLabel className="text-xs font-bold text-muted-foreground">{g.group}</SelectLabel>
            {g.items.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Add / Edit Dialog ──────────────────────────────────────────────────────────

function ExpenseDialog({
  open, onOpenChange, initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: any;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!initial;

  const [type, setType] = useState<"income" | "expense">(initial?.type ?? "expense");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [date, setDate] = useState(initial?.date ?? todayYMD());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [employeeId, setEmployeeId] = useState<string>(initial?.employeeId ? String(initial.employeeId) : "");

  const isBmPrepayment = type === "income" && category === BM_PREPAYMENT_CATEGORY;

  const { data: employees = [] } = useQuery<{ id: number; candidateName: string }[]>({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const list = await res.json();
      return list
        .filter((e: any) => e.status === "active")
        .map((e: any) => ({ id: e.id, candidateName: e.candidate?.name ?? `#${e.id}` }))
        .sort((a: any, b: any) => a.candidateName.localeCompare(b.candidateName, "tr"));
    },
    enabled: isBmPrepayment,
  });

  const mutate = useMutation({
    mutationFn: async (data: any) => {
      const url = isEdit ? `/api/office-expenses/${initial.id}` : "/api/office-expenses";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/office-expenses"] });
      qc.invalidateQueries({ queryKey: ["/api/office-expenses/monthly-pl"] });
      qc.invalidateQueries({ queryKey: ["/api/employees/cap-statuses"] });
      qc.invalidateQueries({ queryKey: ["/api/coaching/stats"] });
      toast({ title: isEdit ? "Güncellendi" : "Kaydedildi" });
      onOpenChange(false);
    },
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  const handleSave = () => {
    if (!category || !amount || !date) {
      toast({ title: "Tüm zorunlu alanları doldurun", variant: "destructive" });
      return;
    }
    if (isBmPrepayment && !employeeId) {
      toast({ title: "Danışman seçimi zorunlu", variant: "destructive" });
      return;
    }
    mutate.mutate({
      type,
      category,
      amount: String(parseFloat(amount.replace(",", "."))),
      date,
      notes: notes || null,
      employeeId: isBmPrepayment ? Number(employeeId) : null,
    });
  };

  // Reset category when type changes
  const handleTypeChange = (t: "income" | "expense") => {
    setType(t);
    setCategory("");
    setEmployeeId("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Kaydı Düzenle" : "Yeni Kayıt Ekle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Type toggle */}
          <div>
            <Label className="text-xs mb-2 block">Tür *</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange("income")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-all ${
                  type === "income"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-border text-muted-foreground hover:border-emerald-300"
                }`}
              >
                <TrendingUp className="h-4 w-4" /> Gelir
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange("expense")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-medium transition-all ${
                  type === "expense"
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-border text-muted-foreground hover:border-red-300"
                }`}
              >
                <TrendingDown className="h-4 w-4" /> Gider
              </button>
            </div>
          </div>

          {/* Category */}
          <div>
            <Label className="text-xs mb-1 block">Kategori *</Label>
            <CategorySelect type={type} value={category} onChange={setCategory} />
          </div>

          {/* Employee picker — only for BM Payı Ön Ödemesi */}
          {isBmPrepayment && (
            <div>
              <Label className="text-xs mb-1 block">Danışman *</Label>
              <EmployeePicker
                employees={employees.map((e) => ({ id: e.id, name: e.candidateName }))}
                value={employeeId ? Number(employeeId) : null}
                onChange={(id) => setEmployeeId(id ? String(id) : "")}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Ödeme tarihine göre danışmanın mevcut cap dönemine eklenir.
              </p>
            </div>
          )}

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Tutar (₺) *</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Tarih *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs mb-1 block">Açıklama</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Opsiyonel not..." />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>İptal</Button>
            <Button
              className={`flex-1 ${type === "income" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
              onClick={handleSave}
              disabled={mutate.isPending}
            >
              {mutate.isPending ? "Kaydediliyor..." : (isEdit ? "Güncelle" : "Kaydet")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Expenses() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [cardImportOpen, setCardImportOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/office-expenses", { year, month }],
    queryFn: async () => {
      const res = await fetch(`/api/office-expenses?year=${year}&month=${month}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/office-expenses/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/office-expenses"] });
      qc.invalidateQueries({ queryKey: ["/api/office-expenses/monthly-pl"] });
      qc.invalidateQueries({ queryKey: ["/api/employees/cap-statuses"] });
      qc.invalidateQueries({ queryKey: ["/api/coaching/stats"] });
      toast({ title: "Silindi" });
    },
    onError: () => toast({ title: "Silinemedi", variant: "destructive" }),
  });

  const handleDelete = (item: any) => {
    if (!confirm(`"${item.category}" kaydı silinsin mi?`)) return;
    deleteMutation.mutate(item.id);
  };

  const filtered = typeFilter === "all" ? rows : rows.filter((r) => r.type === typeFilter);

  const totalIncome = rows.filter((r) => r.type === "income").reduce((s, r) => s + parseFloat(r.amount), 0);
  const totalExpense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + parseFloat(r.amount), 0);
  const net = totalIncome - totalExpense;

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Receipt className="h-6 w-6 text-primary" /> Masraflar & Ek Gelirler
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Aylık gelir ve gider kayıtları</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5">
              <Upload className="h-4 w-4" /> Banka Ekstresi
            </Button>
            <Button variant="outline" onClick={() => setCardImportOpen(true)} className="gap-1.5">
              <Upload className="h-4 w-4" /> Kart Ekstresi
            </Button>
            <Button onClick={() => { setEditItem(null); setDialogOpen(true); }} className="gap-1.5">
              <Plus className="h-4 w-4" /> Yeni Kayıt
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS_TR.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            {(["all", "income", "expense"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  typeFilter === t
                    ? t === "income" ? "bg-emerald-600 text-white border-emerald-600"
                      : t === "expense" ? "bg-red-600 text-white border-red-600"
                      : "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "all" ? "Tümü" : t === "income" ? "Gelir" : "Gider"}
              </button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs text-emerald-700 font-medium mb-1">Toplam Gelir</p>
            <p className="text-lg font-bold text-emerald-700">{fmtTRY(totalIncome)}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs text-red-700 font-medium mb-1">Toplam Gider</p>
            <p className="text-lg font-bold text-red-700">{fmtTRY(totalExpense)}</p>
          </div>
          <div className={`rounded-xl border p-4 ${net >= 0 ? "border-blue-200 bg-blue-50" : "border-orange-200 bg-orange-50"}`}>
            <p className={`text-xs font-medium mb-1 ${net >= 0 ? "text-blue-700" : "text-orange-700"}`}>Net</p>
            <p className={`text-lg font-bold ${net >= 0 ? "text-blue-700" : "text-orange-700"}`}>{fmtTRY(net)}</p>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="grid grid-cols-[1fr_2fr_auto_1fr_auto] gap-4 px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <div>Tarih</div>
            <div>Kategori</div>
            <div>Tür</div>
            <div className="text-right">Tutar</div>
            <div />
          </div>

          {isLoading && (
            <div className="p-8 text-center text-sm text-muted-foreground">Yükleniyor…</div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="p-12 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Bu ay için kayıt bulunamadı</p>
              <p className="text-xs text-muted-foreground mt-1">Yeni kayıt eklemek için butona tıklayın</p>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="divide-y divide-border">
              {filtered.map((row: any) => (
                <div key={row.id} className="grid grid-cols-[1fr_2fr_auto_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors group">
                  <div className="text-sm text-muted-foreground">
                    {row.date ? format(new Date(row.date + "T12:00:00"), "dd.MM.yyyy") : "—"}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{row.category}</p>
                    {row.employeeName && (
                      <p className="text-xs text-blue-700 font-medium truncate">{row.employeeName}</p>
                    )}
                    {row.notes && <p className="text-xs text-muted-foreground truncate">{row.notes}</p>}
                  </div>
                  <div>
                    {row.type === "income" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <TrendingUp className="h-3 w-3" /> Gelir
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                        <TrendingDown className="h-3 w-3" /> Gider
                      </span>
                    )}
                  </div>
                  <div className={`text-right text-sm font-semibold ${row.type === "income" ? "text-emerald-700" : "text-red-700"}`}>
                    {row.type === "income" ? "+" : "-"}{fmtTRY(parseFloat(row.amount))}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1 rounded text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditItem(row); setDialogOpen(true); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="p-1 rounded text-muted-foreground hover:text-red-600"
                      onClick={() => handleDelete(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground flex justify-between items-center">
              <span>{filtered.length} kayıt</span>
              {typeFilter === "all" && (
                <span className={`font-semibold text-sm ${net >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                  Net: {net >= 0 ? "+" : ""}{fmtTRY(net)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {dialogOpen && (
        <ExpenseDialog
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditItem(null); }}
          initial={editItem}
        />
      )}
      <BankStatementImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <CreditCardImportDialog open={cardImportOpen} onOpenChange={setCardImportOpen} />
    </Layout>
  );
}
