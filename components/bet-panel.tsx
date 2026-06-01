import type { Market } from "@/lib/types";
import { formatCoins, pct, totalPool } from "@/lib/format";
import { Coin } from "@/components/icons";

/**
 * Static preview of the bet flow. The interactive version (stake state, server
 * action, balance update) lands with the database — see PRD P0-5.
 */
export function BetPanel({ market }: { market: Market }) {
  const total = totalPool(market.outcomes);
  const stake = 100;
  const lead = [...market.outcomes].sort((a, b) => b.pool - a.pool)[0];
  const potential = Math.round(((total + stake) * stake) / (lead.pool + stake));

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-foreground">הימור</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          תצוגה מקדימה
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {market.outcomes.map((o, i) => {
          const tone =
            market.type === "binary"
              ? i === 0
                ? "border-positive text-positive"
                : "border-negative text-negative"
              : "border-border text-foreground";
          return (
            <span
              key={o.id}
              className={`rounded-lg border-2 px-3 py-1.5 text-sm font-bold ${tone}`}
            >
              {o.label} <span className="nums opacity-70">{pct(o.pool, total)}%</span>
            </span>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg bg-muted px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">סכום</span>
          <span className="inline-flex items-center gap-1.5">
            <Coin className="h-4 w-4 text-accent" />
            <span className="nums text-lg font-black text-foreground">{stake}</span>
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          {["10", "50", "100", "הכול"].map((c) => (
            <span
              key={c}
              className="rounded-md bg-card px-2.5 py-1 text-xs font-bold text-muted-foreground ring-1 ring-border"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">תשלום פוטנציאלי</span>
        <span className="nums font-black text-positive">+{formatCoins(potential)}</span>
      </div>

      <button
        type="button"
        className="mt-4 w-full rounded-lg bg-primary py-3 font-bold text-primary-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-hover"
      >
        הניחו ניחוש
      </button>
    </div>
  );
}
