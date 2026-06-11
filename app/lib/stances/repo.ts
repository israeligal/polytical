// User stances (עמדות) — private civic positions on Knesset votes. Sensitive
// data (Israel PPL Amendment 13): rows cascade-delete with the account, the
// direction never leaves the DB (aggregates are k-gated in the service), and
// every user-scoped read is guarded.

import { and, count, countDistinct, eq, inArray } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { knessetVotes, userStances } from "@/app/lib/schema";
import { MissingUserError } from "@/app/lib/errors";

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type StanceValue = (typeof schema.userStance.enumValues)[number];

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

export async function getStance({
  db = defaultDb,
  userId,
  voteId,
}: { db?: DB; userId: string; voteId: number }): Promise<StanceValue | null> {
  const [row] = await db
    .select({ stance: userStances.stance })
    .from(userStances)
    .where(and(eq(userStances.userId, reqUser(userId)), eq(userStances.voteId, voteId)))
    .limit(1);
  return row?.stance ?? null;
}

/** The user's stances across a set of votes (feed chip state). */
export async function getStancesForVotes({
  db = defaultDb,
  userId,
  voteIds,
}: { db?: DB; userId: string; voteIds: number[] }): Promise<Map<number, StanceValue>> {
  if (!voteIds.length) return new Map();
  const rows = await db
    .select({ voteId: userStances.voteId, stance: userStances.stance })
    .from(userStances)
    .where(and(eq(userStances.userId, reqUser(userId)), inArray(userStances.voteId, voteIds)));
  return new Map(rows.map((r) => [r.voteId, r.stance]));
}

/** UPSERT — re-stancing flips the pick in place (predictions precedent). */
export async function upsertStance({
  db = defaultDb,
  userId,
  voteId,
  stance,
}: { db?: DB; userId: string; voteId: number; stance: StanceValue }): Promise<void> {
  await db
    .insert(userStances)
    .values({ userId: reqUser(userId), voteId, stance })
    .onConflictDoUpdate({
      target: [userStances.userId, userStances.voteId],
      set: { stance, updatedAt: new Date() },
    });
}

/** Retraction — tapping the selected stance again removes the row entirely. */
export async function deleteStance({
  db = defaultDb,
  userId,
  voteId,
}: { db?: DB; userId: string; voteId: number }): Promise<void> {
  await db
    .delete(userStances)
    .where(and(eq(userStances.userId, reqUser(userId)), eq(userStances.voteId, voteId)));
}

/** Community split for one vote — RAW counts; the k-gate lives in the service. */
export async function getStanceCounts({
  db = defaultDb,
  voteId,
}: { db?: DB; voteId: number }): Promise<{ forCount: number; againstCount: number }> {
  const rows = await db
    .select({ stance: userStances.stance, n: count() })
    .from(userStances)
    .where(eq(userStances.voteId, voteId))
    .groupBy(userStances.stance);
  let forCount = 0;
  let againstCount = 0;
  for (const r of rows) {
    if (r.stance === "for") forCount = Number(r.n);
    else againstCount = Number(r.n);
  }
  return { forCount, againstCount };
}

/**
 * How many of the user's stances sit on SCOREABLE votes (decisive AND
 * electronic/roll_call) — the match-unlock counter. A hand-vote stance is a
 * legitimate opinion but can never contribute to matching.
 */
export async function getScoreableStanceCount({
  db = defaultDb,
  userId,
}: { db?: DB; userId: string }): Promise<number> {
  const [row] = await db
    .select({ n: countDistinct(userStances.voteId) })
    .from(userStances)
    .innerJoin(knessetVotes, eq(knessetVotes.voteId, userStances.voteId))
    .where(
      and(
        eq(userStances.userId, reqUser(userId)),
        eq(knessetVotes.isDecisive, true),
        inArray(knessetVotes.voteType, ["electronic", "roll_call"]),
      ),
    );
  return Number(row?.n ?? 0);
}
