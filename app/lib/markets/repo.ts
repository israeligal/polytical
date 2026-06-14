import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, desc, eq, gt, inArray, isNull, lte, notExists, notInArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import type { Tx } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { bets, marketPoliticians, markets, outcomes, politicians, users } from "@/app/lib/schema";
import { normalizeSearchName } from "@/app/lib/knesset/search-name";
import { requireUserId } from "@/app/lib/errors";

// Market repository: scope-guarded, tx-aware DB access for the prediction service.
//
// Two access modes:
//  - MUTATING paths join an existing transaction (`tx`) so the market-row lock
//    (`getMarketForUpdate` → FOR UPDATE) and the prediction/stat writes share one
//    atomic unit. Lock ordering is market→user.
//  - READ helpers default to the shared `db` (no tx) for server-component reads.

// Driver-agnostic DB handle (postgres-js in prod, PGlite in tests). Mirrors the
// politicians repo so reads are injectable without an `as any`.
type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type MarketRow = typeof markets.$inferSelect;
export type OutcomeRow = typeof outcomes.$inferSelect;
export type PredictionRow = typeof bets.$inferSelect;

// --- Mutating, tx-aware (lock the market row FIRST, then write predictions/stats) ---

/** Locks the market row FOR UPDATE; concurrent bets/resolves serialize here. */
export async function getMarketForUpdate({
  tx,
  marketId,
}: {
  tx: Tx;
  marketId: string;
}): Promise<MarketRow | null> {
  const [row] = await tx.select().from(markets).where(eq(markets.id, marketId)).for("update");
  return row ?? null;
}

/** An outcome row, scoped to its market (rejects cross-market outcome ids). */
export async function getOutcome({
  tx,
  outcomeId,
  marketId,
}: {
  tx: Tx;
  outcomeId: string;
  marketId: string;
}): Promise<OutcomeRow | null> {
  const [row] = await tx
    .select()
    .from(outcomes)
    .where(and(eq(outcomes.id, outcomeId), eq(outcomes.marketId, marketId)));
  return row ?? null;
}

/** All outcomes of a market, ordered by ordinal. */
export async function listOutcomes({
  tx,
  marketId,
}: {
  tx: Tx;
  marketId: string;
}): Promise<OutcomeRow[]> {
  return tx
    .select()
    .from(outcomes)
    .where(eq(outcomes.marketId, marketId))
    .orderBy(asc(outcomes.ordinal));
}

/** Records the user's prediction on a market: one stake-less pick per
 *  (user, market). Re-predicting changes the pick in place (upsert on the
 *  unique index) until the market closes. Returns the prediction row id. */
export async function upsertPrediction({
  tx,
  userId,
  marketId,
  outcomeId,
}: {
  tx: Tx;
  userId: string;
  marketId: string;
  outcomeId: string;
}): Promise<{ id: string }> {
  const [row] = await tx
    .insert(bets)
    .values({ userId, marketId, outcomeId })
    // Change the pick in place but KEEP the original createdAt (and seenAt) so a
    // changed prediction doesn't jump to the top of the portfolio's createdAt order.
    .onConflictDoUpdate({
      target: [bets.userId, bets.marketId],
      set: { outcomeId },
    })
    .returning({ id: bets.id });
  return row;
}

/** All predictions on a market (the set tallied on resolve). */
export async function listPredictions({
  tx,
  marketId,
}: {
  tx: Tx;
  marketId: string;
}): Promise<PredictionRow[]> {
  return tx.select().from(bets).where(eq(bets.marketId, marketId));
}

/** The market's featured politicians with their role (for card-unlock thresholds). */
export async function getMarketPoliticianRoles({
  tx,
  marketId,
}: {
  tx: Tx;
  marketId: string;
}): Promise<{ personId: number; roleHe: string | null }[]> {
  return tx
    .select({ personId: marketPoliticians.personId, roleHe: politicians.roleHe })
    .from(marketPoliticians)
    .leftJoin(politicians, eq(politicians.personId, marketPoliticians.personId))
    .where(eq(marketPoliticians.marketId, marketId));
}

