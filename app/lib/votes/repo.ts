// Write-side repo for the votes ingest. Same conventions as
// app/lib/knesset/repo.ts: driver-agnostic DB handle, ≤100-row batches,
// onConflictDoUpdate with explicit SET lists. Admin-owned columns
// (knesset_votes.featured) and pipeline-owned state (isDecisive,
// detailsStatus) are EXCLUDED from the header upsert SET — the dob carve-out
// pattern: re-ingest must never clobber them.

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import * as schema from "@/app/lib/schema";
import { chunk, sqlExcluded, type AppDb } from "@/app/lib/db-utils";
import {
  factionStints, knessetVotes, mkNameMappings, mkVotes, mkVotesRaw, unmappedMkNames,
} from "@/app/lib/schema";
import { logger } from "@/app/lib/logger";
import { upsertBills } from "@/app/lib/knesset/repo";
import type { BillRow } from "@/app/lib/knesset/normalize";
import type { KnessetVoteInsert, MkVoteRawInsert, MkVoteResultValue, VoteDetailsPatch } from "./normalize";
import { ITEM_TYPE_AGENDA, ITEM_TYPE_BILL, WEBSITE_RESULT_BY_ID, pickDecisiveVoteId } from "./normalize";

export type VotesDb = AppDb;
type DB = VotesDb;
export type VotesTx = PgTransaction<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

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

/** ALL stuck pending votes, regardless of sweep window — the self-heal path:
 *  a vote whose details failed (e.g. an unknown counter title) outside the
 *  incremental window would otherwise never be retried. Capped: a persistent
 *  thrower retries once per run, not unboundedly within one. */
export async function listAllPendingDetailVoteIds({ db, limit = 50 }: { db: DB; limit?: number }): Promise<number[]> {
  const rows = await db
    .select({ voteId: knessetVotes.voteId })
    .from(knessetVotes)
    .where(eq(knessetVotes.detailsStatus, "pending_details"))
    .limit(limit);
  return rows.map((r) => r.voteId);
}

export interface AttributionContext {
  /** verified nameKey -> personId (attribution refuses unverified maps at the service layer) */
  mappings: Map<string, number>;
  /** personId -> stints sorted by startDate (faction-at-vote-time lookup) */
  stintsByPerson: Map<number, { factionId: number; startDate: Date; finishDate: Date | null }[]>;
  /** nameKeys already dismissed by an admin — never re-queued */
  dismissedKeys: Set<string>;
}

