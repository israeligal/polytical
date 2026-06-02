import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { bets, markets, outcomes } from "@/app/lib/schema";
import { MissingUserError } from "@/app/lib/errors";

// Bets read/seen helpers — a small module so markets/repo.ts stays under 500
// lines. Drives the one-time win/loss celebration via the bets.seenAt flag.

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export interface UnseenResolvedBet {
  betId: string;
  marketId: string;
  questionHe: string;
  outcomeLabelHe: string;
  amount: number;
  payout: number;
  status: "won" | "lost";
}

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/**
 * A user's resolved-but-unseen bets (won/lost only — refunds aren't celebratory),
 * optionally scoped to one market. `seenAt IS NULL` is the one-time trigger.
 */
export async function listUnseenResolvedBets({
  db = defaultDb,
  userId,
  marketId,
}: {
  db?: DB;
  userId: string;
  marketId?: string;
}): Promise<UnseenResolvedBet[]> {
  const where = [
    eq(bets.userId, reqUser(userId)),
    isNull(bets.seenAt),
    inArray(bets.status, ["won", "lost"]),
  ];
  if (marketId) where.push(eq(bets.marketId, marketId));
  const rows = await db
    .select({
      betId: bets.id,
      marketId: bets.marketId,
      questionHe: markets.questionHe,
      outcomeLabelHe: outcomes.labelHe,
      amount: bets.amount,
      payout: bets.payout,
      status: bets.status,
    })
    .from(bets)
    .innerJoin(markets, eq(markets.id, bets.marketId))
    .innerJoin(outcomes, eq(outcomes.id, bets.outcomeId))
    .where(and(...where));
  // status is the betStatus enum; narrowed to won|lost by the inArray filter.
  return rows.map((r) => ({ ...r, status: r.status as "won" | "lost" }));
}

/**
 * Marks the given bets seen — scope-guarded (only the user's own) and idempotent
 * (`seenAt IS NULL` so a re-fire updates nothing). No-op on empty input.
 */
export async function markBetsSeen({
  db = defaultDb,
  userId,
  betIds,
}: {
  db?: DB;
  userId: string;
  betIds: string[];
}): Promise<{ updated: number }> {
  if (betIds.length === 0) return { updated: 0 };
  const rows = await db
    .update(bets)
    .set({ seenAt: sql`now()` })
    .where(and(eq(bets.userId, reqUser(userId)), inArray(bets.id, betIds), isNull(bets.seenAt)))
    .returning({ id: bets.id });
  return { updated: rows.length };
}
