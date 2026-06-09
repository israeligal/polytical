import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import webpush, { WebPushError } from "web-push";
import * as schema from "@/app/lib/schema";
import * as pushRepo from "@/app/lib/push/repo";
import {
  eventToPush,
  dedupeEventsPerUser,
  type PushPayload,
} from "@/app/lib/push/payload";
import { type NotificationEvent } from "@/app/lib/notifications/service";
import { logger } from "@/app/lib/logger";

// The web-push DISPATCHER — Node-only (it reaches the push services over HTTP).
// Two layers: `sendToUser` fans one payload out to every device a user has;
// `dispatchPush` is the best-effort orchestrator the resolution/suggestion flows
// fire-and-forget AFTER their DB transaction has committed (a push must never be
// able to roll back a settlement). A dead endpoint (404/410) is pruned in place,
// turning the live push services into the source of truth for endpoint liveness.

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Whether all three VAPID env vars are present. Read at CALL time so tests can
 *  stubEnv per-case and the server can boot without push configured. */
function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

// Memoize ONLY the side-effect (setVapidDetails is global + idempotent), never
// the configured-ness check — env can differ across test cases.
let vapidSet = false;
function ensureVapid() {
  if (vapidSet) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidSet = true;
}

/** Fan one payload out to every push subscription a user owns. Prunes endpoints
 *  the push service reports as gone (404/410); logs other send failures and
 *  keeps the row. No-ops (skipped) when push isn't configured. */
export async function sendToUser({
  db,
  userId,
  payload,
}: {
  db?: DB;
  userId: string;
  payload: PushPayload;
}): Promise<{ sent: number; skipped?: boolean }> {
  if (!isPushConfigured()) {
    logger.warn("push.not_configured", { userId });
    return { sent: 0, skipped: true };
  }
  ensureVapid();

  const subs = await pushRepo.listByUser({ db, userId });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (e) {
      if (
        e instanceof WebPushError &&
        (e.statusCode === 404 || e.statusCode === 410)
      ) {
        await pushRepo.deleteByEndpoint({ db, endpoint: s.endpoint });
      } else {
        logger.error("push.send_failed", {
          userId,
          endpoint: s.endpoint,
          err: String(e),
        });
      }
    }
  }
  return { sent };
}

/** Best-effort push for a batch of notification events. Dedupes to one push per
 *  user (a winner emits both bet_won + market_resolved), then fans each out.
 *  NEVER throws — push is a side-channel that must not break the caller. */
export async function dispatchPush({
  db,
  events,
}: {
  db?: DB;
  events: NotificationEvent[];
}): Promise<void> {
  if (!events.length) return;
  if (!isPushConfigured()) return;
  // Self-contained no-throw guarantee: dedupe + eventToPush (which calls
  // composeNotification) run INSIDE the guard too, so the contract holds for any
  // caller, not just the ones that also wrap their await in try/catch.
  let deduped: NotificationEvent[];
  try {
    deduped = dedupeEventsPerUser(events);
  } catch (err) {
    logger.error("push.dispatch_failed", { err: String(err) });
    return;
  }
  for (const e of deduped) {
    try {
      await sendToUser({ db, userId: e.userId, payload: eventToPush(e) });
    } catch (err) {
      logger.error("push.dispatch_failed", { err: String(err) });
    }
  }
}
