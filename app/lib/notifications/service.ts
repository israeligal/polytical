import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import type { Tx } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import * as repo from "@/app/lib/notifications/repo";
import type { NewNotification, NotificationRow } from "@/app/lib/notifications/repo";
import { NotificationNotFoundError } from "@/app/lib/errors";

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

// A notification EVENT is what callers emit; the service composes the Hebrew
// copy + ref columns so emit sites stay terse. Discriminated on `type`.
export type NotificationEvent =
  | { type: "bet_won"; userId: string; marketId: string; betId: string; questionHe: string }
  | { type: "market_resolved"; userId: string; marketId: string; questionHe: string }
  | { type: "suggestion_approved"; userId: string; suggestionId: string; marketId: string; questionHe: string }
  | { type: "suggestion_rejected"; userId: string; suggestionId: string; questionHe: string; note?: string | null }
  // marketId is null when the market was hard-DELETED (not just voided) — the
  // in-app link and push URL then fall back to /profile and /notifications
  // instead of deep-linking a market page that would 404.
  | { type: "market_voided"; userId: string; marketId: string | null; questionHe: string }
  | { type: "market_closing_soon"; userId: string; marketId: string; questionHe: string }
  // --- Groups / קואליציה ---
  | { type: "group_motion_posted"; userId: string; groupId: string; marketId: string; questionHe: string }
  | { type: "group_motion_resolved"; userId: string; groupId: string; marketId: string; questionHe: string; won: boolean }
  | { type: "group_mention"; userId: string; groupId: string; marketId: string; questionHe: string; actorName: string }
  | { type: "group_member_joined"; userId: string; groupId: string; groupNameHe: string; actorName: string }
  // --- Duels / דו-קרב ---
  | { type: "duel_settled"; userId: string; challengeId: string; questionHe: string; result: "won" | "lost" | "tie" };

// Exported so the push dispatcher derives its `{title, body}` from the SAME
// Hebrew copy as the in-app row — one source of truth for notification text.
export function composeNotification(e: NotificationEvent): NewNotification {
  switch (e.type) {
    case "bet_won":
      return {
        userId: e.userId, type: "bet_won",
        titleHe: "המנדט נפדה! 🎯",
        bodyHe: `המנדט נפדה — צדקת · ${e.questionHe}`,
        refMarketId: e.marketId, refBetId: e.betId,
      };
    case "market_resolved":
      return {
        userId: e.userId, type: "market_resolved",
        titleHe: "תחזית שנתת בה מנדט הוכרעה",
        bodyHe: e.questionHe,
        refMarketId: e.marketId,
      };
    case "suggestion_approved":
      return {
        userId: e.userId, type: "suggestion_approved",
        titleHe: "ההצעה שלך אושרה",
        bodyHe: `נפתחה תחזית חדשה: ${e.questionHe}`,
        refMarketId: e.marketId, refSuggestionId: e.suggestionId,
      };
    case "suggestion_rejected":
      return {
        userId: e.userId, type: "suggestion_rejected",
        titleHe: "ההצעה שלך נדחתה",
        bodyHe: e.note?.trim() || e.questionHe,
        refSuggestionId: e.suggestionId,
      };
    case "market_voided":
      return {
        userId: e.userId, type: "market_voided",
        titleHe: "התחזית בוטלה",
        bodyHe: `המנדט שלך בוטל · ${e.questionHe}`,
        refMarketId: e.marketId,
      };
    case "market_closing_soon":
      return {
        userId: e.userId, type: "market_closing_soon",
        titleHe: "תחזית נסגרת בקרוב ⏰",
        bodyHe: `הספיקו לתת מנדט לפני הסגירה · ${e.questionHe}`,
        refMarketId: e.marketId,
      };
    case "group_motion_posted":
      return {
        userId: e.userId, type: "group_motion_posted",
        titleHe: "הצעה חדשה בקואליציה 🗳️",
        bodyHe: e.questionHe,
        refMarketId: e.marketId, refGroupId: e.groupId,
      };
    case "group_motion_resolved":
      return {
        userId: e.userId, type: "group_motion_resolved",
        titleHe: e.won ? "צדקת בקואליציה! 🎯" : "הצעה בקואליציה הוכרעה",
        bodyHe: e.questionHe,
        refMarketId: e.marketId, refGroupId: e.groupId,
      };
    case "group_mention":
      return {
        userId: e.userId, type: "group_mention",
        titleHe: "תויגת במליאה 💬",
        bodyHe: `${e.actorName} הזכיר/ה אותך · ${e.questionHe}`,
        refMarketId: e.marketId, refGroupId: e.groupId,
      };
    case "group_member_joined":
      return {
        userId: e.userId, type: "group_member_joined",
        titleHe: "חבר/ה חדש/ה בקואליציה 👋",
        bodyHe: `${e.actorName} הצטרף/ה ל${e.groupNameHe}`,
        refGroupId: e.groupId,
      };
    case "duel_settled":
      return {
        userId: e.userId, type: "duel_settled",
        titleHe:
          e.result === "won" ? "ניצחת בדו-קרב! 🥊" : e.result === "tie" ? "תיקו בדו-קרב 🤝" : "הדו-קרב הוכרע",
        bodyHe:
          e.result === "won"
            ? `הכרעת את היריב — בדקו את התוצאות · ${e.questionHe}`
            : e.result === "tie"
              ? `שניכם ניבאתם אותו דבר · ${e.questionHe}`
              : `הפעם היריב צדק — בדקו מי ניצח · ${e.questionHe}`,
        refChallengeId: e.challengeId,
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
