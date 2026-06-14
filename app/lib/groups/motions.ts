import { db as defaultDb } from "@/app/lib/db";
import type { AppDb } from "@/app/lib/db-utils";
import * as groupsRepo from "@/app/lib/groups/repo";
import * as marketsRepo from "@/app/lib/markets/repo";
import { emitNotifications, type NotificationEvent } from "@/app/lib/notifications/service";
import { dispatchPush } from "@/app/lib/push/service";
import { logger } from "@/app/lib/logger";
import { CATEGORIES } from "@/lib/categories";
import {
  MIN_SUGGESTION_LEN,
  MAX_SUGGESTION_LEN,
  MIN_OUTCOMES,
  MAX_OUTCOMES,
  MAX_OUTCOME_LABEL_LEN,
} from "@/app/lib/suggestions/service";
import {
  NotGroupMemberError,
  InsufficientGroupRoleError,
  SuggestionTooShortError,
  SuggestionTooLongError,
  InvalidCategoryError,
  ClosePastError,
  CloseRequiredError,
  OutcomeCountError,
  OutcomeLabelError,
  MarketNotFoundError,
  AlreadyResolvedError,
  InvalidOutcomeError,
  DailySuggestionLimitError,
} from "@/app/lib/errors";

// Group motions — the auto-published, owner-resolved, SANDBOXED half of the
// groups feature. A motion is a `markets` row carrying groupId; resolution
// touches ONLY the group_members counters (never global stats/cards/seasons).
// Notification emits are layered on in M4.

const VALID_CATEGORIES = new Set<string>(CATEGORIES.map((c) => c.key));
const DAY_MS = 24 * 60 * 60 * 1000;
/** Per-(user, group) motions/day (DB-authoritative). */
export const MAX_GROUP_MOTIONS_PER_DAY = 10;

const BINARY_OUTCOMES = [
  { labelHe: "כן", ordinal: 0 },
  { labelHe: "לא", ordinal: 1 },
] as const;

function buildOutcomeRows(
  outcomes: { labelHe: string }[] | null | undefined,
): { rows: { labelHe: string; ordinal: number }[]; multi: boolean } {
  if (!outcomes || outcomes.length === 0) return { rows: BINARY_OUTCOMES.map((o) => ({ ...o })), multi: false };
  if (outcomes.length < MIN_OUTCOMES || outcomes.length > MAX_OUTCOMES) throw new OutcomeCountError();
  const seen = new Set<string>();
  const rows = outcomes.map((o, i) => {
    const labelHe = o.labelHe.trim();
    if (!labelHe || labelHe.length > MAX_OUTCOME_LABEL_LEN || seen.has(labelHe)) throw new OutcomeLabelError();
    seen.add(labelHe);
    return { labelHe, ordinal: i };
  });
  return { rows, multi: true };
}

/**
 * Any active member posts a motion — it goes LIVE immediately (no approval). It's
 * a group-scoped market (markets.groupId set), so it never leaks into a global
 * feed. Validates like a suggestion (length, category, future close, outcomes);
 * per-(user,group) daily cap is DB-authoritative.
 */
