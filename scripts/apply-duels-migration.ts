// One-off PROD migration applier for 0033_mute_nighthawk (prediction-duels P1:
// the `challenges` + `challenge_participants` tables).
//
// Mirrors scripts/apply-groups-migration.ts. Deliberately targets the configured DB
// (PRODUCTION — the single prod DB; there is no dev DB) and intentionally does NOT call
// assertNonProductionDb(): applying schema to prod is its job. SAFE because 0033 is purely
// ADDITIVE — CREATE TABLE / ADD CONSTRAINT / CREATE INDEX only, never a DROP — so it cannot
// clobber anything other branches pushed to the shared prod DB (unlike a full
// `drizzle-kit push`), and it's forward-compatible with the currently-deployed code.
// Idempotent: "already exists" errors are skipped, so a re-run is a no-op.
//
// Run once with the REAL prod env:
//   pnpm tsx --env-file=.env scripts/apply-duels-migration.ts
import { readFileSync } from "node:fs";
import { sharedSql } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";

async function report(label: string) {
  const tables = await sharedSql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_name in ('challenges','challenge_participants')`;
  logger.info("apply-0033.state", { label, tables: tables.map((t) => t.table_name).sort() });
}

async function main() {
  await report("before");
  const text = readFileSync("drizzle/0033_mute_nighthawk.sql", "utf8");
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
      logger.info("apply-0033.ok", { stmt: stmt.slice(0, 70) });
    } catch (err) {
      const msg = String(err);
      if (/already exists/i.test(msg)) {
        skipped += 1;
        logger.warn("apply-0033.skip_exists", { stmt: stmt.slice(0, 70) });
      } else {
        logger.error("apply-0033.failed", { stmt: stmt.slice(0, 90), err: msg });
        throw err;
      }
    }
  }
  await report("after");
  logger.info("apply-0033.done", { statements: statements.length, applied, skipped });
  await sharedSql.end();
  process.exit(0);
}

main().catch((e) => {
  logger.error("apply-0033.fatal", { err: String(e) });
  process.exit(1);
});
