import type { ExtractTablesWithRelations } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { users } from "@/app/lib/schema";

// Leaderboard + portfolio read model. Pure, read-only derivations over the
// users + bets tables — no coin movement (that stays in applyEntry). Mirrors the
// driver-agnostic DB handle the ledger/markets repos use so PGlite tests and the
// production postgres-js client both type-check off the same source.

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** A leaderboard line: net worth = coins on hand + open stakes at cost. */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  netWorth: number;
  accuracy: number; // 0–100
}

/** A user's full portfolio stats for the profile page (and own leaderboard row). */
export interface UserStats {
  balance: number;
  netWorth: number;
  accuracy: number; // 0–100
  totalResolved: number;
  totalWins: number;
  rank: number; // 1-based, by net worth
}

// Net worth = settled balance + every still-open stake at cost. The correlated
// subquery sums `open` bets per user (COALESCE→0 when they hold no positions).
// `users.id` is referenced via its fully-qualified column so it binds to the
// OUTER user row, not `bets.id` (which would shadow an unqualified "id").
const netWorthExpr = sql<number>`(
  ${users.balance} + COALESCE((
    SELECT SUM(${schema.bets.amount})
    FROM ${schema.bets}
    WHERE ${schema.bets.userId} = "user"."id" AND ${schema.bets.status} = 'open'
  ), 0)
)::int`;

// Forecaster accuracy = round(wins / resolved × 100), or 0 before any resolve.
const accuracyExpr = sql<number>`(
  CASE WHEN ${users.totalResolved} > 0
    THEN round(${users.totalWins} * 100.0 / ${users.totalResolved})
    ELSE 0
  END
)::int`;

/**
 * The ranked leaderboard. `by: "networth"` orders by coins-at-risk-plus-balance
 * desc; `by: "accuracy"` orders by win ratio desc (0-resolved users sort last
 * because their accuracy is 0). Rank is the 1-based position in the chosen order.
 */
export async function getLeaderboard({
  db = defaultDb,
  by,
  limit = 50,
}: {
  db?: DB;
  by: "networth" | "accuracy";
  limit?: number;
}): Promise<LeaderboardEntry[]> {
  const orderExpr = by === "accuracy" ? accuracyExpr : netWorthExpr;
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      netWorth: netWorthExpr,
      accuracy: accuracyExpr,
    })
    .from(users)
    .orderBy(sql`${orderExpr} DESC, ${netWorthExpr} DESC, ${users.id} ASC`)
    .limit(limit);

  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    name: r.name,
    netWorth: r.netWorth,
    accuracy: r.accuracy,
  }));
}

/**
 * One user's portfolio stats plus their net-worth rank (count of users with a
 * strictly-higher net worth, + 1). Returns null if the user does not exist.
 */
export async function getUserStats({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<UserStats | null> {
  const [row] = await db
    .select({
      balance: users.balance,
      netWorth: netWorthExpr,
      accuracy: accuracyExpr,
      totalResolved: users.totalResolved,
      totalWins: users.totalWins,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) return null;

  const [higher] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${netWorthExpr} > ${row.netWorth}`);

  return { ...row, rank: (higher?.n ?? 0) + 1 };
}
