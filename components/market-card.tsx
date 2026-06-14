import Link from "next/link";
import type { Market, Politician } from "@/lib/types";
import { marketPoliticians } from "@/lib/mock-data";
import { formatCount } from "@/lib/format";
import { CategoryBadge, Countdown, HotBadge } from "@/components/badges";
import { StatusChip } from "@/components/status-chip";
import { OddsBar } from "@/components/odds-bar";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { Users } from "@/components/icons";

/**
 * Feed card (Feature tier): the whole card links to the market; hover lifts.
 * `featured` lets the (real-data) server pages pass resolved MK portraits in;
 * when omitted it falls back to `marketPoliticians(market)` so mock callers
 * (Storybook, fixtures) keep working unchanged.
 */
export function MarketCard({
  market,
  featured,
  myPickLabel,
}: {
  market: Market;
  featured?: Politician[];
  /** The viewer's picked-outcome label — renders the המנדט-שלי chip when set. */
  myPickLabel?: string;
}) {
  const pols = featured ?? marketPoliticians(market);
  const predictors = market.outcomes.reduce((sum, o) => sum + o.predictors, 0);

  return (
    <Link
      href={`/market/${market.id}`}
      className="group flex h-full flex-col rounded-card border border-border bg-card p-4 shadow-2 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-3 hover:shadow-glow-mint"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <CategoryBadge category={market.category} />
        <span className="flex min-w-0 items-center gap-1.5">
          {myPickLabel && (
            <StatusChip tone="positive" className="min-w-0">
              <span className="truncate">המנדט שלי: {myPickLabel}</span>
            </StatusChip>
          )}
          {market.hot && <HotBadge />}
        </span>
      </div>

      <h3 className="mb-4 min-h-[2.75em] font-sans text-[17px] font-extrabold leading-snug text-foreground transition-colors group-hover:text-primary line-clamp-2">
        {market.question}
      </h3>

      {/* mb-4 is the MINIMUM gap before the pinned footer — on the tallest card
          in a row, the footer's mt-auto computes to 0 and only this margin
          keeps the border-t off the odds bar. */}
      <div className="mb-4">
        <OddsBar market={market} compact />
      </div>

      {/* min-h-9 = the sm portrait height — a portrait-less footer reserves the
          same row height, so the border-t separator aligns across siblings. */}
      <div className="mt-auto flex min-h-[calc(2.25rem+0.75rem)] items-center justify-between gap-2 border-t border-border pt-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-[18px] w-[18px]" />
            <span className="nums font-extrabold text-gold">{formatCount(predictors)}</span>
          </span>
          <span className="text-border">•</span>
          <Countdown closeAt={market.closeAt} />
        </div>
        <div className="flex">
          {pols.map((p) => (
            <div key={p.id} className="-ms-2 rounded-full ring-2 ring-card first:ms-0">
              <PoliticianPortrait politician={p} size="sm" />
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
