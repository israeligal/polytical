import type { Market } from "@/lib/types";
import { pct, totalPool } from "@/lib/format";
import { catBg } from "@/lib/cat";

/**
 * The signature component: the YES/NO odds duel. Binary renders one split bar —
 * mint YES segment (at the start/right in RTL) vs coral NO segment — with the
 * label + percentage set INSIDE each segment in dark ink, widths animating as
 * the crowd moves. Multi uses categorical segments + a legend.
 */
export function OddsBar({ market }: { market: Market }) {
  const total = totalPool(market.outcomes);

  if (market.type === "binary") {
    const [yes, no] = market.outcomes;
    const yp = pct(yes.pool, total);
    const np = 100 - yp;
    return (
      <div className="flex h-10 overflow-hidden rounded-[12px] border border-border">
        <div
          className="flex min-w-[54px] items-center bg-positive px-3 text-sm font-extrabold text-primary-foreground transition-[width] duration-500 ease-out"
          style={{ width: `${yp}%` }}
        >
          <span className="nums truncate">{yes.label} {yp}%</span>
        </div>
        <div
          className="flex min-w-[54px] items-center justify-end bg-negative px-3 text-sm font-extrabold text-primary-foreground transition-[width] duration-500 ease-out"
          style={{ width: `${np}%` }}
        >
          <span className="nums truncate">{no.label} {np}%</span>
        </div>
      </div>
    );
  }

  const sorted = [...market.outcomes].sort((a, b) => b.pool - a.pool);
  return (
    <div className="space-y-2.5">
      <div className="flex h-10 gap-0.5 overflow-hidden rounded-[12px] border border-border">
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
            <span className="nums font-bold text-muted-foreground">{pct(o.pool, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
