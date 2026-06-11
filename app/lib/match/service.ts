// "מי מצביע כמוכם" — agreement between a user's stances and every MK's real
// roll-call record. Computed on-read (148 MKs × ≤ a few hundred stances —
// trivial); derive-don't-sync, so a retraction immediately re-locks.
//
// Scoreable universe: the user's stances on DECISIVE votes of SCOREABLE types
// (electronic/roll_call — a hand vote can be decisive as the feed
// representative but carries no per-MK rows), against MK results 'for'/
// 'against' only (abstain/didnt_vote/absence excluded from the math).

import { and, eq, inArray, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { factions, knessetVotes, mkVotes, politicians, userStances } from "@/app/lib/schema";
import { MATCH_UNLOCK_THRESHOLD } from "@/app/lib/stances/service";
import type { PoliticianRow } from "@/app/lib/politicians/repo";

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** An MK qualifies for the lists only with this many shared votes. */
export const MK_QUALIFY_THRESHOLD = 5;
/** Below this many shared votes a score renders with a low-confidence label. */
export const LOW_CONFIDENCE_BELOW = 10;
/** Top/bottom panels need this many qualified MKs; fewer → single-list mode. */
const PANELS_MIN_QUALIFIED = 6;

const SCOREABLE = and(
  eq(knessetVotes.isDecisive, true),
  inArray(knessetVotes.voteType, ["electronic", "roll_call"]),
);

export interface MkMatch {
  politician: PoliticianRow;
  shared: number;
  matches: number;
  /** 0–100, rounded. */
  agreementPct: number;
  lowConfidence: boolean;
}

export interface PartyMatch {
  factionId: number;
  nameHe: string;
  shared: number;
  matches: number;
  agreementPct: number;
}

export type MatchResult =
  | { state: "locked"; scoreableCount: number; needed: number }
  | {
      state: "unlocked";
      scoreableCount: number;
      mode: "panels" | "partial";
      top: MkMatch[];
      bottom: MkMatch[];
      bestParty: PartyMatch | null;
      worstParty: PartyMatch | null;
    };

/** Deterministic order: agreement desc, then more shared evidence, then name. */
function rank(a: MkMatch, b: MkMatch): number {
  return (
    b.agreementPct - a.agreementPct ||
    b.shared - a.shared ||
    a.politician.nameHe.localeCompare(b.politician.nameHe, "he")
  );
}

export async function computeMatch({
  db = defaultDb,
  userId,
}: { db?: DB; userId: string }): Promise<MatchResult> {
  // One pass: every (stance × MK for/against vote) pair on scoreable votes.
  const perMk = await db
    .select({
      personId: mkVotes.personId,
      shared: sql<number>`count(*)::int`,
      matches: sql<number>`count(*) filter (where ${mkVotes.result}::text = ${userStances.stance}::text)::int`,
    })
    .from(userStances)
    .innerJoin(knessetVotes, eq(knessetVotes.voteId, userStances.voteId))
    .innerJoin(mkVotes, eq(mkVotes.voteId, userStances.voteId))
    .where(and(eq(userStances.userId, userId), SCOREABLE, inArray(mkVotes.result, ["for", "against"])))
    .groupBy(mkVotes.personId);

  const scoreableCount = await db
    .select({ n: sql<number>`count(distinct ${userStances.voteId})::int` })
    .from(userStances)
    .innerJoin(knessetVotes, eq(knessetVotes.voteId, userStances.voteId))
    .where(and(eq(userStances.userId, userId), SCOREABLE))
    .then((r) => Number(r[0]?.n ?? 0));

  if (scoreableCount < MATCH_UNLOCK_THRESHOLD) {
    return { state: "locked", scoreableCount, needed: MATCH_UNLOCK_THRESHOLD - scoreableCount };
  }

  const qualifiedRows = perMk.filter((r) => r.shared >= MK_QUALIFY_THRESHOLD);
  const polRows = qualifiedRows.length
    ? await db
        .select()
        .from(politicians)
        .where(and(eq(politicians.active, true), inArray(politicians.personId, qualifiedRows.map((r) => r.personId))))
    : [];
  const polById = new Map(polRows.map((p) => [p.personId, p]));
  const qualified: MkMatch[] = qualifiedRows
    .filter((r) => polById.has(r.personId)) // active MKs only
    .map((r) => ({
      politician: polById.get(r.personId)!,
      shared: r.shared,
      matches: r.matches,
      agreementPct: Math.round((r.matches / r.shared) * 100),
      lowConfidence: r.shared < LOW_CONFIDENCE_BELOW,
    }))
    .sort(rank);

  // Party match: per scoreable vote, each faction's majority position (>50% of
  // its for/against voters; ties skip), scored against the user's stance.
  const perFaction = await db
    .select({
      factionId: sql<number>`fm."factionId"`,
      shared: sql<number>`count(*)::int`,
      matches: sql<number>`count(*) filter (where fm.majority = ${userStances.stance}::text)::int`,
    })
    .from(
      sql`(
        select m."voteId", m."factionId",
          case
            when count(*) filter (where m.result = 'for') * 2 > count(*) then 'for'
            when count(*) filter (where m.result = 'against') * 2 > count(*) then 'against'
            else null
          end as majority
        from ${mkVotes} m
        where m."factionId" is not null and m.result in ('for', 'against')
        group by m."voteId", m."factionId"
      ) as fm`,
    )
    .innerJoin(userStances, sql`${userStances.voteId} = fm."voteId"`)
    .innerJoin(knessetVotes, eq(knessetVotes.voteId, userStances.voteId))
    .where(and(eq(userStances.userId, userId), SCOREABLE, sql`fm.majority is not null`))
    .groupBy(sql`fm."factionId"`);

  const factionQualified = perFaction.filter((f) => f.shared >= MK_QUALIFY_THRESHOLD);
  const factionRows = factionQualified.length
    ? await db.select().from(factions).where(inArray(factions.factionId, factionQualified.map((f) => Number(f.factionId))))
    : [];
  const factionNameById = new Map(factionRows.map((f) => [f.factionId, f.nameHe]));
  const parties: PartyMatch[] = factionQualified
    .map((f) => ({
      factionId: Number(f.factionId),
      nameHe: factionNameById.get(Number(f.factionId)) ?? "",
      shared: f.shared,
      matches: f.matches,
      agreementPct: Math.round((f.matches / f.shared) * 100),
    }))
    .filter((f) => f.nameHe)
    .sort((a, b) => b.agreementPct - a.agreementPct || b.shared - a.shared || a.nameHe.localeCompare(b.nameHe, "he"));

  if (qualified.length >= PANELS_MIN_QUALIFIED) {
    return {
      state: "unlocked",
      scoreableCount,
      mode: "panels",
      top: qualified.slice(0, 3),
      bottom: qualified.slice(-3).reverse(),
      bestParty: parties[0] ?? null,
      worstParty: parties.length > 1 ? parties[parties.length - 1] : null,
    };
  }
  return {
    state: "unlocked",
    scoreableCount,
    mode: "partial",
    top: qualified,
    bottom: [],
    bestParty: parties[0] ?? null,
    worstParty: parties.length > 1 ? parties[parties.length - 1] : null,
  };
}
