// One-off PROD migration applier for 0024_bill_details (the bill-pages feature).
//
// Deliberately targets the configured DB (PRODUCTION — the single prod DB; there is no
// dev DB) and intentionally does NOT call assertNonProductionDb(): applying schema to prod
// is its job. It is SAFE because 0024 is purely ADDITIVE — ADD COLUMN / CREATE TABLE /
// CREATE INDEX only, never a DROP — so it cannot clobber columns/tables other branches may
// have pushed to the shared prod DB (unlike a full `drizzle-kit push`, which syncs the whole
// schema and could drop drift). It is idempotent: "already exists" errors are skipped.
//
// Run once:  pnpm tsx --env-file=.env scripts/apply-bill-migration.ts
import { readFileSync } from "node:fs";
import { sharedSql } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";

async function report(label: string) {
  const cols = await sharedSql<{ column_name: string }[]>`
    select column_name from information_schema.columns where table_name = 'bills' order by column_name`;
  const tables = await sharedSql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_name in ('bill_documents', 'bill_statuses') order by table_name`;
  logger.info("apply-0024.state", {
    label,
    billsHasSubTypeId: cols.some((c) => c.column_name === "subTypeId"),
    billsHasSummaryLaw: cols.some((c) => c.column_name === "summaryLaw"),
    newTables: tables.map((t) => t.table_name),
  });
}

async function main() {
  await report("before");
  const text = readFileSync("drizzle/0024_bill_details.sql", "utf8");
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
      logger.info("apply-0024.ok", { stmt: stmt.slice(0, 70) });
    } catch (err) {
      const msg = String(err);
      if (/already exists/i.test(msg)) {
        skipped += 1;
        logger.warn("apply-0024.skip_exists", { stmt: stmt.slice(0, 70) });
      } else {
        logger.error("apply-0024.failed", { stmt: stmt.slice(0, 90), err: msg });
        throw err;
      }
    }
  }
  await report("after");
  logger.info("apply-0024.done", { statements: statements.length, applied, skipped });
  await sharedSql.end();
  process.exit(0);
}

main().catch((e) => {
  logger.error("apply-0024.fatal", { err: String(e) });
  process.exit(1);
});
