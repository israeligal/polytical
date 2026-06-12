import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db as defaultDb } from "@/app/lib/db";
import type { AppDb } from "@/app/lib/db-utils";
import { factionStints, knessetVotes, mkVotes } from "@/app/lib/schema";

export interface MkParticipation {
  votesInTenure: number;
  participated: number;
  missed: number;
  presentDays: number;
  plenumDaysInTenure: number;
}

const ZERO: MkParticipation = {
  votesInTenure: 0,
  participated: 0,
  missed: 0,
  presentDays: 0,
  plenumDaysInTenure: 0,
};

/**
 * An MK's K25 roll-call participation — votes attended vs missed, plus the plenum days
 * they appeared on — over their OWN tenure window (from faction_stints), so departed MKs
 * / non-MK ministers aren't scored against votes cast when they weren't sitting. Roll-call
 * presence is a PROXY, NOT official attendance. Scoreable = electronic|roll_call (hand/
 * secret votes carry no per-MK rows). Absence = no mk_votes row for a scoreable vote.
 */
export async function getMkParticipation({
  db = defaultDb,
  personId,
}: {
  db?: AppDb;
  personId: number;
}): Promise<MkParticipation> {
  const stints = await db
    .select({ start: factionStints.startDate, finish: factionStints.finishDate })
    .from(factionStints)
    .where(eq(factionStints.personId, personId));

  if (stints.length === 0) return ZERO;

  const start = stints.reduce((m, s) => (s.start < m ? s.start : m), stints[0].start);
  const ongoing = stints.some((s) => s.finish == null);
  const finish = ongoing
    ? null
    : stints.reduce<Date>((m, s) => (s.finish! > m ? s.finish! : m), stints[0].finish!);

  const tenureConditions = [
    inArray(knessetVotes.voteType, ["roll_call", "electronic"]),
    gte(knessetVotes.voteDate, start),
    ...(finish ? [lte(knessetVotes.voteDate, finish)] : []),
  ] as const;

  const scoreable = and(...tenureConditions);

  const [denom] = await db
    .select({
      votes: sql<number>`count(*)::int`,
      days: sql<number>`count(distinct date(${knessetVotes.voteDate}))::int`,
    })
    .from(knessetVotes)
    .where(scoreable);

  const [mine] = await db
    .select({
      participated: sql<number>`count(*)::int`,
      days: sql<number>`count(distinct date(${knessetVotes.voteDate}))::int`,
    })
    .from(mkVotes)
    .innerJoin(knessetVotes, eq(knessetVotes.voteId, mkVotes.voteId))
    .where(and(eq(mkVotes.personId, personId), scoreable));

  const votesInTenure = denom?.votes ?? 0;
  const participated = mine?.participated ?? 0;

  return {
    votesInTenure,
    participated,
    missed: Math.max(0, votesInTenure - participated),
    presentDays: mine?.days ?? 0,
    plenumDaysInTenure: denom?.days ?? 0,
  };
}
