import { ukMondayOptions, ukProgramWeek1Monday, ukAddDays, ukIsMonday } from "@shared/uk-program";

// 45+45 program başlangıcı yalnızca pazartesi seçilebilir (sunucu da doğrular).
export function localTodayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nextMondayYmd(today = localTodayYmd()) {
  return ukAddDays(ukProgramWeek1Monday(today), 7);
}

function label(ymd: string, thisMonday: string) {
  const d = new Date(ymd + "T00:00:00Z");
  const txt = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  const diff = Math.round((Date.parse(ymd) - Date.parse(thisMonday)) / (7 * 86400000));
  const rel = diff === 0 ? " · bu hafta" : diff === 1 ? " · gelecek hafta" : diff === -1 ? " · geçen hafta" : "";
  return `${txt} Pazartesi${rel}`;
}

export function UkMondaySelect({
  value, onChange, className = "", before = 8, after = 12,
}: { value: string; onChange: (v: string) => void; className?: string; before?: number; after?: number }) {
  const today = localTodayYmd();
  const thisMonday = ukProgramWeek1Monday(today);
  const opts = ukMondayOptions(today, before, after);
  // Kayıtlı değer listede yoksa (eski / pazartesi olmayan) en üste ekle.
  const all = value && !opts.includes(value) ? [value, ...opts] : opts;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {!value && <option value="">Seçin…</option>}
      {all.map((m) => (
        <option key={m} value={m}>{ukIsMonday(m) ? label(m, thisMonday) : `${m} (pazartesi değil)`}</option>
      ))}
    </select>
  );
}
