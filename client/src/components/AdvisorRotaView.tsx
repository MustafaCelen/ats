import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Loader2, Lock, Route as RouteIcon, AlertCircle } from "lucide-react";
import { UK_ACTIVITIES, UK_DAYS, UK_TIME_ROWS, UK_PROGRAM_WEEKS, ukAddDays } from "@shared/uk-program";
import { UkWeekGrid, UkGridLegend } from "@/components/UkWeekGrid";
import { CalendarDays, List } from "lucide-react";

type ViewMode = "liste" | "takvim";
const VIEW_KEY = "ukRotaView";
function initialViewMode(): ViewMode {
  try {
    const s = localStorage.getItem(VIEW_KEY);
    if (s === "liste" || s === "takvim") return s;
  } catch {}
  // Varsayılan liste (onaylı karar); danışmanın seçimi hatırlanır.
  return "liste";
}

// Danışman portalı (/a/:token) → "Rotam": 45+45 Başarı Rotası'nı danışmanın kendisi
// doldurur. Telefon öncelikli: gün gün liste. Yetki kuralları sunucuda
// (server/uk-program.ts): onaylı hafta kilitli, ileri tarih işaretlenemez.

type WeekRow = {
  week: number; monday: string | null; totalActivities: number; doneActivities: number;
  arama: number | null; randevu: number | null; tekYetki: number | null;
  kapanis: number; bhb: number; katkiPayi: number;
  coachNote: string | null; confirmedAt: string | null;
};
type Data = {
  participant: { name: string; coachName: string | null; programStart: string | null };
  week1Monday: string | null;
  currentWeek: number;
  today: string;
  checks: Record<string, { at: string; by: string }>;
  weeks: WeekRow[];
  weekEnd: string | null;   // içinde bulunulan haftanın pazarı
  programTargets?: { key: string; label: string; target: number; done: number; hint: string }[];
  preview?: boolean;
};

