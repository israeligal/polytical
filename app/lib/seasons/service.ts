import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import * as repo from "@/app/lib/seasons/repo";
import type { SeasonRow } from "@/app/lib/seasons/repo";
import { isUniqueViolation } from "@/app/lib/pg-errors";
import {
  AnotherSeasonActiveError,
  InvalidSeasonError,
  NoActiveSeasonError,
  SeasonEndedError,
  SeasonNotFoundError,
} from "@/app/lib/errors";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export interface SeasonTierView {
  id: string;
  ordinal: number;
  nameHe: string;
  goalCorrect: number; // # correct predictions in-window to reach the tier
  reached: boolean;    // progress >= goalCorrect
}

export interface SeasonBoard {
  season: { id: string; nameHe: string; startAtIso: string; endAtIso: string; status: SeasonRow["status"] };
  progress: number; // # correct predictions this season
  tiers: SeasonTierView[];
  ended: boolean; // status==='ended' OR now >= endAt
}

/**
 * The full season board for a (possibly anonymous) viewer. Returns null when
 * there's no active season. Progress is the number of CORRECT predictions the
 * user made on markets resolved this season (0 for anonymous). Each tier's
 * "reached" flag is derived, not stored — counts only grow, so a reached tier
 * stays reached. No claims, no coins: it's a badge track.
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

  const progress = userId
    ? await repo.getSeasonCorrect({ db, userId, startAt: season.startAt, endAt: season.endAt })
    : 0;

  const tierViews: SeasonTierView[] = tiers.map((t) => ({
    id: t.id,
    ordinal: t.ordinal,
    nameHe: t.nameHe,
    goalCorrect: t.goalCorrect,
    reached: progress >= t.goalCorrect,
  }));

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

// --- Admin ---

/** Creates a new active season with increasing-goal accuracy tiers. Rejects if
 *  another season is already active, or the tier goals aren't strictly sane. */
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
  tiers: { nameHe: string; goalCorrect: number }[];
}): Promise<{ seasonId: string }> {
  if (!nameHe.trim()) throw new InvalidSeasonError();
  if (!(endAt.getTime() > startAt.getTime())) throw new InvalidSeasonError();
  if (tiers.length === 0) throw new InvalidSeasonError();
  // Goals must strictly increase and be positive.
  let prevGoal = 0;
  for (const t of tiers) {
    if (t.goalCorrect <= prevGoal || !t.nameHe.trim()) throw new InvalidSeasonError();
    prevGoal = t.goalCorrect;
  }
  if ((await repo.countActiveSeasons({ db })) > 0) throw new AnotherSeasonActiveError();

  // The count guard above and the insert below aren't one transaction, so two
  // concurrent creates can both pass it; the seasons_one_active_uq partial-unique
  // index is the real backstop. Translate its 23505 to the clean domain error so
  // a race surfaces a Hebrew message, not a 500.
  try {
    return await repo.insertSeasonWithTiers({
      db,
      nameHe,
      startAt,
      endAt,
      tiers: tiers.map((t, i) => ({ ordinal: i + 1, ...t })),
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AnotherSeasonActiveError();
    throw e;
  }
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
  // The UPDATE is scoped to status='active'; 0 rows means it was already ended —
  // surface that rather than reporting a false success (errors-over-fallbacks).
  const { ended } = await repo.setSeasonEnded({ db, seasonId: target.id });
  if (ended === 0) throw new SeasonEndedError();
}
