import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as repo from "@/app/lib/ledger/repo";
import type { LedgerTx } from "@/app/lib/ledger/repo";
import * as schema from "@/app/lib/schema";
import { txType } from "@/app/lib/schema";
import { STARTING_STACK, DAILY_FAUCET, FAUCET_COOLDOWN_MS } from "@/app/lib/economy";
import { FaucetCooldownError, InsufficientFundsError } from "@/app/lib/errors";

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
    if ((await repo.countByType({ tx, userId, type: "grant" })) > 0) return; // idempotent
    await applyEntry({ tx, userId, type: "grant", amount: STARTING_STACK });
  });
}

export async function claimDailyFaucet({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<{ balanceAfter: number }> {
  return db.transaction(async (tx) => {
    const u = await repo.readUser({ tx, userId });
    if (!u) throw new InsufficientFundsError();
    const last = u.lastFaucetAt?.getTime() ?? 0;
    if (Date.now() - last < FAUCET_COOLDOWN_MS)
      throw new FaucetCooldownError(new Date(last + FAUCET_COOLDOWN_MS));
    const res = await applyEntry({ tx, userId, type: "faucet", amount: DAILY_FAUCET });
    await repo.writeBalance({ tx, userId, balance: res.balanceAfter, lastFaucetAt: new Date() });
    return res;
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
