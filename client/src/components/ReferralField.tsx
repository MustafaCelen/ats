import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, UserCheck, X } from "lucide-react";

// Aday referansı: tek alan. Yazarken danışman önerir; seçilirse danışmana bağlanır
// (ÜK 45+45 Katkı Payı buradan sayılır), seçilmezse dış referans olarak metin kalır.
// Eşleştirme mantığı: server/referral.ts

export type ReferralValue = { text: string; employeeId: number | null; external: boolean };
type Suggestion = { employeeId: number; name: string; kwuid: string | null; status: string; score: number; exact: boolean };
type MatchResult = {
  norm: string; exactEmployeeId: number | null; suggestions: Suggestion[];
  decision: { employeeId: number | null; external: boolean } | null;
};

async function fetchMatch(q: string): Promise<MatchResult> {
  const r = await fetch(`/api/referrals/match?q=${encodeURIComponent(q)}`, { credentials: "include" });
  return r.json();
}

function SuggestionLabel({ s }: { s: Suggestion }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="font-medium truncate">{s.name}</span>
      {s.kwuid && <span className="text-[11px] text-muted-foreground font-mono">{s.kwuid}</span>}
      {s.status !== "active" && <span className="text-[10px] text-muted-foreground">(pasif)</span>}
      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{s.exact ? "birebir" : `%${Math.round(s.score * 100)}`}</span>
    </span>
  );
}

export function ReferralField({ value, onChange }: { value: ReferralValue; onChange: (v: ReferralValue) => void }) {
  const [open, setOpen] = useState(false);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const box = useRef<HTMLDivElement>(null);

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    queryFn: () => fetch("/api/employees", { credentials: "include" }).then((r) => r.json()).then((d) => (Array.isArray(d) ? d : [])),
    staleTime: 5 * 60 * 1000,
    enabled: value.employeeId != null,
  });
  const linked = value.employeeId != null ? employees.find((e) => e.id === value.employeeId) : null;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const search = (q: string) => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setSugs([]); return; }
    timer.current = setTimeout(async () => {
      try { setSugs((await fetchMatch(q)).suggestions); setOpen(true); } catch { setSugs([]); }
    }, 250);
  };

  return (
    <div ref={box} className="relative">
      <Input
        value={value.text}
        placeholder="Ad Soyad veya kaynak — danışmansa listeden seçin"
        onFocus={() => { if (sugs.length) setOpen(true); }}
        onChange={(e) => {
          // Metin değişince bağlantı/karar sıfırlanır.
          onChange({ text: e.target.value, employeeId: null, external: false });
          search(e.target.value);
        }}
      />
      {open && value.employeeId == null && value.text.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden text-sm">
          {sugs.length > 0 && <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Danışmanlarımız</p>}
          {sugs.map((s) => (
            <button
              key={s.employeeId} type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted flex"
              onClick={() => { onChange({ text: s.name, employeeId: s.employeeId, external: false }); setOpen(false); }}
            >
              <SuggestionLabel s={s} />
            </button>
          ))}
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-muted border-t border-border text-muted-foreground"
            onClick={() => { onChange({ ...value, employeeId: null, external: true }); setOpen(false); }}
          >
            “{value.text.trim()}” <span className="text-foreground">dış referans</span> olarak kalsın
          </button>
        </div>
      )}
      {value.employeeId != null && (
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 text-xs text-emerald-800">
          <UserCheck className="h-3.5 w-3.5" />
          Danışman: <b>{linked?.candidate?.name ?? value.text}</b>{linked?.kwuid && <span className="font-mono">· {linked.kwuid}</span>}
          <button
            type="button" title="Danışman bağlantısını kaldır (dış referans)"
            onClick={() => onChange({ ...value, employeeId: null, external: true })}
            className="ml-0.5 text-emerald-700 hover:text-emerald-900"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {value.employeeId == null && value.external && value.text.trim() && (
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          Dış referans
          <button type="button" title="Kararı kaldır" onClick={() => onChange({ ...value, external: false })}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}

// Kaydetmeden önce: danışman seçilmemiş ve metin bir danışmana benziyorsa sorar.
// Dönüş null → kullanıcı vazgeçti (kaydetme).
export function useReferralConfirm() {
  const [state, setState] = useState<{ text: string; sugs: Suggestion[]; resolve: (v: { employeeId: number | null; external: boolean } | null) => void } | null>(null);

  const confirm = async (v: ReferralValue): Promise<{ employeeId: number | null; external: boolean } | null> => {
    if (v.employeeId != null) return { employeeId: v.employeeId, external: false };
    if (!v.text.trim() || v.external) return { employeeId: null, external: v.external && !!v.text.trim() };
    let m: MatchResult;
    try { m = await fetchMatch(v.text); } catch { return { employeeId: null, external: false }; }
    if (m.decision) return { employeeId: m.decision.employeeId, external: m.decision.external };   // daha önce karar verilmiş
    if (m.exactEmployeeId != null) return { employeeId: m.exactEmployeeId, external: false };     // kesin + tekil → otomatik
    if (!m.suggestions.length) return { employeeId: null, external: false };
    return new Promise((resolve) => setState({ text: v.text.trim(), sugs: m.suggestions.slice(0, 4), resolve }));
  };

  const close = (r: { employeeId: number | null; external: boolean } | null) => { state?.resolve(r); setState(null); };

  const dialog = (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) close(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Bu kişi danışmanımız mı?</DialogTitle></DialogHeader>
        {state && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              “<b className="text-foreground">{state.text}</b>” referansı şu danışmanlara benziyor. Danışmanımızsa bağlayın; katkı payı buradan sayılır.
            </p>
            <div className="space-y-1.5">
              {state.sugs.map((s) => (
                <button
                  key={s.employeeId} type="button"
                  onClick={() => close({ employeeId: s.employeeId, external: false })}
                  className="w-full flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-emerald-50 hover:border-emerald-300"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="flex-1 min-w-0"><SuggestionLabel s={s} /></span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => close(null)}>Vazgeç</Button>
              <Button variant="secondary" className="flex-1" onClick={() => close({ employeeId: null, external: true })}>Hayır, dış referans</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  return { confirm, dialog };
}