export async function createGroupMotion({
  db = defaultDb,
  userId,
  groupId,
  questionHe,
  category,
  closeAt,
  outcomes,
}: {
  db?: AppDb;
  userId: string;
  groupId: string;
  questionHe: string;
  category: string;
  closeAt: Date;
  outcomes?: { labelHe: string }[] | null;
}): Promise<{ marketId: string }> {
  const membership = await groupsRepo.getMembership({ db, groupId, userId });
  if (!membership || membership.status !== "active") throw new NotGroupMemberError();

  const question = questionHe.trim();
  if (question.length < MIN_SUGGESTION_LEN) throw new SuggestionTooShortError();
  if (question.length > MAX_SUGGESTION_LEN) throw new SuggestionTooLongError();
  if (!VALID_CATEGORIES.has(category)) throw new InvalidCategoryError();
  if (!(closeAt instanceof Date) || Number.isNaN(closeAt.getTime())) throw new CloseRequiredError();
  if (closeAt.getTime() <= Date.now()) throw new ClosePastError();

  const { rows, multi } = buildOutcomeRows(outcomes);

  const filedToday = await groupsRepo.countGroupMotionsSince({
    db, groupId, userId, since: new Date(Date.now() - DAY_MS),
  });
  if (filedToday >= MAX_GROUP_MOTIONS_PER_DAY) throw new DailySuggestionLimitError();

  // Create the market + notify members in ONE tx (the motion and its "new
  // motion" pings commit together); push fans out after commit.
  let dispatched: NotificationEvent[] = [];
  const result = await db.transaction(async (tx) => {
    const created = await marketsRepo.createMarket({
      tx,
      groupId,
      questionHe: question,
      category,
      type: multi ? "multi" : "binary",
      closeAt,
      createdBy: userId,
      outcomes: rows,
    });
    const members = await groupsRepo.listActiveMembers({ db: tx, groupId });
    const events: NotificationEvent[] = members
      .filter((m) => m.userId !== userId)
      .map((m) => ({
        type: "group_motion_posted" as const,
        userId: m.userId,
        groupId,
        marketId: created.marketId,
        questionHe: question,
      }));
    await emitNotifications({ tx, events });
    dispatched = events;
    return created;
  });
  try {
    await dispatchPush({ db, events: dispatched });
  } catch (e) {
    logger.error("push.group_motion_posted_dispatch_failed", { groupId, err: String(e) });
  }
  return result;
}

/**
 * Owner/admin resolves a group motion to its winning outcome. SANDBOXED: in one
 * tx it marks the market resolved and bumps EACH predictor's group_members
 * counters (+1 resolved, +1 win if correct) — and NOTHING else (no
 * users.totalWins, no card progress, no seasons). Terminal-guarded.
 */
export async function resolveGroupMotion({
  db = defaultDb,
  actorId,
  groupId,
  marketId,
  winningOutcomeId,
  sourceUrl,
  note,
}: {
  db?: AppDb;
  actorId: string;
  groupId: string;
  marketId: string;
  winningOutcomeId: string;
  sourceUrl?: string;
  note?: string;
}): Promise<void> {
  const actor = await groupsRepo.getMembership({ db, groupId, userId: actorId });
  if (!actor || actor.status !== "active") throw new NotGroupMemberError();
  if (actor.role !== "owner" && actor.role !== "admin") throw new InsufficientGroupRoleError();

  let dispatched: NotificationEvent[] = [];
  await db.transaction(async (tx) => {
    const market = await marketsRepo.getMarketForUpdate({ tx, marketId }); // lock MARKET first
    if (!market || market.groupId !== groupId) throw new MarketNotFoundError();
    if (market.status === "resolved" || market.status === "voided") throw new AlreadyResolvedError();

    const outs = await marketsRepo.listOutcomes({ tx, marketId });
    if (!outs.some((o) => o.id === winningOutcomeId)) throw new InvalidOutcomeError();

    const predictions = await marketsRepo.listPredictions({ tx, marketId });
    const events: NotificationEvent[] = [];
    for (const p of predictions) {
      const won = p.outcomeId === winningOutcomeId;
      await groupsRepo.bumpGroupStats({ tx, groupId, userId: p.userId, correct: won });
      events.push({
        type: "group_motion_resolved",
        userId: p.userId,
        groupId,
        marketId,
        questionHe: market.questionHe,
        won,
      });
    }
    await marketsRepo.markResolved({ tx, marketId, winningOutcomeId, sourceUrl, note });
    // NOTE: deliberately NO bumpUserStats / card progress / seasons — sandbox.
    await emitNotifications({ tx, events });
    dispatched = events;
  });
  try {
    await dispatchPush({ db, events: dispatched });
  } catch (e) {
    logger.error("push.group_motion_resolved_dispatch_failed", { marketId, err: String(e) });
  }
}

