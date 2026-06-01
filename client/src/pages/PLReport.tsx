import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight } from "lucide-react";
import { INCOME_CATEGORIES, EXPENSE_CATEGORY_GROUPS } from "@shared/schema";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

const MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i);

const ALL_EXPENSE_CATEGORIES = EXPENSE_CATEGORY_GROUPS.flatMap((g) => g.items);

function fmtTRY(n: number, opts?: { compact?: boolean }) {
  if (opts?.compact && Math.abs(n) >= 1_000_000) {
    return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n / 1_000_000) + " M₺";
  }
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " ₺";
}

type MonthData = {
  month: number;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
  totalIncome: number;
  totalExpenses: number;
  net: number;
};

export default function PLReport() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  const { data: months = [], isLoading } = useQuery<MonthData[]>({
    queryKey: ["/api/office-expenses/monthly-pl", year],
    queryFn: async () => {
      const res = await fetch(`/api/office-expenses/monthly-pl?year=${year}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const yearTotals = months.reduce(
    (acc, m) => ({
      income: acc.income + m.totalIncome,
      expenses: acc.expenses + m.totalExpenses,
      net: acc.net + m.net,
    }),
    { income: 0, expenses: 0, net: 0 }
  );

  // Annual totals per income category
  const annualIncomeByCategory: Record<string, number> = {};
  const annualExpenseByCategory: Record<string, number> = {};
  for (const m of months) {
    for (const [cat, val] of Object.entries(m.incomeByCategory)) {
      annualIncomeByCategory[cat] = (annualIncomeByCategory[cat] ?? 0) + val;
    }
    for (const [cat, val] of Object.entries(m.expenseByCategory)) {
      annualExpenseByCategory[cat] = (annualExpenseByCategory[cat] ?? 0) + val;
    }
  }

  const toggleMonth = (m: number) => setExpandedMonth((prev) => (prev === m ? null : m));

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold">Kâr / Zarar Raporu</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Aylık gelir-gider dengesi</p>
          </div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Annual summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs text-emerald-700 font-medium mb-1 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Yıllık Toplam Gelir
            </p>
            <p className="text-xl font-bold text-emerald-700">{fmtTRY(yearTotals.income)}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs text-red-700 font-medium mb-1 flex items-center gap-1">
              <TrendingDown className="h-3.5 w-3.5" /> Yıllık Toplam Gider
            </p>
            <p className="text-xl font-bold text-red-700">{fmtTRY(yearTotals.expenses)}</p>
          </div>
          <div className={`rounded-xl border p-4 ${yearTotals.net >= 0 ? "border-blue-200 bg-blue-50" : "border-orange-200 bg-orange-50"}`}>
            <p className={`text-xs font-medium mb-1 flex items-center gap-1 ${yearTotals.net >= 0 ? "text-blue-700" : "text-orange-700"}`}>
              <Minus className="h-3.5 w-3.5" /> Net Kâr / Zarar
            </p>
            <p className={`text-xl font-bold ${yearTotals.net >= 0 ? "text-blue-700" : "text-orange-700"}`}>
              {yearTotals.net >= 0 ? "+" : ""}{fmtTRY(yearTotals.net)}
            </p>
          </div>
        </div>

        {/* Bar Chart */}
        {!isLoading && (
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold mb-4">Aylık Gelir / Gider Karşılaştırması</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={months.map((m) => ({
                  name: MONTHS_TR[m.month - 1].slice(0, 3),
                  Gelir: Math.round(m.totalIncome),
                  Gider: Math.round(m.totalExpenses),
                  Net: Math.round(m.net),
                }))}
                margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                barCategoryGap="25%"
                barGap={2}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value) + " ₺",
                    name,
                  ]}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Bar dataKey="Gelir" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gider" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Net"   fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Month-by-month table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <div>Ay</div>
            <div className="text-right text-emerald-700">Gelir</div>
            <div className="text-right text-red-700">Gider</div>
            <div className="text-right">Net</div>
            <div className="w-6" />
          </div>

          {isLoading && (
            <div className="p-8 text-center text-sm text-muted-foreground">Yükleniyor…</div>
          )}

          {!isLoading && (
            <div className="divide-y divide-border">
              {months.map((m) => {
                const isExpanded = expandedMonth === m.month;
                const hasData = m.totalIncome > 0 || m.totalExpenses > 0;

                return (
                  <div key={m.month}>
                    {/* Month summary row */}
                    <button
                      type="button"
                      className={`w-full grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors text-left ${!hasData ? "opacity-50" : ""}`}
                      onClick={() => hasData && toggleMonth(m.month)}
                    >
                      <div className="font-medium text-sm">{MONTHS_TR[m.month - 1]} {year}</div>
                      <div className="text-right text-sm text-emerald-700 font-medium">
                        {m.totalIncome > 0 ? fmtTRY(m.totalIncome) : "—"}
                      </div>
                      <div className="text-right text-sm text-red-700 font-medium">
                        {m.totalExpenses > 0 ? fmtTRY(m.totalExpenses) : "—"}
                      </div>
                      <div className={`text-right text-sm font-bold ${
                        !hasData ? "text-muted-foreground" :
                        m.net > 0 ? "text-blue-700" : m.net < 0 ? "text-orange-700" : "text-muted-foreground"
                      }`}>
                        {hasData ? (m.net >= 0 ? "+" : "") + fmtTRY(m.net) : "—"}
                      </div>
                      <div className="w-6 flex items-center justify-center">
                        {hasData && (
                          isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="bg-muted/10 border-t border-border/50 px-4 py-4 space-y-5">
                        {/* Income breakdown */}
                        {m.totalIncome > 0 && (
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-2 flex items-center gap-1.5">
                              <TrendingUp className="h-3.5 w-3.5" /> Gelir Kalemleri
                            </p>
                            <div className="rounded-lg border border-emerald-200 overflow-hidden">
                              <table className="w-full text-sm">
                                <tbody>
                                  {/* BM Gelirleri first — auto-calculated from closings */}
                                  {m.incomeByCategory["BM Gelirleri"] > 0 && (
                                    <tr className="border-b border-emerald-100 bg-emerald-50/60">
                                      <td className="px-3 py-2 font-medium text-emerald-900 flex items-center gap-1.5">
                                        BM Gelirleri
                                        <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-semibold">Otomatik</span>
                                      </td>
                                      <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmtTRY(m.incomeByCategory["BM Gelirleri"])}</td>
                                    </tr>
                                  )}
                                  {/* Manual income categories */}
                                  {INCOME_CATEGORIES.filter((cat) => m.incomeByCategory[cat] > 0).map((cat) => (
                                    <tr key={cat} className="border-b border-emerald-100 last:border-0">
                                      <td className="px-3 py-2 text-foreground">{cat}</td>
                                      <td className="px-3 py-2 text-right font-medium text-emerald-700">{fmtTRY(m.incomeByCategory[cat])}</td>
                                    </tr>
                                  ))}
                                  {/* Any other unlisted categories */}
                                  {Object.entries(m.incomeByCategory)
                                    .filter(([cat]) => cat !== "BM Gelirleri" && !(INCOME_CATEGORIES as readonly string[]).includes(cat))
                                    .map(([cat, val]) => (
                                      <tr key={cat} className="border-b border-emerald-100 last:border-0">
                                        <td className="px-3 py-2 text-foreground">{cat}</td>
                                        <td className="px-3 py-2 text-right font-medium text-emerald-700">{fmtTRY(val)}</td>
                                      </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-emerald-50">
                                  <tr>
                                    <td className="px-3 py-2 font-bold text-emerald-800">Toplam Gelir</td>
                                    <td className="px-3 py-2 text-right font-bold text-emerald-800">{fmtTRY(m.totalIncome)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Expense breakdown */}
                        {m.totalExpenses > 0 && (
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-red-700 mb-2 flex items-center gap-1.5">
                              <TrendingDown className="h-3.5 w-3.5" /> Gider Kalemleri
                            </p>
                            <div className="rounded-lg border border-red-200 overflow-hidden">
                              <table className="w-full text-sm">
                                <tbody>
                                  {EXPENSE_CATEGORY_GROUPS.map((g) => {
                                    const items = g.items.filter((item) => m.expenseByCategory[item] > 0);
                                    if (items.length === 0) return null;
                                    return (
                                      <>
                                        <tr key={`group-${g.group}`} className="bg-red-50/50">
                                          <td colSpan={2} className="px-3 py-1.5 text-xs font-bold text-red-800 uppercase tracking-wide">{g.group}</td>
                                        </tr>
                                        {items.map((item) => (
                                          <tr key={item} className="border-b border-red-100 last:border-0">
                                            <td className="px-3 py-2 pl-6 text-foreground">{item}</td>
                                            <td className="px-3 py-2 text-right font-medium text-red-700">{fmtTRY(m.expenseByCategory[item])}</td>
                                          </tr>
                                        ))}
                                      </>
                                    );
                                  })}
                                  {/* Any uncategorized expenses */}
                                  {Object.entries(m.expenseByCategory)
                                    .filter(([cat]) => !ALL_EXPENSE_CATEGORIES.includes(cat))
                                    .map(([cat, val]) => (
                                      <tr key={cat} className="border-b border-red-100 last:border-0">
                                        <td className="px-3 py-2 text-foreground">{cat}</td>
                                        <td className="px-3 py-2 text-right font-medium text-red-700">{fmtTRY(val)}</td>
                                      </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-red-50">
                                  <tr>
                                    <td className="px-3 py-2 font-bold text-red-800">Toplam Gider</td>
                                    <td className="px-3 py-2 text-right font-bold text-red-800">{fmtTRY(m.totalExpenses)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Net summary */}
                        <div className={`rounded-lg border p-3 flex justify-between items-center ${m.net >= 0 ? "border-blue-200 bg-blue-50" : "border-orange-200 bg-orange-50"}`}>
                          <span className={`font-bold text-sm ${m.net >= 0 ? "text-blue-800" : "text-orange-800"}`}>
                            Net Kâr / Zarar
                          </span>
                          <span className={`font-bold text-lg ${m.net >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                            {m.net >= 0 ? "+" : ""}{fmtTRY(m.net)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Annual totals footer */}
          {!isLoading && (
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-t-2 border-border bg-muted/40 font-semibold text-sm">
              <div>Yıl Toplamı</div>
              <div className="text-right text-emerald-700">{fmtTRY(yearTotals.income)}</div>
              <div className="text-right text-red-700">{fmtTRY(yearTotals.expenses)}</div>
              <div className={`text-right font-bold ${yearTotals.net >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                {yearTotals.net >= 0 ? "+" : ""}{fmtTRY(yearTotals.net)}
              </div>
              <div className="w-6" />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
