import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { seasons, seasonRewardTiers, seasonRewardClaims, transactions } from "@/app/lib/schema";
import type { LedgerTx } from "@/app/lib/ledger/repo";
import { MissingUserError } from "@/app/lib/errors";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
type Tx = LedgerTx;

export type SeasonRow = typeof seasons.$inferSelect;
export type SeasonTierRow = typeof seasonRewardTiers.$inferSelect;

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/** The single active season (status='active'), or null. */
export async function getActiveSeason({ db = defaultDb }: { db?: DB } = {}): Promise<SeasonRow | null> {
  const [row] = await db.select().from(seasons).where(eq(seasons.status, "active")).limit(1);
  return row ?? null;
}

export async function getSeasonById({
  db = defaultDb,
  seasonId,
}: {
  db?: DB;
  seasonId: string;
}): Promise<SeasonRow | null> {
  const [row] = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  return row ?? null;
}

/** A season's tiers, in ordinal order. */
export async function getSeasonTiers({
  db = defaultDb,
  seasonId,
}: {
  db?: DB;
  seasonId: string;
}): Promise<SeasonTierRow[]> {
  return db
    .select()
    .from(seasonRewardTiers)
    .where(eq(seasonRewardTiers.seasonId, seasonId))
    .orderBy(asc(seasonRewardTiers.ordinal));
}

/**
 * Net Shekoins won in the season window — computed LIVE from the ledger, not a
 * tally column. Sums signed transaction amounts of betting types (payout/refund
 * credits +, bet debits −) created within [startAt, endAt]. grant/faucet/collect/
 * season_reward are excluded so progress reflects forecasting skill, not handouts.
 * May be negative (net loser); the caller/UI clamps at 0 for the bar.
 */
export async function getSeasonNetWinnings({
  db,
  tx,
  userId,
  startAt,
  endAt,
}: {
  db?: DB;
  tx?: Tx;
  userId: string;
  startAt: Date;
  endAt: Date;
}): Promise<number> {
  const conn = tx ?? db ?? defaultDb;
  const [row] = await conn
    .select({ net: sql<number>`COALESCE(SUM(${transactions.amount}), 0)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, reqUser(userId)),
        inArray(transactions.type, ["payout", "refund", "bet"]),
        gte(transactions.createdAt, startAt),
        lte(transactions.createdAt, endAt),
      ),
    );
  return row?.net ?? 0;
}

/** The tierIds the user has already claimed in a season. */
export async function getClaimedTierIds({
  db = defaultDb,
  userId,
  seasonId,
}: {
  db?: DB;
  userId: string;
  seasonId: string;
}): Promise<Set<string>> {
  const rows = await db
    .select({ tierId: seasonRewardClaims.tierId })
    .from(seasonRewardClaims)
    .where(and(eq(seasonRewardClaims.userId, reqUser(userId)), eq(seasonRewardClaims.seasonId, seasonId)));
  return new Set(rows.map((r) => r.tierId));
}

/** Locks a tier row FOR UPDATE (+ returns it) so a claim serializes. */
export async function lockTier({ tx, tierId }: { tx: Tx; tierId: string }): Promise<SeasonTierRow | null> {
  const [row] = await tx.select().from(seasonRewardTiers).where(eq(seasonRewardTiers.id, tierId)).for("update");
  return row ?? null;
}

/** Locks a season row FOR UPDATE (+ returns it) — read the season under the
 *  claim's tx so a concurrent endSeason can't slip in between check and credit. */
export async function lockSeason({ tx, seasonId }: { tx: Tx; seasonId: string }): Promise<SeasonRow | null> {
  const [row] = await tx.select().from(seasons).where(eq(seasons.id, seasonId)).for("update");
  return row ?? null;
}

/** True if this (user, tier) claim already exists. */
export async function isClaimed({
  tx,
  userId,
  tierId,
}: {
  tx: Tx;
  userId: string;
  tierId: string;
}): Promise<boolean> {
  const [row] = await tx
    .select({ userId: seasonRewardClaims.userId })
    .from(seasonRewardClaims)
    .where(and(eq(seasonRewardClaims.userId, reqUser(userId)), eq(seasonRewardClaims.tierId, tierId)))
    .limit(1);
  return !!row;
}

/** Records a claim idempotently. Returns false if the (user,tier) row already
 *  existed (the composite PK is the backstop) — caller rolls back the credit. */
export async function insertClaim({
  tx,
  userId,
  tierId,
  seasonId,
  amount,
}: {
  tx: Tx;
  userId: string;
  tierId: string;
  seasonId: string;
  amount: number;
}): Promise<boolean> {
  const inserted = await tx
    .insert(seasonRewardClaims)
    .values({ userId: reqUser(userId), tierId, seasonId, amount })
    .onConflictDoNothing({ target: [seasonRewardClaims.userId, seasonRewardClaims.tierId] })
    .returning({ userId: seasonRewardClaims.userId });
  return inserted.length > 0;
}

// --- Admin writes ---

/** Count of currently-active seasons (the one-active invariant guard). */
export async function countActiveSeasons({ db = defaultDb }: { db?: DB } = {}): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seasons)
    .where(eq(seasons.status, "active"));
  return row?.n ?? 0;
}

/** Creates a season + its tiers atomically (one tx). */
export async function insertSeasonWithTiers({
  db = defaultDb,
  nameHe,
  startAt,
  endAt,
  tiers,
}: {
  db?: DB;
  nameHe: string;
  startAt: Date;
  endAt: Date;
  tiers: { ordinal: number; nameHe: string; goalAmount: number; rewardAmount: number }[];
}): Promise<{ seasonId: string }> {
  return db.transaction(async (tx) => {
    const [season] = await tx
      .insert(seasons)
      .values({ nameHe, startAt, endAt, status: "active" })
      .returning({ id: seasons.id });
    if (tiers.length > 0) {
      await tx.insert(seasonRewardTiers).values(tiers.map((t) => ({ ...t, seasonId: season.id })));
    }
    return { seasonId: season.id };
  });
}

/** Flips an ACTIVE season to ended; returns how many rows changed (0 = it was
 *  already ended, so the caller can avoid reporting a false success). */
export async function setSeasonEnded({
  db = defaultDb,
  seasonId,
}: {
  db?: DB;
  seasonId: string;
}): Promise<{ ended: number }> {
  const rows = await db
    .update(seasons)
    .set({ status: "ended" })
    .where(and(eq(seasons.id, seasonId), eq(seasons.status, "active")))
    .returning({ id: seasons.id });
  return { ended: rows.length };
}
