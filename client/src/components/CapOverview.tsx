// Cap Analizi: güncel cap durumu panelleri — Cap Yenileme Takvimi, Cap Yapanlar,
// Cap'e Yaklaşanlar, Cap Yapabilecekler. (Finansal Raporlar'dan taşındı.)
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

function fmtTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " ₺";
}

const MONTH_NAMES_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const MONTH_NAMES_LONG = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

function useCapStatuses() {
  return useQuery<Record<string, any>>({
    queryKey: ["/api/employees/cap-statuses"],
    queryFn: async () => {
      const res = await fetch("/api/employees/cap-statuses", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Mevcut hızla dönem sonuna kadar cap'e ulaşır mı?
function projection(s: any) {
  const today = new Date();
  const start = new Date(s.periodStart);
  const monthsElapsed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  const monthsRemaining = 12 - monthsElapsed;
  const ratePerMonth = monthsElapsed > 0 ? s.capUsed / monthsElapsed : 0;
  const projected = s.capUsed + ratePerMonth * monthsRemaining;
  return { monthsElapsed, monthsRemaining, projected, projPct: s.capAmount > 0 ? Math.round((projected / s.capAmount) * 100) : 0 };
}

export function CapOverview() {
  const { data: capStatuses = {} } = useCapStatuses();

  const capList = useMemo(() => {
    return Object.values(capStatuses as Record<string, any>)
      .filter((s: any) => s.capAmount !== null)
      .map((s: any) => ({ ...s, pct: s.capAmount > 0 ? Math.min(100, Math.round((s.capUsed / s.capAmount) * 100)) : 0 }))
      .sort((a: any, b: any) => b.pct - a.pct);
  }, [capStatuses]);

  const cappers       = capList.filter((s: any) => s.pct >= 100);
  const almostCappers = capList.filter((s: any) => s.pct >= 75 && s.pct < 100);
  const probableCappers = useMemo(() => capList.filter((s: any) => {
    if (s.pct >= 75 || !s.periodStart || s.capAmount <= 0) return false;
    const p = projection(s);
    return p.monthsElapsed > 0 && p.monthsRemaining > 0 && p.projected >= s.capAmount;
  }), [capList]);

  const capResetMonth = (s: any): string | null => s.periodStart ? MONTH_NAMES_TR[new Date(s.periodStart).getMonth()] : null;

  // Üretken + muhtemel capper'lar cap döneminin başladığı aya göre gruplanır
  const resetByMonth = useMemo(() => {
    const map: Record<number, any[]> = {};
    for (let i = 0; i < 12; i++) map[i] = [];
    const currentMonthIdx = new Date().getMonth();
    const productiveSet = new Set([...cappers, ...almostCappers, ...probableCappers].map((s: any) => s.employeeId));
    for (const s of capList) {
      if (!s.periodStart) continue;
      const resetMonth = new Date(s.periodStart).getMonth();
      const prevPct = s.capAmount > 0 ? (s.prevCapUsed ?? 0) / s.capAmount * 100 : 0;
      if (productiveSet.has(s.employeeId) || (resetMonth === currentMonthIdx && prevPct >= 75)) map[resetMonth].push(s);
    }
    return map;
  }, [capList, cappers, almostCappers, probableCappers]);

  const Row = ({ s, tone, right }: { s: any; tone: string; right: React.ReactNode }) => (
    <div className="px-5 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{s.name}</div>
        <div className="text-xs text-muted-foreground">{s.kwuid || "—"}</div>
      </div>
      {capResetMonth(s) && <span className={`text-xs border px-2 py-0.5 rounded-full shrink-0 ${tone}`}>{capResetMonth(s)}</span>}
      <div className="text-right shrink-0">{right}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Cap Yenileme Takvimi ── */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold">Cap Yenileme Takvimi</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Her danışmanın cap döneminin başladığı ay</p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 divide-x divide-y divide-border/50">
          {MONTH_NAMES_LONG.map((monthName, i) => {
            const agents = resetByMonth[i] ?? [];
            const isCurrentMonth = i === new Date().getMonth();
            return (
              <div key={i} className={`p-3 min-h-[110px] ${isCurrentMonth ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}>
                <div className={`text-xs font-semibold mb-2 ${isCurrentMonth ? "text-blue-600" : "text-muted-foreground"}`}>{monthName}</div>
                {agents.length === 0 ? <div className="text-xs text-muted-foreground/50">—</div> : (
                  <div className="space-y-1">
                    {agents.map((s: any) => (
                      <div key={s.employeeId} className="flex items-center gap-1">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${s.pct >= 100 ? "bg-emerald-500" : s.pct >= 75 ? "bg-amber-500" : "bg-muted-foreground/40"}`} />
                        <span className="text-xs truncate leading-tight">{s.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Capper listeleri (sabit yükseklik, kendi içinde kayar) ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">✓</span>
            <h2 className="text-base font-semibold">Cap Yapanlar</h2>
            <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">{cappers.length} danışman</span>
          </div>
          {cappers.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Henüz cap yapan danışman yok</div> : (
            <div className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
              {cappers.map((s: any) => (
                <Row key={s.employeeId} s={s} tone="bg-emerald-50 text-emerald-700 border-emerald-200" right={<>
                  <div className="text-xs font-semibold text-emerald-600">{fmtTRY(s.capUsed)} / {fmtTRY(s.capAmount)}</div>
                  <div className="text-xs text-muted-foreground">{s.pct}% kullanıldı</div>
                </>} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">!</span>
            <h2 className="text-base font-semibold">Cap'e Yaklaşanlar</h2>
            <span className="ml-auto text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">{almostCappers.length} danışman</span>
          </div>
          {almostCappers.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">75% eşiğinde danışman yok</div> : (
            <div className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
              {almostCappers.map((s: any) => (
                <Row key={s.employeeId} s={s} tone="bg-amber-50 text-amber-700 border-amber-200" right={<>
                  <div className="text-xs font-semibold text-amber-600">{fmtTRY(s.capUsed)} / {fmtTRY(s.capAmount)}</div>
                  <div className="text-xs text-muted-foreground">{fmtTRY(s.capRemaining ?? 0)} kaldı · {s.pct}%</div>
                </>} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">~</span>
            <h2 className="text-base font-semibold">Cap Yapabilecekler</h2>
            <span className="ml-auto text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">{probableCappers.length} danışman</span>
          </div>
          {probableCappers.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Mevcut hızda cap yapabilecek danışman yok</div> : (
            <div className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
              {probableCappers.map((s: any) => (
                <Row key={s.employeeId} s={s} tone="bg-blue-50 text-blue-700 border-blue-200" right={<>
                  <div className="text-xs font-semibold text-blue-600">{s.pct}% → proj. {projection(s).projPct}%</div>
                  <div className="text-xs text-muted-foreground">{fmtTRY(s.capUsed)} / {fmtTRY(s.capAmount)}</div>
                </>} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
