// One-off PROD migration applier for 0029_agenda_stances (the pre-voting feature).
//
// Deliberately targets the configured DB (PRODUCTION — the single prod DB; there is no
// dev DB) and intentionally does NOT call assertNonProductionDb(): applying schema to prod
// is its job. SAFE because 0029 is purely ADDITIVE — CREATE TABLE / ADD CONSTRAINT /
// CREATE INDEX only, never a DROP — so it cannot clobber anything other branches pushed to
// the shared prod DB (unlike a full `drizzle-kit push`). Idempotent: "already exists" errors
// are skipped.
//
// Run once:  pnpm tsx --env-file=.env scripts/apply-agenda-migration.ts
import { readFileSync } from "node:fs";
import { sharedSql } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";

async function report(label: string) {
  const tables = await sharedSql<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_name = 'agenda_stances'`;
  const idx = await sharedSql<{ indexname: string }[]>`
    select indexname from pg_indexes where indexname = 'agenda_items_bill_uq'`;
  logger.info("apply-0029.state", {
    label,
    hasAgendaStances: tables.length > 0,
    hasBillUniqueIndex: idx.length > 0,
  });
}

async function main() {
  await report("before");
  const text = readFileSync("drizzle/0029_agenda_stances.sql", "utf8");
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
      logger.info("apply-0029.ok", { stmt: stmt.slice(0, 70) });
    } catch (err) {
      const msg = String(err);
      if (/already exists/i.test(msg)) {
        skipped += 1;
        logger.warn("apply-0029.skip_exists", { stmt: stmt.slice(0, 70) });
      } else {
        logger.error("apply-0029.failed", { stmt: stmt.slice(0, 90), err: msg });
        throw err;
      }
    }
  }
  await report("after");
  logger.info("apply-0029.done", { statements: statements.length, applied, skipped });
  await sharedSql.end();
  process.exit(0);
}

main().catch((e) => {
  logger.error("apply-0029.fatal", { err: String(e) });
  process.exit(1);
});
