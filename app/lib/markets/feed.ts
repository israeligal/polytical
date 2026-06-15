import type { Category, Market, Politician } from "@/lib/types";
import { getPoliticiansByPersonIds } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import {
  getMarketBundle,
  getMarketBundles,
  listOpenMarkets,
  listUnpredictedOpenMarkets,
  getOutcomeCountsForMarkets,
  getUserPredictions,
} from "@/app/lib/markets/repo";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import type { AppDb } from "@/app/lib/db-utils";

/** marketId → the viewer's picked-outcome label, for the המנדט-שלי chip on feed cards. */
export async function getMyPickLabels({
  userId,
  groupScope = null,
}: {
  userId: string;
  groupScope?: string | null;
}): Promise<Map<string, string>> {
  const predictions = await getUserPredictions({ userId, groupScope });
  return new Map(predictions.map((p) => [p.marketId, p.outcomeLabelHe]));
}

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
  groupScope = null,
}: {
  category?: Category;
  /** Active-coalition scope: null = national feed, id = that coalition's motions. */
  groupScope?: string | null;
}): Promise<MarketCardData[]> {
  const marketRows = await listOpenMarkets({ category, groupScope });
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

/**
 * Open markets the user has NOT yet predicted on — the deck feed. Returns the
 * same `MarketCardData` view-model as `getMarketCards` (outcomes with live
 * predictor counts + linked politician portraits) so pages can render deck
 * cards with the exact same components. Three DB round-trips regardless of
 * deck size: one for the unpredicted-market ids, one batched bundle fetch,
 * one batched politician fetch, one batched count fetch.
 */
export async function getUnpredictedOpenMarketCards({
  db,
  userId,
  excludeMarketId,
  limit = 8,
  groupScope = null,
}: {
  db: AppDb;
  userId: string;
  excludeMarketId?: string;
  limit?: number;
  /** Active-coalition scope: null = national deck, id = that coalition's motions. */
  groupScope?: string | null;
}): Promise<MarketCardData[]> {
  const marketRows = await listUnpredictedOpenMarkets({ db, userId, excludeMarketId, limit, groupScope });
  if (marketRows.length === 0) return [];

  const bundles = await getMarketBundles({
    db,
    marketIds: marketRows.map((m) => m.id),
  });

  const linkedIds = [...new Set(bundles.flatMap((b) => b.personIds))];
  const polById = new Map<string, Politician>();
  for (const row of await getPoliticiansByPersonIds({ db, personIds: linkedIds })) {
    polById.set(String(row.personId), dbToCard(row));
  }
  const featuredFor = (personIds: number[]): Politician[] =>
    personIds.map((id) => polById.get(String(id))).filter((p): p is Politician => Boolean(p));

  const countsByMarket = await getOutcomeCountsForMarkets({
    db,
    marketIds: bundles.map((b) => b.market.id),
  });

  return bundles.map((b) => ({
    market: bundleToMarket({ ...b, counts: countsByMarket.get(b.market.id) }),
    featured: featuredFor(b.personIds),
  }));
}
