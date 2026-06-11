// Write-side repo for the votes ingest. Same conventions as
// app/lib/knesset/repo.ts: driver-agnostic DB handle, ≤100-row batches,
// onConflictDoUpdate with explicit SET lists. Admin-owned columns
// (knesset_votes.featured) and pipeline-owned state (isDecisive,
// detailsStatus) are EXCLUDED from the header upsert SET — the dob carve-out
// pattern: re-ingest must never clobber them.

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import * as schema from "@/app/lib/schema";
import {
  factionStints, knessetVotes, mkNameMappings, mkVotes, mkVotesRaw, unmappedMkNames,
} from "@/app/lib/schema";
import { logger } from "@/app/lib/logger";
import type { KnessetVoteInsert, MkVoteRawInsert, MkVoteResultValue, VoteDetailsPatch } from "./normalize";
import { WEBSITE_RESULT_BY_ID, pickDecisiveVoteId } from "./normalize";

export type VotesDb = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
type DB = VotesDb;
export type VotesTx = PgTransaction<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

const BATCH = 100;

function chunk<T>(rows: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Header sweep upsert. Detail-derived, admin, and pipeline columns untouched. */
export async function upsertVoteHeaders({ db, rows }: { db: DB; rows: KnessetVoteInsert[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(knessetVotes).values(batch).onConflictDoUpdate({
      target: knessetVotes.voteId,
      set: {
        knessetNum: sqlExcluded("knessetNum"), titleHe: sqlExcluded("titleHe"),
        voteDate: sqlExcluded("voteDate"), voteType: sqlExcluded("voteType"),
        sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"),
        fetchedAt: sqlExcluded("fetchedAt"),
        // featured (admin), isDecisive/detailsStatus (pipeline), detail fields — never reset here
      },
    });
    n += batch.length;
  }
  logger.info("votes.repo.upsert", { entity: "knesset_votes", rows: n });
  return n;
}

/** voteIds whose details still need fetching. */
export async function listPendingDetailVoteIds({ db, voteIds }: { db: DB; voteIds: number[] }): Promise<number[]> {
  if (!voteIds.length) return [];
  const out: number[] = [];
  for (const batch of chunk(voteIds, 500)) {
    const rows = await db
      .select({ voteId: knessetVotes.voteId })
      .from(knessetVotes)
      .where(and(inArray(knessetVotes.voteId, batch), eq(knessetVotes.detailsStatus, "pending_details")));
    out.push(...rows.map((r) => r.voteId));
  }
  return out;
}

export interface AttributionContext {
  /** verified nameKey -> personId (attribution refuses unverified maps at the service layer) */
  mappings: Map<string, number>;
  /** personId -> stints sorted by startDate (faction-at-vote-time lookup) */
  stintsByPerson: Map<number, { factionId: number; startDate: Date; finishDate: Date | null }[]>;
  /** nameKeys already dismissed by an admin — never re-queued */
  dismissedKeys: Set<string>;
  /** K25 bill ids we store — itemId membership sets billId */
  validBillIds: Set<number>;
}

export async function loadAttributionContext({ db }: { db: DB }): Promise<AttributionContext & { unverifiedCount: number }> {
  const [mappingRows, stintRows, queueRows, billRows] = await Promise.all([
    db.select().from(mkNameMappings),
    db.select().from(factionStints),
    db.select({ nameKey: unmappedMkNames.nameKey, status: unmappedMkNames.status }).from(unmappedMkNames),
    db.select({ billId: schema.bills.billId }).from(schema.bills),
  ]);
  const unverifiedCount = mappingRows.filter((m) => m.verifiedAt == null).length;
  const mappings = new Map(mappingRows.filter((m) => m.verifiedAt != null).map((m) => [m.nameKey, m.personId]));
  const stintsByPerson = new Map<number, { factionId: number; startDate: Date; finishDate: Date | null }[]>();
  for (const s of stintRows) {
    const list = stintsByPerson.get(s.personId) ?? [];
    list.push({ factionId: s.factionId, startDate: s.startDate, finishDate: s.finishDate });
    stintsByPerson.set(s.personId, list);
  }
  for (const list of stintsByPerson.values()) list.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const dismissedKeys = new Set(queueRows.filter((q) => q.status === "dismissed").map((q) => q.nameKey));
  const validBillIds = new Set(billRows.map((b) => b.billId));
  return { mappings, stintsByPerson, dismissedKeys, validBillIds, unverifiedCount };
}

/** The stint whose [startDate, finishDate) interval covers the vote instant. */
export function factionAtVoteTime(
  ctx: AttributionContext,
  personId: number,
  voteDate: Date,
): number | null {
  const stints = ctx.stintsByPerson.get(personId);
  if (!stints) return null;
  const t = voteDate.getTime();
  for (const s of stints) {
    if (t >= s.startDate.getTime() && (s.finishDate == null || t < s.finishDate.getTime())) {
      return s.factionId;
    }
  }
  return null;
}

/**
 * Applies a fetched vote's details in ONE transaction: header patch +
 * detailsStatus=complete, raw-evidence upsert, verified attribution into
 * mk_votes, and queueing of unmapped names (insert-or-ignore — a dismissed
 * key never re-queues because the row already exists in status 'dismissed').
 */
export async function applyVoteDetails({
  db, voteId, voteDate, patch, rawRows, ctx,
}: {
  db: DB;
  voteId: number;
  voteDate: Date;
  patch: VoteDetailsPatch;
  rawRows: MkVoteRawInsert[];
  ctx: AttributionContext;
}): Promise<{ attributed: number; queued: number }> {
  let attributed = 0;
  let queued = 0;
  await db.transaction(async (tx) => {
    await tx
      .update(knessetVotes)
      .set({
        itemId: patch.itemId,
        billId: patch.itemId != null && ctx.validBillIds.has(patch.itemId) ? patch.itemId : null,
        decisionHe: patch.decisionHe,
        isAccepted: patch.isAccepted,
        totalFor: patch.totalFor,
        totalAgainst: patch.totalAgainst,
        totalAbstain: patch.totalAbstain,
        totalDidntVote: patch.totalDidntVote,
        detailsStatus: "complete",
      })
      .where(eq(knessetVotes.voteId, voteId));

    for (const batch of chunk(rawRows)) {
      await tx.insert(mkVotesRaw).values(batch).onConflictDoUpdate({
        target: [mkVotesRaw.voteId, mkVotesRaw.mkNameKey],
        set: {
          mkNameRaw: sqlExcluded("mkNameRaw"), factionNameRaw: sqlExcluded("factionNameRaw"),
          voteResultIdRaw: sqlExcluded("voteResultIdRaw"), resultTitleRaw: sqlExcluded("resultTitleRaw"),
          fetchedAt: sqlExcluded("fetchedAt"),
        },
      });
    }

    const mkRows: (typeof mkVotes.$inferInsert)[] = [];
    for (const raw of rawRows) {
      const personId = ctx.mappings.get(raw.mkNameKey);
      if (personId == null) {
        if (!ctx.dismissedKeys.has(raw.mkNameKey)) {
          await tx
            .insert(unmappedMkNames)
            .values({ nameKey: raw.mkNameKey, nameRaw: raw.mkNameRaw })
            .onConflictDoNothing();
          queued += 1;
        }
        continue;
      }
      const result = WEBSITE_RESULT_BY_ID[raw.voteResultIdRaw];
      const factionId = factionAtVoteTime(ctx, personId, voteDate);
      if (factionId == null) {
        logger.warn("votes.repo.no_covering_stint", { voteId, personId, voteDate: voteDate.toISOString() });
      }
      mkRows.push({
        voteId, personId, result, factionId,
        sourceDataset: raw.sourceDataset, sourceUrl: raw.sourceUrl, fetchedAt: raw.fetchedAt,
      });
    }
    for (const batch of chunk(mkRows)) {
      await tx.insert(mkVotes).values(batch).onConflictDoUpdate({
        target: [mkVotes.voteId, mkVotes.personId],
        set: {
          result: sqlExcluded("result"), factionId: sqlExcluded("factionId"),
          fetchedAt: sqlExcluded("fetchedAt"),
        },
      });
    }
    attributed = mkRows.length;
  });
  return { attributed, queued };
}

/** Recomputes the decisive flag for every vote of the given items. */
export async function recomputeDecisive({ db, itemIds }: { db: DB; itemIds: number[] }): Promise<void> {
  const ids = [...new Set(itemIds)].filter((i) => i != null);
  for (const itemId of ids) {
    const votes = await db
      .select({
        voteId: knessetVotes.voteId, voteType: knessetVotes.voteType,
        decisionHe: knessetVotes.decisionHe, isAccepted: knessetVotes.isAccepted,
        voteDate: knessetVotes.voteDate,
      })
      .from(knessetVotes)
      .where(eq(knessetVotes.itemId, itemId));
    const decisiveId = pickDecisiveVoteId(votes);
    await db.update(knessetVotes).set({ isDecisive: false }).where(and(eq(knessetVotes.itemId, itemId), sql`${knessetVotes.voteId} <> ${decisiveId ?? -1}`));
    if (decisiveId != null) {
      await db.update(knessetVotes).set({ isDecisive: true }).where(eq(knessetVotes.voteId, decisiveId));
    }
  }
}

/**
 * Admin resolution of a queued name — ONE transaction: verified mapping row,
 * queue row → resolved, and mk_votes backfill from RETAINED raw evidence
 * (no API re-fetch). Returns how many votes were attributed.
 */
export async function resolveUnmappedName({
  db, nameKey: key, personId, reviewedBy, ctx,
}: {
  db: DB;
  nameKey: string;
  personId: number;
  reviewedBy: string;
  ctx: AttributionContext;
}): Promise<{ backfilled: number }> {
  let backfilled = 0;
  await db.transaction(async (tx) => {
    await tx
      .insert(mkNameMappings)
      .values({ nameKey: key, personId, source: "admin", verifiedAt: new Date() })
      .onConflictDoUpdate({
        target: mkNameMappings.nameKey,
        set: { personId: sqlExcluded("personId"), source: sql`'admin'`, verifiedAt: sqlExcluded("verifiedAt") },
      });
    await tx
      .update(unmappedMkNames)
      .set({ status: "resolved", resolvedPersonId: personId, reviewedBy, reviewedAt: new Date() })
      .where(eq(unmappedMkNames.nameKey, key));

    const raws = await tx
      .select({
        raw: mkVotesRaw,
        voteDate: knessetVotes.voteDate,
      })
      .from(mkVotesRaw)
      .innerJoin(knessetVotes, eq(knessetVotes.voteId, mkVotesRaw.voteId))
      .where(eq(mkVotesRaw.mkNameKey, key));
    const rows = raws.map(({ raw, voteDate }) => ({
      voteId: raw.voteId,
      personId,
      result: WEBSITE_RESULT_BY_ID[raw.voteResultIdRaw] as MkVoteResultValue,
      factionId: factionAtVoteTime(ctx, personId, voteDate),
      sourceDataset: raw.sourceDataset, sourceUrl: raw.sourceUrl, fetchedAt: raw.fetchedAt,
    }));
    for (const batch of chunk(rows)) {
      await tx.insert(mkVotes).values(batch).onConflictDoUpdate({
        target: [mkVotes.voteId, mkVotes.personId],
        set: { result: sqlExcluded("result"), factionId: sqlExcluded("factionId"), fetchedAt: sqlExcluded("fetchedAt") },
      });
    }
    backfilled = rows.length;
  });
  logger.info("votes.repo.name_resolved", { nameKey: key, personId, backfilled });
  return { backfilled };
}

/** Marks a queued name dismissed (sticky — ingest never re-queues it). */
export async function dismissUnmappedName({
  db, nameKey: key, reviewedBy,
}: { db: DB; nameKey: string; reviewedBy: string }): Promise<void> {
  await db
    .update(unmappedMkNames)
    .set({ status: "dismissed", reviewedBy, reviewedAt: new Date() })
    .where(and(eq(unmappedMkNames.nameKey, key), isNull(unmappedMkNames.reviewedAt)));
}

// --- admin writes (actions authorize/validate; the repo owns the DB) ---

export async function setVoteFeatured({
  db, voteId, featured,
}: { db: DB; voteId: number; featured: boolean }): Promise<void> {
  await db.update(knessetVotes).set({ featured }).where(eq(knessetVotes.voteId, voteId));
}

/** Admin-authored agenda row — carries the documented 'admin' provenance. */
export async function insertAgendaItem({
  db, titleHe, expectedDate,
}: { db: DB; titleHe: string; expectedDate: string | null }): Promise<void> {
  await db.insert(schema.agendaItems).values({
    titleHe,
    expectedDate,
    addedBy: "admin",
    sourceDataset: "admin",
    sourceUrl: "/admin",
    fetchedAt: new Date(),
  });
}

export async function setAgendaItemStatus({
  db, id, status,
}: { db: DB; id: string; status: "announced" | "voted" | "dropped" }): Promise<void> {
  await db.update(schema.agendaItems).set({ status }).where(eq(schema.agendaItems.id, id));
}
