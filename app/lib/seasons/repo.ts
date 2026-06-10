import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { bets, markets, seasons, seasonTiers } from "@/app/lib/schema";
import type { Tx as LedgerTx } from "@/app/lib/db";
import { MissingUserError } from "@/app/lib/errors";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
type Tx = LedgerTx;

export type SeasonRow = typeof seasons.$inferSelect;
export type SeasonTierRow = typeof seasonTiers.$inferSelect;

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/** The single active season (status='active'), or null. */
export async function getActiveSeason({ db = defaultDb }: { db?: DB } = {}): Promise<SeasonRow | null> {
  const [row] = await db.select().from(seasons).where(eq(seasons.status, "active")).limit(1);
  return row ?? null;
}

export async function getSeasonById({
  db = defaultDb,
  seasonId,
}: {
  db?: DB;
  seasonId: string;
}): Promise<SeasonRow | null> {
  const [row] = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  return row ?? null;
}

/** A season's tiers, in ordinal order. */
export async function getSeasonTiers({
  db = defaultDb,
  seasonId,
}: {
  db?: DB;
  seasonId: string;
}): Promise<SeasonTierRow[]> {
  return db
    .select()
    .from(seasonTiers)
    .where(eq(seasonTiers.seasonId, seasonId))
    .orderBy(asc(seasonTiers.ordinal));
}

/**
 * The number of CORRECT predictions the user made on markets RESOLVED within the
 * season window [startAt, endAt] — computed LIVE (no tally column). A prediction
 * is correct iff its outcome is the market's resolved winning outcome. This is
 * the season's accuracy metric: it rewards making good calls during the season.
 * Always >= 0.
 */
export async function getSeasonCorrect({
  db,
  tx,
  userId,
  startAt,
  endAt,
}: {
  db?: DB;
  tx?: Tx;
  userId: string;
  startAt: Date;
  endAt: Date;
}): Promise<number> {
  const conn = tx ?? db ?? defaultDb;
  const [row] = await conn
    .select({ correct: sql<number>`count(*)::int` })
    .from(bets)
    .innerJoin(markets, eq(markets.id, bets.marketId))
    .where(
      and(
        eq(bets.userId, reqUser(userId)),
        eq(markets.status, "resolved"),
        gte(markets.resolvedAt, startAt),
        lte(markets.resolvedAt, endAt),
        sql`${bets.outcomeId} = ${markets.resolvedOutcomeId}`,
      ),
    );
  return row?.correct ?? 0;
}

// --- Admin writes ---

/** Count of currently-active seasons (the one-active invariant guard). */
export async function countActiveSeasons({ db = defaultDb }: { db?: DB } = {}): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(seasons)
    .where(eq(seasons.status, "active"));
  return row?.n ?? 0;
}

/** Creates a season + its accuracy tiers atomically (one tx). */
export async function insertSeasonWithTiers({
  db = defaultDb,
  nameHe,
  startAt,
  endAt,
  tiers,
}: {
  db?: DB;
  nameHe: string;
  startAt: Date;
  endAt: Date;
  tiers: { ordinal: number; nameHe: string; goalCorrect: number }[];
}): Promise<{ seasonId: string }> {
  return db.transaction(async (tx) => {
    const [season] = await tx
      .insert(seasons)
      .values({ nameHe, startAt, endAt, status: "active" })
      .returning({ id: seasons.id });
    if (tiers.length > 0) {
      await tx.insert(seasonTiers).values(tiers.map((t) => ({ ...t, seasonId: season.id })));
    }
    return { seasonId: season.id };
  });
}

/** Flips an ACTIVE season to ended; returns how many rows changed (0 = it was
 *  already ended, so the caller can avoid reporting a false success). */
export async function setSeasonEnded({
  db = defaultDb,
  seasonId,
}: {
  db?: DB;
  seasonId: string;
}): Promise<{ ended: number }> {
  const rows = await db
    .update(seasons)
    .set({ status: "ended" })
    .where(and(eq(seasons.id, seasonId), eq(seasons.status, "active")))
    .returning({ id: seasons.id });
  return { ended: rows.length };
}
