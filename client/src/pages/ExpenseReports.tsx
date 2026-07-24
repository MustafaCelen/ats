import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BarChart3, Filter, Receipt, TrendingUp, Target, Pencil } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  LineChart, Line,
} from "recharts";
import { EXPENSE_CATEGORY_GROUPS, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface BreakdownRow {
  month: string;
  type: "income" | "expense";
  category: string;
  count: number;
  total: string;
}

interface TopRow {
  id: number;
  date: string;
  type: string;
  category: string;
  amount: string;
  notes: string | null;
  employee_id: number | null;
}

const fmtTRY = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);

const fmtTRYFull = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(n);

// Grup renkleri (readability için kontrast)
const GROUP_COLORS: Record<string, string> = {
  "KW & Teknoloji":         "#3b82f6",
  "Personel":               "#ef4444",
  "Ulaşım":                 "#f59e0b",
  "Ofis & Genel Giderler":  "#10b981",
  "KW Etkinlik & Eğitim":   "#8b5cf6",
  "Pazarlama & Reklam":     "#ec4899",
  "Portaller":              "#06b6d4",
  "Danışmanlık":            "#84cc16",
  "Vergi & Yasal":          "#64748b",
  "Gelir":                  "#22c55e",
  "Diğer":                  "#94a3b8",
};

// kategori → grup lookup
const categoryToGroup = new Map<string, string>();
for (const g of EXPENSE_CATEGORY_GROUPS) {
  for (const c of g.items) categoryToGroup.set(c, g.group);
}

function ymToLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  return `${months[m - 1]} ${y}`;
}

