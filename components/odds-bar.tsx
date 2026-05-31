import type { Market } from "@/lib/types";
import { pct, totalPool } from "@/lib/format";
import { catBg } from "@/lib/cat";

/**
 * The signature component: crowd-driven odds. Binary uses the reserved
 * positive/negative tokens; multi uses categorical segments. Widths animate
 * (transition-[width]) for when live odds move later.
 */
export function OddsBar({ market }: { market: Market }) {
  const total = totalPool(market.outcomes);

  if (market.type === "binary") {
    const [yes, no] = market.outcomes;
    const yp = pct(yes.pool, total);
    const np = 100 - yp;
    return (
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-positive">{yes.label}</span>
            <span className="nums text-2xl font-black text-positive">{yp}%</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <span className="nums text-2xl font-black text-negative">{np}%</span>
            <span className="text-sm font-bold text-negative">{no.label}</span>
          </span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-muted ring-1 ring-border">
          <div
            className="h-full bg-positive transition-[width] duration-500 ease-out"
            style={{ width: `${yp}%` }}
          />
          <div
            className="h-full bg-negative transition-[width] duration-500 ease-out"
            style={{ width: `${np}%` }}
          />
        </div>
      </div>
    );
  }

  const sorted = [...market.outcomes].sort((a, b) => b.pool - a.pool);
  return (
    <div className="space-y-2.5">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted ring-1 ring-border">
        {sorted.map((o) => (
          <div
            key={o.id}
            className={`h-full transition-[width] duration-500 ease-out ${catBg[o.color ?? 1]}`}
            style={{ width: `${pct(o.pool, total)}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {sorted.map((o) => (
          <li key={o.id} className="inline-flex items-center gap-1.5 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${catBg[o.color ?? 1]}`} />
            <span className="font-semibold text-foreground">{o.label}</span>
            <span className="nums font-bold text-muted-foreground">
              {pct(o.pool, total)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
