import { eq } from "drizzle-orm";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";
import { politicians } from "@/app/lib/schema";
import { normalizeSearchName } from "@/app/lib/knesset/search-name";

// Re-normalizes politicians.searchName for existing rows after a
// normalizeSearchName change (e.g. the definite-article particle-chain fix), so
// the stored stem matches what new queries normalize to. Idempotent + batched.
async function main() {
  assertNonProductionDb();

  const rows = await db
    .select({ personId: politicians.personId, nameHe: politicians.nameHe, searchName: politicians.searchName })
    .from(politicians);

  let updated = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    for (const r of rows.slice(i, i + BATCH)) {
      const next = normalizeSearchName(r.nameHe);
      if (next !== r.searchName) {
        await db.update(politicians).set({ searchName: next }).where(eq(politicians.personId, r.personId));
        updated += 1;
      }
    }
  }

  logger.info("backfill_politician_search_ok", { total: rows.length, updated });
  console.log(`Backfilled searchName: ${updated}/${rows.length} politicians updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error("backfill_politician_search_failed", { err: String(e) });
    process.exit(1);
  });
