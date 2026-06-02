import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import * as repo from "@/app/lib/bets/repo";
import type { UnseenResolvedBet } from "@/app/lib/bets/repo";

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Resolved bets the user hasn't yet seen — drives the one-time celebration. */
export async function getCelebrations({
  db = defaultDb,
  userId,
  marketId,
}: {
  db?: DB;
  userId: string;
  marketId?: string;
}): Promise<UnseenResolvedBet[]> {
  return repo.listUnseenResolvedBets({ db, userId, marketId });
}

/** Acknowledge celebrations (mark seen). Idempotent; validates input shape. */
export async function acknowledgeCelebrations({
  db = defaultDb,
  userId,
  betIds,
}: {
  db?: DB;
  userId: string;
  betIds: string[];
}): Promise<{ count: number }> {
  const ids = (betIds ?? []).filter((b) => typeof b === "string" && b.length > 0);
  const { updated } = await repo.markBetsSeen({ db, userId, betIds: ids });
  return { count: updated };
}
