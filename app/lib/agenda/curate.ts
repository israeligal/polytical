// Agenda curation sweep (ingest): ensure every current-Knesset bill approaching
// its decisive 2nd-3rd reading vote has an `announced` agenda item, and drop
// items whose bill left that window without a decisive vote. Idempotent; never
// resurrects a voted/dropped item; admin-added rows are untouched.

import { and, eq, inArray, isNotNull, notExists, notInArray, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { agendaItems, bills, knessetVotes } from "@/app/lib/schema";
import { chunk, sqlExcluded } from "@/app/lib/db-utils";
import { CURRENT_KNESSET, buildODataUrl } from "@/app/lib/knesset/odata";
import { logger } from "@/app/lib/logger";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

/** KNS_Status ids for bills heading into the decisive 2nd-3rd reading vote:
 *  113 הכנה לקריאה שנייה ושלישית · 130 הונחה לקריאה שנייה-שלישית · 114 לדיון לקראת 2-3. */
export const ELIGIBLE_STATUS_IDS = [113, 130, 114] as const;

export async function runAgendaCuration({
  db = defaultDb,
  fetchedAt,
}: { db?: DB; fetchedAt: Date }): Promise<{ upserted: number; dropped: number }> {
  const sourceUrl = buildODataUrl({ entity: "KNS_Bill", filter: `KnessetNum eq ${CURRENT_KNESSET}` });
  const eligible = await db
    .select({ billId: bills.billId, nameHe: bills.nameHe })
    .from(bills)
    .where(and(eq(bills.knessetNum, CURRENT_KNESSET), inArray(bills.statusId, [...ELIGIBLE_STATUS_IDS])));

  let upserted = 0;
  for (const batch of chunk(eligible)) {
    await db
      .insert(agendaItems)
      .values(
        batch.map((b) => ({
          titleHe: b.nameHe,
          billId: b.billId,
          addedBy: "ingest" as const,
          status: "announced" as const,
          sourceDataset: "agenda_curation",
          sourceUrl,
          fetchedAt,
        })),
      )
      // Refresh title/provenance only — NEVER reset status, so a re-run can't
      // resurrect a voted/dropped item back to announced.
      .onConflictDoUpdate({
        target: agendaItems.billId,
        targetWhere: sql`${agendaItems.billId} is not null`,
        set: { titleHe: sqlExcluded("titleHe"), sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt") },
      });
    upserted += batch.length;
  }

  // Drop announced ingest items whose bill left the window WITHOUT a decisive
  // vote (halted/merged/expired). A bill that left because it got its decisive
  // vote is intentionally NOT dropped — the resolution sweep marks it 'voted'.
  const eligibleIds = eligible.map((b) => b.billId);
  const dropped = await db
    .update(agendaItems)
    .set({ status: "dropped" })
    .where(
      and(
        eq(agendaItems.status, "announced"),
        eq(agendaItems.addedBy, "ingest"),
        isNotNull(agendaItems.billId),
        eligibleIds.length ? notInArray(agendaItems.billId, eligibleIds) : sql`true`,
        notExists(
          db
            .select({ x: sql`1` })
            .from(knessetVotes)
            .where(and(eq(knessetVotes.billId, agendaItems.billId), eq(knessetVotes.isDecisive, true))),
        ),
      ),
    )
    .returning({ id: agendaItems.id });

  logger.info("knesset.ingest.entity_done", { entity: "agenda_curation", upserted, dropped: dropped.length });
  return { upserted, dropped: dropped.length };
}
