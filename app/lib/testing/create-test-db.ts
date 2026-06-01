import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/app/lib/schema";

export async function createTestDb() {
  // Register the contrib extensions the discovery migration (0003) installs so
  // `CREATE EXTENSION ... pg_trgm/unaccent` and the trigram GIN index replay in
  // real (PGlite) Postgres — mirroring Neon, where these ship built-in.
  const client = new PGlite({ extensions: { pg_trgm, unaccent } });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, close: () => client.close() };
}
export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];
