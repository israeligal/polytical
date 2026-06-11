// Read-side repo for the votes UI (write-side lives in repo.ts). The feed
// spine is "primary" votes: isDecisive (one per item — see pickDecisiveVoteId)
// plus standalone votes with no itemId. ~2.3k primaries over 6,979 votes.

import { and, count, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/app/lib/db";
import {
  agendaItems, factions, ingestHeartbeats, knessetVotes, mkVotes, mkVotesRaw, politicians, unmappedMkNames,
} from "@/app/lib/schema";
import type { VotesDb } from "./repo";
import { jerusalemWeekday } from "@/lib/time";

type DB = VotesDb;

export type KnessetVoteRow = typeof knessetVotes.$inferSelect;
export type AgendaItemRow = typeof agendaItems.$inferSelect;

export interface FeedVote extends KnessetVoteRow {
  /** Other votes on the same item (readings/reservations) — 0 for standalones. */
  siblingCount: number;
}

export interface VotesFeedPage {
  votes: FeedVote[];
  /** Cursor for the next page (pass as `before`), null when exhausted. */
  nextBefore: string | null;
}

const FEED_PRIMARY = or(eq(knessetVotes.isDecisive, true), isNull(knessetVotes.itemId));

// Composite keyset cursor "(iso)_(voteId)" matching the (voteDate, voteId)
// sort key. A date-only cursor silently drops same-timestamp rows across a
// page boundary — verified real: 137 timestamp ties across the 2.3k primaries
// (plenum runs stamp same-minute votes). Garbage cursors (user-craftable URL)
// parse to null → first page, never a 500.
function parseCursor(before: string | undefined): { date: Date; voteId: number } | null {
  if (!before) return null;
  const sep = before.lastIndexOf("_");
  const iso = sep === -1 ? before : before.slice(0, sep);
  const voteId = sep === -1 ? Number.MAX_SAFE_INTEGER : Number(before.slice(sep + 1));
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(voteId)) return null;
  return { date, voteId };
}

/** Newest-first keyset pagination over primary votes. */
export async function getVotesFeed({
  db = defaultDb,
  before,
  limit = 30,
}: { db?: DB; before?: string; limit?: number } = {}): Promise<VotesFeedPage> {
  const cursor = parseCursor(before);
  const where = cursor
    ? and(
        FEED_PRIMARY,
        or(
          lt(knessetVotes.voteDate, cursor.date),
          and(eq(knessetVotes.voteDate, cursor.date), lt(knessetVotes.voteId, cursor.voteId)),
        ),
      )
    : FEED_PRIMARY;
  const rows = await db
    .select()
    .from(knessetVotes)
    .where(where)
    .orderBy(desc(knessetVotes.voteDate), desc(knessetVotes.voteId))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextBefore = rows.length > limit ? `${last.voteDate.toISOString()}_${last.voteId}` : null;

  const itemIds = [...new Set(page.map((v) => v.itemId).filter((i): i is number => i != null))];
  const siblingCounts = new Map<number, number>();
  if (itemIds.length) {
    const counts = await db
      .select({ itemId: knessetVotes.itemId, n: count() })
      .from(knessetVotes)
      .where(inArray(knessetVotes.itemId, itemIds))
      .groupBy(knessetVotes.itemId);
    for (const c of counts) if (c.itemId != null) siblingCounts.set(c.itemId, Number(c.n));
  }
  return {
    votes: page.map((v) => ({
      ...v,
      siblingCount: v.itemId != null ? Math.max(0, (siblingCounts.get(v.itemId) ?? 1) - 1) : 0,
    })),
    nextBefore,
  };
}

/** Admin-featured primaries of the last `sinceDays` for the feed rail. */
export async function getFeaturedVotes({
  db = defaultDb,
  sinceDays = 31,
  limit = 6,
}: { db?: DB; sinceDays?: number; limit?: number } = {}): Promise<KnessetVoteRow[]> {
  const since = new Date(Date.now() - sinceDays * 864e5);
  return db
    .select()
    .from(knessetVotes)
    .where(and(eq(knessetVotes.featured, true), gte(knessetVotes.voteDate, since)))
    .orderBy(desc(knessetVotes.voteDate))
    .limit(limit);
}

