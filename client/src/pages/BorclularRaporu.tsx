import { SortTh, SortableRows } from "@/components/SortTh";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import * as XLSX from "xlsx";

interface DebtorRow {
  fonzip_user_id: number;
  employee_id: number | null;
  membership_no: string | null;
  user_name: string;
  employee_name: string | null;
  employee_email: string | null;
  total_financial: string;
  synced_at: string | null;
}

function fmtTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " ₺";
}

export default function BorclularRaporu() {
  const { data, isLoading } = useQuery<DebtorRow[]>({
    queryKey: ["/api/fonzip/user-financials"],
    queryFn: () => fetch("/api/fonzip/user-financials", { credentials: "include" }).then((r) => r.json()),
  });

  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + parseFloat(r.total_financial), 0);

  const handleExport = () => {
    if (!rows.length) return;
    const sheet = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        "Danışman": r.employee_name ?? r.user_name,
        "Üye No": r.membership_no ?? "",
        "Borç": parseFloat(r.total_financial),
        "Son Senkron": r.synced_at ?? "",
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Borçlular");
    XLSX.writeFile(wb, `borclular-raporu-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertCircle className="h-6 w-6 text-red-600" /> Borçlular Raporu
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Fonzip üzerinden senkronize edilmiş, borcu {'>'} 0 olan danışmanlar — büyükten küçüğe sıralı
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={!rows.length}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Excel'e Aktar
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : !rows.length ? (
          <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
            Borcu olan danışman yok.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-red-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-red-700">{rows.length} danışman</h2>
              <span className="text-sm font-bold text-red-700">Toplam: {fmtTRY(total)}</span>
            </div>
            <SortableRows
              rows={rows}
              getters={{ name: (r: DebtorRow) => r.employee_name ?? r.user_name, debt: (r: DebtorRow) => parseFloat(r.total_financial), membership_no: (r: DebtorRow) => r.membership_no, synced_at: (r: DebtorRow) => r.synced_at }}
              initial={{ key: "debt", dir: "desc" }}
            >{({ sorted, sort, toggle }) => (
            <table className="w-full text-sm [&_td]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground [&_th]:py-2 [&_th]:px-4">
                  <SortTh label="Danışman" sortKey="name" sort={sort} onSort={toggle} />
                  <SortTh label="Üye No" sortKey="membership_no" sort={sort} onSort={toggle} />
                  <SortTh label="Borç" sortKey="debt" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                  <SortTh label="Son Senkron" sortKey="synced_at" sort={sort} onSort={toggle} align="right" firstDir="desc" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.fonzip_user_id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 px-4 font-medium max-w-[320px] truncate" title={r.employee_name ?? r.user_name}>{r.employee_name ?? r.user_name}</td>
                    <td className="py-2.5 px-4 text-muted-foreground font-mono text-xs">{r.membership_no ?? "—"}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-red-700 tabular-nums">{fmtTRY(parseFloat(r.total_financial))}</td>
                    <td className="py-2.5 px-4 text-right text-xs text-muted-foreground tabular-nums">
                      {r.synced_at ? format(new Date(r.synced_at), "d MMM yyyy", { locale: tr }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}</SortableRows>
          </div>
        )}
      </div>
    </Layout>
  );
}
