// Stance orchestration: validation (vote exists + is its item's decisive
// vote), toggle semantics (same stance again = retraction), and the
// k-anonymous community aggregate.

import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/app/lib/db";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/app/lib/schema";
import { knessetVotes } from "@/app/lib/schema";
import { VoteNotFoundError, VoteNotStanceableError } from "@/app/lib/errors";
import * as repo from "./repo";
import type { StanceValue } from "./repo";

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Below this many distinct stancers the aggregate stays hidden — a tiny-N
 *  percentage both deanonymizes early voters and looks bogus (spec P0-5). */
export const AGGREGATE_MIN_STANCERS = 10;

/** The match unlocks at this many scoreable stances (spec P0-7). */
export const MATCH_UNLOCK_THRESHOLD = 5;

export interface StanceState {
  stance: StanceValue | null;
  /** Stances on scoreable votes — drives the match-unlock progress. */
  scoreableCount: number;
  /** Scoreable count BEFORE this write — lets callers edge-detect the unlock. */
  prevScoreableCount: number;
  /** k-gated community split; null until the viewer has a stance AND n ≥ k. */
  aggregate: { forPct: number; total: number } | null;
}

/**
 * Sets / flips / retracts the user's stance. Tapping the already-selected
 * stance deletes the row (a misclick must be retractable — privacy); the
 * decision is a single atomic statement in the repo, so concurrent casts
 * can't interleave into a dropped stance. Only the item's decisive vote
 * accepts stances, so reservations never collect them.
 */
export async function setStance({
  db = defaultDb,
  userId,
  voteId,
  stance,
}: {
  db?: DB;
  userId: string;
  voteId: number;
  stance: StanceValue;
}): Promise<StanceState> {
  const [vote] = await db
    .select({ isDecisive: knessetVotes.isDecisive })
    .from(knessetVotes)
    .where(eq(knessetVotes.voteId, voteId))
    .limit(1);
  if (!vote) throw new VoteNotFoundError();
  if (!vote.isDecisive) throw new VoteNotStanceableError();

  const prevScoreableCount = await repo.getScoreableStanceCount({ db, userId });
  await repo.toggleStance({ db, userId, voteId, stance });
  const state = await getStanceState({ db, userId, voteId });
  return { ...state, prevScoreableCount };
}

export async function getStanceState({
  db = defaultDb,
  userId,
  voteId,
}: { db?: DB; userId: string; voteId: number }): Promise<StanceState> {
  const [stance, scoreableCount] = await Promise.all([
    repo.getStance({ db, userId, voteId }),
    repo.getScoreableStanceCount({ db, userId }),
  ]);
  let aggregate: StanceState["aggregate"] = null;
  if (stance != null) {
    const { forCount, againstCount } = await repo.getStanceCounts({ db, voteId });
    const total = forCount + againstCount;
    if (total >= AGGREGATE_MIN_STANCERS) {
      aggregate = { forPct: Math.round((forCount / total) * 100), total };
    }
  }
  return { stance, scoreableCount, prevScoreableCount: scoreableCount, aggregate };
}
