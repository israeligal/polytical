// Read-side for the "על סדר היום" pre-voting feed: announced agenda items joined
// to their bill's current status label, plus RAW community counts (the k-anon
// gate is applied by the page, mirroring user_stances). Most-imminent-first.

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { agendaItems, agendaStances, billSplits, billSponsors, billStatuses, bills, politicians } from "@/app/lib/schema";
import { alias } from "drizzle-orm/pg-core";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

/** Full politician row of an MK who initiated the bill — for portraits on the
 *  card (rendered through dbToCard, like every other portrait surface). */
export type AgendaInitiator = typeof politicians.$inferSelect;

// Portraits shown per card before the "+N" overflow chip — keeps even a
// 30-sponsor bill's row to a tidy avatar cluster.
const MAX_INITIATORS_PER_ITEM = 6;

export interface AgendaFeedItem {
  id: string;
  titleHe: string;
  billId: number | null;
  expectedDate: string | null;
  statusDescHe: string | null;
  forCount: number;
  againstCount: number;
  /** Proposing MKs (KNS_BillInitiator, isInitiator), ordinal order, capped to
   *  MAX_INITIATORS_PER_ITEM for the avatar cluster. */
  initiators: AgendaInitiator[];
  /** True number of initiators (drives the "+N" overflow chip). */
  initiatorCount: number;
  /** When the agenda item's bill is a split child, its parent bill — else null.
   *  Most budget-split agenda items have no initiators but DO have a parent. */
  splitParent: { billId: number; nameHe: string } | null;
}

/** The announced (still pre-vote) agenda item for a bill, if any — drives the
 *  pre-vote widget on the bill page. Resolved/dropped items return null. */
export async function getAnnouncedAgendaItemByBill({
  db = defaultDb,
  billId,
}: { db?: DB; billId: number }): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: agendaItems.id })
    .from(agendaItems)
    .where(and(eq(agendaItems.status, "announced"), eq(agendaItems.billId, billId)))
    .limit(1);
  return row ?? null;
}

export async function getAgendaFeed({
  db = defaultDb,
  limit = 50,
}: { db?: DB; limit?: number } = {}): Promise<AgendaFeedItem[]> {
  const items = await db
    .select({
      id: agendaItems.id,
      titleHe: agendaItems.titleHe,
      billId: agendaItems.billId,
      expectedDate: agendaItems.expectedDate,
      statusDescHe: billStatuses.descHe,
    })
    .from(agendaItems)
    .leftJoin(bills, eq(bills.billId, agendaItems.billId))
    .leftJoin(billStatuses, eq(billStatuses.statusId, bills.statusId))
    .where(eq(agendaItems.status, "announced"))
    .orderBy(sql`${agendaItems.expectedDate} asc nulls last`, desc(agendaItems.createdAt))
    .limit(limit);

  if (items.length === 0) return [];

  const billIds = [...new Set(items.map((i) => i.billId).filter((b): b is number => b != null))];

  const parentBill = alias(bills, "parent_bill");
  const [counts, sponsorRows, splitRows] = await Promise.all([
    db
      .select({ agendaItemId: agendaStances.agendaItemId, stance: agendaStances.stance, n: count() })
      .from(agendaStances)
      .where(inArray(agendaStances.agendaItemId, items.map((i) => i.id)))
      .groupBy(agendaStances.agendaItemId, agendaStances.stance),
    billIds.length
      ? db
          .select({ billId: billSponsors.billId, p: politicians })
          .from(billSponsors)
          .innerJoin(politicians, eq(politicians.personId, billSponsors.personId))
          .where(and(inArray(billSponsors.billId, billIds), eq(billSponsors.isInitiator, true)))
          .orderBy(sql`${billSponsors.ordinal} asc nulls last`, asc(politicians.nameHe))
      : Promise.resolve([] as { billId: number; p: AgendaInitiator }[]),
    billIds.length
      ? db
          .select({ splitBillId: billSplits.splitBillId, parentId: parentBill.billId, parentName: parentBill.nameHe })
          .from(billSplits)
          .innerJoin(parentBill, eq(parentBill.billId, billSplits.mainBillId))
          .where(inArray(billSplits.splitBillId, billIds))
      : Promise.resolve([] as { splitBillId: number; parentId: number; parentName: string }[]),
  ]);
  const splitParentByBill = new Map<number, { billId: number; nameHe: string }>();
  for (const s of splitRows) splitParentByBill.set(s.splitBillId, { billId: s.parentId, nameHe: s.parentName });

  const byItem = new Map<string, { forCount: number; againstCount: number }>();
  for (const c of counts) {
    const e = byItem.get(c.agendaItemId) ?? { forCount: 0, againstCount: 0 };
    if (c.stance === "for") e.forCount = Number(c.n);
    else e.againstCount = Number(c.n);
    byItem.set(c.agendaItemId, e);
  }

  // Initiators grouped by bill (ordinal order preserved by the query). Keep the
  // true total for the overflow chip; the visible array is capped at render.
  const initiatorsByBill = new Map<number, AgendaInitiator[]>();
  for (const { billId, p } of sponsorRows) {
    const list = initiatorsByBill.get(billId) ?? [];
    list.push(p);
    initiatorsByBill.set(billId, list);
  }

  return items.map((i) => {
    const all = i.billId != null ? (initiatorsByBill.get(i.billId) ?? []) : [];
    return {
      ...i,
      forCount: byItem.get(i.id)?.forCount ?? 0,
      againstCount: byItem.get(i.id)?.againstCount ?? 0,
      initiators: all.slice(0, MAX_INITIATORS_PER_ITEM),
      initiatorCount: all.length,
      splitParent: i.billId != null ? (splitParentByBill.get(i.billId) ?? null) : null,
    };
  });
}
