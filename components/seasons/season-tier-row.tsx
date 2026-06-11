import { Trophy, Lock } from "@/components/icons";
import { formatCount } from "@/lib/format";

/**
 * One accuracy-tier row. `reached` (the user has enough correct predictions this
 * season) → a gold trophy + "הושג" badge; otherwise a lock + the # correct it
 * still needs. Tiers are derived live from the prediction record — there's
 * nothing to claim, so this is purely presentational.
 */
export function SeasonTierRow({
  ordinal,
  nameHe,
  goalCorrect,
  reached,
}: {
  ordinal: number;
  nameHe: string;
  goalCorrect: number;
  reached: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-card border p-4 transition-colors ${
        reached ? "border-accent/50 bg-accent/5 shadow-glow-gold" : "border-border bg-card"
      }`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-display text-lg ${
          reached ? "bg-accent/15 text-accent" : "bg-background text-muted-foreground"
        }`}
      >
        {reached ? <Trophy className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-display text-lg text-foreground">
          <span className="text-muted-foreground">{ordinal}. </span>
          {nameHe}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="nums">{formatCount(goalCorrect)}</span> מנדטים מדויקים בעונה
        </p>
      </div>

      {reached ? (
        <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent">
          הושג ✓
        </span>
      ) : (
        <span className="shrink-0 text-sm font-semibold text-muted-foreground">נעול</span>
      )}
    </div>
  );
}
