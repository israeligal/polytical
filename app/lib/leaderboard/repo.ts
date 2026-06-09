import type { ExtractTablesWithRelations } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { users } from "@/app/lib/schema";

// Leaderboard + profile read model. Pure, read-only derivations over the users
// table — the only score is the prediction record (totalWins / totalResolved).
// Mirrors the driver-agnostic DB handle the markets repo uses so PGlite tests and
// the production postgres-js client both type-check off the same source.

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** A leaderboard line: how many correct calls + the accuracy of those calls. */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  totalWins: number;
  totalResolved: number;
  accuracy: number; // 0–100
}

/** A user's prediction-record stats for the profile page (and own leaderboard row). */
export interface UserStats {
  totalResolved: number;
  totalWins: number;
  totalWrong: number;
  accuracy: number; // 0–100
  rank: number; // 1-based, by # correct
}

// Forecaster accuracy = round(wins / resolved × 100), or 0 before any resolve.
const accuracyExpr = sql<number>`(
  CASE WHEN ${users.totalResolved} > 0
    THEN round(${users.totalWins} * 100.0 / ${users.totalResolved})
    ELSE 0
  END
)::int`;

/**
 * The ranked leaderboard. `by: "wins"` orders by number of correct predictions
 * desc (accuracy breaks ties); `by: "accuracy"` orders by win ratio desc (then by
 * volume of correct calls, so a 1/1 user doesn't outrank a 90/100 one). Rank is
 * the 1-based position in the chosen order.
 */
export async function getLeaderboard({
  db = defaultDb,
  by,
  limit = 50,
}: {
  db?: DB;
  by: "wins" | "accuracy";
  limit?: number;
}): Promise<LeaderboardEntry[]> {
  const order =
    by === "accuracy"
      ? sql`${accuracyExpr} DESC, ${users.totalWins} DESC, ${users.id} ASC`
      : sql`${users.totalWins} DESC, ${accuracyExpr} DESC, ${users.id} ASC`;
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      totalWins: users.totalWins,
      totalResolved: users.totalResolved,
      accuracy: accuracyExpr,
    })
    .from(users)
    .orderBy(order)
    .limit(limit);

  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    name: r.name,
    totalWins: r.totalWins,
    totalResolved: r.totalResolved,
    accuracy: r.accuracy,
  }));
}

/**
 * One user's prediction-record stats plus their rank (count of users with
 * strictly more correct calls, + 1). Returns null if the user does not exist.
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
      totalResolved: users.totalResolved,
      totalWins: users.totalWins,
      accuracy: accuracyExpr,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) return null;

  const [higher] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.totalWins} > ${row.totalWins}`);

  return {
    totalResolved: row.totalResolved,
    totalWins: row.totalWins,
    totalWrong: row.totalResolved - row.totalWins,
    accuracy: row.accuracy,
    rank: (higher?.n ?? 0) + 1,
  };
}