export interface MkVoteWithPolitician {
  personId: number;
  result: typeof mkVotes.$inferSelect.result;
  factionId: number | null;
  factionNameHe: string | null;
  politician: typeof politicians.$inferSelect | null;
}

export interface VoteDetail {
  vote: KnessetVoteRow;
  /** Per-MK breakdown with the politician row + faction-at-vote-time name. */
  breakdown: MkVoteWithPolitician[];
  /** Raw rows withheld from attribution (pending identity verification). */
  withheldCount: number;
  /** The item's other votes, newest first (readings/reservations context). */
  siblings: KnessetVoteRow[];
}

export async function getVoteDetail({
  db = defaultDb,
  voteId,
}: { db?: DB; voteId: number }): Promise<VoteDetail | null> {
  const [vote] = await db.select().from(knessetVotes).where(eq(knessetVotes.voteId, voteId)).limit(1);
  if (!vote) return null;

  const [breakdownRows, [rawCount], siblings] = await Promise.all([
    db
      .select({
        personId: mkVotes.personId,
        result: mkVotes.result,
        factionId: mkVotes.factionId,
        factionNameHe: factions.nameHe,
        politician: politicians,
      })
      .from(mkVotes)
      .leftJoin(factions, eq(factions.factionId, mkVotes.factionId))
      .leftJoin(politicians, eq(politicians.personId, mkVotes.personId))
      .where(eq(mkVotes.voteId, voteId)),
    db.select({ n: count() }).from(mkVotesRaw).where(eq(mkVotesRaw.voteId, voteId)),
    vote.itemId == null
      ? Promise.resolve([] as KnessetVoteRow[])
      : db
          .select()
          .from(knessetVotes)
          .where(and(eq(knessetVotes.itemId, vote.itemId), sql`${knessetVotes.voteId} <> ${voteId}`))
          .orderBy(desc(knessetVotes.voteDate), desc(knessetVotes.voteId)),
  ]);
  return {
    vote,
    breakdown: breakdownRows,
    withheldCount: Math.max(0, Number(rawCount?.n ?? 0) - breakdownRows.length),
    siblings,
  };
}

export interface FactionGroup {
  name: string;
  members: MkVoteWithPolitician[];
}

/** Group a breakdown by faction-at-vote-time, largest faction first; members
 *  sorted by result so בעד/נגד/נמנע cluster. Pure — unit-tested. */
export function groupByFaction(breakdown: MkVoteWithPolitician[]): FactionGroup[] {
  const groups = new Map<string, MkVoteWithPolitician[]>();
  for (const row of breakdown) {
    const name = row.factionNameHe ?? "ללא שיוך סיעתי";
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([name, members]) => ({
      name,
      members: members.sort((a, b) => a.result.localeCompare(b.result)),
    }))
    .sort((a, b) => b.members.length - a.members.length);
}

export interface RecentMkVote {
  voteId: number;
  titleHe: string;
  voteDate: Date;
  isAccepted: boolean | null;
  isDecisive: boolean;
}

/** An MK's recent בעד / נגד records (decisive-first, then newest). */
export async function getRecentMkVotes({
  db = defaultDb,
  personId,
  limit = 8,
}: { db?: DB; personId: number; limit?: number }): Promise<{ for: RecentMkVote[]; against: RecentMkVote[] }> {
  const fetch = (result: "for" | "against") =>
    db
      .select({
        voteId: knessetVotes.voteId,
        titleHe: knessetVotes.titleHe,
        voteDate: knessetVotes.voteDate,
        isAccepted: knessetVotes.isAccepted,
        isDecisive: knessetVotes.isDecisive,
      })
      .from(mkVotes)
      .innerJoin(knessetVotes, eq(knessetVotes.voteId, mkVotes.voteId))
      .where(and(eq(mkVotes.personId, personId), eq(mkVotes.result, result)))
      .orderBy(desc(knessetVotes.isDecisive), desc(knessetVotes.voteDate))
      .limit(limit);
  const [forVotes, againstVotes] = await Promise.all([fetch("for"), fetch("against")]);
  return { for: forVotes, against: againstVotes };
}

export interface VotesFreshness {
  /** Last successful ingest RUN (heartbeat) — shown as "עודכן לאחרונה". */
  latest: Date | null;
  /** True when the pipeline looks broken: no successful run within the SLO
   *  (6h on plenum days Mon–Wed in Asia/Jerusalem, 24h otherwise — spec P0-4).
   *  Based on the heartbeat, NOT max(fetchedAt): a recess sweep re-stamps no
   *  rows but is perfectly healthy. */
  isStale: boolean;
}

