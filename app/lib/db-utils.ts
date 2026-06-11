// Shared repo plumbing — previously copy-pasted per repo (the BATCH constant
// alone existed twice; a change in one copy would silently desync Neon's
// parameter-limit batching on the other path).

import { sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "@/app/lib/schema";

/**
 * Driver-agnostic DB handle: the production postgres-js `db` and the PGlite
 * test db share Drizzle's PG types and differ only by the query-result HKT —
 * this is the entire PGlite injection mechanism for repos/services.
 */
export type AppDb = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** References the conflicting row's incoming value (Postgres `excluded.<col>`). */
export function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

/** ≈100 rows keeps multi-row inserts under Neon's bind-parameter limit. */
export const BATCH = 100;

export function chunk<T>(rows: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