/** One politician's role by stable personId (tx-aware) — the resolution-time
 *  lookup for a winning outcome's linked MK. Independent of market_politicians,
 *  so progress scoping survives links added outside createMarket (backfills). */
export async function getPoliticianRoleByPersonId({
  tx,
  personId,
}: {
  tx: Tx;
  personId: number;
}): Promise<{ personId: number; roleHe: string | null } | null> {
  const [row] = await tx
    .select({ personId: politicians.personId, roleHe: politicians.roleHe })
    .from(politicians)
    .where(eq(politicians.personId, personId))
    .limit(1);
  return row ?? null;
}

/** Live predictor count per outcome of a market (replaces the cached pool) —
 *  the crowd-split the odds bars render. Returns outcomeId → count. */
export async function getOutcomeCounts({
  db = defaultDb,
  marketId,
}: {
  db?: DB;
  marketId: string;
}): Promise<Map<string, number>> {
  const rows = await db
    .select({ outcomeId: bets.outcomeId, n: sql<number>`count(*)::int` })
    .from(bets)
    .where(eq(bets.marketId, marketId))
    .groupBy(bets.outcomeId);
  return new Map(rows.map((r) => [r.outcomeId, r.n]));
}

/** Predictor counts for MANY markets in one query → marketId → (outcomeId → count).
 *  Feed pages use this so every card's crowd split is real (no N+1, no blank bars). */
export async function getOutcomeCountsForMarkets({
  db = defaultDb,
  marketIds,
}: {
  db?: DB;
  marketIds: string[];
}): Promise<Map<string, Map<string, number>>> {
  const ids = [...new Set(marketIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ marketId: bets.marketId, outcomeId: bets.outcomeId, n: sql<number>`count(*)::int` })
    .from(bets)
    .where(inArray(bets.marketId, ids))
    .groupBy(bets.marketId, bets.outcomeId);
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = out.get(r.marketId) ?? new Map<string, number>();
    m.set(r.outcomeId, r.n);
    out.set(r.marketId, m);
  }
  return out;
}

/** Bumps a user's forecaster-accuracy counters on a resolve: +1 resolved, and
 *  +1 win when their prediction was on the winning outcome. Rides inside the
 *  resolveMarket transaction. */
export async function bumpUserStats({
  tx,
  userId,
  won,
}: {
  tx: Tx;
  userId: string;
  won: boolean;
}): Promise<void> {
  await tx
    .update(users)
    .set({
      totalResolved: sql`${users.totalResolved} + 1`,
      totalWins: sql`${users.totalWins} + ${won ? 1 : 0}`,
    })
    .where(eq(users.id, userId));
}

/** Marks a market resolved with its winning outcome + resolution provenance. */
export async function markResolved({
  tx,
  marketId,
  winningOutcomeId,
  sourceUrl,
  note,
}: {
  tx: Tx;
  marketId: string;
  winningOutcomeId: string;
  sourceUrl?: string;
  note?: string;
}): Promise<void> {
  // The status guard makes the terminal invariant hold at the DB layer too, not
  // just via the service's FOR UPDATE check — a direct caller can't overwrite an
  // already-settled market (the UPDATE matches 0 rows).
  await tx
    .update(markets)
    .set({
      status: "resolved",
      resolvedOutcomeId: winningOutcomeId,
      resolutionSourceUrl: sourceUrl ?? null,
      resolutionNote: note ?? null,
      resolvedAt: new Date(),
    })
    .where(and(eq(markets.id, marketId), notInArray(markets.status, ["resolved", "voided"])));
}

/** Marks a market voided (predictions left untouched — no stakes to refund).
 *  Status-guarded so a settled market can't be re-voided at the DB layer. */
export async function markVoided({ tx, marketId }: { tx: Tx; marketId: string }): Promise<void> {
  await tx
    .update(markets)
    .set({ status: "voided", resolvedAt: new Date() })
    .where(and(eq(markets.id, marketId), notInArray(markets.status, ["resolved", "voided"])));
}

