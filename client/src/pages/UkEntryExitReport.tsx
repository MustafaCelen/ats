import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { Users, UserPlus, UserMinus, FileSpreadsheet } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import * as XLSX from "xlsx";

function formatYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface UkEntryExitData {
  entries: { employeeId: number; name: string; kwuid: string | null; startDate: string | null; office: string | null; status: string }[];
  exits: { employeeId: number; name: string; kwuid: string | null; ukEndDate: string; office: string | null; status: string }[];
}

// Giriş tarihi olarak employees.startDate (şirkete giriş) kullanılıyor — ÜK koçluğu işe
// başlamayla başlıyor, ayrı bir "ÜK giriş tarihi" alanı yok (kasıtlı, bkz. server tarafı).
export default function UkEntryExitReport() {
  const [from, setFrom] = useState(() => formatYMD(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [to, setTo] = useState(() => formatYMD(new Date()));
  const [includePassive, setIncludePassive] = useState(false);

  const { data, isLoading } = useQuery<UkEntryExitData>({
    queryKey: ["/api/coaching/uk-entry-exit", from, to, includePassive],
    queryFn: () =>
      fetch(`/api/coaching/uk-entry-exit?startDate=${from}&endDate=${to}&includePassive=${includePassive}`, { credentials: "include" }).then((r) =>
        r.json()
      ),
    enabled: !!from && !!to,
  });

  const fmtDate = (d: string) => format(new Date(d), "d MMM yyyy", { locale: tr });

  const handleExport = () => {
    if (!data) return;
    const entrySheet = XLSX.utils.json_to_sheet(
      data.entries.map((e) => ({
        "Ad Soyad": e.name,
        Ofis: e.office ?? "",
        KWUID: e.kwuid ?? "",
        "Giriş Tarihi": e.startDate ?? "",
        Durum: e.status === "passive" ? "Pasif" : "Aktif",
      }))
    );
    const exitSheet = XLSX.utils.json_to_sheet(
      data.exits.map((e) => ({
        "Ad Soyad": e.name,
        Ofis: e.office ?? "",
        KWUID: e.kwuid ?? "",
        "Çıkış Tarihi": e.ukEndDate,
        Durum: e.status === "passive" ? "Pasif" : "Aktif",
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, entrySheet, "Giriş Yapanlar");
    XLSX.utils.book_append_sheet(wb, exitSheet, "Çıkış Yapanlar");
    XLSX.writeFile(wb, `uk-giris-cikis-${from}_${to}.xlsx`);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> ÜK Giriş / Çıkış Listesi
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Seçilen tarih aralığında Üretkenlik Koçluğu'na giriş yapan ve çıkış yapan danışmanlar
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={includePassive}
                onChange={(e) => setIncludePassive(e.target.checked)}
              />
              Pasif danışmanları da göster
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-sm text-muted-foreground">—</span>
              <input
                type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={!data || isLoading}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel'e Aktar
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-emerald-50">
                <h2 className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                  <UserPlus className="h-4 w-4" /> Giriş Yapanlar ({data?.entries.length ?? 0})
                </h2>
              </div>
              <div className="p-4">
                {!data?.entries.length ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Bu aralıkta ÜK'ya giriş yapan yok.</p>
                ) : (
                  <div className="space-y-2">
                    {data.entries.map((e) => (
                      <div key={e.employeeId} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                        <div className="min-w-0">
                          <span className="font-medium truncate">{e.name}</span>
                          {e.office && <span className="text-xs text-muted-foreground ml-1.5">({e.office})</span>}
                          {e.status === "passive" && (
                            <span className="ml-1.5 rounded border border-slate-300 bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500">Pasif</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                          {e.startDate ? fmtDate(e.startDate) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-rose-50">
                <h2 className="text-sm font-semibold text-rose-700 flex items-center gap-1.5">
                  <UserMinus className="h-4 w-4" /> Çıkış Yapanlar ({data?.exits.length ?? 0})
                </h2>
              </div>
              <div className="p-4">
                {!data?.exits.length ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Bu aralıkta ÜK'dan çıkış yapan yok.</p>
                ) : (
                  <div className="space-y-2">
                    {data.exits.map((e) => (
                      <div key={e.employeeId} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                        <div className="min-w-0">
                          <span className="font-medium truncate">{e.name}</span>
                          {e.office && <span className="text-xs text-muted-foreground ml-1.5">({e.office})</span>}
                          {e.status === "passive" && (
                            <span className="ml-1.5 rounded border border-slate-300 bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500">Pasif</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                          {fmtDate(e.ukEndDate)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
