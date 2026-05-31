import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/app/lib/db";
import { transactions, txType, users } from "@/app/lib/schema";
import { MissingUserError } from "@/app/lib/errors";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
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
