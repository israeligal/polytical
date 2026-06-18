import type { ExtractTablesWithRelations } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { users } from "@/app/lib/schema";
import { MissingUserError, requireUserId } from "@/app/lib/errors";
import type { Tx } from "@/app/lib/db";

// User-row access primitives shared across services. Scope guard first.
// Driver-agnostic handle so PGlite tests + the production client type-check off
// the same source (mirrors the leaderboard/markets repos).
type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

/**
 * Locks the user row FOR UPDATE and returns it. Take this BEFORE a
 * check-then-act guard (e.g. onboarding identity writes) so concurrent
 * transactions serialize on the row instead of racing a stale read.
 */
export async function lockUser({ tx, userId }: { tx: Tx; userId: string }) {
  const [row] = await tx
    .select()
    .from(users)
    .where(eq(users.id, requireUserId(userId)))
    .for("update");
  if (!row) throw new MissingUserError();
  return row;
}

/**
 * Sets (or clears, with null) the user's caricature-avatar URL. Scope-guarded:
 * a caller can only ever write their own row. A single UPDATE — no transaction
 * needed (the avatar is independent of the prediction-record invariants).
 */
export async function updateUserCaricature({
  db = defaultDb,
  userId,
  caricatureUrl,
}: {
  db?: DB;
  userId: string;
  caricatureUrl: string | null;
}): Promise<void> {
  await db
    .update(users)
    .set({ caricatureUrl, updatedAt: new Date() })
    .where(eq(users.id, requireUserId(userId)));
}
