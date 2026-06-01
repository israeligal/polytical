import { and, eq, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import * as schema from "@/app/lib/schema";
import { transactions, txType, users } from "@/app/lib/schema";
import { MissingUserError } from "@/app/lib/errors";

// Driver-agnostic transaction handle: the authoritative writer runs on the
// production postgres-js `db` and on the PGlite test db, whose Drizzle types
// differ only by the query-result HKT. Keeping `TQueryResult` generic lets a
// single `applyEntry` accept either without `as any`.
export type LedgerTx = PgTransaction<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
type Tx = LedgerTx;
type Type = (typeof txType.enumValues)[number];

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/** Locks the user row, returns balance (FOR UPDATE → serializes concurrent ledger writes). */
export async function lockBalance({ tx, userId }: { tx: Tx; userId: string }): Promise<number> {
  const [row] = await tx
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, reqUser(userId)))
    .for("update");
  if (!row) throw new MissingUserError();
  return row.balance;
}

/**
 * Locks the user row FOR UPDATE and returns the FULL row (balance + lastFaucetAt).
 * Take this BEFORE any check-then-act guard (grant idempotency, faucet cooldown)
 * so concurrent transactions serialize on the row instead of racing a stale read.
 */
export async function lockUser({ tx, userId }: { tx: Tx; userId: string }) {
  const [row] = await tx
    .select()
    .from(users)
    .where(eq(users.id, reqUser(userId)))
    .for("update");
  if (!row) throw new MissingUserError();
  return row;
}

export async function writeBalance({
  tx,
  userId,
  balance,
  lastFaucetAt,
}: {
  tx: Tx;
  userId: string;
  balance: number;
  lastFaucetAt?: Date;
}): Promise<void> {
  await tx
    .update(users)
    .set({ balance, ...(lastFaucetAt ? { lastFaucetAt } : {}), updatedAt: new Date() })
    .where(eq(users.id, reqUser(userId)));
}

/** Sets ONLY lastFaucetAt — keeps balance written exactly once, by applyEntry. */
export async function setLastFaucetAt({
  tx,
  userId,
  at,
}: {
  tx: Tx;
  userId: string;
  at: Date;
}): Promise<void> {
  await tx
    .update(users)
    .set({ lastFaucetAt: at, updatedAt: new Date() })
    .where(eq(users.id, reqUser(userId)));
}

/**
 * Records a faucet claim's streak bookkeeping (timestamp + current/best streak)
 * in one statement. Balance is NOT touched here — applyEntry remains the sole
 * balance writer. Runs under the same FOR-UPDATE lock as the cooldown check.
 */
export async function setFaucetClaim({
  tx,
  userId,
  at,
  streak,
  bestStreak,
}: {
  tx: Tx;
  userId: string;
  at: Date;
  streak: number;
  bestStreak: number;
}): Promise<void> {
  await tx
    .update(users)
    .set({ lastFaucetAt: at, streakCount: streak, bestStreak, updatedAt: new Date() })
    .where(eq(users.id, reqUser(userId)));
}

export async function insertEntry({
  tx,
  userId,
  type,
  amount,
  balanceAfter,
  refMarketId,
  refBetId,
}: {
  tx: Tx;
  userId: string;
  type: Type;
  amount: number;
  balanceAfter: number;
  refMarketId?: string;
  refBetId?: string;
}): Promise<void> {
  await tx
    .insert(transactions)
    .values({ userId: reqUser(userId), type, amount, balanceAfter, refMarketId, refBetId });
}

export async function countByType({
  tx,
  userId,
  type,
}: {
  tx: Tx;
  userId: string;
  type: Type;
}): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(eq(transactions.userId, reqUser(userId)), eq(transactions.type, type)));
  return row?.n ?? 0;
}

export async function readUser({ tx, userId }: { tx: Tx; userId: string }) {
  const [row] = await tx.select().from(users).where(eq(users.id, reqUser(userId)));
  return row ?? null;
}
