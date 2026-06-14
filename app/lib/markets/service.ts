import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as repo from "@/app/lib/markets/repo";
import * as cardsRepo from "@/app/lib/cards/repo";
import { emitNotifications, type NotificationEvent } from "@/app/lib/notifications/service";
import { dispatchPush } from "@/app/lib/push/service";
import { logger } from "@/app/lib/logger";
import { unlockThreshold } from "@/lib/rarity";
import { getMembership } from "@/app/lib/groups/repo";
import * as schema from "@/app/lib/schema";
import {
  AlreadyResolvedError,
  InvalidOutcomeError,
  MarketClosedError,
  MarketNotFoundError,
  NotGroupMemberError,
} from "@/app/lib/errors";

// Driver-agnostic DB handle (postgres-js in prod, PGlite in tests). Mirrors the
// markets repo so the service is injectable with the test db without an `as any`.
type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

// Prediction service. A prediction is a stake-less pick of one outcome per
// market, changeable until close. Lock ordering is market-row FIRST
// (getMarketForUpdate → FOR UPDATE) so concurrent predictions and a resolve
// serialize on the market row.

/** Records (or changes) the user's prediction on a market: validates the market
 *  is open + the outcome belongs to it, then upserts one pick per (user, market).
 *  No stake, no balance — just the pick. */
export async function makePrediction({
  db = defaultDb,
  userId,
  marketId,
  outcomeId,
}: {
  db?: DB;
  userId: string;
  marketId: string;
  outcomeId: string;
}): Promise<{ predictionId: string }> {
  return db.transaction(async (tx) => {
    const market = await repo.getMarketForUpdate({ tx, marketId }); // lock MARKET first
    if (!market) throw new MarketNotFoundError();
    if (market.status !== "open" || market.closeAt.getTime() <= Date.now())
      throw new MarketClosedError();
    // Group motions are member-only: a non-member can't predict on one.
    if (market.groupId) {
      const membership = await getMembership({ db: tx, groupId: market.groupId, userId });
      if (!membership || membership.status !== "active") throw new NotGroupMemberError();
    }
    const outcome = await repo.getOutcome({ tx, outcomeId, marketId });
    if (!outcome) throw new InvalidOutcomeError();
    const prediction = await repo.upsertPrediction({ tx, userId, marketId, outcomeId });
    return { predictionId: prediction.id };
  });
}

/** Resolves a market to its winning outcome and tallies right/wrong for every
 *  predictor in one tx. A predictor is RIGHT iff their pick is the winning
 *  outcome → bump totalWins; everyone who predicted gets +1 totalResolved. Each
 *  correct call also advances the user's card-unlock progress — for the winning
 *  outcome's linked politician alone when the outcome carries a personId (multi
 *  markets), otherwise for every politician featured in the market — granting
 *  the card when the rarity threshold is reached.
 *  No pools, no payouts, no refunds. Market-first lock ordering: concurrent
 *  predictions block on the market lock and cannot race the settlement. */
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
    const predictions = await repo.listPredictions({ tx, marketId });
    // The market's featured politicians (+ their role) drive card-unlock thresholds.
    // A winning outcome that is ITSELF a politician (outcomes.personId — multi
    // markets like "מי ירכיב את הממשלה?") scopes progress to that MK alone:
    // predicting Netanyahu must not advance Bennett's card. The role is looked
    // up by personId directly (not via market_politicians) so the scoping also
    // survives links backfilled outside createMarket's auto-feature sync. An
    // unlinked winner ("אחר", or any binary outcome) keeps the market-level
    // behavior — every featured MK advances.
    const persons = await repo.getMarketPoliticianRoles({ tx, marketId });
    let progressPersons = persons;
    if (winner.personId != null) {
      const linked = await repo.getPoliticianRoleByPersonId({ tx, personId: winner.personId });
      progressPersons = linked ? [linked] : persons.filter((p) => p.personId === winner.personId);
      if (progressPersons.length === 0)
        // A linked winner pointing at a politician we can't resolve means card
        // progress would be silently skipped — surface it, don't bury it.
        logger.error("markets.resolve.linked_winner_unresolvable", {
          marketId,
          personId: winner.personId,
        });
    }
    // Notification events accumulate here and emit (in this same tx) after the
    // market is marked resolved — so the "you were right" notice is atomic with it.
    const events: NotificationEvent[] = [];
    for (const p of predictions) {
      const won = p.outcomeId === winningOutcomeId;
      await repo.bumpUserStats({ tx, userId: p.userId, won });
      if (won) {
        // Each correct call advances accuracy progress on the scoped MKs; cross
        // the rarity threshold → grant the card (idempotent on the unique index).
        for (const person of progressPersons) {
          const count = await cardsRepo.bumpCardProgress({ tx, userId: p.userId, personId: person.personId });
          if (count >= unlockThreshold({ personId: person.personId, role: person.roleHe }))
            await cardsRepo.insertOwnership({ tx, userId: p.userId, personId: person.personId });
        }
        events.push({ type: "bet_won", userId: p.userId, marketId, betId: p.id, questionHe: market.questionHe });
      }
    }
    // One "market resolved" notice per distinct predictor.
    for (const uid of new Set(predictions.map((p) => p.userId)))
      events.push({ type: "market_resolved", userId: uid, marketId, questionHe: market.questionHe });
    await repo.markResolved({ tx, marketId, winningOutcomeId, sourceUrl, note });
    dispatched = events;
    await emitNotifications({ tx, events });
  });
  // Best-effort push AFTER commit. A push failure must never break settlement.
  try {
    await dispatchPush({ db, events: dispatched });
  } catch (e) {
    logger.error("push.resolve_dispatch_failed", { marketId, err: String(e) });
  }
}

