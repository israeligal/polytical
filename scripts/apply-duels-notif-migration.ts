// One-off PROD migration applier for 0034_warm_ezekiel_stane (duel settlement
// notifications: the `duel_settled` notification_type value + notifications.refChallengeId).
//
// Mirrors scripts/apply-groups-migration.ts. Targets the configured DB (PRODUCTION —
// single prod DB, no dev DB) and intentionally does NOT call assertNonProductionDb().
// SAFE: purely ADDITIVE — ALTER TYPE ADD VALUE + ADD COLUMN, no DROP. Statements run
// individually (ALTER TYPE ADD VALUE cannot run inside a transaction). Idempotent:
// "already exists" errors are skipped, so a re-run is a no-op.
//
// Run once with the REAL prod env:
//   pnpm tsx --env-file=.env scripts/apply-duels-notif-migration.ts
import { readFileSync } from "node:fs";
import { sharedSql } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";

async function report(label: string) {
  const enumVals = await sharedSql<{ enumlabel: string }[]>`
    select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_type' and enumlabel = 'duel_settled'`;
  const cols = await sharedSql<{ column_name: string }[]>`
    select column_name from information_schema.columns
    where table_name = 'notifications' and column_name = 'refChallengeId'`;
  logger.info("apply-0034.state", {
    label,
    duelSettledValue: enumVals.map((e) => e.enumlabel),
    refChallengeIdColumn: cols.map((c) => c.column_name),
  });
}

async function main() {
  await report("before");
  const text = readFileSync("drizzle/0034_warm_ezekiel_stane.sql", "utf8");
  const statements = text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  let applied = 0;
  let skipped = 0;
  for (const stmt of statements) {
    try {
      await sharedSql.unsafe(stmt);
      applied += 1;
      logger.info("apply-0034.ok", { stmt: stmt.slice(0, 70) });
    } catch (err) {
      const msg = String(err);
      if (/already exists/i.test(msg)) {
        skipped += 1;
        logger.warn("apply-0034.skip_exists", { stmt: stmt.slice(0, 70) });
      } else {
        logger.error("apply-0034.failed", { stmt: stmt.slice(0, 90), err: msg });
        throw err;
      }
    }
  }
  await report("after");
  logger.info("apply-0034.done", { statements: statements.length, applied, skipped });
  await sharedSql.end();
  process.exit(0);
}

main().catch((e) => {
  logger.error("apply-0034.fatal", { err: String(e) });
  process.exit(1);
});
