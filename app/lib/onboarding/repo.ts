import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { users } from "@/app/lib/schema";
import type { Tx as LedgerTx } from "@/app/lib/db";
import { MissingUserError } from "@/app/lib/errors";

// Driver-agnostic handles (postgres-js in prod, PGlite in tests). Mirrors the
// ledger repo so identity reads/writes are injectable without an `as any`.
type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
type Tx = LedgerTx;

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/** The onboarding-relevant slice of a user row (read authoritatively by the page). */
export type OnboardingState = {
  handle: string | null;
  arena: string | null;
  onboardedAt: Date | null;
};

/** Authoritative DB read of the gate state — used by the /onboarding page so a
 *  stale 5-min cookieCache can never trap (or wrongly release) the user. */
export async function readOnboardingState({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<OnboardingState | null> {
  const [row] = await db
    .select({ handle: users.handle, arena: users.arena, onboardedAt: users.onboardedAt })
    .from(users)
    .where(eq(users.id, reqUser(userId)))
    .limit(1);
  return row ?? null;
}

/** True if any OTHER user already holds this (already-normalized) handle. */
export async function isHandleTaken({
  db,
  tx,
  handle,
  excludeUserId,
}: {
  db?: DB;
  tx?: Tx;
  handle: string;
  excludeUserId: string;
}): Promise<boolean> {
  const conn = tx ?? db ?? defaultDb;
  const [row] = await conn
    .select({ n: sql<number>`1` })
    .from(users)
    .where(and(eq(users.handle, handle), ne(users.id, reqUser(excludeUserId))))
    .limit(1);
  return !!row;
}

/** Writes the handle (already validated + normalized). The DB unique constraint
 *  is the final backstop against a cross-user race — the caller maps 23505. */
export async function setHandle({
  tx,
  userId,
  handle,
}: {
  tx: Tx;
  userId: string;
  handle: string;
}): Promise<void> {
  await tx
    .update(users)
    .set({ handle, updatedAt: new Date() })
    .where(eq(users.id, reqUser(userId)));
}

/** Sets the chosen arena and stamps onboardedAt — the gate-clearing write. */
export async function completeOnboarding({
  tx,
  userId,
  arena,
  at,
}: {
  tx: Tx;
  userId: string;
  arena: string;
  at: Date;
}): Promise<void> {
  await tx
    .update(users)
    .set({ arena, onboardedAt: at, updatedAt: new Date() })
    .where(eq(users.id, reqUser(userId)));
}
