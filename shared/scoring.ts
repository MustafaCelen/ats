/**
 * Candidate Scoring — manual 0–10 scale set by hiring manager
 */

/** Return a label and color class for a given 0–10 score */
export function scoreLabel(score: number | null | undefined): {
  label: string;
  color: string;
  bg: string;
  ring: string;
} {
  const s = score ?? 0;
  if (s === 0) return { label: "Unrated", color: "text-muted-foreground", bg: "bg-muted/40",    ring: "ring-border" };
  if (s >= 9)  return { label: "Excellent", color: "text-emerald-700",    bg: "bg-emerald-50",  ring: "ring-emerald-400" };
  if (s >= 7)  return { label: "Strong",    color: "text-blue-700",       bg: "bg-blue-50",     ring: "ring-blue-400" };
  if (s >= 5)  return { label: "Good",      color: "text-amber-700",      bg: "bg-amber-50",    ring: "ring-amber-400" };
  if (s >= 3)  return { label: "Fair",      color: "text-orange-700",     bg: "bg-orange-50",   ring: "ring-orange-400" };
  return              { label: "Low",       color: "text-red-700",        bg: "bg-red-50",      ring: "ring-red-400" };
}
