import type { Category, Market, Politician } from "@/lib/types";
import { getPoliticiansByPersonIds } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { getMarketBundle, listOpenMarkets, getOutcomeCountsForMarkets } from "@/app/lib/markets/repo";
import { bundleToMarket } from "@/app/lib/markets/adapter";

export type MarketCardData = { market: Market; featured: Politician[] };

/**
 * The feed pipeline shared by the homepage and /markets: open markets → bundles
 * (outcomes + personIds) → view models, with featured MK portraits resolved
 * against a single politicians map (one query, no N+1) and live predictor
 * counts fetched for every card in one query so each OddsBar shows the real
 * crowd split (not a blank 0/0 bar).
 */
export async function getMarketCards({
  category,
}: {
  category?: Category;
}): Promise<MarketCardData[]> {
  const marketRows = await listOpenMarkets({ category });
  const bundles = (
    await Promise.all(marketRows.map((m) => getMarketBundle({ marketId: m.id })))
  ).filter((b): b is NonNullable<typeof b> => b !== null);

  // Resolve by stable id, NOT by the active-only gallery list: linked outcome
  // politicians can be former MKs (Norwegian-law ministers' rivals, ex-PMs —
  // e.g. Bennett/Eizenkot on "מי ירכיב את הממשלה"), whose roster rows are
  // active=false yet must still render a portrait on feed cards.
  const linkedIds = [...new Set(bundles.flatMap((b) => b.personIds))];
  const polById = new Map<string, Politician>();
  for (const row of await getPoliticiansByPersonIds({ personIds: linkedIds })) {
    polById.set(String(row.personId), dbToCard(row));
  }
  const featuredFor = (personIds: number[]): Politician[] =>
    personIds.map((id) => polById.get(String(id))).filter((p): p is Politician => Boolean(p));

  const countsByMarket = await getOutcomeCountsForMarkets({
    marketIds: bundles.map((b) => b.market.id),
  });

  return bundles.map((b) => ({
    market: bundleToMarket({ ...b, counts: countsByMarket.get(b.market.id) }),
    featured: featuredFor(b.personIds),
  }));
}
