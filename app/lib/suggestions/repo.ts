import type { ExtractTablesWithRelations } from "drizzle-orm";
import { desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import type { Tx } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { marketSuggestions, users } from "@/app/lib/schema";
import { SuggestionNotFoundError } from "@/app/lib/errors";

// Repository for community market suggestions. Mirrors the comments repo: owns
// all Drizzle access, driver-agnostic DB handle (postgres-js in prod, PGlite in
// tests), tx-aware mutators so the approval flow stays atomic with createMarket.

type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type SuggestionRow = typeof marketSuggestions.$inferSelect;
export type SuggestionStatus = (typeof schema.suggestionStatus.enumValues)[number];

/** A suggestion joined to its proposer's display name, for queue + profile lists. */
export interface SuggestionView {
  id: string;
  userId: string;
  proposerName: string;
  questionHe: string;
  category: string;
  personId: number | null;
  proposedCloseAt: Date | null;
  resolutionSourceNote: string | null;
  status: SuggestionStatus;
  reviewNote: string | null;
  marketId: string | null;
  createdAt: Date;
}

const VIEW_COLUMNS = {
  id: marketSuggestions.id,
  userId: marketSuggestions.userId,
  proposerName: users.name,
  questionHe: marketSuggestions.questionHe,
  category: marketSuggestions.category,
  personId: marketSuggestions.personId,
  proposedCloseAt: marketSuggestions.proposedCloseAt,
  resolutionSourceNote: marketSuggestions.resolutionSourceNote,
  status: marketSuggestions.status,
  reviewNote: marketSuggestions.reviewNote,
  marketId: marketSuggestions.marketId,
  createdAt: marketSuggestions.createdAt,
} as const;

export async function insertSuggestion({
  tx,
  db = defaultDb,
  userId,
  questionHe,
  category,
  personId,
  proposedCloseAt,
  resolutionSourceNote,
}: {
  tx?: Tx;
  db?: DB;
  userId: string;
  questionHe: string;
  category: string;
  personId?: number | null;
  proposedCloseAt: Date;
  resolutionSourceNote?: string | null;
}): Promise<{ id: string }> {
  const exec = tx ?? db;
  const [row] = await exec
    .insert(marketSuggestions)
    .values({
      userId,
      questionHe,
      category,
      personId: personId ?? null,
      proposedCloseAt,
      resolutionSourceNote: resolutionSourceNote ?? null,
    })
    .returning({ id: marketSuggestions.id });
  return row;
}

/** All suggestions (optionally filtered by status), newest first — admin queue. */
export async function listSuggestions({
  db = defaultDb,
  status,
}: {
  db?: DB;
  status?: SuggestionStatus;
}): Promise<SuggestionView[]> {
  return db
    .select(VIEW_COLUMNS)
    .from(marketSuggestions)
    .innerJoin(users, eq(users.id, marketSuggestions.userId))
    .where(status ? eq(marketSuggestions.status, status) : undefined)
    .orderBy(desc(marketSuggestions.createdAt));
}

/** A single user's own suggestions (all statuses), newest first — profile. */
export async function listSuggestionsByUser({
  db = defaultDb,
  userId,
}: {
  db?: DB;
  userId: string;
}): Promise<SuggestionView[]> {
  return db
    .select(VIEW_COLUMNS)
    .from(marketSuggestions)
    .innerJoin(users, eq(users.id, marketSuggestions.userId))
    .where(eq(marketSuggestions.userId, userId))
    .orderBy(desc(marketSuggestions.createdAt));
}

/**
 * Locks a suggestion row FOR UPDATE and returns it; throws if it doesn't exist.
 * Take this FIRST in the review tx so concurrent approve/reject serialize on the
 * row and the terminal-state guard can't be raced.
 */
export async function lockSuggestion({
  tx,
  id,
}: {
  tx: Tx;
  id: string;
}): Promise<SuggestionRow> {
  const [row] = await tx
    .select()
    .from(marketSuggestions)
    .where(eq(marketSuggestions.id, id))
    .for("update");
  if (!row) throw new SuggestionNotFoundError();
  return row;
}

/** Writes the review outcome (status + reviewer + timestamp + optional note/market link). */
export async function markReviewed({
  tx,
  db = defaultDb,
  id,
  status,
  reviewerId,
  reviewNote,
  marketId,
  reviewedAt = new Date(),
}: {
  tx?: Tx;
  db?: DB;
  id: string;
  status: SuggestionStatus;
  reviewerId: string;
  reviewNote?: string | null;
  marketId?: string | null;
  reviewedAt?: Date;
}): Promise<void> {
  const exec = tx ?? db;
  await exec
    .update(marketSuggestions)
    .set({ status, reviewedBy: reviewerId, reviewNote: reviewNote ?? null, marketId: marketId ?? null, reviewedAt })
    .where(eq(marketSuggestions.id, id));
}