/** Hard-deletes a market row. FK cascades wipe its outcomes, predictions
 *  (bets), market_politicians links and comments in the same statement;
 *  notifications survive by design (ref* columns carry no FK). Status-guarded
 *  in SQL like markResolved/markVoided: a RESOLVED market already bumped
 *  accuracy stats + card progress, so even a direct caller can't delete it
 *  (the DELETE matches 0 rows). The service adds the error + notification. */
export async function deleteMarket({ tx, marketId }: { tx: Tx; marketId: string }): Promise<void> {
  await tx
    .delete(markets)
    .where(and(eq(markets.id, marketId), notInArray(markets.status, ["resolved"])));
}

// --- Closing-soon sweep (the cron's queries) ---

/** OPEN markets closing within `withinMs` from `now` that haven't had their
 *  closing-soon notice sent yet (closingSoonNotifiedAt IS NULL). Soonest first. */
export async function listMarketsClosingSoon({
  db = defaultDb,
  withinMs,
  now,
}: {
  db?: DB;
  withinMs: number;
  now: Date;
}): Promise<MarketRow[]> {
  const horizon = new Date(now.getTime() + withinMs);
  return db
    .select()
    .from(markets)
    .where(
      and(
        eq(markets.status, "open"),
        isNull(markets.groupId), // group motions don't use the global closing-soon cron
        isNull(markets.closingSoonNotifiedAt),
        gt(markets.closeAt, now),
        lte(markets.closeAt, horizon),
      ),
    )
    .orderBy(asc(markets.closeAt));
}

/** Distinct users who have a bet on a market (the closing-soon notice audience). */
export async function getMarketBettors({
  tx,
  marketId,
}: {
  tx: Tx;
  marketId: string;
}): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ userId: bets.userId })
    .from(bets)
    .where(eq(bets.marketId, marketId));
  return rows.map((r) => r.userId);
}

/** Claims the closing-soon notice for a market: stamps closingSoonNotifiedAt only
 *  if still NULL AND the market is still open + not yet past closeAt. Returns true
 *  iff THIS call won. The status/closeAt predicates are part of the atomic UPDATE
 *  (which row-locks), so a market resolved/voided/closed in the gap since the
 *  unlocked list read is NOT claimed — its bettors never get a stale "closing
 *  soon" push. Concurrent crons also can't double-send (loser matches 0 rows). */
export async function markClosingSoonNotified({
  tx,
  marketId,
  now,
}: {
  tx: Tx;
  marketId: string;
  now: Date;
}): Promise<boolean> {
  const rows = await tx
    .update(markets)
    .set({ closingSoonNotifiedAt: now })
    .where(
      and(
        eq(markets.id, marketId),
        eq(markets.status, "open"),
        gt(markets.closeAt, now),
        isNull(markets.closingSoonNotifiedAt),
      ),
    )
    .returning({ id: markets.id });
  return rows.length > 0;
}

// --- Read helpers (default `db`, no tx) ---

/** Open markets for the feed, optionally filtered by category, newest first. */
export async function listOpenMarkets({
  db = defaultDb,
  category,
}: {
  db?: DB;
  category?: string;
} = {}): Promise<MarketRow[]> {
  // isNull(groupId): global feed never shows group-only motions (feed isolation).
  const where = category
    ? and(eq(markets.status, "open"), eq(markets.category, category), isNull(markets.groupId))
    : and(eq(markets.status, "open"), isNull(markets.groupId));
  return db.select().from(markets).where(where).orderBy(sql`${markets.createdAt} desc`);
}

/**
 * Open markets (status = 'open' AND closeAt > now) where the given user has
 * made NO prediction yet — the source list for the "answer deck" feature. The
 * anti-join is via NOT EXISTS on the unique (userId, marketId) bets index, so
 * it is a single index probe per candidate row, not a hash of all bets.
 *
 * Ordering: newest first (createdAt DESC), matching listOpenMarkets. Excludes
 * `excludeMarketId` when provided.
 */
