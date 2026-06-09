import { sharedSql } from "@/app/lib/db";
import { assertNonProductionDb } from "@/app/lib/db-guards";

// Surgical, idempotent apply of the push-notifications schema (migrations 0014 +
// 0015) to a NON-prod DB. Used instead of `drizzle-kit push` because push diffs
// the WHOLE schema against the live DB — risky when the shared dev DB carries
// unrelated in-flight schema drift (it would offer to drop those columns). Every
// statement is IF-NOT-EXISTS so this is safe to re-run. For prod, prefer applying
// the committed migration files; this script also works there with
// ALLOW_PROD_INGEST=1 if you must.
async function main() {
  assertNonProductionDb();

  // 0014 — push_subscriptions (FK inlined so CREATE IF NOT EXISTS stays idempotent)
  await sharedSql`
    CREATE TABLE IF NOT EXISTS "push_subscriptions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "endpoint" text NOT NULL,
      "p256dh" text NOT NULL,
      "auth" text NOT NULL,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )`;
  await sharedSql`CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_uq" ON "push_subscriptions" ("endpoint")`;
  await sharedSql`CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx" ON "push_subscriptions" ("userId")`;

  // 0015 — new notification_type values + the closing-soon dedup column
  await sharedSql`ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'season_reward'`;
  await sharedSql`ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'market_voided'`;
  await sharedSql`ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'market_closing_soon'`;
  await sharedSql`ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "closingSoonNotifiedAt" timestamp`;

  // Verify the table + enum values landed.
  const [tbl] = await sharedSql`SELECT to_regclass('public.push_subscriptions') AS t`;
  const vals = await sharedSql`
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'notification_type' ORDER BY e.enumsortorder`;
  console.log("✓ push_subscriptions:", tbl.t);
  console.log("✓ notification_type values:", vals.map((v) => v.enumlabel).join(", "));
  await sharedSql.end();
}

main().catch((e) => {
  console.error("apply-push-schema failed:", e);
  process.exit(1);
});
