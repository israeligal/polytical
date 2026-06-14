// One-off PROD migration applier for 0031_group_stance_consent (Phase 2 group
// stance sharing). Mirrors scripts/apply-groups-migration.ts — idempotent,
// additive-only (CREATE TABLE + FKs + index), forward-compatible. Does NOT call
// assertNonProductionDb (applying schema to prod is the job).
//
// Run once with the REAL prod env:
//   pnpm tsx --env-file=<path-to-prod>/.env scripts/apply-stance-consent-migration.ts
import { readFileSync } from "node:fs";
import { sharedSql } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";

async function report(label: string) {
  const t = await sharedSql<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_name = 'group_stance_consent'`;
  logger.info("apply-0031.state", { label, hasGroupStanceConsent: t.length > 0 });
}

async function main() {
  await report("before");
  const text = readFileSync("drizzle/0031_group_stance_consent.sql", "utf8");
  const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  let applied = 0;
  let skipped = 0;
  for (const stmt of statements) {
    try {
      await sharedSql.unsafe(stmt);
      applied += 1;
      logger.info("apply-0031.ok", { stmt: stmt.slice(0, 70) });
    } catch (err) {
      const msg = String(err);
      if (/already exists/i.test(msg)) {
        skipped += 1;
        logger.warn("apply-0031.skip_exists", { stmt: stmt.slice(0, 70) });
      } else {
        logger.error("apply-0031.failed", { stmt: stmt.slice(0, 90), err: msg });
        throw err;
      }
    }
  }
  await report("after");
  logger.info("apply-0031.done", { statements: statements.length, applied, skipped });
  await sharedSql.end();
  process.exit(0);
}

main().catch((e) => {
  logger.error("apply-0031.fatal", { err: String(e) });
  process.exit(1);
});
