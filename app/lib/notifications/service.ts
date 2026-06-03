import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import type { LedgerTx } from "@/app/lib/ledger/repo";
import * as schema from "@/app/lib/schema";
import * as repo from "@/app/lib/notifications/repo";
import type { NewNotification, NotificationRow } from "@/app/lib/notifications/repo";
import { formatCoins } from "@/lib/format";
import { NotificationNotFoundError } from "@/app/lib/errors";

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
type Tx = LedgerTx;

// A notification EVENT is what callers emit; the service composes the Hebrew
// copy + ref columns so emit sites stay terse. Discriminated on `type`.
export type NotificationEvent =
  | { type: "bet_won"; userId: string; marketId: string; betId: string; questionHe: string; payout: number }
  | { type: "market_resolved"; userId: string; marketId: string; questionHe: string }
  | { type: "suggestion_approved"; userId: string; suggestionId: string; marketId: string; questionHe: string }
  | { type: "suggestion_rejected"; userId: string; suggestionId: string; questionHe: string; note?: string | null };

// Exported so the push dispatcher derives its `{title, body}` from the SAME
// Hebrew copy as the in-app row — one source of truth for notification text.
export function composeNotification(e: NotificationEvent): NewNotification {
  switch (e.type) {
    case "bet_won":
      return {
        userId: e.userId, type: "bet_won",
        titleHe: "זכית בהימור!",
        bodyHe: `קיבלת ${formatCoins(e.payout)} שקוינים · ${e.questionHe}`,
        refMarketId: e.marketId, refBetId: e.betId,
      };
    case "market_resolved":
      return {
        userId: e.userId, type: "market_resolved",
        titleHe: "שוק שהימרת בו הוכרע",
        bodyHe: e.questionHe,
        refMarketId: e.marketId,
      };
    case "suggestion_approved":
      return {
        userId: e.userId, type: "suggestion_approved",
        titleHe: "ההצעה שלך אושרה",
        bodyHe: `נפתח שוק חדש: ${e.questionHe}`,
        refMarketId: e.marketId, refSuggestionId: e.suggestionId,
      };
    case "suggestion_rejected":
      return {
        userId: e.userId, type: "suggestion_rejected",
        titleHe: "ההצעה שלך נדחתה",
        bodyHe: e.note?.trim() || e.questionHe,
        refSuggestionId: e.suggestionId,
      };
  }
}

/**
 * Emit notifications INSIDE the caller's transaction (pass the same `tx` used by
 * resolveMarket / approve-rejectSuggestion). They commit or roll back atomically
 * with the event that produced them — never a separate write that could fail
 * after the settlement already committed.
 */
export async function emitNotifications({
  tx,
  events,
}: {
  tx: Tx;
  events: NotificationEvent[];
}): Promise<void> {
  if (events.length === 0) return;
  await repo.insertNotifications({ tx, rows: events.map(composeNotification) });
}

export async function listNotifications({
  db = defaultDb,
  userId,
  limit,
}: {
  db?: DB;
  userId: string;
  limit?: number;
}): Promise<NotificationRow[]> {
  return repo.listByUser({ db, userId, limit });
}

export async function getUnreadCount({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<number> {
  return repo.countUnread({ db, userId });
}

export async function markNotificationRead({
  db = defaultDb,
  userId,
  id,
}: {
  db?: DB;
  userId: string;
  id: string;
}): Promise<void> {
  const { updated } = await repo.markRead({ db, userId, id });
  if (updated === 0) throw new NotificationNotFoundError();
}

export async function markAllNotificationsRead({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<{ count: number }> {
  const { updated } = await repo.markAllRead({ db, userId });
  return { count: updated };
}
