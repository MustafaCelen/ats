import { SortTh, SortableRows } from "@/components/SortTh";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, CheckCircle2 } from "lucide-react";

// Danışmanın Fonzip borcu — Employees diyaloğu ve aday profil sayfası ortak kullanır.
// Veri: GET /api/employees/:id/fonzip-debt (admin).

export type EmployeeFonzipDebt = {
  totalFinancial: number; // Fonzip bakiyesi (net borç, esas rakam)
  pendingTotal: number;   // açık (status=1) kalemlerin toplamı
  pendingCount: number;
  pendingDebts: { amount: number; details: string | null; period: string | null; operationDate: string | null }[];
};

function fmtTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " ₺";
}

export function useEmployeeFonzipDebt(employeeId: number | undefined, enabled = true) {
  return useQuery<EmployeeFonzipDebt>({
    queryKey: ["/api/employees", employeeId, "fonzip-debt"],
    queryFn: () => fetch(`/api/employees/${employeeId}/fonzip-debt`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!employeeId && enabled,
  });
}

export function hasDebt(d: EmployeeFonzipDebt | undefined): d is EmployeeFonzipDebt {
  return !!d && (d.totalFinancial > 0 || d.pendingCount > 0);
}

// Tek satır kırmızı özet (profil kartlarında). onClick verilirse Borç sekmesine atlar.
export function EmployeeDebtSummaryLine({ debt, onClick }: { debt: EmployeeFonzipDebt | undefined; onClick?: () => void }) {
  if (!hasDebt(debt)) return null;
  const inner = (
    <>
      <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
      <span className="text-sm text-red-700">
        <span className="font-semibold">Fonzip borcu {fmtTRY(Math.max(debt.totalFinancial, 0))}</span>
        {" "}· {debt.pendingCount} ödenmemiş kalem{onClick ? " — detay için Borç sekmesi" : ""}
      </span>
    </>
  );
  const cls = "w-full text-left rounded-lg bg-red-50 ring-1 ring-red-200 px-3 py-2 flex items-center gap-2";
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} hover:bg-red-100 transition-colors`}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}

// Mutabakat paneli: Fonzip tahsilatı kalemlere kendisi tahsis eder (tam kapanan kalem
// status=8 olur). Kısmi / toplu tahsilatın kaleme bağlanmamış kısmı bakiyeyi düşürür
// ama kalemler "açık" kalır → açık kalemler − bakiye = tahsis edilmemiş tahsilat.
// Bu tutar en eski kalemden başlayarak tahmini dağıtılır (FIFO) ve * ile işaretlenir.
export function EmployeeDebtPanel({ debt, kwuid }: { debt: EmployeeFonzipDebt | undefined; kwuid?: string | null }) {
  if (!debt) return <p className="text-sm text-muted-foreground">Yükleniyor…</p>;

  if (!hasDebt(debt)) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-emerald-700 gap-2">
        <CheckCircle2 className="h-8 w-8 opacity-60" />
        <p className="text-sm font-medium">Fonzip'te ödenmemiş borcu yok</p>
        {!kwuid && <p className="text-xs text-muted-foreground">KWUID tanımlı değil — Fonzip eşleşmesi yapılamıyor olabilir.</p>}
      </div>
    );
  }

  const bal = Math.max(debt.totalFinancial, 0);
  const unallocTotal = Math.max(debt.pendingTotal - bal, 0);

  // En eskiden yeniye sırala, bağlanmamış tahsilatı sırayla düş; gösterim yeniden eskiye.
  let unalloc = unallocTotal;
  const rows = [...debt.pendingDebts]
    .sort((a, b) => String(a.operationDate ?? "").localeCompare(String(b.operationDate ?? "")))
    .map((d) => {
      const covered = Math.min(d.amount, unalloc);
      unalloc -= covered;
      const remaining = d.amount - covered;
      const state: "kapandi" | "kismi" | "acik" = remaining <= 0.005 ? "kapandi" : covered > 0 ? "kismi" : "acik";
      return { ...d, remaining, state };
    })
    .reverse();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/40 ring-1 ring-border p-3">
          <p className="text-[11px] text-muted-foreground font-medium">Açık Kalemler ({debt.pendingCount})</p>
          <p className="text-base font-bold">{fmtTRY(debt.pendingTotal)}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-200 p-3">
          <p className="text-[11px] text-emerald-700/80 font-medium">Kaleme Bağlanmamış Tahsilat</p>
          <p className="text-base font-bold text-emerald-700">− {fmtTRY(unallocTotal)}</p>
        </div>
        <div className="rounded-lg bg-red-50 ring-1 ring-red-200 p-3">
          <p className="text-[11px] text-red-600/80 font-medium">Fonzip Bakiyesi (net borç)</p>
          <p className="text-base font-bold text-red-700">{fmtTRY(bal)}</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {unallocTotal >= 1
          ? "Kısmi veya toplu tahsilatlar Fonzip'te tek tek kalemlere eşleşmez; kaleme bağlanmamış tutar aşağıda en eski kalemden başlayarak tahmini dağıtıldı. Esas alınacak rakam Fonzip bakiyesidir."
          : "Tüm tahsilatlar kalemlere eşleşmiş; açık kalemler toplamı Fonzip bakiyesine eşit."}
      </p>
      <div className="rounded-lg border border-border overflow-hidden">
        <SortableRows rows={rows} getters={{ state: (d: any) => ({ acik: 0, kismi: 1, kapandi: 2 })[d.state as string] }}>{({ sorted, sort, toggle }) => (
        <table className="w-full text-xs [&_td]:whitespace-nowrap">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="[&_th]:px-3 [&_th]:py-2">
              <SortTh label="Tarih" sortKey="operationDate" sort={sort} onSort={toggle} firstDir="desc" />
              <SortTh label="Açıklama" sortKey="details" sort={sort} onSort={toggle} />
              <SortTh label="Tutar" sortKey="amount" sort={sort} onSort={toggle} align="right" firstDir="desc" />
              <SortTh label="Kalan" sortKey="remaining" sort={sort} onSort={toggle} align="right" firstDir="desc" />
              <SortTh label="Durum" sortKey="state" sort={sort} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((d, i) => (
              <tr key={i} className={`border-t border-border ${d.state === "kapandi" ? "text-muted-foreground" : ""}`}>
                <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                  {d.operationDate ? format(new Date(d.operationDate), "dd.MM.yyyy") : "—"}
                </td>
                <td className="px-3 py-1.5 max-w-[260px] truncate" title={d.details || undefined}>{d.details || "—"}</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">{fmtTRY(d.amount)}</td>
                <td className={`px-3 py-1.5 text-right font-medium whitespace-nowrap ${d.state === "kapandi" ? "" : "text-red-700"}`}>
                  {d.state === "kapandi" ? "—" : fmtTRY(d.remaining)}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {d.state === "kapandi" && <span className="rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-1.5 py-0.5 text-[10px] font-medium">Kapandı*</span>}
                  {d.state === "kismi" && <span className="rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-1.5 py-0.5 text-[10px] font-medium">Kısmi*</span>}
                  {d.state === "acik" && <span className="rounded-full bg-red-50 text-red-700 ring-1 ring-red-200 px-1.5 py-0.5 text-[10px] font-medium">Açık</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/30 border-t border-border">
            <tr>
              <td className="px-3 py-2 font-semibold" colSpan={2}>Toplam ({debt.pendingCount} kalem)</td>
              <td className="px-3 py-2 text-right font-semibold">{fmtTRY(debt.pendingTotal)}</td>
              <td className="px-3 py-2 text-right font-bold text-red-700">{fmtTRY(bal)}</td>
              <td className="px-3 py-2 text-[10px] text-muted-foreground">* tahmini dağılım</td>
            </tr>
          </tfoot>
        </table>
        )}</SortableRows>
      </div>
    </div>
  );
}