export async function listUnpredictedOpenMarkets({
  db = defaultDb,
  userId,
  excludeMarketId,
  limit = 8,
  now = new Date(),
}: {
  db?: DB;
  userId: string;
  excludeMarketId?: string;
  limit?: number;
  now?: Date;
}): Promise<MarketRow[]> {
  const uid = requireUserId(userId);
  const conditions = [
    eq(markets.status, "open"),
    isNull(markets.groupId), // global answer-deck never includes group motions
    gt(markets.closeAt, now),
    notExists(
      db
        .select({ one: sql`1` })
        .from(bets)
        .where(and(eq(bets.userId, uid), eq(bets.marketId, markets.id))),
    ),
  ];
  if (excludeMarketId != null) conditions.push(sql`${markets.id} <> ${excludeMarketId}`);
  return db
    .select()
    .from(markets)
    .where(and(...conditions))
    .orderBy(desc(markets.createdAt))
    .limit(limit);
}

/**
 * The "market of the day": the OPEN market with the most bets (highest activity),
 * ties broken by newest. Drives the homepage daily-challenge highlight. Returns
 * null when no market is open. A left join keeps zero-bet markets eligible so a
 * fresh app with no bets yet still surfaces something.
 */
export async function getMarketOfTheDay({
  db = defaultDb,
}: { db?: DB } = {}): Promise<MarketRow | null> {
  const [row] = await db
    .select({ market: markets, betCount: sql<number>`count(${bets.id})::int` })
    .from(markets)
    .leftJoin(bets, eq(bets.marketId, markets.id))
    .where(and(eq(markets.status, "open"), isNull(markets.groupId)))
    .groupBy(markets.id)
    .orderBy(desc(sql`count(${bets.id})`), desc(markets.createdAt))
    .limit(1);
  return row?.market ?? null;
}

/** Markets an admin can still act on (open + closed, plus voided — those can
 *  still be hard-deleted for cleanup), each with its ordered outcomes — drives
 *  the admin resolve/void/delete list. Newest first; one query per table (no
 *  per-market round-trips). */
export async function listManageableMarkets({
  db = defaultDb,
}: {
  db?: DB;
} = {}): Promise<{ market: MarketRow; outcomes: OutcomeRow[] }[]> {
  const rows = await db
    .select()
    .from(markets)
    // Group motions are owner-resolved in-group; never in the platform admin queue.
    .where(and(inArray(markets.status, ["open", "closed", "voided"]), isNull(markets.groupId)))
    .orderBy(desc(markets.createdAt));
  if (rows.length === 0) return [];
  const outs = await db
    .select()
    .from(outcomes)
    .where(
      inArray(
        outcomes.marketId,
        rows.map((m) => m.id),
      ),
    )
    .orderBy(asc(outcomes.ordinal));
  return rows.map((market) => ({
    market,
    outcomes: outs.filter((o) => o.marketId === market.id),
  }));
}

/** A single market row by id (light read; null if missing). */
export async function getMarket({ db = defaultDb, marketId }: { db?: DB; marketId: string }): Promise<MarketRow | null> {
  const [row] = await db.select().from(markets).where(eq(markets.id, marketId));
  return row ?? null;
}

/** One market plus its ordered outcomes and featured politician personIds. */
export async function getMarketBundle({
  db = defaultDb,
  marketId,
}: {
  db?: DB;
  marketId: string;
}): Promise<{ market: MarketRow; outcomes: OutcomeRow[]; personIds: number[] } | null> {
  const [market] = await db.select().from(markets).where(eq(markets.id, marketId));
  if (!market) return null;
  const outs = await db
    .select()
    .from(outcomes)
    .where(eq(outcomes.marketId, marketId))
    .orderBy(asc(outcomes.ordinal));
  const links = await db
    .select({ personId: marketPoliticians.personId })
    .from(marketPoliticians)
    .where(eq(marketPoliticians.marketId, marketId));
  return { market, outcomes: outs, personIds: links.map((l) => l.personId) };
}

/**
 * Batched bundles for many markets — three queries total regardless of count
 * (markets by id, outcomes by ids, links by ids), modeled on
 * getMarketsForPolitician. Use this over mapping getMarketBundle per id (which
 * is 3 queries EACH). Returned in the order of the passed ids; unknown ids drop.
 */
