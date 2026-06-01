import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as repo from "@/app/lib/ledger/repo";
import type { LedgerTx } from "@/app/lib/ledger/repo";
import * as schema from "@/app/lib/schema";
import { txType } from "@/app/lib/schema";
import {
  STARTING_STACK, FAUCET_COOLDOWN_MS, MAX_BALANCE, STREAK_GRACE_MS, faucetAmountForStreak,
} from "@/app/lib/economy";
import { BalanceOverflowError, FaucetCooldownError, InsufficientFundsError } from "@/app/lib/errors";

// Driver-agnostic DB handle (postgres-js in prod, PGlite in tests). See repo.ts.
type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
type Type = (typeof txType.enumValues)[number];
type Tx = LedgerTx;

/** THE authoritative coin writer — joins an existing tx. Lock → validate → cache + append row. */
export async function applyEntry({
  tx,
  userId,
  type,
  amount,
  refMarketId,
  refBetId,
}: {
  tx: Tx;
  userId: string;
  type: Type;
  amount: number;
  refMarketId?: string;
  refBetId?: string;
}): Promise<{ balanceAfter: number }> {
  const current = await repo.lockBalance({ tx, userId });
  const balanceAfter = current + amount;
  if (balanceAfter < 0) throw new InsufficientFundsError();
  if (balanceAfter > MAX_BALANCE) throw new BalanceOverflowError();
  await repo.writeBalance({ tx, userId, balance: balanceAfter });
  await repo.insertEntry({ tx, userId, type, amount, balanceAfter, refMarketId, refBetId });
  return { balanceAfter };
}

export async function grantStartingStack({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await repo.lockUser({ tx, userId }); // lock FIRST so concurrent first-grants serialize, not race
    if ((await repo.countByType({ tx, userId, type: "grant" })) > 0) return; // idempotent under the lock
    await applyEntry({ tx, userId, type: "grant", amount: STARTING_STACK });
  });
}

export async function claimDailyFaucet({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<{ balanceAfter: number; amount: number; streak: number; bonus: number }> {
  return db.transaction(async (tx) => {
    const u = await repo.lockUser({ tx, userId }); // lock FIRST, then read state under the lock
    const prev = u.lastFaucetAt?.getTime() ?? null;
    const now = Date.now();
    if (prev !== null && now - prev < FAUCET_COOLDOWN_MS)
      throw new FaucetCooldownError(new Date(prev + FAUCET_COOLDOWN_MS));

    // Streak continuity: claiming again within the grace window keeps the chain;
    // a longer gap (or the first-ever claim) restarts it at 1. Computed under the
    // lock so two concurrent claims can't both advance the streak.
    const continues = prev !== null && now - prev < STREAK_GRACE_MS;
    const streak = continues ? u.streakCount + 1 : 1;
    const amount = faucetAmountForStreak(streak);
    const bonus = amount - faucetAmountForStreak(1);

    const res = await applyEntry({ tx, userId, type: "faucet", amount });
    await repo.setFaucetClaim({
      tx, userId, at: new Date(now), streak, bestStreak: Math.max(u.bestStreak, streak),
    });
    return { balanceAfter: res.balanceAfter, amount, streak, bonus };
  });
}

export async function getBalance({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<number> {
  return db.transaction(async (tx) => (await repo.readUser({ tx, userId }))?.balance ?? 0);
}

/** Ensures the starting stack (idempotent) then returns balance. Call where balance renders. */
export async function getOrInitBalance({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<number> {
  await grantStartingStack({ db, userId });
  return getBalance({ db, userId });
}
