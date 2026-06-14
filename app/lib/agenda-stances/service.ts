// Agenda-stance orchestration: the announced-only guard, toggle semantics
// (same stance again = retraction), and the k-anonymous community aggregate.
// A pre-vote is NOT scoreable until the resolution sweep adopts it into
// user_stances, so there is no match-unlock counter here (unlike user_stances).

import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/app/lib/db";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/app/lib/schema";
import { agendaItems } from "@/app/lib/schema";
import { AgendaItemNotFoundError, AgendaItemNotStanceableError } from "@/app/lib/errors";
import { AGGREGATE_MIN_STANCERS } from "@/app/lib/stances/service";
import * as repo from "./repo";
import type { StanceValue } from "@/app/lib/stances/repo";

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Same k-anonymity floor as post-vote stances — reuse the value, don't fork it. */
export const AGENDA_AGGREGATE_MIN_STANCERS = AGGREGATE_MIN_STANCERS;

export interface AgendaStanceState {
  stance: StanceValue | null;
  /** k-gated community split; null until the viewer has a stance AND n ≥ k. */
  aggregate: { forPct: number; total: number } | null;
}

/**
 * Sets / flips / retracts the user's pre-vote stance. Tapping the selected side
 * deletes the row (misclicks must be retractable — privacy). Only an `announced`
 * item accepts stances: once it flips to `voted`/`dropped` the pick is locked
 * (the resolution sweep has adopted it into user_stances).
 */
export async function setAgendaStance({
  db = defaultDb,
  userId,
  agendaItemId,
  stance,
}: {
  db?: DB;
  userId: string;
  agendaItemId: string;
  stance: StanceValue;
}): Promise<AgendaStanceState> {
  const [item] = await db
    .select({ status: agendaItems.status })
    .from(agendaItems)
    .where(eq(agendaItems.id, agendaItemId))
    .limit(1);
  if (!item) throw new AgendaItemNotFoundError();
  if (item.status !== "announced") throw new AgendaItemNotStanceableError();

  await repo.toggleAgendaStance({ db, userId, agendaItemId, stance });
  return getAgendaStanceState({ db, userId, agendaItemId });
}

export async function getAgendaStanceState({
  db = defaultDb,
  userId,
  agendaItemId,
}: { db?: DB; userId: string; agendaItemId: string }): Promise<AgendaStanceState> {
  const stance = await repo.getAgendaStance({ db, userId, agendaItemId });
  let aggregate: AgendaStanceState["aggregate"] = null;
  if (stance != null) {
    const { forCount, againstCount } = await repo.getAgendaStanceCounts({ db, agendaItemId });
    const total = forCount + againstCount;
    if (total >= AGENDA_AGGREGATE_MIN_STANCERS) {
      aggregate = { forPct: Math.round((forCount / total) * 100), total };
    }
  }
  return { stance, aggregate };
}