export async function getMarketBundles({
  db = defaultDb,
  marketIds,
}: {
  db?: DB;
  marketIds: string[];
}): Promise<{ market: MarketRow; outcomes: OutcomeRow[]; personIds: number[] }[]> {
  const ids = [...new Set(marketIds)];
  if (ids.length === 0) return [];
  const [mkts, outs, allLinks] = await Promise.all([
    db.select().from(markets).where(inArray(markets.id, ids)),
    db.select().from(outcomes).where(inArray(outcomes.marketId, ids)).orderBy(asc(outcomes.ordinal)),
    db.select().from(marketPoliticians).where(inArray(marketPoliticians.marketId, ids)),
  ]);
  const byId = new Map(mkts.map((m) => [m.id, m]));
  return marketIds
    .map((id) => byId.get(id))
    .filter((m): m is MarketRow => Boolean(m))
    .map((market) => ({
      market,
      outcomes: outs.filter((o) => o.marketId === market.id),
      personIds: allLinks.filter((l) => l.marketId === market.id).map((l) => l.personId),
    }));
}

/** A user's prediction on a market (their pick; drives the UI "your pick" view).
 *  At most one row now (unique per user+market), but kept as a list for callers. */
export async function getUserPositions({
  db = defaultDb,
  userId,
  marketId,
}: {
  db?: DB;
  userId: string;
  marketId: string;
}): Promise<PredictionRow[]> {
  return db
    .select()
    .from(bets)
    .where(and(eq(bets.userId, userId), eq(bets.marketId, marketId)))
    .orderBy(asc(bets.createdAt));
}

/** One row in a user's portfolio: their prediction plus the market + chosen-outcome
 *  context the profile page renders (question, status, picked label, and — once
 *  resolved — whether the pick was right). Newest first. One join, no per-row reads. */
export interface PortfolioPrediction {
  predictionId: string;
  marketId: string;
  questionHe: string;
  marketType: (typeof schema.marketType.enumValues)[number];
  marketStatus: (typeof schema.marketStatus.enumValues)[number];
  resolvedOutcomeId: string | null;
  outcomeId: string;
  outcomeLabelHe: string;
  createdAt: Date;
}

