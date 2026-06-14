import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { bets, markets, outcomes } from "@/app/lib/schema";
import { requireUserId } from "@/app/lib/errors";

// Prediction read/seen helpers — a small module so markets/repo.ts stays under
// 500 lines. Drives the one-time right/wrong reveal via the bets.seenAt flag.

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export interface UnseenResolvedPrediction {
  predictionId: string;
  marketId: string;
  questionHe: string;
  outcomeLabelHe: string;
  correct: boolean; // the picked outcome was the market's winning outcome
}

/**
 * A user's resolved-but-unseen predictions, optionally scoped to one market.
 * `seenAt IS NULL` on a RESOLVED market is the one-time reveal trigger; `correct`
 * is derived (picked outcome === the market's resolved winning outcome). Voided
 * markets are excluded — there's no right/wrong to reveal.
 */
export async function listUnseenResolvedPredictions({
  db = defaultDb,
  userId,
  marketId,
}: {
  db?: DB;
  userId: string;
  marketId?: string;
}): Promise<UnseenResolvedPrediction[]> {
  const where = [
    eq(bets.userId, requireUserId(userId)),
    isNull(bets.seenAt),
    eq(markets.status, "resolved"),
    isNull(markets.groupId), // group motions reveal via group_motion_resolved, not the global deck
  ];
  if (marketId) where.push(eq(bets.marketId, marketId));
  const rows = await db
    .select({
      predictionId: bets.id,
      marketId: bets.marketId,
      questionHe: markets.questionHe,
      outcomeLabelHe: outcomes.labelHe,
      outcomeId: bets.outcomeId,
      resolvedOutcomeId: markets.resolvedOutcomeId,
    })
    .from(bets)
    .innerJoin(markets, eq(markets.id, bets.marketId))
    .innerJoin(outcomes, eq(outcomes.id, bets.outcomeId))
    .where(and(...where));
  return rows.map((r) => ({
    predictionId: r.predictionId,
    marketId: r.marketId,
    questionHe: r.questionHe,
    outcomeLabelHe: r.outcomeLabelHe,
    correct: r.outcomeId === r.resolvedOutcomeId,
  }));
}

/**
 * Marks the given predictions seen — scope-guarded (only the user's own) and
 * idempotent (`seenAt IS NULL` so a re-fire updates nothing). No-op on empty input.
 */
export async function markPredictionsSeen({
  db = defaultDb,
  userId,
  predictionIds,
}: {
  db?: DB;
  userId: string;
  predictionIds: string[];
}): Promise<{ updated: number }> {
  if (predictionIds.length === 0) return { updated: 0 };
  const rows = await db
    .update(bets)
    .set({ seenAt: sql`now()` })
    .where(and(eq(bets.userId, requireUserId(userId)), inArray(bets.id, predictionIds), isNull(bets.seenAt)))
    .returning({ id: bets.id });
  return { updated: rows.length };
}
