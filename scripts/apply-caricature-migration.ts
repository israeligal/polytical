import { sharedSql } from "@/app/lib/db";
import { assertNonProductionDb } from "@/app/lib/db-guards";

// Surgical, idempotent apply of migration 0033 (user.caricatureUrl). Additive
// `ADD COLUMN IF NOT EXISTS` — safe to re-run. The single prod DB has no dev
// twin; to apply against prod run with ALLOW_PROD_INGEST=1.
async function main() {
  assertNonProductionDb();
  await sharedSql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "caricatureUrl" text`;
  const cols = await sharedSql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'user' AND column_name = 'caricatureUrl'`;
  console.log("✓ user.caricatureUrl:", cols.length === 1 ? "present" : "MISSING");
  await sharedSql.end();
}

main().catch((e) => {
  console.error("apply-caricature-migration failed:", e);
  process.exit(1);
});