function shiftYM(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const VAT_RATE = 0.20;

interface ExpenseTarget {
  id: number;
  year: number;
  month: number;
  type: "income" | "expense";
  category: string;
  amount: string;
}

export default function ExpenseReports() {
  const today = currentYM();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [startMonth, setStartMonth] = useState(shiftYM(today, -4));
  const [endMonth, setEndMonth] = useState(today);
  const [type, setType] = useState<"expense" | "income" | "all">("expense");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [excludeVat, setExcludeVat] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);

  const adj = (n: number) => excludeVat ? n / (1 + VAT_RATE) : n;

  // Hedefler için ana yıl/ay (endMonth kullanılır)
  const [targetY, targetM] = endMonth.split("-").map(Number);

  const { data: targets = [] } = useQuery<ExpenseTarget[]>({
    queryKey: ["/api/expense-targets", targetY, targetM],
    queryFn: () => fetch(`/api/expense-targets?year=${targetY}&month=${targetM}`, { credentials: "include" }).then(r => r.json()),
  });

  const saveTargetMutation = useMutation({
    mutationFn: async (payload: { category: string; type: "income" | "expense"; amount: number }) => {
      const res = await fetch("/api/expense-targets", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: targetY, month: targetM, ...payload }),
      });
      if (!res.ok) throw new Error("Kayıt başarısız");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/expense-targets"] });
    },
    onError: () => toast({ title: "Kaydedilemedi", variant: "destructive" }),
  });

  const { data: rawBreakdown = [], isLoading } = useQuery<BreakdownRow[]>({
    queryKey: ["/api/office-expenses/reports/breakdown", startMonth, endMonth, type],
    queryFn: () => {
      const params = new URLSearchParams({ startMonth, endMonth });
      if (type !== "all") params.set("type", type);
      return fetch(`/api/office-expenses/reports/breakdown?${params}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const { data: rawTopTransactions = [] } = useQuery<TopRow[]>({
    queryKey: ["/api/office-expenses/reports/top", startMonth, endMonth, type, selectedCategory],
    queryFn: () => {
      const params = new URLSearchParams({ startMonth, endMonth, limit: "15" });
      if (type !== "all") params.set("type", type);
      if (selectedCategory) params.set("category", selectedCategory);
      return fetch(`/api/office-expenses/reports/top?${params}`, { credentials: "include" }).then(r => r.json());
    },
  });

  // KDV dönüşümü — memoize edilmiş
  const breakdown = useMemo(
    () => rawBreakdown.map(r => ({ ...r, total: String(adj(parseFloat(r.total))) })),
    [rawBreakdown, excludeVat]
  );
  const topTransactions = useMemo(
    () => rawTopTransactions.map(t => ({ ...t, amount: String(adj(parseFloat(t.amount))) })),
    [rawTopTransactions, excludeVat]
  );

  // ── Türetilen veriler ────────────────────────────────────────────────
  const months = useMemo(() => {
    const set = new Set<string>();
    let cur = startMonth;
    for (let i = 0; i < 24 && cur <= endMonth; i++) {
      set.add(cur);
      cur = shiftYM(cur, 1);
    }
    return Array.from(set);
  }, [startMonth, endMonth]);

  // Ay bazlı, grup bazlı toplam (stacked bar için)
  const monthlyByGroup = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const m of months) map.set(m, {});
    for (const r of breakdown) {
      const group = r.type === "income" ? "Gelir" : (categoryToGroup.get(r.category) ?? "Diğer");
      const monthMap = map.get(r.month);
      if (!monthMap) continue;
      monthMap[group] = (monthMap[group] ?? 0) + parseFloat(r.total);
    }
    return months.map(m => ({
      month: ymToLabel(m),
      raw: m,
      ...map.get(m)!,
    }));
  }, [breakdown, months]);

  // Toplam grup listesi (chart legend için)
  const activeGroups = useMemo(() => {
    const set = new Set<string>();
    for (const row of monthlyByGroup) {
      for (const k of Object.keys(row)) {
        if (k !== "month" && k !== "raw") set.add(k);
      }
    }
    return Array.from(set).sort();
  }, [monthlyByGroup]);

  // Kategori bazlı toplam ve grup dağılımı (tablo için)
  const categoryTotals = useMemo(() => {
    const map = new Map<string, { category: string; group: string; total: number; count: number; monthCount: number }>();
    for (const r of breakdown) {
      const key = r.category;
      const group = r.type === "income" ? "Gelir" : (categoryToGroup.get(r.category) ?? "Diğer");
      if (!map.has(key)) map.set(key, { category: r.category, group, total: 0, count: 0, monthCount: 0 });
      const agg = map.get(key)!;
      agg.total += parseFloat(r.total);
      agg.count += r.count;
      agg.monthCount++;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [breakdown]);

  const grandTotal = categoryTotals.reduce((s, r) => s + r.total, 0);

  // Top 5 kategori için trend (line chart)
  const top5Categories = categoryTotals.slice(0, 5).map(c => c.category);
  const categoryTrend = useMemo(() => {
    const catByMonth = new Map<string, Record<string, number>>();
    for (const m of months) catByMonth.set(m, {});
    for (const r of breakdown) {
      if (!top5Categories.includes(r.category)) continue;
      const monthMap = catByMonth.get(r.month);
      if (!monthMap) continue;
      monthMap[r.category] = (monthMap[r.category] ?? 0) + parseFloat(r.total);
    }
    return months.map(m => ({
      month: ymToLabel(m),
      ...top5Categories.reduce((acc, c) => { acc[c] = catByMonth.get(m)![c] ?? 0; return acc; }, {} as Record<string, number>),
    }));
  }, [breakdown, months, top5Categories]);

  // Grup bazlı toplam
  const groupTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of breakdown) {
      const group = r.type === "income" ? "Gelir" : (categoryToGroup.get(r.category) ?? "Diğer");
      map.set(group, (map.get(group) ?? 0) + parseFloat(r.total));
    }
    return Array.from(map.entries()).map(([group, total]) => ({ group, total })).sort((a, b) => b.total - a.total);
  }, [breakdown]);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Masraf Raporları
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Kategori bazlı detaylı analiz</p>
        </div>

        {/* Filtreler */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Filtreler</span>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Tip</Label>
                <Select value={type} onValueChange={(v: any) => setType(v)}>
                  <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Masraf</SelectItem>
                    <SelectItem value="income">Gelir</SelectItem>
                    <SelectItem value="all">Her ikisi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Başlangıç</Label>
                <Input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)} className="w-40 h-9" />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Bitiş</Label>
                <Input type="month" value={endMonth} onChange={e => setEndMonth(e.target.value)} className="w-40 h-9" />
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => { setStartMonth(today); setEndMonth(today); }}>Bu Ay</Button>
                <Button size="sm" variant="outline" onClick={() => { setStartMonth(shiftYM(today, -2)); setEndMonth(today); }}>3 Ay</Button>
                <Button size="sm" variant="outline" onClick={() => { setStartMonth(shiftYM(today, -5)); setEndMonth(today); }}>6 Ay</Button>
                <Button size="sm" variant="outline" onClick={() => { setStartMonth(shiftYM(today, -11)); setEndMonth(today); }}>1 Yıl</Button>
              </div>
              <Button
                size="sm"
                variant={excludeVat ? "default" : "outline"}
                onClick={() => setExcludeVat(v => !v)}
                title="Fonzip verileri KDV dahil geliyor. Bu toggle ile %20 KDV hariç görünür."
              >
                KDV Hariç {excludeVat ? "✓" : ""}
              </Button>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted-foreground">Toplam {excludeVat && <span className="text-[10px]">(KDV hariç)</span>}</p>
                <p className="text-lg font-bold">{fmtTRY(grandTotal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grup Toplam Kartları — tıklayınca içindeki kategoriler açılır (Katalog) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {groupTotals.map(({ group, total }) => {
            const isOpen = expandedGroup === group;
            return (
              <Card
                key={group}
                className={`cursor-pointer transition-all ${isOpen ? "ring-2 ring-primary shadow-md" : "hover:shadow-md"}`}
                onClick={() => setExpandedGroup(isOpen ? null : group)}
              >
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[group] ?? "#94a3b8" }} />
                    <p className="text-xs text-muted-foreground truncate">{group}</p>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {isOpen ? "▼" : "▶"}
                    </span>
                  </div>
                  <p className="text-lg font-bold">{fmtTRY(total)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {grandTotal > 0 ? `%${((total / grandTotal) * 100).toFixed(1)}` : "—"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Açılmış grubun kategori kırılımı (Katalog dip toplam içeriği) */}
        {expandedGroup && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[expandedGroup] ?? "#94a3b8" }} />
                {expandedGroup} — Kategori Kırılımı
                <button onClick={() => setExpandedGroup(null)} className="ml-auto text-xs underline text-muted-foreground hover:text-foreground">
                  Kapat
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Adet</TableHead>
                    <TableHead className="text-right">Toplam</TableHead>
                    <TableHead className="text-right">% (Grup içi)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoryTotals.filter(c => c.group === expandedGroup).map((c) => {
                    const groupTotal = groupTotals.find(g => g.group === expandedGroup)?.total ?? 1;
                    return (
                      <TableRow
                        key={c.category}
                        className="cursor-pointer hover:bg-primary/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCategory(selectedCategory === c.category ? null : c.category);
                        }}
                      >
                        <TableCell className="font-medium">{c.category}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{c.count}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtTRY(c.total)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          %{((c.total / groupTotal) * 100).toFixed(1)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Ay Bazlı Stacked Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Ay Bazlı Grup Dağılımı
            </CardTitle>
            <p className="text-xs text-muted-foreground">Her ayın toplam masrafı ve kategori gruplarına dağılımı</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground p-4 text-center">Yükleniyor...</div>
            ) : monthlyByGroup.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 text-center">Bu aralıkta veri yok</div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={monthlyByGroup} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" style={{ fontSize: "12px" }} />
                  <YAxis
                    style={{ fontSize: "11px" }}
                    tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()}
                  />
                  <Tooltip
                    formatter={(value: any) => fmtTRYFull(Number(value))}
                    contentStyle={{ backgroundColor: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {activeGroups.map(g => (
                    <Bar key={g} dataKey={g} stackId="a" fill={GROUP_COLORS[g] ?? "#94a3b8"} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top 5 Kategori Trend */}
        {top5Categories.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                En Yüksek 5 Kategori — Aylık Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={categoryTrend} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" style={{ fontSize: "12px" }} />
                  <YAxis
                    style={{ fontSize: "11px" }}
                    tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toString()}
                  />
                  <Tooltip
                    formatter={(value: any) => fmtTRYFull(Number(value))}
                    contentStyle={{ backgroundColor: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {top5Categories.map((c, i) => (
                    <Line key={c} type="monotone" dataKey={c} stroke={["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6"][i]} strokeWidth={2} dot={{ r: 3 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Aylık Toplam Hedefler ─ endMonth ayı için */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Aylık Toplam Hedefler — {targetM.toString().padStart(2, "0")}/{targetY}
              <button
                onClick={() => setTargetDialogOpen(true)}
                className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Pencil className="h-3 w-3" /> Hedef Düzenle
              </button>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Aylık toplam gelir ve gider hedefleri, gerçekleşen ile karşılaştırma
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(["income", "expense"] as const).map((ttype) => {
                const target = targets.find(t => t.type === ttype && t.category === "_TOTAL_");
                const targetAmt = target ? parseFloat(target.amount) : 0;
                const displayTarget = adj(targetAmt);
                // O ay için tüm kategorilerin toplamı
                const actualRow = rawBreakdown
                  .filter(r => r.month === `${targetY}-${String(targetM).padStart(2, "0")}` && r.type === ttype)
                  .reduce((s, r) => s + parseFloat(r.total), 0);
                const actual = adj(actualRow);
                const pct = displayTarget > 0 ? Math.round((actual / displayTarget) * 100) : 0;
                const isIncome = ttype === "income";
                const good = displayTarget === 0 ? true : (isIncome ? actual >= displayTarget : actual <= displayTarget);
                return (
                  <div key={ttype} className={`rounded-lg border p-4 ${isIncome ? "border-emerald-200 bg-emerald-50/30" : "border-red-200 bg-red-50/30"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${isIncome ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {isIncome ? "Aylık Toplam Gelir" : "Aylık Toplam Gider"}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-2xl font-bold">{fmtTRY(actual)}</span>
                      {displayTarget > 0 && (
                        <span className="text-sm text-muted-foreground">/ {fmtTRY(displayTarget)}</span>
                      )}
                    </div>
                    {displayTarget > 0 ? (
                      <>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full transition-all ${good ? "bg-emerald-500" : "bg-red-500"}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          %{pct} · {good ? "✓ hedef içinde" : (isIncome ? "hedefin altında" : "hedefi aştı")}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Hedef tanımlı değil</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Kategori Detay Tablosu */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Kategori Detayları</CardTitle>
            <p className="text-xs text-muted-foreground">Bir satıra tıklayınca "En Yüksek İşlemler" o kategoriye filtreler</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Grup</TableHead>
                  <TableHead className="text-right">İşlem Sayısı</TableHead>
                  <TableHead className="text-right">Toplam</TableHead>
                  <TableHead className="text-right">Ort. / Ay</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryTotals.map((r) => (
                  <TableRow
                    key={r.category}
                    onClick={() => setSelectedCategory(selectedCategory === r.category ? null : r.category)}
                    className={`cursor-pointer ${selectedCategory === r.category ? "bg-primary/10" : ""}`}
                  >
                    <TableCell className="font-medium">{r.category}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[r.group] ?? "#94a3b8" }} />
                        {r.group}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.count}</TableCell>
                    <TableCell className="text-right font-semibold">{fmtTRY(r.total)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.monthCount > 0 ? fmtTRY(r.total / r.monthCount) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {grandTotal > 0 ? `%${((r.total / grandTotal) * 100).toFixed(1)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* En Yüksek İşlemler */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              En Yüksek 15 İşlem
              {selectedCategory && (
                <span className="text-xs font-normal text-muted-foreground">
                  · <button onClick={() => setSelectedCategory(null)} className="underline">{selectedCategory} filtresini kaldır</button>
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Kayıt yok</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topTransactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{new Date(t.date).toLocaleDateString("tr-TR")}</TableCell>
                      <TableCell className="text-xs">{t.category}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate">{t.notes ?? "—"}</TableCell>
                      <TableCell className={`text-right font-medium ${t.type === "income" ? "text-emerald-700" : "text-red-600"}`}>
                        {fmtTRYFull(parseFloat(t.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {targetDialogOpen && (
        <TargetEditor
          open={targetDialogOpen}
          onOpenChange={setTargetDialogOpen}
          year={targetY}
          month={targetM}
          existingTargets={targets}
          onSave={(payload) => saveTargetMutation.mutate(payload)}
        />
      )}
    </Layout>
  );
}

// ── Hedef Düzenle Dialog (aylık toplam hedef) ────────────────────────────
function TargetEditor({
  open, onOpenChange, year, month, existingTargets, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: number;
  month: number;
  existingTargets: ExpenseTarget[];
  onSave: (p: { category: string; type: "income" | "expense"; amount: number }) => void;
}) {
  const currentIncome = existingTargets.find(t => t.type === "income" && t.category === "_TOTAL_");
  const currentExpense = existingTargets.find(t => t.type === "expense" && t.category === "_TOTAL_");

  const [incomeAmount, setIncomeAmount] = useState(currentIncome?.amount ?? "");
  const [expenseAmount, setExpenseAmount] = useState(currentExpense?.amount ?? "");

  const handleSave = () => {
    const inc = parseFloat(String(incomeAmount).replace(",", "."));
    const exp = parseFloat(String(expenseAmount).replace(",", "."));
    if (!isNaN(inc) && inc >= 0) onSave({ category: "_TOTAL_", type: "income", amount: inc });
    if (!isNaN(exp) && exp >= 0) onSave({ category: "_TOTAL_", type: "expense", amount: exp });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Aylık Hedef — {String(month).padStart(2, "0")}/{year}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            Aylık toplam hedefler (KDV dahil tutar girin). Boş bırakırsan mevcut değer korunur.
          </p>

          <div>
            <Label className="text-xs">Aylık Toplam Gelir Hedefi (₺)</Label>
            <Input
              type="text" inputMode="decimal"
              value={incomeAmount}
              onChange={(e) => setIncomeAmount(e.target.value)}
              placeholder="ör. 500000"
              className="mt-1"
            />
            {currentIncome && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Mevcut: {new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(parseFloat(currentIncome.amount))} ₺
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Aylık Toplam Gider Hedefi (₺)</Label>
            <Input
              type="text" inputMode="decimal"
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              placeholder="ör. 350000"
              className="mt-1"
            />
            {currentExpense && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Mevcut: {new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(parseFloat(currentExpense.amount))} ₺
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>İptal</Button>
          <Button onClick={handleSave}>Kaydet</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
