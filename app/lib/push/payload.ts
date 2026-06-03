import {
  composeNotification,
  type NotificationEvent,
} from "@/app/lib/notifications/service";

/**
 * The shape `public/sw.js` reads from the push message body. The `{ title,
 * body, url }` keys are a hard contract with the service worker — do not rename.
 */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/**
 * Turn a notification event into the web-push payload. Reuses the same Hebrew
 * copy the in-app notification renders (single source of truth via
 * `composeNotification`), and routes the click to the referenced market when one
 * exists, otherwise to the notifications inbox.
 */
export function eventToPush(event: NotificationEvent): PushPayload {
  const n = composeNotification(event);
  return {
    title: n.titleHe,
    body: n.bodyHe,
    url: pushUrl(event, n.refMarketId),
  };
}

/** Where a notification click lands: the referenced market, the seasons board
 *  for a reward, otherwise the notifications inbox. */
function pushUrl(event: NotificationEvent, refMarketId?: string | null): string {
  if (event.type === "season_reward") return "/seasons";
  return refMarketId ? `/market/${refMarketId}` : "/notifications";
}

/** Higher number wins when one user has multiple pending events. */
const EVENT_PRIORITY: Record<NotificationEvent["type"], number> = {
  bet_won: 3,
  market_resolved: 2,
  market_voided: 2,
  market_closing_soon: 1,
  suggestion_approved: 1,
  season_reward: 1,
  suggestion_rejected: 0,
};

/**
 * Collapse to at most one event per user, keeping the highest-priority type.
 * resolveMarket emits both `bet_won` AND `market_resolved` for a winner — without
 * this, that user would receive two pushes for the same resolution.
 */
export function dedupeEventsPerUser(
  events: NotificationEvent[],
): NotificationEvent[] {
  const best = new Map<string, NotificationEvent>();
  for (const event of events) {
    const current = best.get(event.userId);
    if (
      current === undefined ||
      EVENT_PRIORITY[event.type] > EVENT_PRIORITY[current.type]
    ) {
      best.set(event.userId, event);
    }
  }
  return [...best.values()];
}
