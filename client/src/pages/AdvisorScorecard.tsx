import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { MapPin, Calendar, ChevronDown, ChevronRight, Building2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAdvisorScorecard, ScorecardAdvisorRow, ScorecardOfficeAdvisorRow } from "@/hooks/use-stats";

function fmtTRY(n: number) {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " ₺";
}
function fmtOran(n: number) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return `%${(n * 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatYMD(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const OFFICE_TOGGLE = [undefined, "Akatlar", "Zekeriyaköy"] as const;

function MahalleMultiSelect({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggle = (m: string) => onChange(value.includes(m) ? value.filter(x => x !== m) : [...value, m]);
  const label = value.length === 0 ? "Tüm Mahalleler" : value.length <= 2 ? value.join(", ") : `${value.length} mahalle seçili`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 w-[220px] justify-between text-xs font-normal">
          <span className="truncate">{label}</span>
          {value.length > 0 ? (
            <span
              className="ml-1 rounded-full p-0.5 hover:bg-muted shrink-0"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
            >
              <X className="h-3 w-3" />
            </span>
          ) : <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Mahalle ara…" className="text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs">Mahalle bulunamadı.</CommandEmpty>
            <CommandGroup>
              {options.map((m) => (
                <CommandItem key={m} value={m} onSelect={() => toggle(m)} className="text-xs cursor-pointer">
                  <Check className={`h-3.5 w-3.5 ${value.includes(m) ? "opacity-100" : "opacity-0"}`} />
                  {m}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AdvisorRowGroup({ row, extra, expandable = true }: { row: ScorecardAdvisorRow; extra?: ScorecardOfficeAdvisorRow; expandable?: boolean }) {
  const canExpand = expandable && row.rows.length > 0;
  const [open, setOpen] = useState(canExpand); // mahalle kırılımı default açık gelsin
  return (
    <>
      <tr className={`border-b border-border/50 hover:bg-muted/30 ${canExpand ? "cursor-pointer" : ""}`} onClick={() => canExpand && setOpen(o => !o)}>
        <td className="py-2 px-3 font-medium whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5">
            {canExpand ? (
              open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : <span className="w-3.5" />}
            {row.name}
          </span>
        </td>
        <td className="py-2 px-3 text-right tabular-nums">{fmtTRY(row.total.bhb)}</td>
        <td className="py-2 px-3 text-right tabular-nums">{fmtOran(row.total.oran)}</td>
        <td className="py-2 px-3 text-right tabular-nums font-semibold">{fmtTRY(row.total.hacim)}</td>
        <td className="py-2 px-3 text-right tabular-nums">{fmtPct(row.hacimPayi)}</td>
        {extra && (
          <>
            <td className="py-2 px-3 text-right tabular-nums">{fmtPct(extra.oranPayi)}</td>
            <td className="py-2 px-3 text-right tabular-nums">{fmtPct(extra.bireyselHacimPayi)}</td>
            <td className="py-2 px-3 text-right tabular-nums">{fmtPct(extra.bireyselOranPayi)}</td>
            <td className="py-2 px-3 text-right tabular-nums">{extra.portfoyAdedi || "—"}</td>
            <td className="py-2 px-3 text-right tabular-nums">{extra.portfoyHacmi > 0 ? fmtTRY(extra.portfoyHacmi) : "—"}</td>
          </>
        )}
      </tr>
      {open && canExpand && row.rows.map((m, i) => (
        <tr key={i} className="border-b border-border/30 bg-muted/10 text-muted-foreground">
          <td className="py-1.5 px-3 pl-9">{m.mahalle}</td>
          <td className="py-1.5 px-3 text-right tabular-nums">{fmtTRY(m.bhb)}</td>
          <td className="py-1.5 px-3 text-right tabular-nums">{fmtOran(m.oran)}</td>
          <td className="py-1.5 px-3 text-right tabular-nums">{fmtTRY(m.hacim)}</td>
          <td className="py-1.5 px-3 text-right tabular-nums">{fmtPct(m.hacimPayi)}</td>
          {extra && (
            <>
              <td className="py-1.5 px-3 text-right tabular-nums">{m.oranPayi != null ? fmtPct(m.oranPayi) : "—"}</td>
              <td className="py-1.5 px-3 text-right tabular-nums">{m.bireyselHacimPayi != null ? fmtPct(m.bireyselHacimPayi) : "—"}</td>
              <td className="py-1.5 px-3 text-right tabular-nums">{m.bireyselOranPayi != null ? fmtPct(m.bireyselOranPayi) : "—"}</td>
              <td className="py-1.5 px-3" colSpan={2} />
            </>
          )}
        </tr>
      ))}
    </>
  );
}

export default function AdvisorScorecard() {
  const [office, setOffice] = useState<string | undefined>(undefined);
  const [mahalle, setMahalle] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState(() => formatYMD(new Date(new Date().getFullYear(), 0, 1)));
  const [toDate, setToDate] = useState(() => formatYMD(new Date()));
  const [showCompany, setShowCompany] = useState(false);

  // Mahalle listesi ofise özel — ofis değişince eski seçim anlamsız kalır.
  useEffect(() => { setMahalle([]); }, [office]);

  const { data, isLoading } = useAdvisorScorecard(fromDate, toDate, office, mahalle);
  const mahalleLabel = mahalle.length <= 2 ? mahalle.join(", ") : `${mahalle.length} mahalle`;
  const hasMahalleFilter = mahalle.length > 0;
  const officeLabel = office ?? "Tüm Ofisler";

  const officeRows = data?.office.rows ?? [];
  const companyRows = data?.company.rows ?? [];
  const officeTotal = data?.office.total ?? { bhb: 0, oran: 0, hacim: 0 };
  const companyTotal = data?.company.total ?? { bhb: 0, oran: 0, hacim: 0 };
  const portfolioTotal = data?.office.portfolioTotal ?? { adet: 0, hacim: 0 };
  const availableMahalleler = data?.availableMahalleler ?? [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" />
              Mahalle Bazlı Danışman Karnesi
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Seçilen ofisteki danışmanların üretimi, mahalle kırılımında
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {OFFICE_TOGGLE.map((o) => (
                <Button key={o ?? "all"} size="sm" variant={office === o ? "default" : "ghost"} className="h-7 text-xs px-3" onClick={() => setOffice(o)}>
                  {o ?? "Tümü"}
                </Button>
              ))}
            </div>
            <MahalleMultiSelect options={availableMahalleler} value={mahalle} onChange={setMahalle} />
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[140px] h-7 text-xs" />
              <span className="text-xs text-muted-foreground">—</span>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[140px] h-7 text-xs" />
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Yükleniyor…</div>
        )}

        {!isLoading && (
          <>
            {/* ── Ofis Karnesi (asıl rapor) ── */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">{officeLabel} Bölge İşlemleri{hasMahalleFilter ? ` — ${mahalleLabel}` : ""}</h2>
                <span className="text-xs text-muted-foreground ml-1">{fromDate} – {toDate}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-3 py-2 font-medium">Danışman</th>
                      <th className="text-right px-3 py-2 font-medium">BHB</th>
                      <th className="text-right px-3 py-2 font-medium">İşlem Adedi</th>
                      <th className="text-right px-3 py-2 font-medium">İşlem Hacmi</th>
                      <th className="text-right px-3 py-2 font-medium">{officeLabel} Hacim Payı{hasMahalleFilter ? " (mahalle)" : ""}</th>
                      <th className="text-right px-3 py-2 font-medium">{officeLabel} Adedi Payı{hasMahalleFilter ? " (mahalle)" : ""}</th>
                      <th className="text-right px-3 py-2 font-medium">Bireysel Hacim Payı</th>
                      <th className="text-right px-3 py-2 font-medium">Bireysel Adedi Payı</th>
                      <th className="text-right px-3 py-2 font-medium">Portföy Adedi</th>
                      <th className="text-right px-3 py-2 font-medium">Portföy Hacmi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {officeRows.length === 0 && (
                      <tr><td colSpan={10} className="py-6 text-center text-muted-foreground">Bu dönemde {officeLabel}{hasMahalleFilter ? ` / ${mahalleLabel}` : ""} için işlem bulunamadı.</td></tr>
                    )}
                    {officeRows.map((row) => (
                      <AdvisorRowGroup key={row.employeeId} row={row} extra={row} expandable={mahalle.length !== 1} />
                    ))}
                  </tbody>
                  {officeRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-emerald-300 bg-emerald-50 font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <td className="py-2 px-3">Genel Toplam</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtTRY(officeTotal.bhb)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtOran(officeTotal.oran)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtTRY(officeTotal.hacim)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtPct(officeRows.reduce((s, r) => s + r.hacimPayi, 0))}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtPct(officeRows.reduce((s, r) => s + r.oranPayi, 0))}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtPct(companyTotal.hacim > 0 ? officeTotal.hacim / companyTotal.hacim : 0)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtPct(companyTotal.oran > 0 ? officeTotal.oran / companyTotal.oran : 0)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{portfolioTotal.adet}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtTRY(portfolioTotal.hacim)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <div className="px-5 py-2 border-t border-border text-[11px] text-muted-foreground space-y-0.5">
                {!office && (
                  <p><strong>Tüm Ofisler</strong> seçiliyken bu tablo şirket geneliyle birebir aynıdır, Bireysel Hacim/Adedi Payı bu yüzden her zaman %100'dür.</p>
                )}
                {office && !hasMahalleFilter && (
                  <p><strong>Bireysel Hacim/Adedi Payı</strong>: danışmanın {officeLabel}'daki üretiminin, kendi TÜM işlemlerine (tüm ofisler, tüm mahalleler) oranı.</p>
                )}
                {office && hasMahalleFilter && (
                  <>
                    <p><strong>{officeLabel} Hacim/Adedi Payı</strong>: bu danışmanın {mahalleLabel}'deki üretiminin, {officeLabel}'ın sadece seçili mahalle(ler)deki toplam üretimine oranı.</p>
                    <p><strong>Bireysel Hacim/Adedi Payı</strong>: danışmanın {officeLabel} / {mahalleLabel}'deki üretiminin, kendi TÜM işlemlerine (tüm ofisler, tüm mahalleler) oranı — yani üretiminin ne kadarı bu seçili mahalle(ler)den geliyor.</p>
                  </>
                )}
                <p><strong>İşlem Hacmi</strong> = işlem bedeli × işlem oranı (BHB payı / tam pay) — çift taraflı (içeride) kapanan işlemler iki kez katkı verir, İşlem Adedi ile birebir tutarlıdır.</p>
              </div>
            </div>

            {/* ── Şirket Geneli (referans, katlanabilir) — Tümü seçiliyken ana tabloyla aynı, gizli ── */}
            {office && (
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <button
                  className="w-full px-5 py-3 border-b border-border flex items-center gap-2 hover:bg-muted/30"
                  onClick={() => setShowCompany(v => !v)}
                >
                  {showCompany ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <h2 className="text-base font-semibold">Şirket Geneli{hasMahalleFilter ? ` — ${mahalleLabel}` : ""} — Tüm İşlemler (Referans)</h2>
                  <span className="text-xs text-muted-foreground ml-1">Bireysel Payı hesaplamalarının paydası</span>
                </button>
                {showCompany && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30">
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">Danışman</th>
                          <th className="text-right px-3 py-2 font-medium">BHB</th>
                          <th className="text-right px-3 py-2 font-medium">İşlem Adedi</th>
                          <th className="text-right px-3 py-2 font-medium">İşlem Hacmi</th>
                          <th className="text-right px-3 py-2 font-medium">Şirket Hacim Payı</th>
                        </tr>
                      </thead>
                      <tbody>
                        {companyRows.map((row) => (
                          <AdvisorRowGroup key={row.employeeId} row={row} expandable={mahalle.length !== 1} />
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-emerald-300 bg-emerald-50 font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <td className="py-2 px-3">Genel Toplam</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmtTRY(companyTotal.bhb)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmtOran(companyTotal.oran)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmtTRY(companyTotal.hacim)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmtPct(companyRows.reduce((s, r) => s + r.hacimPayi, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
