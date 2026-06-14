// Agenda resolution sweep (ingest, the keystone): when an announced item's bill
// gets its decisive plenum vote, link it and ADOPT every pre-vote stance into
// user_stances — after which the match engine sees those rows like any other
// stance, with no engine change. Atomic per item; idempotent (a voted item is
// never re-picked; adoption is ON CONFLICT DO NOTHING).

import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { agendaItems, agendaStances, knessetVotes, userStances } from "@/app/lib/schema";
import { logger } from "@/app/lib/logger";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export async function resolveAgendaItems({
  db = defaultDb,
}: { db?: DB } = {}): Promise<{ resolved: number; adopted: number }> {
  const pending = await db
    .select({ id: agendaItems.id, billId: agendaItems.billId })
    .from(agendaItems)
    .where(and(eq(agendaItems.status, "announced"), isNotNull(agendaItems.billId)));

  let resolved = 0;
  let adopted = 0;
  for (const item of pending) {
    if (item.billId == null) continue;
    // The decisive vote for this bill (latest by date — mirrors bills/repo.ts).
    const [vote] = await db
      .select({ voteId: knessetVotes.voteId })
      .from(knessetVotes)
      .where(and(eq(knessetVotes.billId, item.billId), eq(knessetVotes.isDecisive, true)))
      .orderBy(desc(knessetVotes.voteDate))
      .limit(1);
    if (!vote) continue;

    const stances = await db
      .select({ userId: agendaStances.userId, stance: agendaStances.stance })
      .from(agendaStances)
      .where(eq(agendaStances.agendaItemId, item.id));

    await db.transaction(async (tx) => {
      await tx
        .update(agendaItems)
        .set({ linkedVoteId: vote.voteId, status: "voted" })
        .where(eq(agendaItems.id, item.id));
      if (stances.length > 0) {
        const inserted = await tx
          .insert(userStances)
          .values(stances.map((s) => ({ userId: s.userId, voteId: vote.voteId, stance: s.stance })))
          .onConflictDoNothing() // a post-hoc stance on this vote already wins
          .returning({ userId: userStances.userId });
        adopted += inserted.length;
      }
    });
    resolved += 1;
  }

  logger.info("knesset.ingest.entity_done", { entity: "agenda_resolution", resolved, adopted });
  return { resolved, adopted };
}