const fmt = (ymd: string | null) => (ymd ? ymd.slice(8, 10) + "." + ymd.slice(5, 7) + "." + ymd.slice(0, 4) : "—");
const fmtTRY = (n: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(n) + " ₺";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-border bg-card p-5 shadow-sm ${className}`}>{children}</div>;
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

export function AdvisorRotaView({ token, onWideChange }: { token: string; onWideChange?: (wide: boolean) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "need-login" | "error" | "ready">("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(initialViewMode);
  const changeView = (v: ViewMode) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  };
  // Takvim görünümünde portal kabuğu genişlesin (masaüstünde tüm hafta tek ekranda).
  useEffect(() => {
    onWideChange?.(state === "ready" && view === "takvim");
    return () => onWideChange?.(false);
  }, [state, view, onWideChange]);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e === "email_mismatch") setLoginErr("Bu bağlantı size ait değil. Lütfen kayıtlı KW hesabınızla giriş yapın.");
    else if (e === "not_authorized") setLoginErr("Bu bölüm için yetkiniz bulunmuyor. Lütfen ofisle iletişime geçin.");
  }, []);

  const load = useCallback((first = false) => {
    if (first) setState("loading");
    return fetch(`/api/public/advisor/${token}/uk-program`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 401) { setState("need-login"); return; }
        if (!r.ok) { setErrMsg((await r.json().catch(() => ({}))).message ?? null); setState("error"); return; }
        const d: Data = await r.json();
        setData(d);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [token]);

  useEffect(() => { load(true); }, [load]);

  const startGoogleLogin = async () => {
    setRedirecting(true);
    try {
      // Google dönüşünde portal bu sekmeyle açılsın.
      try { sessionStorage.setItem("advisorTab", "rota"); } catch {}
      const res = await fetch(`/api/public/advisor/${token}/google-login`, { credentials: "include" });
      const d = await res.json();
      if (d.url) { window.location.href = d.url; return; }
      setLoginErr(d.message || "Google girişi başlatılamadı.");
    } catch {
      setLoginErr("Google girişi başlatılamadı.");
    }
    setRedirecting(false);
  };

  const toggle = async (id: string, done: boolean) => {
    if (!data || data.preview) return;
    setNotice(null);
    const prev = data;
    const checks = { ...data.checks };
    if (done) checks[id] = { at: new Date().toISOString(), by: "Siz" }; else delete checks[id];
    setData({ ...data, checks });
    const r = await fetch(`/api/public/advisor/${token}/uk-program/checks/${id}`, {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }),
    });
    if (!r.ok) {
      setData(prev);
      setNotice((await r.json().catch(() => ({}))).message ?? "Kaydedilemedi.");
      return;
    }
    load();
  };

  if (state === "loading") return <Card className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></Card>;

  if (state === "need-login") {
    return (
      <Card>
        <div className="text-center py-4">
          <RouteIcon className="h-9 w-9 text-[#24064f] mx-auto mb-3" />
          <h2 className="font-semibold text-lg">45+45 Başarı Rotası</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Haftalık rotanızı doldurmak için <b>KW Google hesabınızla</b> giriş yapın. Bu bölüm yalnızca size özeldir.
          </p>
          {loginErr && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{loginErr}</div>}
          <button
            onClick={startGoogleLogin}
            disabled={redirecting}
            className="w-full h-11 rounded-xl border border-border bg-white hover:bg-muted/50 font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
            Google ile giriş yap
          </button>
        </div>
      </Card>
    );
  }

  if (state === "error" || !data) {
    return (
      <Card>
        <div className="text-center py-6">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{errMsg ?? "Veriler yüklenemedi."}</p>
        </div>
      </Card>
    );
  }

  // Danışman yalnızca içinde bulunduğu haftayı görür; sunucu da yalnızca o haftayı döner.
  const inProgram = data.currentWeek >= 1 && data.currentWeek <= UK_PROGRAM_WEEKS;
  const currentRow = inProgram ? data.weeks.find((w) => w.week === data.currentWeek) ?? null : null;
  const pct = currentRow && currentRow.totalActivities ? Math.round((currentRow.doneActivities / currentRow.totalActivities) * 100) : 0;

  return (
    <>
      {data.preview && (
        <div className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2.5 text-xs text-amber-900">
          <b>Önizleme:</b> Danışmanın gördüğü ekranı görüyorsunuz. Bu modda değişiklik yapılamaz.
        </div>
      )}
      <div className="rounded-2xl bg-[#24064f] text-white p-5 shadow-sm">
        <p className="text-[10px] tracking-widest text-white/70">ÜRETKENLİK KOÇLUĞU PROGRAMI</p>
        <h2 className="text-xl font-extrabold mt-0.5">45+45 Başarı Rotası</h2>
        <p className="text-sm text-white/75 mt-1">Koçunuz: {data.participant.coachName ?? "—"} · Başlangıç {fmt(data.week1Monday)}</p>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <p className="text-[10px] text-white/70">Şu an</p>
            <p className="font-bold text-sm">{data.currentWeek === 0 ? "Başlamadı" : data.currentWeek > UK_PROGRAM_WEEKS ? "Tamamlandı" : `${data.currentWeek}. hafta`}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <p className="text-[10px] text-white/70">Son giriş</p>
            <p className="font-bold text-sm">{data.weekEnd ? `Pazar ${fmt(data.weekEnd).slice(0, 5)} 23:59` : "—"}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-3 py-2">
            <p className="text-[10px] text-white/70">Bu hafta</p>
            <p className="font-bold text-sm">
              {currentRow ? `${currentRow.doneActivities}/${currentRow.totalActivities}` : "—"}
            </p>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-amber-300" style={{ width: `${pct}%` }} /></div>
      </div>

      {!inProgram && (
        <Card>
          <div className="text-center py-4">
            <RouteIcon className="h-8 w-8 text-[#24064f] mx-auto mb-2" />
            {data.currentWeek === 0 ? (
              <>
                <p className="font-semibold">Programınız {fmt(data.week1Monday)} Pazartesi başlıyor.</p>
                <p className="text-sm text-muted-foreground mt-1">İlk haftanız o gün burada açılacak.</p>
              </>
            ) : (
              <>
                <p className="font-semibold">Tebrikler, 6 haftalık programı tamamladınız! 🎉</p>
                <p className="text-sm text-muted-foreground mt-1">Değerlendirmeniz için koçunuzla görüşebilirsiniz.</p>
              </>
            )}
          </div>
        </Card>
      )}

      {inProgram && (
        <div className="rounded-xl bg-primary/5 border border-primary/15 px-3 py-2.5 text-xs text-foreground/80">
          <b>{data.currentWeek}. hafta</b> açık. Girişlerinizi <b>Pazar {fmt(data.weekEnd)} 23:59</b>'a kadar yapabilirsiniz;
          pazartesi otomatik olarak bir sonraki haftaya geçilir.
        </div>
      )}

      {inProgram && <div className="flex justify-end">
        <div className="inline-flex rounded-xl bg-card ring-1 ring-border p-1 gap-1">
          {([["liste", "Liste", List], ["takvim", "Takvim", CalendarDays]] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => changeView(k)}
              className={`h-8 px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 ${view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>}

      {notice && <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{notice}</div>}

      {inProgram && <WeekView token={token} data={data} week={data.currentWeek} onToggle={toggle} onSaved={() => load()} readOnly={!!data.preview} view={view} />}
    </>
  );
}

