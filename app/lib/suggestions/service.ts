import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import * as repo from "@/app/lib/suggestions/repo";
import type { SuggestionStatus, SuggestionView } from "@/app/lib/suggestions/repo";
import { createMarket } from "@/app/lib/markets/repo";
import { getPoliticianByPersonId } from "@/app/lib/politicians/repo";
import { CATEGORIES } from "@/lib/categories";
import {
  AlreadyReviewedError,
  InvalidCategoryError,
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
}: {
  db?: DB;
  userId: string;
  questionHe: string;
  category: string;
  personId?: number | null;
}): Promise<{ id: string }> {
  const question = questionHe.trim();
  if (question.length < MIN_SUGGESTION_LEN) throw new SuggestionTooShortError();
  if (question.length > MAX_SUGGESTION_LEN) throw new SuggestionTooLongError();
  if (!VALID_CATEGORIES.has(category)) throw new InvalidCategoryError();

  // Resolve the optional featured MK by stable id only — never guess. An absent
  // or non-existent id is rejected, never silently dropped.
  let resolvedPersonId: number | null = null;
  if (personId != null) {
    if (!Number.isInteger(personId) || personId <= 0) throw new UnknownPoliticianError();
    const mk = await getPoliticianByPersonId({ db, personId });
    if (!mk) throw new UnknownPoliticianError();
    resolvedPersonId = personId;
  }

  return repo.insertSuggestion({ db, userId, questionHe: question, category, personId: resolvedPersonId });
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
  return db.transaction(async (tx) => {
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
    return { marketId };
  });
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
  });
}
