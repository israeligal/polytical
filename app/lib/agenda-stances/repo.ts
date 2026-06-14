// Agenda stances (עמדה מראש) — a user's pre-vote position on an upcoming bill's
// agenda item. Same sensitive-data contract as user_stances: rows cascade-delete
// with the account, the direction never leaves the DB (aggregates are k-gated in
// the service), and every user-scoped read is guarded.

import { and, count, eq, inArray } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { agendaStances } from "@/app/lib/schema";
import { requireUserId } from "@/app/lib/errors";
import type { StanceValue } from "@/app/lib/stances/repo";

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export async function getAgendaStance({
  db = defaultDb,
  userId,
  agendaItemId,
}: { db?: DB; userId: string; agendaItemId: string }): Promise<StanceValue | null> {
  const [row] = await db
    .select({ stance: agendaStances.stance })
    .from(agendaStances)
    .where(and(eq(agendaStances.userId, requireUserId(userId)), eq(agendaStances.agendaItemId, agendaItemId)))
    .limit(1);
  return row?.stance ?? null;
}

/** The user's pre-vote stances across a set of agenda items (feed chip state). */
export async function getAgendaStancesForItems({
  db = defaultDb,
  userId,
  agendaItemIds,
}: { db?: DB; userId: string; agendaItemIds: string[] }): Promise<Map<string, StanceValue>> {
  if (!agendaItemIds.length) return new Map();
  const rows = await db
    .select({ agendaItemId: agendaStances.agendaItemId, stance: agendaStances.stance })
    .from(agendaStances)
    .where(and(eq(agendaStances.userId, requireUserId(userId)), inArray(agendaStances.agendaItemId, agendaItemIds)));
  return new Map(rows.map((r) => [r.agendaItemId, r.stance]));
}

/**
 * Atomic toggle — ONE round-trip decides retraction vs set (same rationale as
 * user_stances.toggleStance): first try `DELETE ... AND stance = $same` — a hit
 * means the tap retracted the existing pick; a miss falls through to the
 * idempotent upsert. The `announced`-only guard lives in the service.
 */
export async function toggleAgendaStance({
  db = defaultDb,
  userId,
  agendaItemId,
  stance,
}: { db?: DB; userId: string; agendaItemId: string; stance: StanceValue }): Promise<{ stance: StanceValue | null }> {
  const deleted = await db
    .delete(agendaStances)
    .where(
      and(
        eq(agendaStances.userId, requireUserId(userId)),
        eq(agendaStances.agendaItemId, agendaItemId),
        eq(agendaStances.stance, stance),
      ),
    )
    .returning({ agendaItemId: agendaStances.agendaItemId });
  if (deleted.length > 0) return { stance: null }; // retraction
  await db
    .insert(agendaStances)
    .values({ userId: requireUserId(userId), agendaItemId, stance })
    .onConflictDoUpdate({
      target: [agendaStances.userId, agendaStances.agendaItemId],
      set: { stance, updatedAt: new Date() },
    });
  return { stance };
}

/** Community split for one agenda item — RAW counts; the k-gate lives in the service. */
export async function getAgendaStanceCounts({
  db = defaultDb,
  agendaItemId,
}: { db?: DB; agendaItemId: string }): Promise<{ forCount: number; againstCount: number }> {
  const rows = await db
    .select({ stance: agendaStances.stance, n: count() })
    .from(agendaStances)
    .where(eq(agendaStances.agendaItemId, agendaItemId))
    .groupBy(agendaStances.stance);
  let forCount = 0;
  let againstCount = 0;
  for (const r of rows) {
    if (r.stance === "for") forCount = Number(r.n);
    else againstCount = Number(r.n);
  }
  return { forCount, againstCount };
}
