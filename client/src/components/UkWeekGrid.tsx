import { Check } from "lucide-react";
import { UK_ACTIVITIES, UK_DAYS, UK_SCORE_ITEMS, UK_TIME_ROWS, ukAddDays, type UkActivity } from "@shared/uk-program";

// 45+45 Başarı Rotası haftalık takvimi (PDF düzeni: satırlar saat, sütunlar gün).
// Personel detay sayfası ve danışman portalı ("Rotam" → Takvim) ortak kullanır.

const scoreLabel = new Map(UK_SCORE_ITEMS.map((s) => [s.key, s.label]));

function fmtYmd(ymd: string | null) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function UkWeekGrid({
  week, week1Monday, today, checks, canToggle, onToggle, compact = false, showScore = true,
}: {
  week: number;
  week1Monday: string | null;
  today: string;
  checks: Record<string, { by?: string | null } | undefined>;
  canToggle: (a: UkActivity, date: string | null) => boolean;
  onToggle: (id: string, done: boolean) => void;
  compact?: boolean;
  /** false: puanlı/puansız ayrımı ve skor ipuçları gizlenir (danışman portalı). */
  showScore?: boolean;
}) {
  const acts = UK_ACTIVITIES.filter((a) => a.week === week);
  const monday = week1Monday ? ukAddDays(week1Monday, (week - 1) * 7) : null;
  return (
    // contain: geniş takvim kaydırma kutusunda kalsın, sayfa genişliğini büyütmesin.
    <div className="overflow-x-auto rounded-xl border border-border bg-card [contain:inline-size]">
      <div
        className={`grid gap-1.5 p-3 ${compact ? "min-w-[760px]" : "min-w-[980px]"}`}
        style={{
          gridTemplateColumns: `${compact ? "84px" : "112px"} repeat(5, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${UK_TIME_ROWS.length}, minmax(${compact ? 40 : 46}px, auto))`,
        }}
      >
        <div />
        {UK_DAYS.map((d, i) => {
          const date = monday ? ukAddDays(monday, i) : null;
          const isToday = date === today;
          return (
            <div key={d} className={`rounded-lg px-2 py-1.5 text-center ${isToday ? "bg-primary text-primary-foreground" : "bg-muted/60"}`}>
              <p className="text-xs font-bold uppercase tracking-wide">{d}</p>
              <p className={`text-[11px] ${isToday ? "opacity-90" : "text-muted-foreground"}`}>{fmtYmd(date)}</p>
            </div>
          );
        })}
        {UK_TIME_ROWS.map((t, r) => (
          <div
            key={t}
            className="flex items-center justify-center rounded-lg bg-amber-50 ring-1 ring-amber-200 text-[11px] font-semibold text-amber-900 text-center px-1"
            style={{ gridColumn: 1, gridRow: r + 2 }}
          >
            {t}
          </div>
        ))}
        {acts.map((a) => {
          const date = monday ? ukAddDays(monday, a.day) : null;
          const done = !!checks[a.id];
          const score = showScore && a.score ? scoreLabel.get(a.score) : null;
          const by = checks[a.id]?.by;
          const enabled = canToggle(a, date);
          const future = !date || date > today;
          return (
            <button
              key={a.id}
              type="button"
              disabled={!enabled}
              onClick={() => onToggle(a.id, !done)}
              title={showScore
                ? [score ? `Skor: ${score}` : "Takvim aktivitesi (puansız)", done && by ? `İşaretleyen: ${by}` : null].filter(Boolean).join("\n")
                : a.label}
              className={`relative rounded-lg px-2 py-1.5 text-left ${compact ? "text-[11px]" : "text-[11.5px]"} leading-snug font-medium ring-1 transition-colors flex items-center gap-2
                ${done ? "bg-emerald-50 ring-emerald-300 text-emerald-900" : score || !showScore ? "bg-white ring-border hover:ring-primary/50" : "bg-muted/30 ring-border/70 text-muted-foreground hover:ring-primary/40"}
                ${score && !done ? "border-l-[3px] border-l-primary" : ""}
                ${enabled ? "cursor-pointer" : "cursor-default"}
                ${!done && future && !enabled ? "opacity-60" : ""}`}
              style={{ gridColumn: a.day + 2, gridRow: `${a.from + 2} / ${a.to + 3}` }}
            >
              <span className="flex-1">{a.label}</span>
              <span className={`h-5 w-5 shrink-0 rounded-full flex items-center justify-center ring-1 ${done ? "bg-emerald-500 ring-emerald-500 text-white" : "ring-border bg-white"}`}>
                {done && <Check className="h-3 w-3" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function UkGridLegend({ showScore = true }: { showScore?: boolean }) {
  return (
    <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
      {showScore && (
        <>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-white ring-1 ring-border border-l-[3px] border-l-primary" /> Puanlı aktivite</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-muted/50 ring-1 ring-border" /> Takvim aktivitesi (puansız)</span>
        </>
      )}
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-emerald-100 ring-1 ring-emerald-300" /> Yapıldı</span>
    </div>
  );
}
