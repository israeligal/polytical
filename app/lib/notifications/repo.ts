import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import type { LedgerTx } from "@/app/lib/ledger/repo";
import * as schema from "@/app/lib/schema";
import { notifications } from "@/app/lib/schema";
import { MissingUserError } from "@/app/lib/errors";

// Repository for the notifications event log. `insertNotifications` is tx-aware
// so it rides the transaction of the event that produced it (resolveMarket /
// approve-rejectSuggestion) — notifications commit/roll back WITH the event.
// Reads default the shared db.

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
type Tx = LedgerTx;

export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationType = (typeof schema.notificationType.enumValues)[number];

export interface NewNotification {
  userId: string;
  type: NotificationType;
  titleHe: string;
  bodyHe: string;
  refMarketId?: string | null;
  refBetId?: string | null;
  refSuggestionId?: string | null;
}

function reqUser(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}

/** Batched insert that rides the caller's transaction. No-op on empty input. */
export async function insertNotifications({
  tx,
  rows,
}: {
  tx: Tx;
  rows: NewNotification[];
}): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(notifications).values(
    rows.map((r) => ({
      userId: reqUser(r.userId),
      type: r.type,
      titleHe: r.titleHe,
      bodyHe: r.bodyHe,
      refMarketId: r.refMarketId ?? null,
      refBetId: r.refBetId ?? null,
      refSuggestionId: r.refSuggestionId ?? null,
    })),
  );
}

/** A user's notifications, newest first (uses the (userId, createdAt) index). */
export async function listByUser({
  db = defaultDb,
  userId,
  limit = 50,
}: {
  db?: DB;
  userId: string;
  limit?: number;
}): Promise<NotificationRow[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, reqUser(userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** Unread count (uses the partial (userId) WHERE read=false index). */
export async function countUnread({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, reqUser(userId)), eq(notifications.read, false)));
  return row?.n ?? 0;
}

/** Marks ONE notification read — scope-guarded by userId so a forged id no-ops. */
export async function markRead({
  db = defaultDb,
  userId,
  id,
}: {
  db?: DB;
  userId: string;
  id: string;
}): Promise<{ updated: number }> {
  const rows = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, id), eq(notifications.userId, reqUser(userId))))
    .returning({ id: notifications.id });
  return { updated: rows.length };
}

/** Marks every unread notification of a user read. */
export async function markAllRead({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<{ updated: number }> {
  const rows = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, reqUser(userId)), eq(notifications.read, false)))
    .returning({ id: notifications.id });
  return { updated: rows.length };
}
