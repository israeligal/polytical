import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { pushSubscriptions } from "@/app/lib/schema";
import { MissingUserError } from "@/app/lib/errors";

// Repository for web-push subscriptions — one row per browser push endpoint a
// user has granted. `endpoint` is the natural key (UNIQUE), so re-subscribe is
// an idempotent rebind to the latest user + keys. The dispatcher prunes a dead
// endpoint by endpoint alone (no userId — a 410/404 invalidates it for anyone).
// All writes here are single-row and self-contained, so the public API takes a
// db (defaulting to the shared client), not a caller transaction.

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/** Inserts a subscription, or rebinds an existing endpoint to the latest
 *  user + keys. UNIQUE(endpoint) makes this idempotent across re-subscribes. */
export async function upsertSubscription({
  db = defaultDb,
  userId,
  endpoint,
  p256dh,
  auth,
}: {
  db?: DB;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ userId: reqUser(userId), endpoint, p256dh, auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: reqUser(userId), p256dh, auth },
    });
}

/** Every subscription owned by a user — fans out to all their devices. */
export async function listByUser({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<PushSubscriptionRow[]> {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, reqUser(userId)));
}

/** Prunes a dead endpoint (410/404 from the push service). No userId: an
 *  invalidated endpoint is dead for whoever currently owns it. */
export async function deleteByEndpoint({
  db = defaultDb,
  endpoint,
}: {
  db?: DB;
  endpoint: string;
}): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/** User-initiated unsubscribe — scope-guarded by userId so a forged endpoint
 *  from another user no-ops. Returns the number of rows removed. */
export async function deleteByUserAndEndpoint({
  db = defaultDb,
  userId,
  endpoint,
}: {
  db?: DB;
  userId: string;
  endpoint: string;
}): Promise<{ deleted: number }> {
  const rows = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, reqUser(userId)),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    )
    .returning({ id: pushSubscriptions.id });
  return { deleted: rows.length };
}
