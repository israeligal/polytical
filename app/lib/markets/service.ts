import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as repo from "@/app/lib/markets/repo";
import { applyEntry } from "@/app/lib/ledger/service";
import { emitNotifications, type NotificationEvent } from "@/app/lib/notifications/service";
import { dispatchPush } from "@/app/lib/push/service";
import { logger } from "@/app/lib/logger";
import { MIN_BET } from "@/app/lib/economy";
import * as schema from "@/app/lib/schema";
import {
  AlreadyResolvedError,
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

/** Resolves a market to its winning outcome and settles every open bet in one tx.
 *  Final-odds parimutuel: winners split the ENTIRE pot —
 *  `payout = floor(total × yourStake / winningPool)`. If the winning pool is empty
 *  (nobody bet it) there are no winners, so every open bet is refunded in full
 *  (no divide-by-zero). Lock ordering is market-row FIRST (getMarketForUpdate →
 *  FOR UPDATE), THEN each user via applyEntry — concurrent bets block on the
 *  market lock and cannot race the settlement. */
export async function resolveMarket({
  db = defaultDb,
  marketId,
  winningOutcomeId,
  sourceUrl,
  note,
}: {
  db?: DB;
  marketId: string;
  winningOutcomeId: string;
  sourceUrl?: string;
  note?: string;
}): Promise<void> {
  // Captured inside the tx and pushed AFTER commit: web-push is a network call
  // that cannot roll back and must not hold the market FOR UPDATE lock.
  let dispatched: NotificationEvent[] = [];
  await db.transaction(async (tx) => {
    const market = await repo.getMarketForUpdate({ tx, marketId }); // lock MARKET first
    if (!market) throw new MarketNotFoundError();
    if (market.status === "resolved" || market.status === "voided")
      throw new AlreadyResolvedError();
    const outs = await repo.listOutcomes({ tx, marketId });
    const winner = outs.find((o) => o.id === winningOutcomeId);
    if (!winner) throw new InvalidOutcomeError();
    const total = outs.reduce((s, o) => s + o.poolTotal, 0);
    const bets = await repo.listOpenBets({ tx, marketId });
    // Notification events accumulate here and emit (in this same tx) after the
    // market is marked resolved — so the "you won" notice is atomic with the payout.
    const events: NotificationEvent[] = [];
    for (const b of bets) {
      if (winner.poolTotal === 0) {
        // No winners → refund all (avoids divide-by-zero).
        await applyEntry({
          tx,
          userId: b.userId,
          type: "refund",
          amount: b.amount,
          refMarketId: marketId,
          refBetId: b.id,
        });
        await repo.setBetStatus({ tx, betId: b.id, status: "refunded", payout: b.amount });
      } else if (b.outcomeId === winningOutcomeId) {
        const payout = Math.floor((total * b.amount) / winner.poolTotal);
        await applyEntry({
          tx,
          userId: b.userId,
          type: "payout",
          amount: payout,
          refMarketId: marketId,
          refBetId: b.id,
        });
        await repo.setBetStatus({ tx, betId: b.id, status: "won", payout });
        events.push({ type: "bet_won", userId: b.userId, marketId, betId: b.id, questionHe: market.questionHe, payout });
      } else {
        await repo.setBetStatus({ tx, betId: b.id, status: "lost", payout: 0 });
      }
    }
    // One "market resolved" notice per distinct participant (winners + losers).
    for (const uid of new Set(bets.map((b) => b.userId)))
      events.push({ type: "market_resolved", userId: uid, marketId, questionHe: market.questionHe });
    // Forecaster accuracy: a user "won" the market iff their largest single-outcome
    // stake was on the winning outcome (strict max; ties → not a win). Skip on the
    // winningPool=0 refund path (nobody backed the winner → no skill signal).
    if (winner.poolTotal > 0) {
      const byUser = new Map<string, Map<string, number>>();
      for (const b of bets) {
        const m = byUser.get(b.userId) ?? new Map<string, number>();
        m.set(b.outcomeId, (m.get(b.outcomeId) ?? 0) + b.amount);
        byUser.set(b.userId, m);
      }
      for (const [uid, stakes] of byUser) {
        let topOutcome: string | null = null;
        let top = -1;
        for (const [oid, amt] of stakes)
          if (amt > top) {
            top = amt;
            topOutcome = oid;
          }
        await repo.bumpUserStats({ tx, userId: uid, won: topOutcome === winningOutcomeId });
      }
    }
    await repo.markResolved({ tx, marketId, winningOutcomeId, sourceUrl, note });
    dispatched = events;
    await emitNotifications({ tx, events });
  });
  // Best-effort push AFTER commit. A push failure must never break settlement.
  try {
    await dispatchPush({ events: dispatched });
  } catch (e) {
    logger.error("push.resolve_dispatch_failed", { marketId, err: String(e) });
  }
}

/** Voids a market: refunds every open bet in full and marks it voided. Same
 *  market-first lock ordering as resolveMarket. */
export async function voidMarket({
  db = defaultDb,
  marketId,
}: {
  db?: DB;
  marketId: string;
}): Promise<void> {
  let dispatched: NotificationEvent[] = [];
  await db.transaction(async (tx) => {
    const market = await repo.getMarketForUpdate({ tx, marketId }); // lock MARKET first
    if (!market) throw new MarketNotFoundError();
    if (market.status === "resolved" || market.status === "voided")
      throw new AlreadyResolvedError();
    const bets = await repo.listOpenBets({ tx, marketId });
    for (const b of bets) {
      await applyEntry({
        tx,
        userId: b.userId,
        type: "refund",
        amount: b.amount,
        refMarketId: marketId,
        refBetId: b.id,
      });
      await repo.setBetStatus({ tx, betId: b.id, status: "refunded", payout: b.amount });
    }
    await repo.markVoided({ tx, marketId });
    // One "market voided, stake refunded" notice per distinct bettor.
    const events: NotificationEvent[] = [...new Set(bets.map((b) => b.userId))].map((uid) => ({
      type: "market_voided" as const,
      userId: uid,
      marketId,
      questionHe: market.questionHe,
    }));
    await emitNotifications({ tx, events });
    dispatched = events;
  });
  // Best-effort push AFTER commit (a push failure must never break the void/refunds).
  try {
    await dispatchPush({ events: dispatched });
  } catch (e) {
    logger.error("push.void_dispatch_failed", { marketId, err: String(e) });
  }
}

/** Default closing-soon horizon: notify bettors of markets closing within 24h. */
export const CLOSING_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Sweeps OPEN markets closing within `withinMs` and sends each a one-time
 * "closing soon" notice to its bettors. Driven by the Vercel Cron at
 * /api/cron/closing-soon. Idempotent + concurrency-safe: each market is claimed
 * via markClosingSoonNotified (conditional UPDATE on closingSoonNotifiedAt IS
 * NULL) inside its own tx — a second run (or a parallel cron) that loses the
 * claim skips it, so no bettor is double-notified. Push fans out post-commit.
 */
export async function notifyClosingSoonMarkets({
  db = defaultDb,
  withinMs = CLOSING_SOON_WINDOW_MS,
  now = new Date(),
}: {
  db?: DB;
  withinMs?: number;
  now?: Date;
} = {}): Promise<{ notified: number }> {
  const due = await repo.listMarketsClosingSoon({ db, withinMs, now });
  let notified = 0;
  for (const m of due) {
    let dispatched: NotificationEvent[] = [];
    const claimed = await db.transaction(async (tx) => {
      // Win the claim BEFORE notifying — a lost claim (another run got here first)
      // skips the market entirely so its bettors aren't notified twice.
      if (!(await repo.markClosingSoonNotified({ tx, marketId: m.id, now }))) return false;
      const bettors = await repo.getMarketBettors({ tx, marketId: m.id });
      const events: NotificationEvent[] = bettors.map((uid) => ({
        type: "market_closing_soon" as const,
        userId: uid,
        marketId: m.id,
        questionHe: m.questionHe,
      }));
      await emitNotifications({ tx, events });
      dispatched = events;
      return true;
    });
    if (!claimed) continue;
    notified += 1;
    try {
      await dispatchPush({ events: dispatched });
    } catch (e) {
      logger.error("push.closing_dispatch_failed", { marketId: m.id, err: String(e) });
    }
  }
  return { notified };
}
