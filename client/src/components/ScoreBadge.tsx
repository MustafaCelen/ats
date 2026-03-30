import { scoreLabel } from "@shared/scoring";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Star } from "lucide-react";

interface ScoreBadgeProps {
  score: number | null | undefined;
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, showLabel = false, size = "sm" }: ScoreBadgeProps) {
  const s = score ?? 0;
  const { label, color, bg, ring } = scoreLabel(s);
  const isUnrated = s === 0;

  const badgeSz = size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`inline-flex items-center gap-1 rounded-full font-semibold ${bg} ring-1 ${ring} ${badgeSz} ${color} cursor-default shrink-0`}
            data-testid="score-badge"
          >
            <Star className={`${size === "md" ? "h-3 w-3" : "h-2.5 w-2.5"} ${isUnrated ? "opacity-40" : ""}`}
              fill={isUnrated ? "none" : "currentColor"} />
            {isUnrated ? (
              <span>—/10</span>
            ) : (
              <span>{s}/10</span>
            )}
            {showLabel && !isUnrated && (
              <span className="opacity-70">· {label}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {isUnrated ? (
            <p>Not yet rated by hiring manager</p>
          ) : (
            <>
              <p className="font-semibold">{label} — {s} / 10</p>
              <p className="text-muted-foreground text-[10px] mt-0.5">Rated by hiring manager</p>
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Star row for the Rate dialog */
export function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" data-testid="star-picker">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          data-testid={`star-${n}`}
          className="transition-transform hover:scale-110 focus:outline-none"
        >
          <Star
            className={`h-5 w-5 ${n <= value ? "text-amber-400" : "text-muted-foreground/30"}`}
            fill={n <= value ? "currentColor" : "none"}
          />
        </button>
      ))}
    </div>
  );
}

/** Horizontal score bar for detail views */
export function ScoreBar({ score }: { score: number | null | undefined }) {
  const s = score ?? 0;
  const { label, color } = scoreLabel(s);
  const pct = (s / 10) * 100;

  const barColor =
    s >= 9 ? "bg-emerald-500" :
    s >= 7 ? "bg-blue-500" :
    s >= 5 ? "bg-amber-500" :
    s >= 3 ? "bg-orange-500" :
    s === 0 ? "bg-muted" :
              "bg-red-500";

  return (
    <div className="space-y-1" data-testid="score-bar">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Hiring Manager Score</span>
        {s === 0 ? (
          <span className="text-muted-foreground italic">Not rated yet</span>
        ) : (
          <span className={`font-bold ${color}`}>{s}/10 — {label}</span>
        )}
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
