import { db as defaultDb } from "@/app/lib/db";
import type { AppDb } from "@/app/lib/db-utils";
import * as commentsService from "@/app/lib/comments/service";
import * as groupsRepo from "@/app/lib/groups/repo";
import { getMarket } from "@/app/lib/markets/repo";
import { emitNotifications, type NotificationEvent } from "@/app/lib/notifications/service";
import { dispatchPush } from "@/app/lib/push/service";
import { logger } from "@/app/lib/logger";
import { NotGroupMemberError } from "@/app/lib/errors";

// מליאה — group discussion. Reuses the flat comments system; on a GROUP motion it
// also (a) gates commenting to members and (b) atomically emits group_mention to
// any @-mentioned fellow members + the motion's author. General-market comments
// keep their existing behavior (no group context, no mention pings).

// @handle tokens. The Hebrew class is the base block א-ת ONLY (matching
// HANDLE_RE's stored alphabet) — NOT the wider ֐-׿, which would swallow a
// trailing geresh/niqqud into the token and miss the lookup.
const MENTION_RE = /@([a-zA-Z0-9_א-ת]+)/g;

/** Distinct handles referenced in a comment body, lowercased to match stored
 *  handles (normalizeHandle forces lowercase; the DB lookup is case-sensitive). */
export function parseMentionHandles(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) out.add(m[1].toLowerCase());
  return [...out];
}

/**
 * Posts a comment with group awareness. On a group motion: requires active
 * membership, then inserts the comment and emits group_mention (to @-mentioned
 * members + the motion author) in ONE tx. On a global market: a plain comment.
 */
export async function postGroupAwareComment({
  db = defaultDb,
  userId,
  actorName,
  marketId,
  body,
}: {
  db?: AppDb;
  userId: string;
  actorName: string;
  marketId: string;
  body: string;
}): Promise<{ id: string }> {
  const market = await getMarket({ db, marketId });
  // Unknown market → let the plain path raise the comments FK error (the action
  // maps it to "the prediction was removed").
  if (!market?.groupId) {
    return commentsService.postComment({ db, marketId, userId, body });
  }

  const groupId = market.groupId;
  const membership = await groupsRepo.getMembership({ db, groupId, userId });
  if (!membership || membership.status !== "active") throw new NotGroupMemberError();

  let dispatched: NotificationEvent[] = [];
  const result = await db.transaction(async (tx) => {
    const created = await commentsService.postComment({ db: tx, marketId, userId, body });

    // Recipients: @-mentioned fellow members + the motion author — minus the
    // commenter, deduped.
    const handles = parseMentionHandles(body);
    const mentioned = await groupsRepo.getActiveMembersByHandles({ db: tx, groupId, handles });
    const recipients = new Set<string>(mentioned.map((m) => m.userId));
    // Notify the motion author only if they're still an active member.
    if (market.createdBy && market.createdBy !== userId) {
      const author = await groupsRepo.getMembership({ db: tx, groupId, userId: market.createdBy });
      if (author?.status === "active") recipients.add(market.createdBy);
    }
    recipients.delete(userId);

    const events: NotificationEvent[] = [...recipients].map((rid) => ({
      type: "group_mention" as const,
      userId: rid,
      groupId,
      marketId,
      questionHe: market.questionHe,
      actorName,
    }));
    await emitNotifications({ tx, events });
    dispatched = events;
    return created;
  });
  try {
    await dispatchPush({ db, events: dispatched });
  } catch (e) {
    logger.error("push.group_mention_dispatch_failed", { marketId, err: String(e) });
  }
  return result;
}
