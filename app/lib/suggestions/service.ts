import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import * as repo from "@/app/lib/suggestions/repo";
import type { SuggestionStatus, SuggestionView } from "@/app/lib/suggestions/repo";
import { createMarket } from "@/app/lib/markets/repo";
import { emitNotifications } from "@/app/lib/notifications/service";
import { dispatchPush } from "@/app/lib/push/service";
import { type NotificationEvent } from "@/app/lib/notifications/service";
import { logger } from "@/app/lib/logger";
import { getPoliticianByPersonId } from "@/app/lib/politicians/repo";
import { CATEGORIES } from "@/lib/categories";
import {
  AlreadyReviewedError,
  ClosePastError,
  CloseRequiredError,
  CloseTooFarError,
  DailySuggestionLimitError,
  InvalidCategoryError,
  SourceNoteTooLongError,
  SuggestionTooLongError,
  SuggestionTooShortError,
  UnknownPoliticianError,
} from "@/app/lib/errors";

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export const MIN_SUGGESTION_LEN = 10;
export const MAX_SUGGESTION_LEN = 200;
export const MAX_SOURCE_NOTE_LEN = 300;

/** Daily cap per user, enforced on a rolling 24h window against the DB (the
 *  in-memory limiter only guards bursts — it resets on every serverless cold
 *  start, so it cannot hold a day-long window). Counts all statuses. */
export const MAX_SUGGESTIONS_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/** ~2y sanity cap on how far out a proposed decision date may be. */
const MAX_CLOSE_HORIZON_MS = 2 * 365 * 24 * 60 * 60 * 1000;

const VALID_CATEGORIES = new Set<string>(CATEGORIES.map((c) => c.key));

/** Binary outcomes every approved market gets, unless we extend to multi later. */
const BINARY_OUTCOMES = [
  { labelHe: "כן", ordinal: 0 },
  { labelHe: "לא", ordinal: 1 },
] as const;

/**
 * A user proposes a market. Validates (trim → length bounds → category in the
 * union → optional featured MK resolves to a real personId) and inserts as
 * `pending`. Never creates a market — that happens only on admin approval.
 */
export async function createSuggestion({
  db = defaultDb,
  userId,
  questionHe,
  category,
  personId,
  proposedCloseAt,
  resolutionSourceNote,
}: {
  db?: DB;
  userId: string;
  questionHe: string;
  category: string;
  personId?: number | null;
  proposedCloseAt: Date;
  resolutionSourceNote?: string | null;
}): Promise<{ id: string }> {
  const question = questionHe.trim();
  if (question.length < MIN_SUGGESTION_LEN) throw new SuggestionTooShortError();
  if (question.length > MAX_SUGGESTION_LEN) throw new SuggestionTooLongError();
  if (!VALID_CATEGORIES.has(category)) throw new InvalidCategoryError();

  // The proposer owns the decision date (admin can still adjust at approval).
  if (!(proposedCloseAt instanceof Date) || Number.isNaN(proposedCloseAt.getTime())) throw new CloseRequiredError();
  if (proposedCloseAt.getTime() <= Date.now()) throw new ClosePastError();
  if (proposedCloseAt.getTime() > Date.now() + MAX_CLOSE_HORIZON_MS) throw new CloseTooFarError();
  const sourceNote = resolutionSourceNote?.trim() || null;
  if (sourceNote && sourceNote.length > MAX_SOURCE_NOTE_LEN) throw new SourceNoteTooLongError();

  // Resolve the optional featured MK by stable id only — never guess. An absent
  // or non-existent id is rejected, never silently dropped.
  let resolvedPersonId: number | null = null;
  if (personId != null) {
    if (!Number.isInteger(personId) || personId <= 0) throw new UnknownPoliticianError();
    const mk = await getPoliticianByPersonId({ db, personId });
    if (!mk) throw new UnknownPoliticianError();
    resolvedPersonId = personId;
  }

  // Daily cap last (cheapest checks first): the DB count is authoritative.
  const filedToday = await repo.countSuggestionsSince({
    db,
    userId,
    since: new Date(Date.now() - DAY_MS),
  });
  if (filedToday >= MAX_SUGGESTIONS_PER_DAY) throw new DailySuggestionLimitError();

  return repo.insertSuggestion({
    db,
    userId,
    questionHe: question,
    category,
    personId: resolvedPersonId,
    proposedCloseAt,
    resolutionSourceNote: sourceNote,
  });
}

