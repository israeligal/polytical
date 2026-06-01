import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import type { LedgerTx } from "@/app/lib/ledger/repo";
import * as schema from "@/app/lib/schema";
import { bets, marketPoliticians, markets, outcomes } from "@/app/lib/schema";

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

// --- Composite creation (admin/seed): market + outcomes + featured links in one tx ---

export async function createMarket({
  db = defaultDb,
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
  return db.transaction(async (tx) => {
    const [market] = await tx
      .insert(markets)
      .values({
        questionHe,
        descriptionHe,
        category,
        type,
        hot,
        closeAt,
        createdBy,
      })
      .returning({ id: markets.id });

    if (outcomeInputs.length > 0) {
      await tx.insert(outcomes).values(
        outcomeInputs.map((o) => ({
          marketId: market.id,
          labelHe: o.labelHe,
          cat: o.cat,
          ordinal: o.ordinal,
        })),
      );
    }

    if (personIds.length > 0) {
      await tx
        .insert(marketPoliticians)
        .values(personIds.map((personId) => ({ marketId: market.id, personId })));
    }

    return { marketId: market.id };
  });
}
