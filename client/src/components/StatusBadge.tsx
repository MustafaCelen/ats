import { clsx } from "clsx";

const CONFIG: Record<string, { label: string; className: string }> = {
  applied:      { label: "Başvuru",       className: "bg-blue-50 text-blue-700 border-blue-200" },
  screening:    { label: "Tarama",        className: "bg-purple-50 text-purple-700 border-purple-200" },
  interview:    { label: "Mülakat",       className: "bg-amber-50 text-amber-700 border-amber-200" },
  offer:        { label: "Sözleşme Önerildi", className: "bg-pink-50 text-pink-700 border-pink-200" },
  hired:        { label: "Sözleşme İmzalandı", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  myk_training: { label: "MYK Eğitimi",  className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  account_setup:{ label: "Hesap Kur.",   className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  documents:    { label: "Belgeler",      className: "bg-violet-50 text-violet-700 border-violet-200" },
  rejected:     { label: "Reddedildi",   className: "bg-red-50 text-red-700 border-red-200" },
  draft:        { label: "Taslak",        className: "bg-gray-100 text-gray-600 border-gray-200" },
  open:         { label: "Açık",          className: "bg-green-100 text-green-700 border-green-200" },
  closed:       { label: "Kapalı",        className: "bg-slate-100 text-slate-600 border-slate-200" },
  archived:     { label: "Arşiv",         className: "bg-orange-100 text-orange-700 border-orange-200" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = CONFIG[status?.toLowerCase()] ?? {
    label: status,
    className: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={clsx("inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold", cfg.className)}>
      {cfg.label}
    </span>
  );
}

export const STAGE_COLORS: Record<string, string> = {
  applied:      "#3b82f6",
  screening:    "#a855f7",
  interview:    "#f59e0b",
  offer:        "#ec4899",
  hired:        "#10b981",
  myk_training: "#06b6d4",
  account_setup:"#6366f1",
  documents:    "#8b5cf6",
  rejected:     "#ef4444",
};
