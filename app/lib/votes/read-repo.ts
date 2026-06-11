// Read-side repo for the votes UI (write-side lives in repo.ts). The feed
// spine is "primary" votes: isDecisive (one per item — see pickDecisiveVoteId)
// plus standalone votes with no itemId. ~2.3k primaries over 6,979 votes.

import { and, count, desc, eq, inArray, isNull, lt, max, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/app/lib/db";
import {
  agendaItems, factions, knessetVotes, mkVotes, mkVotesRaw, politicians, unmappedMkNames,
} from "@/app/lib/schema";
import type { VotesDb } from "./repo";

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

/** Newest-first cursor pagination over primary votes. `before` = ISO instant. */
export async function getVotesFeed({
  db = defaultDb,
  before,
  limit = 30,
}: { db?: DB; before?: string; limit?: number } = {}): Promise<VotesFeedPage> {
  const where = before
    ? and(FEED_PRIMARY, lt(knessetVotes.voteDate, new Date(before)))
    : FEED_PRIMARY;
  const rows = await db
    .select()
    .from(knessetVotes)
    .where(where)
    .orderBy(desc(knessetVotes.voteDate), desc(knessetVotes.voteId))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const nextBefore = rows.length > limit ? page[page.length - 1].voteDate.toISOString() : null;

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
    .where(and(eq(knessetVotes.featured, true), sql`${knessetVotes.voteDate} >= ${since}`))
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
  latest: Date | null;
  /** True when the pipeline looks broken (no successful ingest in >24h — the
   *  cron sweeps every 2h, plenum day or not). The feed must say so rather
   *  than present old data as current. */
  isStale: boolean;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Data freshness for the user-visible "עודכן לאחרונה" + staleness warning. */
export async function getVotesFreshness({ db = defaultDb }: { db?: DB } = {}): Promise<VotesFreshness> {
  const [row] = await db.select({ latest: max(knessetVotes.fetchedAt) }).from(knessetVotes);
  const latest = row?.latest ?? null;
  return { latest, isStale: latest != null && Date.now() - latest.getTime() > STALE_AFTER_MS };
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

/** Recent primary votes for the admin featured-toggle list. */
export async function listRecentVotesForAdmin({
  db = defaultDb,
  limit = 15,
}: { db?: DB; limit?: number } = {}): Promise<KnessetVoteRow[]> {
  return db
    .select()
    .from(knessetVotes)
    .where(FEED_PRIMARY)
    .orderBy(desc(knessetVotes.voteDate), desc(knessetVotes.voteId))
    .limit(limit);
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
