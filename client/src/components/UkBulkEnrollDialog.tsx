import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UkMondaySelect, nextMondayYmd } from "@/components/UkMondaySelect";

type Candidate = { employeeId: number; name: string; kwuid: string | null; coachName: string; hasEmail: boolean; wasRemoved: boolean };
type Result = { employeeId: number; name: string; enrolled: boolean; mailed: boolean | null; error: string | null };

// 45+45: koçu olan tüm aktif danışmanları tek seferde programa alma + hoş geldin maili.
export function UkBulkEnrollDialog({ open, onOpenChange, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const [startDate, setStartDate] = useState(() => nextMondayYmd());
  const [sendWelcome, setSendWelcome] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ results: Result[]; enrolled: number; mailed: number } | null>(null);

  const { data: candidates = [], isLoading, error } = useQuery<Candidate[]>({
    queryKey: ["/api/uk-program/bulk-candidates"],
    queryFn: async () => {
      const r = await fetch("/api/uk-program/bulk-candidates", { credentials: "include" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(d)) throw new Error(d?.error ?? `HTTP ${r.status}`);
      return d;
    },
    enabled: open,
  });
  // Liste gelince hepsi seçili başlar
  useEffect(() => { if (open) { setSelected(new Set(candidates.map((c) => c.employeeId))); setResult(null); } }, [open, candidates]);

  const filtered = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("tr-TR");
    return s ? candidates.filter((c) => c.name.toLocaleLowerCase("tr-TR").includes(s) || (c.kwuid ?? "").includes(s) || c.coachName.toLocaleLowerCase("tr-TR").includes(s)) : candidates;
  }, [candidates, q]);
  const byCoach = useMemo(() => {
    const m = new Map<string, Candidate[]>();
    for (const c of filtered) { if (!m.has(c.coachName)) m.set(c.coachName, []); m.get(c.coachName)!.push(c); }
    return Array.from(m.entries());
  }, [filtered]);
  const selectedList = candidates.filter((c) => selected.has(c.employeeId));
  const noEmailSelected = selectedList.filter((c) => !c.hasEmail).length;
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setAll = (ids: number[], on: boolean) => setSelected((s) => { const n = new Set(s); for (const id of ids) on ? n.add(id) : n.delete(id); return n; });

  const submit = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/uk-program/bulk-enroll", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: Array.from(selected), startDate, sendWelcome }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Eklenemedi");
      setResult(d);
      onDone();
    } catch (e: any) {
      setResult({ results: [{ employeeId: 0, name: "—", enrolled: false, mailed: null, error: e.message }], enrolled: 0, mailed: 0 });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setResult(null); }}>
      <DialogContent className="max-w-2xl" data-testid="uk-bulk-dialog">
        <DialogHeader>
          <DialogTitle>45+45 Başarı Rotası — Toplu Danışman Ekle</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 pt-1" data-testid="uk-bulk-result">
            <p className="text-sm">
              <span className="font-semibold text-emerald-700">{result.enrolled} danışman programa eklendi</span>
              {sendWelcome && <>, <span className="font-semibold">{result.mailed} hoş geldin maili gönderildi</span></>}.
            </p>
            <div className="max-h-80 overflow-y-auto rounded-lg border divide-y text-sm">
              {result.results.map((r) => (
                <div key={r.employeeId} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="flex-1 truncate">{r.name}</span>
                  {r.enrolled ? <span className="text-xs text-emerald-700">eklendi</span> : <span className="text-xs text-rose-700">eklenmedi</span>}
                  {r.mailed === true && <span className="text-xs text-emerald-700">· mail gitti</span>}
                  {r.error && <span className="text-xs text-amber-700">· {r.error}</span>}
                </div>
              ))}
            </div>
            <div className="flex justify-end"><Button onClick={() => onOpenChange(false)}>Kapat</Button></div>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">
              Aktif, profilinde ÜK koçu olan ve henüz programda olmayan danışmanlar listelenir. Koç danışman profilinden gelir.
            </p>
            {error && <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-xs text-rose-700">{(error as Error).message}</div>}
            <div className="flex items-center gap-2 flex-wrap">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara: ad, KWUID, koç…" className="h-8 text-sm w-56" />
              <Button size="sm" variant="outline" className="h-8" onClick={() => setAll(filtered.map((c) => c.employeeId), true)}>Tümünü seç</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setAll(filtered.map((c) => c.employeeId), false)}>Seçimi kaldır</Button>
              <span className="ml-auto text-xs text-muted-foreground" data-testid="uk-bulk-count">{selected.size} / {candidates.length} seçili</span>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
              {isLoading ? <p className="p-4 text-sm text-muted-foreground">Yükleniyor…</p>
              : candidates.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Eklenecek danışman yok: koçu olan tüm aktif danışmanlar zaten programda.</p>
              : byCoach.map(([coach, list]) => (
                <div key={coach}>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 text-xs font-semibold">
                    <input type="checkbox" className="accent-primary" checked={list.every((c) => selected.has(c.employeeId))} onChange={(e) => setAll(list.map((c) => c.employeeId), e.target.checked)} />
                    Koç: {coach} <span className="font-normal text-muted-foreground">({list.length})</span>
                  </div>
                  {list.map((c) => (
                    <label key={c.employeeId} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/20" data-testid={`uk-bulk-row-${c.employeeId}`}>
                      <input type="checkbox" className="accent-primary" checked={selected.has(c.employeeId)} onChange={() => toggle(c.employeeId)} />
                      <span className="flex-1 truncate">{c.name}</span>
                      {c.kwuid && <span className="text-xs text-muted-foreground font-mono">{c.kwuid}</span>}
                      {c.wasRemoved && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 ring-1 ring-slate-200" title="Daha önce programdan çıkarılmış; önceki işaretleri korunur">yeniden</span>}
                      {!c.hasEmail && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 ring-1 ring-amber-200" title="KW/kişisel e-posta yok: portala giremez, mail gönderilemez">E-posta yok</span>}
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Program başlangıcı (pazartesi)</label>
                <UkMondaySelect value={startDate} onChange={setStartDate} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm select-none cursor-pointer">
                <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} />
                Hoş geldin mailini (erişim linkiyle) hemen gönder
              </label>
            </div>
            {sendWelcome && noEmailSelected > 0 && (
              <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-[11px] text-amber-800">
                Seçilenlerden {noEmailSelected} danışmanın e-postası yok; programa eklenir ama mail gönderilemez.
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
              <Button onClick={submit} disabled={saving || selected.size === 0} data-testid="uk-bulk-submit">
                {saving ? "Ekleniyor…" : `${selected.size} Danışmanı Programa Ekle`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
