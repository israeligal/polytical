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
import { SCOREABLE_VOTE_TYPES } from "@/app/lib/votes/normalize";
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
  inArray(knessetVotes.voteType, [...SCOREABLE_VOTE_TYPES]),
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
      /** Why worstParty is null when it is: no second qualified faction vs a
       *  tie with the best (thin unanimous data) — lets the page render a
       *  distinct "everyone agrees with you" state without a service change. */
      worstPartyHidden: "none" | "tie" | null;
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
  // Three independent aggregations run concurrently: per-MK pairs, the
  // unlock counter, and the per-faction majorities.
  const perMkQ = db
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

  const scoreableCountQ = db
    .select({ n: sql<number>`count(distinct ${userStances.voteId})::int` })
    .from(userStances)
    .innerJoin(knessetVotes, eq(knessetVotes.voteId, userStances.voteId))
    .where(and(eq(userStances.userId, userId), SCOREABLE))
    .then((r) => Number(r[0]?.n ?? 0));

  // Party match: per scoreable vote, each faction's majority position — >50%
  // of its VOTERS at vote time (spec P0-7 wording: abstainers count in the
  // denominator, so a whipped-abstention faction yields NO majority; only
  // didnt_vote rows are excluded). Ties/splits skip the vote.
  const perFactionQ = db
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
        where m."factionId" is not null and m.result in ('for', 'against', 'abstain')
        group by m."voteId", m."factionId"
      ) as fm`,
    )
    .innerJoin(userStances, sql`${userStances.voteId} = fm."voteId"`)
    .innerJoin(knessetVotes, eq(knessetVotes.voteId, userStances.voteId))
    .where(and(eq(userStances.userId, userId), SCOREABLE, sql`fm.majority is not null`))
    .groupBy(sql`fm."factionId"`);

  const [perMk, scoreableCount, perFaction] = await Promise.all([perMkQ, scoreableCountQ, perFactionQ]);
  if (scoreableCount < MATCH_UNLOCK_THRESHOLD) {
    return { state: "locked", scoreableCount, needed: MATCH_UNLOCK_THRESHOLD - scoreableCount };
  }

  const qualifiedRows = perMk.filter((r) => r.shared >= MK_QUALIFY_THRESHOLD);
  const factionQualified = perFaction.filter((f) => f.shared >= MK_QUALIFY_THRESHOLD);
  // Lookups for both panels in one parallel pair.
  const [polRows, factionRows] = await Promise.all([
    qualifiedRows.length
      ? db
          .select()
          .from(politicians)
          .where(and(eq(politicians.active, true), inArray(politicians.personId, qualifiedRows.map((r) => r.personId))))
      : Promise.resolve([] as PoliticianRow[]),
    factionQualified.length
      ? db.select().from(factions).where(inArray(factions.factionId, factionQualified.map((f) => Number(f.factionId))))
      : Promise.resolve([] as (typeof factions.$inferSelect)[]),
  ]);
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

  const bestParty = parties[0] ?? null;
  // A "farthest" party tied with the best (common on thin unanimous data)
  // reads as a contradiction — show it only when it genuinely disagrees more.
  const last = parties.length > 1 ? parties[parties.length - 1] : null;
  const isTie = Boolean(last && bestParty && last.agreementPct >= bestParty.agreementPct);
  const worstParty = last && !isTie ? last : null;
  const worstPartyHidden = worstParty ? null : isTie ? ("tie" as const) : ("none" as const);

  if (qualified.length >= PANELS_MIN_QUALIFIED) {
    return {
      state: "unlocked",
      scoreableCount,
      mode: "panels",
      top: qualified.slice(0, 3),
      bottom: qualified.slice(-3).reverse(),
      bestParty,
      worstParty,
      worstPartyHidden,
    };
  }
  return {
    state: "unlocked",
    scoreableCount,
    mode: "partial",
    top: qualified,
    bottom: [],
    bestParty,
    worstParty,
    worstPartyHidden,
  };
}