/** Admin queue: all suggestions, optionally filtered by status, newest first. */
export async function listSuggestions({
  db = defaultDb,
  status,
}: {
  db?: DB;
  status?: SuggestionStatus;
}): Promise<SuggestionView[]> {
  return repo.listSuggestions({ db, status });
}

/** A user's own suggestions (all statuses) for their profile. */
export async function getMySuggestions({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<SuggestionView[]> {
  return repo.listSuggestionsByUser({ db, userId });
}

/**
 * Approve a pending suggestion: in ONE transaction, lock the row, assert it's
 * still pending (terminal-state guard → AlreadyReviewedError), create a real
 * binary market via createMarket (sharing this tx so both commit together), and
 * flip the suggestion to `approved` linked to the new market.
 */
export async function approveSuggestion({
  db = defaultDb,
  suggestionId,
  reviewerId,
  closeAt,
}: {
  db?: DB;
  suggestionId: string;
  reviewerId: string;
  closeAt: Date;
}): Promise<{ marketId: string }> {
  // Reject a non-future close date here, in the authoritative service: a market
  // is born `open` (schema default) and nothing auto-closes it, so a past closeAt
  // would mint a live-looking market that can never accept a bet.
  if (closeAt.getTime() <= Date.now()) throw new ClosePastError();

  // Captured inside the tx and pushed AFTER commit (web-push is a network call
  // that cannot roll back); a push failure must never break the approval.
  let dispatched: NotificationEvent[] = [];
  const result = await db.transaction(async (tx) => {
    const s = await repo.lockSuggestion({ tx, id: suggestionId });
    if (s.status !== "pending") throw new AlreadyReviewedError();

    const { marketId } = await createMarket({
      tx,
      questionHe: s.questionHe,
      category: s.category,
      type: "binary",
      closeAt,
      createdBy: reviewerId,
      outcomes: BINARY_OUTCOMES.map((o) => ({ ...o })),
      personIds: s.personId ? [s.personId] : [],
    });

    await repo.markReviewed({ tx, id: suggestionId, status: "approved", reviewerId, marketId });
    const events: NotificationEvent[] = [
      { type: "suggestion_approved", userId: s.userId, suggestionId, marketId, questionHe: s.questionHe },
    ];
    dispatched = events;
    await emitNotifications({ tx, events });
    return { marketId };
  });
  try {
    await dispatchPush({ db, events: dispatched });
  } catch (e) {
    logger.error("push.approve_dispatch_failed", { suggestionId, err: String(e) });
  }
  return result;
}

/** Reject a pending suggestion with an optional note. Terminal-state guarded. */
export async function rejectSuggestion({
  db = defaultDb,
  suggestionId,
  reviewerId,
  note,
}: {
  db?: DB;
  suggestionId: string;
  reviewerId: string;
  note?: string;
}): Promise<void> {
  // Captured inside the tx and pushed AFTER commit (web-push is a network call
  // that cannot roll back); a push failure must never break the rejection.
  let dispatched: NotificationEvent[] = [];
  await db.transaction(async (tx) => {
    const s = await repo.lockSuggestion({ tx, id: suggestionId });
    if (s.status !== "pending") throw new AlreadyReviewedError();
    await repo.markReviewed({
      tx,
      id: suggestionId,
      status: "rejected",
      reviewerId,
      reviewNote: note?.trim() || null,
    });
    const events: NotificationEvent[] = [
      { type: "suggestion_rejected", userId: s.userId, suggestionId, questionHe: s.questionHe, note },
    ];
    dispatched = events;
    await emitNotifications({ tx, events });
  });
  try {
    await dispatchPush({ db, events: dispatched });
  } catch (e) {
    logger.error("push.reject_dispatch_failed", { suggestionId, err: String(e) });
  }
}