function WeekView({ token, data, week, onToggle, onSaved, readOnly = false, view = "liste" }: {
  token: string; data: Data; week: number; onToggle: (id: string, done: boolean) => void; onSaved: () => void; readOnly?: boolean; view?: ViewMode;
}) {
  const row = data.weeks.find((w) => w.week === week)!;
  const confirmed = !!row.confirmedAt;
  const monday = data.week1Monday ? ukAddDays(data.week1Monday, (week - 1) * 7) : null;
  // Yalnızca içinde bulunulan hafta düzenlenebilir (sunucu da aynı kuralı uygular).
  const isCurrent = week === data.currentWeek;
  const isPast = !isCurrent && data.currentWeek > week;
  const locked = confirmed || !isCurrent;
  const started = !!monday && monday <= data.today;
  const acts = useMemo(() => UK_ACTIVITIES.filter((a) => a.week === week), [week]);

  return (
    <>
      {!confirmed && !isCurrent && (
        <div className="rounded-xl bg-muted/60 border border-border px-3 py-2.5 text-xs text-muted-foreground flex gap-2">
          <Lock className="h-4 w-4 shrink-0" />
          <p>
            {isPast
              ? "Bu hafta kapandı. Yalnızca içinde bulunduğunuz hafta düzenlenebilir; değişiklik için koçunuzla görüşün."
              : "Bu hafta henüz başlamadı. Haftası geldiğinde düzenleyebilirsiniz."}
          </p>
        </div>
      )}
      {confirmed && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-xs text-emerald-800 flex gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Koçunuz bu haftayı onayladı — değişiklik için koçunuzla görüşün.</p>
            {row.coachNote && <p className="mt-1 text-emerald-900/80">Koçunuzun notu: {row.coachNote}</p>}
          </div>
        </div>
      )}

      {view === "takvim" && (
        <>
          <UkGridLegend showScore={false} />
          <UkWeekGrid
            compact
            showScore={false}
            week={week}
            week1Monday={data.week1Monday}
            today={data.today}
            checks={data.checks}
            canToggle={(_a, date) => !readOnly && !locked && !!date && date <= data.today}
            onToggle={onToggle}
          />
        </>
      )}

      {view === "liste" && UK_DAYS.map((dayName, d) => {
        const date = monday ? ukAddDays(monday, d) : null;
        const isToday = date === data.today;
        const future = !date || date > data.today;
        const dayActs = acts.filter((a) => a.day === d).sort((a, b) => a.from - b.from);
        const dayDone = dayActs.filter((a) => data.checks[a.id]).length;
        return (
          <Card key={d} className={`!p-0 overflow-hidden ${isToday ? "ring-2 ring-primary" : ""}`}>
            <div className={`px-4 py-2.5 flex items-center justify-between ${isToday ? "bg-primary text-primary-foreground" : "bg-muted/50"}`}>
              <p className="font-semibold text-sm">{dayName} <span className={`font-normal ${isToday ? "opacity-90" : "text-muted-foreground"}`}>· {fmt(date)}</span></p>
              <span className={`text-xs ${isToday ? "opacity-90" : "text-muted-foreground"}`}>{isToday ? "Bugün · " : ""}{dayDone}/{dayActs.length}</span>
            </div>
            <ul className="divide-y divide-border">
              {dayActs.map((a) => {
                const done = !!data.checks[a.id];
                const disabled = locked || future || readOnly;
                const time = a.from === a.to ? UK_TIME_ROWS[a.from] : `${UK_TIME_ROWS[a.from].split("–")[0]}–${UK_TIME_ROWS[a.to].split("–")[1] ?? ""}`;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onToggle(a.id, !done)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${disabled ? "cursor-default" : "active:bg-muted/50"} ${future && !done ? "opacity-50" : ""}`}
                    >
                      <span className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center ring-1 ${done ? "bg-emerald-500 ring-emerald-500 text-white" : "ring-border bg-white"}`}>
                        {done && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm leading-snug ${done ? "text-emerald-800" : ""}`}>{a.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{time}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      <WeekActuals token={token} row={row} editable={started && !locked && !readOnly} onSaved={onSaved} />
      {!!data.programTargets?.length && <ProgramTargets items={data.programTargets} />}
    </>
  );
}

// 6 hafta sonu hedefleri: ilerleme (puan gösterilmez).
function ProgramTargets({ items }: { items: { key: string; label: string; target: number; done: number; hint: string }[] }) {
  return (
    <Card>
      <h3 className="font-semibold text-sm">6 hafta sonu hedeflerin</h3>
      <div className="mt-3 space-y-2.5">
        {items.map((t) => {
          const ok = t.done >= t.target;
          return (
            <div key={t.key}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">{ok && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{t.label}</span>
                <span className={`font-semibold ${ok ? "text-emerald-700" : ""}`}>{t.done} / {t.target}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${ok ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${Math.min(100, (t.done / t.target) * 100)}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t.hint}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function WeekActuals({ token, row, editable, onSaved }: { token: string; row: WeekRow; editable: boolean; onSaved: () => void }) {
  const [arama, setArama] = useState("");
  const [randevu, setRandevu] = useState("");
  const [tekYetki, setTekYetki] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setArama(row.arama?.toString() ?? "");
    setRandevu(row.randevu?.toString() ?? "");
    setTekYetki(row.tekYetki?.toString() ?? "");
    setMsg(null);
  }, [row.week, row.arama, row.randevu, row.tekYetki]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const r = await fetch(`/api/public/advisor/${token}/uk-program/weeks/${row.week}`, {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arama, randevu, tekYetki }),
    });
    setSaving(false);
    if (r.ok) { setMsg({ ok: true, text: "Kaydedildi" }); onSaved(); }
    else setMsg({ ok: false, text: (await r.json().catch(() => ({}))).message ?? "Kaydedilemedi." });
  };

  const input = (label: string, v: string, set: (s: string) => void, hint?: string) => (
    <label className="rounded-xl bg-muted/40 ring-1 ring-border p-2.5 block">
      <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
      {hint && <span className="block text-[10px] text-primary/80">{hint}</span>}
      <input
        type="number" inputMode="numeric" min={0} value={v} disabled={!editable}
        onChange={(e) => set(e.target.value)} placeholder="—"
        className="mt-1 w-full bg-white border border-input rounded-lg px-2 py-1.5 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-transparent disabled:border-transparent"
      />
    </label>
  );
  const auto = (label: string, v: string) => (
    <div className="rounded-xl bg-primary/5 ring-1 ring-primary/15 p-2.5">
      <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
      <p className="mt-1 px-2 py-1.5 text-base font-semibold">{v}</p>
    </div>
  );

  return (
    <Card>
      <h3 className="font-semibold text-sm">{row.week}. hafta gerçekleşen</h3>
      <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">Koçunla ölçülebilirliğini ve sonraki haftanın programını teyit et.</p>
      <div className="grid grid-cols-3 gap-2">
        {input("Arama", arama, setArama, "Hedef: 50 (günde 10)")}
        {input("Randevu", randevu, setRandevu, "Hedef: 1")}
        {input("Tek Yetki (Satılık)", tekYetki, setTekYetki, "Bu hafta alınan")}
        {auto("Kapanış", String(row.kapanis))}
        {auto("BHB", fmtTRY(row.bhb))}
        {auto("Katkı Payı", String(row.katkiPayi))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">Kapanış, BHB ve Katkı Payı sistemden otomatik gelir.</p>
      {editable && (
        <button
          onClick={save} disabled={saving}
          className="mt-3 w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Kaydet
        </button>
      )}
      {msg && <p className={`text-xs mt-2 ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </Card>
  );
}