export async function getUserPredictions({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<PortfolioPrediction[]> {
  return db
    .select({
      predictionId: bets.id,
      marketId: bets.marketId,
      questionHe: markets.questionHe,
      marketType: markets.type,
      marketStatus: markets.status,
      resolvedOutcomeId: markets.resolvedOutcomeId,
      outcomeId: bets.outcomeId,
      outcomeLabelHe: outcomes.labelHe,
      createdAt: bets.createdAt,
    })
    .from(bets)
    .innerJoin(markets, eq(markets.id, bets.marketId))
    .innerJoin(outcomes, eq(outcomes.id, bets.outcomeId))
    // Global profile portfolio excludes sandboxed group-motion picks.
    .where(and(eq(bets.userId, userId), isNull(markets.groupId)))
    .orderBy(desc(bets.createdAt));
}

// --- Composite creation (admin/seed): market + outcomes + featured links in one tx ---

export async function createMarket({
  db = defaultDb,
  tx,
  questionHe,
  descriptionHe,
  category,
  type = "binary",
  hot = false,
  closeAt,
  createdBy,
  groupId,
  outcomes: outcomeInputs,
  personIds = [],
}: {
  db?: DB;
  tx?: Tx;
  questionHe: string;
  descriptionHe?: string;
  category: string;
  type?: (typeof schema.marketType.enumValues)[number];
  hot?: boolean;
  closeAt: Date;
  createdBy?: string;
  /** Set for a group-only motion (audience scope); omitted = global market. */
  groupId?: string | null;
  outcomes: { labelHe: string; cat?: number; ordinal: number; personId?: number }[];
  personIds?: number[];
}): Promise<{ marketId: string }> {
  // The whole composite must be atomic. Standalone callers (admin/seed) open a
  // fresh transaction; the suggestion-approval flow passes its OWN tx so the
  // market creation + the status flip commit together.
  const run = async (exec: Tx): Promise<{ marketId: string }> => {
    const [market] = await exec
      .insert(markets)
      // searchText kept in lockstep with the question on every create path
      // (admin + suggestion-approval both route through here) — discovery-only.
      .values({
        questionHe,
        descriptionHe,
        category,
        type,
        hot,
        closeAt,
        createdBy,
        groupId: groupId ?? null,
        searchText: normalizeSearchName(questionHe),
      })
      .returning({ id: markets.id });

    if (outcomeInputs.length > 0) {
      await exec.insert(outcomes).values(
        outcomeInputs.map((o) => ({
          marketId: market.id,
          labelHe: o.labelHe,
          cat: o.cat,
          ordinal: o.ordinal,
          personId: o.personId,
        })),
      );
    }

    // Featured links = explicit personIds ∪ per-outcome personIds, deduped — an
    // outcome-linked MK is always featured (politician pages + the resolve-time
    // progress scoping both read market_politicians), with no double entry.
    const featuredIds = [
      ...new Set([
        ...personIds,
        ...outcomeInputs.flatMap((o) => (o.personId != null ? [o.personId] : [])),
      ]),
    ];
    if (featuredIds.length > 0) {
      await exec
        .insert(marketPoliticians)
        .values(featuredIds.map((personId) => ({ marketId: market.id, personId })));
    }

    return { marketId: market.id };
  };

  return tx ? run(tx) : db.transaction(run);
}

/**
 * The OPEN markets that feature a given MK (via market_politicians), newest
 * first, each as the same `{ market, outcomes, personIds }` bundle the homepage
 * cards consume. Status-filtered to `open` so the politician page never presents
 * a draft/closed/settled market as a live, bettable card (MarketCard carries no
 * status treatment). Four queries total regardless of count — no N+1.
 */
export async function getMarketsForPolitician({
  db = defaultDb,
  personId,
}: {
  db?: DB;
  personId: number;
}): Promise<{ market: MarketRow; outcomes: OutcomeRow[]; personIds: number[] }[]> {
  const links = await db
    .select({ marketId: marketPoliticians.marketId })
    .from(marketPoliticians)
    .where(eq(marketPoliticians.personId, personId));
  if (links.length === 0) return [];

  const ids = [...new Set(links.map((l) => l.marketId))];
  const [mkts, outs, allLinks] = await Promise.all([
    db
      .select()
      .from(markets)
      .where(and(inArray(markets.id, ids), eq(markets.status, "open"), isNull(markets.groupId)))
      .orderBy(desc(markets.createdAt)),
    db.select().from(outcomes).where(inArray(outcomes.marketId, ids)).orderBy(asc(outcomes.ordinal)),
    db.select().from(marketPoliticians).where(inArray(marketPoliticians.marketId, ids)),
  ]);

  return mkts.map((market) => ({
    market,
    outcomes: outs.filter((o) => o.marketId === market.id),
    personIds: allLinks.filter((l) => l.marketId === market.id).map((l) => l.personId),
  }));
}

/**
 * Discovery search over markets by normalized question text. Matches the
 * already-normalized `searchText` column with ILIKE (index-assisted by the
 * trigram GIN index); ILIKE-for-discovery is sanctioned by CLAUDE.md (NOT
 * attribution). Drafts + voided markets are excluded — only live/settled
 * markets are findable. `hot` then newest first. Caller passes a normalized `q`.
 */
export async function searchMarkets({
  db = defaultDb,
  q,
  limit = 20,
}: {
  db?: DB;
  q: string;
  limit?: number;
}): Promise<MarketRow[]> {
  const needle = q.trim();
  if (!needle) return [];
  return db
    .select()
    .from(markets)
    .where(
      and(
        inArray(markets.status, ["open", "closed", "resolved"]),
        isNull(markets.groupId), // group motions are never globally searchable
        sql`${markets.searchText} ILIKE ${"%" + needle + "%"}`,
      ),
    )
    .orderBy(desc(markets.hot), desc(markets.createdAt))
    .limit(limit);
}
