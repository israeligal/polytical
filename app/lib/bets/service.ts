import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import * as repo from "@/app/lib/bets/repo";
import type { UnseenResolvedPrediction } from "@/app/lib/bets/repo";

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Resolved predictions the user hasn't yet seen — drives the one-time right/wrong reveal. */
export async function getCelebrations({
  db = defaultDb,
  userId,
  marketId,
}: {
  db?: DB;
  userId: string;
  marketId?: string;
}): Promise<UnseenResolvedPrediction[]> {
  return repo.listUnseenResolvedPredictions({ db, userId, marketId });
}

/** Acknowledge reveals (mark seen). Idempotent; validates input shape. */
export async function acknowledgeCelebrations({
  db = defaultDb,
  userId,
  predictionIds,
}: {
  db?: DB;
  userId: string;
  predictionIds: string[];
}): Promise<{ count: number }> {
  const ids = (predictionIds ?? []).filter((b) => typeof b === "string" && b.length > 0);
  const { updated } = await repo.markPredictionsSeen({ db, userId, predictionIds: ids });
  return { count: updated };
}
