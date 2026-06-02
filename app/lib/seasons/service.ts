import type { ExtractTablesWithRelations } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { seasons as seasonsTable } from "@/app/lib/schema";
import * as repo from "@/app/lib/seasons/repo";
import type { SeasonRow } from "@/app/lib/seasons/repo";
import { applyEntry } from "@/app/lib/ledger/service";
import { lockUser } from "@/app/lib/ledger/repo";
import {
  AlreadyClaimedError,
  AnotherSeasonActiveError,
  InvalidSeasonError,
  NoActiveSeasonError,
  SeasonEndedError,
  SeasonNotFoundError,
  TierNotFoundError,
  TierNotReachedError,
} from "@/app/lib/errors";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type TierState = "claimed" | "claimable" | "locked";

export interface SeasonTierView {
  id: string;
  ordinal: number;
  nameHe: string;
  goalAmount: number;
  rewardAmount: number;
  state: TierState;
}

export interface SeasonBoard {
  season: { id: string; nameHe: string; startAtIso: string; endAtIso: string; status: SeasonRow["status"] };
  progress: number; // net Shekoins won this season (clamped at 0)
  tiers: SeasonTierView[];
  ended: boolean; // status==='ended' OR now >= endAt
}

/**
 * The full season board for a (possibly anonymous) viewer. Returns null when
 * there's no active season. Progress is the user's live net winnings this season
 * (0 for anonymous / net-losers); each tier's state is derived, not stored:
 * claimed > claimable (reached + season live) > locked.
 */
export async function getSeasonBoard({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId?: string | null;
}): Promise<SeasonBoard | null> {
  const season = await repo.getActiveSeason({ db });
  if (!season) return null;

  const tiers = await repo.getSeasonTiers({ db, seasonId: season.id });
  const ended = season.status === "ended" || Date.now() >= season.endAt.getTime();

  const rawProgress = userId
    ? await repo.getSeasonNetWinnings({ db, userId, startAt: season.startAt, endAt: season.endAt })
    : 0;
  const progress = Math.max(0, rawProgress);

  const claimed = userId ? await repo.getClaimedTierIds({ db, userId, seasonId: season.id }) : new Set<string>();

  const tierViews: SeasonTierView[] = tiers.map((t) => {
    let state: TierState;
    if (claimed.has(t.id)) state = "claimed";
    else if (!ended && progress >= t.goalAmount) state = "claimable";
    else state = "locked";
    return {
      id: t.id,
      ordinal: t.ordinal,
      nameHe: t.nameHe,
      goalAmount: t.goalAmount,
      rewardAmount: t.rewardAmount,
      state,
    };
  });

  return {
    season: {
      id: season.id,
      nameHe: season.nameHe,
      startAtIso: season.startAt.toISOString(),
      endAtIso: season.endAt.toISOString(),
      status: season.status,
    },
    progress,
    tiers: tierViews,
    ended,
  };
}

/**
 * Claims a reward tier. Mirrors grantStartingStack's shape: one tx →
 * lockUser FIRST → lockTier → assert the season is live (not ended, now<endAt)
 * → idempotency guard (AlreadyClaimedError) → progress (computed under the lock)
 * >= goal (TierNotReachedError) → applyEntry season_reward credit → insertClaim
 * (the composite PK is the final backstop: a lost race rolls back the credit).
 * A later dip below goal never revokes the claim — it is terminal.
 */
export async function claimTier({
  db = defaultDb,
  userId,
  tierId,
}: {
  db?: DB;
  userId: string;
  tierId: string;
}): Promise<{ balanceAfter: number; amount: number }> {
  return db.transaction(async (tx) => {
    await lockUser({ tx, userId }); // lock the user first so concurrent claims serialize
    const tier = await repo.lockTier({ tx, tierId });
    if (!tier) throw new TierNotFoundError();

    // Read the tier's season under the same tx (its window bounds the progress).
    const [seasonRow] = await tx
      .select()
      .from(seasonsTable)
      .where(eq(seasonsTable.id, tier.seasonId))
      .limit(1);
    if (!seasonRow) throw new SeasonNotFoundError();
    if (seasonRow.status === "ended" || Date.now() >= seasonRow.endAt.getTime()) throw new SeasonEndedError();

    if (await repo.isClaimed({ tx, userId, tierId })) throw new AlreadyClaimedError();

    const progress = await repo.getSeasonNetWinnings({
      tx,
      userId,
      startAt: seasonRow.startAt,
      endAt: seasonRow.endAt,
    });
    if (progress < tier.goalAmount) throw new TierNotReachedError();

    const { balanceAfter } = await applyEntry({ tx, userId, type: "season_reward", amount: tier.rewardAmount });
    const inserted = await repo.insertClaim({
      tx,
      userId,
      tierId,
      seasonId: seasonRow.id,
      amount: tier.rewardAmount,
    });
    if (!inserted) throw new AlreadyClaimedError(); // lost the PK race → roll back the credit
    return { balanceAfter, amount: tier.rewardAmount };
  });
}

// --- Admin ---

/** Creates a new active season with increasing-goal tiers. Rejects if another
 *  season is already active, or the tier goals/rewards aren't strictly sane. */
export async function createSeason({
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
  tiers: { nameHe: string; goalAmount: number; rewardAmount: number }[];
}): Promise<{ seasonId: string }> {
  if (!nameHe.trim()) throw new InvalidSeasonError();
  if (!(endAt.getTime() > startAt.getTime())) throw new InvalidSeasonError();
  if (tiers.length === 0) throw new InvalidSeasonError();
  // Goals must strictly increase; rewards & goals positive.
  let prevGoal = 0;
  for (const t of tiers) {
    if (t.goalAmount <= prevGoal || t.rewardAmount <= 0 || !t.nameHe.trim()) throw new InvalidSeasonError();
    prevGoal = t.goalAmount;
  }
  if ((await repo.countActiveSeasons({ db })) > 0) throw new AnotherSeasonActiveError();

  return repo.insertSeasonWithTiers({
    db,
    nameHe,
    startAt,
    endAt,
    tiers: tiers.map((t, i) => ({ ordinal: i + 1, ...t })),
  });
}

/** Ends the active season (admin or a passed seasonId). */
export async function endSeason({
  db = defaultDb,
  seasonId,
}: {
  db?: DB;
  seasonId?: string;
}): Promise<void> {
  const target = seasonId
    ? await repo.getSeasonById({ db, seasonId })
    : await repo.getActiveSeason({ db });
  if (!target) throw seasonId ? new SeasonNotFoundError() : new NoActiveSeasonError();
  await repo.setSeasonEnded({ db, seasonId: target.id });
}
