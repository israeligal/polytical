import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Single-source DB connection for the Polytical app + scripts + tests.
//
// DATABASE_URL points at Neon's pooler endpoint (pgbouncer, transaction mode).
// Prepared statements don't survive across pool checkouts there, so we set
// `prepare: false`. We strip `sslmode`/`channel_binding` from the URL so our
// explicit `ssl: "require"` wins (avoids forcing a CA cert we don't ship).

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Set it in .env");
}

function stripSslParams(url: string): string {
  return url
    .replace(/([?&])(sslmode|channel_binding)=[^&]+(&|$)/g, (_m, prefix, _k, suffix) =>
      suffix === "&" ? prefix : "",
    )
    .replace(/\?$/, "");
}

const sharedClient = postgres(stripSslParams(databaseUrl), {
  ssl: "require",
  // Neon free tier caps connections per pool; be conservative.
  max: 3,
  connect_timeout: 10,
  idle_timeout: 30,
  // Required for the Neon pooler (pgbouncer transaction mode).
  prepare: false,
});

/** Drizzle client bound to the shared postgres.js connection. */
export const db = drizzle(sharedClient, { schema });

/** The shared postgres.js Sql client (full postgres.js API for scripts/raw SQL). */
export const sharedSql = sharedClient;

/** The Drizzle DB type. */
export type DB = typeof db;

/**
 * Driver-agnostic Drizzle transaction handle. The same tx-aware repo code runs
 * on the production postgres-js `db` and on the PGlite test db, whose Drizzle
 * types differ only by the query-result HKT — keeping this generic lets a
 * tx-taking function accept either without `as any`. (Formerly `LedgerTx`.)
 */
export type Tx = PgTransaction<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
