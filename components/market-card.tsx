import Link from "next/link";
import type { Market } from "@/lib/types";
import { marketPoliticians } from "@/lib/mock-data";
import { formatCoins, totalPool } from "@/lib/format";
import { CategoryBadge, Countdown, HotBadge } from "@/components/badges";
import { OddsBar } from "@/components/odds-bar";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { Coin } from "@/components/icons";

/** Feed card (Feature tier): the whole card links to the market; hover lifts. */
export function MarketCard({ market }: { market: Market }) {
  const pols = marketPoliticians(market);
  const volume = totalPool(market.outcomes);

  return (
    <Link
      href={`/market/${market.id}`}
      className="group block rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-md"
    >
      <div className="mb-3 flex items-center justify-between">
        <CategoryBadge category={market.category} />
        {market.hot && <HotBadge />}
      </div>

      <h3 className="mb-4 font-display text-xl font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
        {market.question}
      </h3>

      <OddsBar market={market} />

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Coin className="h-4 w-4 text-accent" />
            <span className="nums font-bold text-foreground">{formatCoins(volume)}</span>
            מטבעות
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
