import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import type { LedgerTx } from "@/app/lib/ledger/repo";
import * as schema from "@/app/lib/schema";
import { bets, marketPoliticians, markets, outcomes, users } from "@/app/lib/schema";
import { normalizeSearchName } from "@/app/lib/knesset/search-name";

// Market repository: scope-guarded, tx-aware DB access for the betting service.
//
// Two access modes:
//  - MUTATING paths join an existing transaction (`tx: LedgerTx`) so the
//    market-row lock (`getMarketForUpdate` → FOR UPDATE) and every coin write
//    via `applyEntry` share one atomic unit. Lock ordering is market→user.
//  - READ helpers default to the shared `db` (no tx) for server-component reads.

// Driver-agnostic DB handle (postgres-js in prod, PGlite in tests). Mirrors the
// ledger/politicians repos so reads are injectable without an `as any`.
type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
type Tx = LedgerTx;

export type MarketRow = typeof markets.$inferSelect;
export type OutcomeRow = typeof outcomes.$inferSelect;
export type BetRow = typeof bets.$inferSelect;
type BetStatus = (typeof schema.betStatus.enumValues)[number];

// --- Mutating, tx-aware (lock the market row FIRST, then users via applyEntry) ---

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

/** Bumps an outcome's cached pool total by `delta` (kept in step with bet rows). */
export async function incOutcomePool({
  tx,
  outcomeId,
  delta,
}: {
  tx: Tx;
  outcomeId: string;
  delta: number;
}): Promise<void> {
  await tx
    .update(outcomes)
    .set({ poolTotal: sql`${outcomes.poolTotal} + ${delta}` })
    .where(eq(outcomes.id, outcomeId));
}

/** Inserts an open bet; returns the new bet id (used as the ledger refBetId). */
export async function insertBet({
  tx,
  userId,
  marketId,
  outcomeId,
  amount,
}: {
  tx: Tx;
  userId: string;
  marketId: string;
  outcomeId: string;
  amount: number;
}): Promise<{ id: string }> {
  const [row] = await tx
    .insert(bets)
    .values({ userId, marketId, outcomeId, amount })
    .returning({ id: bets.id });
  return row;
}

/** All still-open bets on a market (the set settled on resolve/void). */
export async function listOpenBets({
  tx,
  marketId,
}: {
  tx: Tx;
  marketId: string;
}): Promise<BetRow[]> {
  return tx
    .select()
    .from(bets)
    .where(and(eq(bets.marketId, marketId), eq(bets.status, "open")));
}

/** Settles a single bet (won/lost/refunded) with its final payout. */
export async function setBetStatus({
  tx,
  betId,
  status,
  payout,
}: {
  tx: Tx;
  betId: string;
  status: BetStatus;
  payout: number;
}): Promise<void> {
  await tx.update(bets).set({ status, payout }).where(eq(bets.id, betId));
}

/** Bumps a user's forecaster-accuracy counters on a resolve: +1 resolved, and
 *  +1 win when their top single-outcome stake was on the winning outcome. Rides
 *  inside the resolveMarket transaction (no coin movement here). */
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
  await tx
    .update(markets)
    .set({
      status: "resolved",
      resolvedOutcomeId: winningOutcomeId,
      resolutionSourceUrl: sourceUrl ?? null,
      resolutionNote: note ?? null,
      resolvedAt: new Date(),
    })
    .where(eq(markets.id, marketId));
}

/** Marks a market voided (all open bets refunded by the caller). */
export async function markVoided({ tx, marketId }: { tx: Tx; marketId: string }): Promise<void> {
  await tx
    .update(markets)
    .set({ status: "voided", resolvedAt: new Date() })
    .where(eq(markets.id, marketId));
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
  const where = category
    ? and(eq(markets.status, "open"), eq(markets.category, category))
    : eq(markets.status, "open");
  return db.select().from(markets).where(where).orderBy(sql`${markets.createdAt} desc`);
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
    .where(eq(markets.status, "open"))
    .groupBy(markets.id)
    .orderBy(desc(sql`count(${bets.id})`), desc(markets.createdAt))
    .limit(1);
  return row?.market ?? null;
}

/** Markets an admin can still act on (open + closed, i.e. not yet settled),
 *  each with its ordered outcomes — drives the admin resolve/void list. Newest
 *  first; one query per table (no per-market round-trips). */
export async function listManageableMarkets({
  db = defaultDb,
}: {
  db?: DB;
} = {}): Promise<{ market: MarketRow; outcomes: OutcomeRow[] }[]> {
  const rows = await db
    .select()
    .from(markets)
    .where(inArray(markets.status, ["open", "closed"]))
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

/** A user's bets on a market (their position; drives the UI "your bets" view). */
export async function getUserPositions({
  db = defaultDb,
  userId,
  marketId,
}: {
  db?: DB;
  userId: string;
  marketId: string;
}): Promise<BetRow[]> {
  return db
    .select()
    .from(bets)
    .where(and(eq(bets.userId, userId), eq(bets.marketId, marketId)))
    .orderBy(asc(bets.createdAt));
}

/** One row in a user's portfolio: their bet plus the market + chosen-outcome
 *  context the profile page renders (question, status, payout, picked label,
 *  and whether their pick won). Newest bet first. One join, no per-row reads. */
export interface PortfolioBet {
  betId: string;
  marketId: string;
  questionHe: string;
  marketType: (typeof schema.marketType.enumValues)[number];
  marketStatus: (typeof schema.marketStatus.enumValues)[number];
  resolvedOutcomeId: string | null;
  outcomeId: string;
  outcomeLabelHe: string;
  amount: number;
  payout: number;
  betStatus: BetStatus;
  createdAt: Date;
}

export async function getUserBets({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<PortfolioBet[]> {
  return db
    .select({
      betId: bets.id,
      marketId: bets.marketId,
      questionHe: markets.questionHe,
      marketType: markets.type,
      marketStatus: markets.status,
      resolvedOutcomeId: markets.resolvedOutcomeId,
      outcomeId: bets.outcomeId,
      outcomeLabelHe: outcomes.labelHe,
      amount: bets.amount,
      payout: bets.payout,
      betStatus: bets.status,
      createdAt: bets.createdAt,
    })
    .from(bets)
    .innerJoin(markets, eq(markets.id, bets.marketId))
    .innerJoin(outcomes, eq(outcomes.id, bets.outcomeId))
    .where(eq(bets.userId, userId))
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
  outcomes: { labelHe: string; cat?: number; ordinal: number }[];
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
        })),
      );
    }

    if (personIds.length > 0) {
      await exec
        .insert(marketPoliticians)
        .values(personIds.map((personId) => ({ marketId: market.id, personId })));
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
      .where(and(inArray(markets.id, ids), eq(markets.status, "open")))
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
        sql`${markets.searchText} ILIKE ${"%" + needle + "%"}`,
      ),
    )
    .orderBy(desc(markets.hot), desc(markets.createdAt))
    .limit(limit);
}
