import { useState } from "react";
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
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { INCOME_CATEGORIES, EXPENSE_CATEGORY_GROUPS } from "@shared/schema";

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
    mutate.mutate({ type, category, amount: String(parseFloat(amount.replace(",", "."))), date, notes: notes || null });
  };

  // Reset category when type changes
  const handleTypeChange = (t: "income" | "expense") => {
    setType(t);
    setCategory("");
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
              <Receipt className="h-6 w-6 text-primary" /> Masraflar
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Aylık gelir ve gider kayıtları</p>
          </div>
          <Button
            onClick={() => { setEditItem(null); setDialogOpen(true); }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" /> Yeni Kayıt
          </Button>
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
    </Layout>
  );
}
