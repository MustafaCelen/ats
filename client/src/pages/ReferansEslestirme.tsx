import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { EmployeePicker } from "@/components/EmployeePicker";
import { useToast } from "@/hooks/use-toast";
import { Link2, Loader2, Search, Sparkles, Undo2, UserX } from "lucide-react";
import { useSortable } from "@/lib/sort";
import { SortTh } from "@/components/SortTh";

// Bağlanmamış aday referanslarını danışmanlarla eşleştirme (admin + hiring manager).
// Karar metin bazındadır: aynı metne sahip tüm adaylar birlikte bağlanır; dış referans
// denilen metin bir daha önerilmez. Bkz. server/referral.ts

type Suggestion = { employeeId: number; name: string; kwuid: string | null; status: string; score: number; exact: boolean };
type Group = {
  norm: string; text: string; variants: string[]; count: number;
  candidates: { id: number; name: string }[];
  suggestions: Suggestion[]; exactEmployeeId: number | null;
};
type Data = { groups: Group[]; exactCount: number; external: { norm: string; text: string; decidedAt: string; decidedBy: string | null }[] };

export default function ReferansEslestirme() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [onlySuggested, setOnlySuggested] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, number | null>>({});

  const { data, isLoading } = useQuery<Data>({
    queryKey: ["/api/referrals/unmatched"],
    queryFn: () => fetch("/api/referrals/unmatched", { credentials: "include" }).then((r) => r.json()),
  });
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    queryFn: () => fetch("/api/employees", { credentials: "include" }).then((r) => r.json()).then((d) => (Array.isArray(d) ? d : [])),
    staleTime: 5 * 60 * 1000,
  });
  const empOptions = useMemo(() => employees
    .map((e) => ({ id: e.id, name: e.candidate?.name ?? `Çalışan #${e.id}`, kwuid: e.kwuid }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr")), [employees]);

  const groups = useMemo(() => {
    const term = q.trim().toLocaleLowerCase("tr-TR");
    return (data?.groups ?? []).filter((g) =>
      (!onlySuggested || g.suggestions.length > 0) &&
      (!term || g.text.toLocaleLowerCase("tr-TR").includes(term) || g.candidates.some((c) => c.name.toLocaleLowerCase("tr-TR").includes(term))));
  }, [data, onlySuggested, q]);

  // Sütun sıralaması (ortak altyapı: @/lib/sort)
  const { sorted: sortedGroups, sort, toggle: toggleSort } = useSortable(groups, {
    text: (g: Group) => g.text, count: (g: Group) => g.count, suggestion: (g: Group) => g.suggestions[0]?.score ?? null,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["/api/referrals/unmatched"] });
    qc.invalidateQueries({ queryKey: ["/api/uk-program"] });
  };

  const decide = async (g: Group, employeeId: number | null) => {
    setBusy(g.norm);
    const r = await fetch("/api/referrals/decide", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: g.text, employeeId }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return toast({ title: "Hata", description: d.error ?? "Kaydedilemedi", variant: "destructive" });
    toast({ title: employeeId != null ? `${d.linked} aday danışmana bağlandı` : `“${g.text}” dış referans olarak işaretlendi` });
    refresh();
  };

  const linkExact = async () => {
    setBusy("__exact");
    const r = await fetch("/api/referrals/link-exact", { method: "POST", credentials: "include" });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return toast({ title: "Hata", description: d.error, variant: "destructive" });
    toast({ title: `${d.linked} aday bağlandı`, description: `${d.texts} farklı referans metni birebir eşleşti.` });
    refresh();
  };

  const undoExternal = async (norm: string) => {
    await fetch(`/api/referrals/decisions/${encodeURIComponent(norm)}`, { method: "DELETE", credentials: "include" });
    refresh();
  };

  const totalPending = (data?.groups ?? []).reduce((s, g) => s + g.count, 0);

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Link2 className="h-6 w-6 text-primary" /> Referans Eşleştirme</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Adaylardaki serbest metin referansları danışmanlarımıza bağlayın. Bağlanan referanslar 45+45 Katkı Payı'na sayılır.
            </p>
          </div>
          {!!data?.exactCount && (
            <Button className="gap-1.5" disabled={busy === "__exact"} onClick={linkExact}>
              {busy === "__exact" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Birebir eşleşenleri bağla ({data.exactCount} aday)
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {([[true, "Önerisi olanlar"], [false, "Tümü"]] as const).map(([v, label]) => (
            <button
              key={label}
              onClick={() => setOnlySuggested(v)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${onlySuggested === v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"}`}
            >{label}</button>
          ))}
          <span className="text-xs text-muted-foreground">{totalPending} aday · {data?.groups.length ?? 0} farklı referans bekliyor</span>
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Referans veya aday ara…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs">
              <tr className="[&_th]:px-4 [&_th]:py-2.5">
                <SortTh label="Referans metni" sortKey="text" sort={sort} onSort={toggleSort} />
                <SortTh label="Adaylar" sortKey="count" sort={sort} onSort={toggleSort} firstDir="desc" />
                <SortTh label="Danışman önerisi" sortKey="suggestion" sort={sort} onSort={toggleSort} firstDir="desc" className="min-w-[280px]" />
                <th className="text-left min-w-[240px]">Başka danışman / dış referans</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Yükleniyor…</td></tr>}
              {!isLoading && groups.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  {onlySuggested ? "Önerisi olan bekleyen referans yok." : "Bağlanmamış referans yok."}
                </td></tr>
              )}
              {sortedGroups.map((g) => (
                <tr key={g.norm} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold whitespace-nowrap max-w-[260px] truncate" title={g.text}>{g.text}</p>
                    {g.variants.length > 1 && <p className="text-[11px] text-muted-foreground mt-0.5">Yazımlar: {g.variants.join(" · ")}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{g.count} aday</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {g.candidates.map((c, i) => (
                        <span key={c.id}>{i > 0 && ", "}<Link href={`/candidates/${c.id}`} className="hover:text-primary hover:underline">{c.name}</Link></span>
                      ))}
                      {g.count > g.candidates.length && ` +${g.count - g.candidates.length}`}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {g.suggestions.length === 0
                      ? <span className="text-xs text-muted-foreground">Benzer danışman yok</span>
                      : (
                        <div className="space-y-1.5">
                          {g.suggestions.map((s) => (
                            <div key={s.employeeId} className="flex items-center gap-2">
                              <span className="min-w-0 flex-1">
                                <span className="font-medium">{s.name}</span>
                                {s.kwuid && <span className="ml-1.5 text-[11px] text-muted-foreground font-mono">{s.kwuid}</span>}
                                {s.status !== "active" && <span className="ml-1 text-[10px] text-muted-foreground">(pasif)</span>}
                                <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.exact ? "bg-emerald-50 text-emerald-700" : s.score >= 0.85 ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"}`}>
                                  {s.exact ? "birebir" : `%${Math.round(s.score * 100)}`}
                                </span>
                              </span>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy === g.norm} onClick={() => decide(g, s.employeeId)}>Bağla</Button>
                            </div>
                          ))}
                        </div>
                      )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 min-w-0">
                        <EmployeePicker
                          employees={empOptions}
                          value={pick[g.norm] ?? null}
                          onChange={(id) => setPick((p) => ({ ...p, [g.norm]: id }))}
                          placeholder="Danışman seç…"
                        />
                      </div>
                      <Button size="sm" className="h-9 px-2.5 text-xs" disabled={pick[g.norm] == null || busy === g.norm} onClick={() => decide(g, pick[g.norm]!)}>Bağla</Button>
                    </div>
                    <button
                      onClick={() => decide(g, null)} disabled={busy === g.norm}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <UserX className="h-3.5 w-3.5" /> Dış referans (danışman değil)
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!!data?.external.length && (
          <details className="rounded-xl border border-border bg-card">
            <summary className="px-4 py-3 text-sm font-medium cursor-pointer select-none">
              Dış referans olarak işaretlenenler ({data.external.length})
            </summary>
            <div className="border-t border-border divide-y divide-border">
              {data.external.map((x) => (
                <div key={x.norm} className="px-4 py-2 flex items-center gap-3 text-sm">
                  <span className="flex-1">{x.text}</span>
                  <span className="text-[11px] text-muted-foreground">{x.decidedBy ?? "—"} · {new Date(x.decidedAt).toLocaleDateString("tr-TR")}</span>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => undoExternal(x.norm)}><Undo2 className="h-3.5 w-3.5" /> Geri al</Button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </Layout>
  );
}