export async function loadAttributionContext({ db }: { db: DB }): Promise<AttributionContext & { unverifiedCount: number }> {
  const [mappingRows, stintRows, queueRows] = await Promise.all([
    db.select().from(mkNameMappings),
    db.select().from(factionStints),
    db.select({ nameKey: unmappedMkNames.nameKey, status: unmappedMkNames.status }).from(unmappedMkNames),
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
  return { mappings, stintsByPerson, dismissedKeys, unverifiedCount };
}

/** Minimal attribution context for a single-person backfill (admin resolve):
 *  only that person's stints — never the full-table mapping/bill loads. */
export async function loadStintsContext({ db, personId }: { db: DB; personId: number }): Promise<AttributionContext> {
  const stintRows = await db.select().from(factionStints).where(eq(factionStints.personId, personId));
  const stints = stintRows
    .map((s) => ({ factionId: s.factionId, startDate: s.startDate, finishDate: s.finishDate }))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return {
    mappings: new Map(),
    stintsByPerson: new Map([[personId, stints]]),
    dismissedKeys: new Set(),
  };
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
        // The header's own type signal is authoritative — no bills-table
        // membership check (which missed bills newer than the manual ingest).
        // A NULL signal means "no information", not "no type": it must never
        // clobber a previously classified itemTypeId/billId (e.g. legacy rows
        // classified by scripts/enrich-vote-items.ts, then --refetch'd).
        ...(patch.itemTypeId != null
          ? { itemTypeId: patch.itemTypeId, billId: patch.itemTypeId === ITEM_TYPE_BILL ? patch.itemId : null }
          : {}),
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
          // returning() exposes whether the row was actually inserted —
          // `queued` counts NEW queue entries, not raw-row occurrences.
          const inserted = await tx
            .insert(unmappedMkNames)
            .values({ nameKey: raw.mkNameKey, nameRaw: raw.mkNameRaw })
            .onConflictDoNothing()
            .returning({ nameKey: unmappedMkNames.nameKey });
          queued += inserted.length;
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

/**
 * Recomputes the decisive flag for every vote of the given items. One SELECT
 * batch + ONE set-based UPDATE per chunk — the per-item two-step (false then
 * true) left a gap where concurrent feed reads saw an item with no decisive
 * vote (dropping it from FEED_PRIMARY), and 3 serial round-trips per item made
 * a 200-item sweep cost 600 RTTs.
 */
export async function recomputeDecisive({ db, itemIds }: { db: DB; itemIds: number[] }): Promise<void> {
  const ids = [...new Set(itemIds)].filter((i) => i != null);
  if (!ids.length) return;
  for (const idBatch of chunk(ids, 200)) {
    const votes = await db
      .select({
        itemId: knessetVotes.itemId, voteId: knessetVotes.voteId, voteType: knessetVotes.voteType,
        decisionHe: knessetVotes.decisionHe, isAccepted: knessetVotes.isAccepted,
        voteDate: knessetVotes.voteDate,
      })
      .from(knessetVotes)
      .where(inArray(knessetVotes.itemId, idBatch));
    const byItem = new Map<number, typeof votes>();
    for (const v of votes) {
      if (v.itemId == null) continue;
      byItem.set(v.itemId, [...(byItem.get(v.itemId) ?? []), v]);
    }
    const decisiveIds = [...byItem.values()]
      .map((group) => pickDecisiveVoteId(group))
      .filter((id): id is number => id != null);
    // Atomic per statement: every vote of the batch's items gets its flag in
    // one UPDATE, so no reader ever observes an item without a decisive vote.
    await db
      .update(knessetVotes)
      .set({ isDecisive: sql`${knessetVotes.voteId} in ${decisiveIds.length ? decisiveIds : [-1]}` })
      .where(inArray(knessetVotes.itemId, idBatch));
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
    .where(and(eq(unmappedMkNames.nameKey, key), eq(unmappedMkNames.status, "pending")));
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

// --- vote-item enrichment (official description + law links) ---

export type VoteItemInsert = typeof schema.voteItems.$inferInsert;

/**
 * Items (bills/agenda motions) seen on votes but not yet enriched — newest
 * vote first. Row-ABSENCE in vote_items IS the pending state (terminal-state-
 * by-existence): fetch failures leave no row and retry next run; a written
 * row (even links-only) is terminal and never re-fetched.
 */
export async function listEnrichmentCandidates({
  db, limit,
}: { db: DB; limit: number }): Promise<{ itemId: number; itemTypeId: number }[]> {
  // Group by itemId ALONE (not itemId+itemTypeId): vote_items is keyed by
  // itemId, so each item must yield exactly ONE candidate. Grouping by both
  // would emit two candidates for one item if sibling votes ever disagreed on
  // itemTypeId — wasting a fetch + a slot, the second upsert clobbering the
  // first. max() collapses to a single (stable) type; an item is a bill XOR an
  // agenda in practice, so the value is unambiguous.
  const rows = await db
    .select({ itemId: knessetVotes.itemId, itemTypeId: sql<number>`max(${knessetVotes.itemTypeId})` })
    .from(knessetVotes)
    .leftJoin(schema.voteItems, eq(schema.voteItems.itemId, knessetVotes.itemId))
    .where(and(
      inArray(knessetVotes.itemTypeId, [ITEM_TYPE_BILL, ITEM_TYPE_AGENDA]),
      isNull(schema.voteItems.itemId),
    ))
    .groupBy(knessetVotes.itemId)
    .orderBy(sql`max(${knessetVotes.voteDate}) desc`)
    .limit(limit);
  return rows
    .filter((r): r is { itemId: number; itemTypeId: number } => r.itemId != null && r.itemTypeId != null);
}

/**
 * Terminal write of one enriched item. The bills row (when given) lands FIRST
 * via the existing upsertBills helper — idempotent and harmless alone, and it
 * keeps billId FK-by-value resolvable for bills newer than the manual knesset
 * ingest. Then the vote_items row (upsert: re-running a backfill refreshes).
 */
export async function upsertVoteItem({
  db, row, bill,
}: { db: DB; row: VoteItemInsert; bill?: BillRow }): Promise<void> {
  if (bill) await upsertBills({ db, rows: [bill] });
  await db.insert(schema.voteItems).values(row).onConflictDoUpdate({
    target: schema.voteItems.itemId,
    set: {
      itemTypeId: sqlExcluded("itemTypeId"),
      descriptionHe: sqlExcluded("descriptionHe"), descriptionSource: sqlExcluded("descriptionSource"),
      legislationUrl: sqlExcluded("legislationUrl"), docUrl: sqlExcluded("docUrl"),
      docTypeDescHe: sqlExcluded("docTypeDescHe"), initiatorPersonId: sqlExcluded("initiatorPersonId"),
      sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"),
      fetchedAt: sqlExcluded("fetchedAt"),
    },
  });
}
