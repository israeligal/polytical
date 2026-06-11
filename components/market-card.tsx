import Link from "next/link";
import type { Market, Politician } from "@/lib/types";
import { marketPoliticians } from "@/lib/mock-data";
import { formatCount } from "@/lib/format";
import { CategoryBadge, Countdown, HotBadge } from "@/components/badges";
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
}: {
  market: Market;
  featured?: Politician[];
}) {
  const pols = featured ?? marketPoliticians(market);
  const predictors = market.outcomes.reduce((sum, o) => sum + o.predictors, 0);

  return (
    <Link
      href={`/market/${market.id}`}
      className="group block rounded-card border border-border bg-card p-4 shadow-2 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-3 hover:shadow-glow-mint"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <CategoryBadge category={market.category} />
        {market.hot && <HotBadge />}
      </div>

      <h3 className="mb-4 font-sans text-[17px] font-extrabold leading-snug text-foreground transition-colors group-hover:text-primary">
        {market.question}
      </h3>

      <OddsBar market={market} compact />

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-sm">
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
