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
import { SCOREABLE_VOTE_TYPES } from "@/app/lib/votes/normalize";

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

/**
 * Atomic toggle — ONE round-trip decides retraction vs set, so two concurrent
 * casts (two tabs/devices) always collapse to a serial order (a read-then-
 * write version could interleave into silently dropping the stance):
 * first try `DELETE ... AND stance = $same` — a hit means the tap was a
 * retraction, done; a miss falls through to the idempotent upsert.
 */
export async function toggleStance({
  db = defaultDb,
  userId,
  voteId,
  stance,
}: { db?: DB; userId: string; voteId: number; stance: StanceValue }): Promise<{ stance: StanceValue | null }> {
  const deleted = await db
    .delete(userStances)
    .where(
      and(
        eq(userStances.userId, reqUser(userId)),
        eq(userStances.voteId, voteId),
        eq(userStances.stance, stance),
      ),
    )
    .returning({ voteId: userStances.voteId });
  if (deleted.length > 0) return { stance: null }; // retraction
  await db
    .insert(userStances)
    .values({ userId: reqUser(userId), voteId, stance })
    .onConflictDoUpdate({
      target: [userStances.userId, userStances.voteId],
      set: { stance, updatedAt: new Date() },
    });
  return { stance };
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
        inArray(knessetVotes.voteType, [...SCOREABLE_VOTE_TYPES]),
      ),
    );
  return Number(row?.n ?? 0);
}