const PLENUM_SLO_MS = 6 * 60 * 60 * 1000;
const OFF_DAY_SLO_MS = 24 * 60 * 60 * 1000;
const PLENUM_DAYS = new Set([1, 2, 3]); // Mon–Wed (plenum sits Mon–Wed)

/** Data freshness for the user-visible "עודכן לאחרונה" + staleness warning. */
export async function getVotesFreshness({ db = defaultDb }: { db?: DB } = {}): Promise<VotesFreshness> {
  const [hb] = await db
    .select({ lastSuccessAt: ingestHeartbeats.lastSuccessAt })
    .from(ingestHeartbeats)
    .where(eq(ingestHeartbeats.job, "votes"))
    .limit(1);
  const latest = hb?.lastSuccessAt ?? null;
  if (!latest) return { latest: null, isStale: false }; // pre-first-run: nothing to claim
  const now = new Date();
  const slo = PLENUM_DAYS.has(jerusalemWeekday(now)) ? PLENUM_SLO_MS : OFF_DAY_SLO_MS;
  return { latest, isStale: now.getTime() - latest.getTime() > slo };
}

/** Announced agenda items for the read-only "על סדר היום" section. */
export async function getAnnouncedAgendaItems({
  db = defaultDb,
  limit = 10,
}: { db?: DB; limit?: number } = {}): Promise<AgendaItemRow[]> {
  return db
    .select()
    .from(agendaItems)
    .where(eq(agendaItems.status, "announced"))
    .orderBy(sql`${agendaItems.expectedDate} asc nulls last`, desc(agendaItems.createdAt))
    .limit(limit);
}

// --- admin reads ---

export interface PendingUnmappedName {
  nameKey: string;
  nameRaw: string;
  firstSeenAt: Date;
  /** Retained raw rows carrying this key — what resolution would backfill. */
  occurrences: number;
}

/** The identity-review queue with evidence counts (admin dashboard). */
export async function listPendingUnmappedNames({
  db = defaultDb,
}: { db?: DB } = {}): Promise<PendingUnmappedName[]> {
  return db
    .select({
      nameKey: unmappedMkNames.nameKey,
      nameRaw: unmappedMkNames.nameRaw,
      firstSeenAt: unmappedMkNames.firstSeenAt,
      occurrences: count(mkVotesRaw.id),
    })
    .from(unmappedMkNames)
    .leftJoin(mkVotesRaw, eq(mkVotesRaw.mkNameKey, unmappedMkNames.nameKey))
    .where(eq(unmappedMkNames.status, "pending"))
    .groupBy(unmappedMkNames.nameKey, unmappedMkNames.nameRaw, unmappedMkNames.firstSeenAt)
    .orderBy(desc(count(mkVotesRaw.id)));
}

/**
 * Recent primary votes for the admin featured-toggle list — PLUS every
 * currently-featured vote regardless of recency, so a vote still rendering in
 * the public rail can always be un-featured (the recency cap alone would
 * orphan older featured votes from the admin UI).
 */
export async function listRecentVotesForAdmin({
  db = defaultDb,
  limit = 15,
}: { db?: DB; limit?: number } = {}): Promise<KnessetVoteRow[]> {
  const [recent, featured] = await Promise.all([
    db
      .select()
      .from(knessetVotes)
      .where(FEED_PRIMARY)
      .orderBy(desc(knessetVotes.voteDate), desc(knessetVotes.voteId))
      .limit(limit),
    db.select().from(knessetVotes).where(eq(knessetVotes.featured, true)).orderBy(desc(knessetVotes.voteDate)),
  ]);
  const seen = new Set(featured.map((v) => v.voteId));
  return [...featured, ...recent.filter((v) => !seen.has(v.voteId))];
}

/** Agenda items in every status (admin CRUD list). */
export async function listAgendaItemsForAdmin({
  db = defaultDb,
  limit = 30,
}: { db?: DB; limit?: number } = {}): Promise<AgendaItemRow[]> {
  return db
    .select()
    .from(agendaItems)
    .orderBy(desc(agendaItems.createdAt))
    .limit(limit);
}
