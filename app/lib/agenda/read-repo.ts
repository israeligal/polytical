// Read-side for the "על סדר היום" pre-voting feed: announced agenda items joined
// to their bill's current status label, plus RAW community counts (the k-anon
// gate is applied by the page, mirroring user_stances). Most-imminent-first.

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { agendaItems, agendaStances, billStatuses, bills } from "@/app/lib/schema";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export interface AgendaFeedItem {
  id: string;
  titleHe: string;
  billId: number | null;
  expectedDate: string | null;
  statusDescHe: string | null;
  forCount: number;
  againstCount: number;
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

  const counts = await db
    .select({ agendaItemId: agendaStances.agendaItemId, stance: agendaStances.stance, n: count() })
    .from(agendaStances)
    .where(inArray(agendaStances.agendaItemId, items.map((i) => i.id)))
    .groupBy(agendaStances.agendaItemId, agendaStances.stance);

  const byItem = new Map<string, { forCount: number; againstCount: number }>();
  for (const c of counts) {
    const e = byItem.get(c.agendaItemId) ?? { forCount: 0, againstCount: 0 };
    if (c.stance === "for") e.forCount = Number(c.n);
    else e.againstCount = Number(c.n);
    byItem.set(c.agendaItemId, e);
  }

  return items.map((i) => ({
    ...i,
    forCount: byItem.get(i.id)?.forCount ?? 0,
    againstCount: byItem.get(i.id)?.againstCount ?? 0,
  }));
}
