import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import type { Market, Politician } from "@/lib/types";
import { normalizeSearchName } from "@/app/lib/knesset/search-name";
import { searchMarkets, getMarketBundles } from "@/app/lib/markets/repo";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import { searchPoliticians, getPoliticianByPersonId } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

/** Below this many (normalized) chars we don't search — too noisy. */
export const MIN_QUERY_LEN = 2;

export interface MarketResult {
  market: Market;
  featured: Politician[];
}

export interface SearchResults {
  q: string;
  normalized: string;
  politicians: Politician[];
  markets: MarketResult[];
}

/**
 * Global discovery search across markets + politicians. Normalizes the query
 * once (same Hebrew-aware normalization the indexed columns use), runs both
 * searches in parallel, and bundles each market into the view-model the cards
 * consume (with its featured MK portraits resolved by stable personId). A query
 * shorter than MIN_QUERY_LEN returns empty — no fuzzy guessing.
 */
export async function search({
  db = defaultDb,
  q,
}: {
  db?: DB;
  q: string;
}): Promise<SearchResults> {
  const normalized = normalizeSearchName(q);
  if (normalized.length < MIN_QUERY_LEN) {
    return { q, normalized, politicians: [], markets: [] };
  }

  const [politicianRows, marketRows] = await Promise.all([
    searchPoliticians({ db, q: normalized }),
    searchMarkets({ db, q: normalized }),
  ]);

  const politicians = politicianRows.map(dbToCard);

  // Hydrate the matched markets' bundles in ONE batched read (3 queries total),
  // then resolve each market's featured portraits from a personId→card map.
  const bundles = await getMarketBundles({ db, marketIds: marketRows.map((m) => m.id) });

  const neededPersonIds = new Set<number>(bundles.flatMap((b) => b.personIds));
  const cardByPersonId = new Map<number, Politician>();
  // Reuse the politician rows we already matched, then fill any gaps.
  for (const row of politicianRows) {
    if (neededPersonIds.has(row.personId)) cardByPersonId.set(row.personId, dbToCard(row));
  }
  const missing = [...neededPersonIds].filter((id) => !cardByPersonId.has(id));
  if (missing.length > 0) {
    const fetched = await Promise.all(missing.map((id) => getPoliticianByPersonId({ db, personId: id })));
    for (const row of fetched) if (row) cardByPersonId.set(row.personId, dbToCard(row));
  }

  const markets: MarketResult[] = bundles.map((b) => ({
    market: bundleToMarket(b),
    featured: b.personIds.map((id) => cardByPersonId.get(id)).filter((p): p is Politician => Boolean(p)),
  }));

  return { q, normalized, politicians, markets };
}