/** Voids a market: marks it voided and notifies predictors. No stakes, so nothing
 *  to refund and no stats change. Same market-first lock ordering as resolveMarket. */
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
    const predictions = await repo.listPredictions({ tx, marketId });
    await repo.markVoided({ tx, marketId });
    // One "market voided" notice per distinct predictor.
    const events: NotificationEvent[] = [...new Set(predictions.map((p) => p.userId))].map((uid) => ({
      type: "market_voided" as const,
      userId: uid,
      marketId,
      questionHe: market.questionHe,
    }));
    await emitNotifications({ tx, events });
    dispatched = events;
  });
  // Best-effort push AFTER commit (a push failure must never break the void).
  try {
    await dispatchPush({ db, events: dispatched });
  } catch (e) {
    logger.error("push.void_dispatch_failed", { marketId, err: String(e) });
  }
}

/** Hard-deletes an invalid market: notifies every predictor ("התחזית בוטלה" —
 *  reuses the market_voided copy; notifications carry no market FK so the rows
 *  survive), then deletes the row — FK cascades wipe outcomes, predictions and
 *  comments atomically. The notice carries marketId: null so its link falls
 *  back to the inbox/profile instead of 404ing on the deleted market page, and
 *  an already-VOIDED market notifies nobody (its predictors got the void notice).
 *  RESOLVED markets are protected (their outcome already bumped accuracy stats
 *  and card progress; deleting one would orphan those), so an admin catches an
 *  invalid market before resolution — or voids it. Same market-first lock
 *  ordering as resolveMarket. */
export async function deleteMarket({
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
    if (market.status === "resolved") throw new AlreadyResolvedError();
    // One notice per distinct predictor, emitted BEFORE the delete so both
    // commit (or roll back) together. Skipped for voided markets — those
    // predictors were already notified when the market was voided.
    const bettors = market.status === "voided" ? [] : await repo.getMarketBettors({ tx, marketId });
    const events: NotificationEvent[] = bettors.map((uid) => ({
      type: "market_voided" as const,
      userId: uid,
      marketId: null,
      questionHe: market.questionHe,
    }));
    await emitNotifications({ tx, events });
    await repo.deleteMarket({ tx, marketId });
    dispatched = events;
  });
  // Best-effort push AFTER commit (a push failure must never undo the delete).
  try {
    await dispatchPush({ db, events: dispatched });
  } catch (e) {
    logger.error("push.delete_dispatch_failed", { marketId, err: String(e) });
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
      await dispatchPush({ db, events: dispatched });
    } catch (e) {
      logger.error("push.closing_dispatch_failed", { marketId: m.id, err: String(e) });
    }
  }
  return { notified };
}
