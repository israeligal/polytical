// One-off/maintenance backfill for vote_items — classify legacy votes'
// itemTypeId (details are `complete`, so the ingest never refills them), then
// drain the enrichment queue.
//
//   pnpm enrich:vote-items                       # classify + drain
//   pnpm enrich:vote-items -- --classify-only    # phase 1 only
//   pnpm enrich:vote-items -- --skip-classify    # phase 2 only
//   pnpm enrich:vote-items -- --limit=50         # per-pass enrichment batch
//
// PREREQUISITE: a fresh bills table (run `pnpm ingest:knesset` first) — phase 1
// classifies bill votes by bills-table membership.

import { sql } from "drizzle-orm";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { chunk } from "@/app/lib/db-utils";
import { logger } from "@/app/lib/logger";
import { fetchAll } from "@/app/lib/knesset/odata";
import type { KnsAgenda } from "@/app/lib/knesset/odata-types";
import { enrichVoteItems } from "@/app/lib/votes/enrich";
import { ITEM_TYPE_AGENDA, ITEM_TYPE_BILL } from "@/app/lib/votes/normalize";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function classify(): Promise<void> {
  // bills: membership in the (freshly ingested) bills table. postgres-js
  // returns a RowList (array) with a `.count` of affected rows for UPDATE.
  const billsRes = await db.execute(sql`
    update knesset_votes v set "itemTypeId" = ${ITEM_TYPE_BILL}
    from bills b
    where v."itemId" = b."billId" and v."itemTypeId" is null
  `);
  logger.info("votes.enrich.classified_bills", { rows: billsRes.count ?? 0 });

  // agenda motions: K25 KNS_Agenda ids (a few thousand — pages fine)
  const agendas = await fetchAll<KnsAgenda>({ entity: "KNS_Agenda", filter: "KnessetNum eq 25" });
  let agendaRows = 0;
  for (const batch of chunk(agendas.map((a) => a.AgendaID), 500)) {
    const res = await db.execute(sql`
      update knesset_votes set "itemTypeId" = ${ITEM_TYPE_AGENDA}
      where "itemTypeId" is null and "itemId" in (${sql.join(batch.map((id) => sql`${id}`), sql`, `)})
    `);
    agendaRows += res.count ?? 0;
  }
  logger.info("votes.enrich.classified_agendas", { agendas: agendas.length, rows: agendaRows });

  // legacy billId fill under the same rule applyVoteDetails owns (billId = itemId iff bill-typed)
  const billIdRes = await db.execute(sql`
    update knesset_votes set "billId" = "itemId" where "itemTypeId" = ${ITEM_TYPE_BILL} and "billId" is null
  `);
  logger.info("votes.enrich.billid_filled", { rows: billIdRes.count ?? 0 });

  // explicit absence: whatever stays NULL (no-confidence, secret-vote items, …) is never enriched
  const left = await db.execute(sql`
    select count(*)::int as n from knesset_votes where "itemTypeId" is null and "itemId" is not null
  `);
  const leftRow = left[0] as { n: number } | undefined;
  logger.info("votes.enrich.unclassified_left", { rows: leftRow?.n ?? 0 });
}

async function main() {
  assertNonProductionDb(); // FIRST — house rule (NB: the single prod DB passes; runs are deliberate + idempotent)

  if (!flag("skip-classify")) await classify();
  if (flag("classify-only")) {
    process.exit(0);
  }

  const limit = Number(arg("limit") ?? 50);
  let idlePasses = 0;
  for (;;) {
    const r = await enrichVoteItems({ db, limit });
    logger.info("votes.enrich.backfill_pass", { ...r });
    if (r.candidates === 0) break;
    // every remaining candidate failing repeatedly (dead doc URLs etc.) would
    // loop forever — three all-fail passes aborts loudly instead
    idlePasses = r.enriched === 0 ? idlePasses + 1 : 0;
    if (idlePasses >= 3) {
      logger.error("votes.enrich.backfill_stuck", { failing: r.failed });
      process.exit(1);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  logger.error("votes.enrich.backfill_failed", { err: String(err) });
  process.exit(1);
});
