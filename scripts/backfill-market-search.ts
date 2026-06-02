import { eq } from "drizzle-orm";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";
import { markets } from "@/app/lib/schema";
import { normalizeSearchName } from "@/app/lib/knesset/search-name";

// Populates markets.searchText for existing rows (Hebrew normalization can't be
// done in pure SQL — niqqud/finals/particles). New markets get it on create;
// this backfills the rows that predate the column. Idempotent + batched.
async function main() {
  assertNonProductionDb();

  const rows = await db
    .select({ id: markets.id, questionHe: markets.questionHe, searchText: markets.searchText })
    .from(markets);

  let updated = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const r of batch) {
      const next = normalizeSearchName(r.questionHe);
      if (next !== r.searchText) {
        await db.update(markets).set({ searchText: next }).where(eq(markets.id, r.id));
        updated += 1;
      }
    }
  }

  logger.info("backfill_market_search_ok", { total: rows.length, updated });
  console.log(`Backfilled searchText: ${updated}/${rows.length} markets updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
