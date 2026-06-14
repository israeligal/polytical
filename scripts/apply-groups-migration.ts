// One-off PROD migration applier for 0030_groups_coalition (the groups/קואליציה feature).
//
// Mirrors scripts/apply-agenda-migration.ts. Deliberately targets the configured DB
// (PRODUCTION — the single prod DB; there is no dev DB) and intentionally does NOT call
// assertNonProductionDb(): applying schema to prod is its job. SAFE because 0030 is purely
// ADDITIVE — CREATE TYPE / CREATE TABLE / ADD COLUMN / ADD CONSTRAINT / CREATE INDEX /
// ALTER TYPE ADD VALUE only, never a DROP — so it cannot clobber anything other branches
// pushed to the shared prod DB (unlike a full `drizzle-kit push`), and it's forward-
// compatible with the currently-deployed (pre-groups) code. Idempotent: "already exists"
// errors are skipped, so a re-run is a no-op.
//
// Prod already has 0029_agenda_stances; this applies ONLY the groups delta.
// Run once with the REAL prod env:
//   pnpm tsx --env-file=<path-to-prod>/.env scripts/apply-groups-migration.ts
import { readFileSync } from "node:fs";
import { sharedSql } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";

async function report(label: string) {
  const tables = await sharedSql<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_name in ('groups','group_members')`;
  const cols = await sharedSql<{ table_name: string; column_name: string }[]>`
    select table_name, column_name from information_schema.columns
    where (table_name = 'markets' and column_name = 'groupId')
       or (table_name = 'user' and column_name = 'defaultGroupId')
       or (table_name = 'notifications' and column_name = 'refGroupId')`;
  const enums = await sharedSql<{ enumlabel: string }[]>`
    select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_type' and enumlabel like 'group_%'`;
  logger.info("apply-0030.state", {
    label,
    tables: tables.map((t) => t.table_name).sort(),
    scopingColumns: cols.map((c) => `${c.table_name}.${c.column_name}`).sort(),
    groupEnumValues: enums.map((e) => e.enumlabel).sort(),
  });
}

async function main() {
  await report("before");
  const text = readFileSync("drizzle/0030_groups_coalition.sql", "utf8");
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
      logger.info("apply-0030.ok", { stmt: stmt.slice(0, 70) });
    } catch (err) {
      const msg = String(err);
      if (/already exists/i.test(msg)) {
        skipped += 1;
        logger.warn("apply-0030.skip_exists", { stmt: stmt.slice(0, 70) });
      } else {
        logger.error("apply-0030.failed", { stmt: stmt.slice(0, 90), err: msg });
        throw err;
      }
    }
  }
  await report("after");
  logger.info("apply-0030.done", { statements: statements.length, applied, skipped });
  await sharedSql.end();
  process.exit(0);
}

main().catch((e) => {
  logger.error("apply-0030.fatal", { err: String(e) });
  process.exit(1);
});
