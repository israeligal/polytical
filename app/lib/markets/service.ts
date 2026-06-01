import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as repo from "@/app/lib/markets/repo";
import { applyEntry } from "@/app/lib/ledger/service";
import { MIN_BET } from "@/app/lib/economy";
import * as schema from "@/app/lib/schema";
import {
  BelowMinBetError,
  InvalidOutcomeError,
  MarketClosedError,
  MarketNotFoundError,
} from "@/app/lib/errors";

// Driver-agnostic DB handle (postgres-js in prod, PGlite in tests). Mirrors the
// ledger service + markets repo so the service is injectable with the test db
// without an `as any`.
type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

// Betting service. All coin movement goes through `applyEntry` (the authoritative
// writer). Lock ordering is market-row FIRST (getMarketForUpdate → FOR UPDATE),
// THEN the user row (inside applyEntry) — never the reverse — so concurrent bets
// and a resolve serialize on the market row without deadlocking.

/** Places a parimutuel bet: validates → debits via applyEntry → bumps the pool.
 *  Atomic: an InsufficientFundsError (or any throw) rolls back the bet row and
 *  pool bump along with the failed debit. */
export async function placeBet({
  db = defaultDb,
  userId,
  marketId,
  outcomeId,
  amount,
}: {
  db?: DB;
  userId: string;
  marketId: string;
  outcomeId: string;
  amount: number;
}): Promise<{ betId: string }> {
  if (!Number.isInteger(amount) || amount < MIN_BET) throw new BelowMinBetError();
  return db.transaction(async (tx) => {
    const market = await repo.getMarketForUpdate({ tx, marketId }); // lock MARKET first
    if (!market) throw new MarketNotFoundError();
    if (market.status !== "open" || market.closeAt.getTime() <= Date.now())
      throw new MarketClosedError();
    const outcome = await repo.getOutcome({ tx, outcomeId, marketId });
    if (!outcome) throw new InvalidOutcomeError();
    const bet = await repo.insertBet({ tx, userId, marketId, outcomeId, amount });
    // Debit via the authoritative writer (locks user row, enforces balance ≥ 0);
    // rolls back the whole tx on InsufficientFundsError.
    await applyEntry({
      tx,
      userId,
      type: "bet",
      amount: -amount,
      refMarketId: marketId,
      refBetId: bet.id,
    });
    await repo.incOutcomePool({ tx, outcomeId, delta: amount });
    return { betId: bet.id };
  });
}
