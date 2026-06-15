import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import type { Tx } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { commentVotes, comments, users } from "@/app/lib/schema";
import { FALLBACK_HANDLE } from "@/app/lib/onboarding/handle";

// Comments repository: per-market discussion. NO coin movement — these helpers
// are pure discussion data. Mirrors the markets repo's two access modes:
//  - MUTATING paths are tx-aware (`tx: Tx`) so a service can compose them;
//    `toggleUpvote` opens its OWN tx (default `db`) so the vote-row check and the
//    cached `upvotes` bump stay atomic and never double-count.
//  - READ helpers default to the shared `db` (no tx) for server-component reads.

// Driver-agnostic DB handle (postgres-js in prod, PGlite in tests). Same shape
// as the markets repo so reads are injectable without an `as any`.
type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type CommentRow = typeof comments.$inferSelect;

/** A comment joined to its author's public @-handle (never the real name),
 *  plus whether the viewer upvoted it. */
export interface CommentView {
  id: string;
  marketId: string;
  userId: string;
  authorHandle: string;
  body: string;
  upvotes: number;
  hidden: boolean;
  createdAt: Date;
  mineUpvoted: boolean;
}

// --- Mutating, tx-aware where it composes; toggleUpvote owns its tx ---

/** Inserts a comment; returns the new comment id. */
export async function insertComment({
  tx,
  db = defaultDb,
  marketId,
  userId,
  body,
}: {
  tx?: Tx;
  db?: DB;
  marketId: string;
  userId: string;
  body: string;
}): Promise<{ id: string }> {
  const exec = tx ?? db;
  const [row] = await exec
    .insert(comments)
    .values({ marketId, userId, body })
    .returning({ id: comments.id });
  return row;
}

/** Visible comments on a market, with author name and the viewer's vote state.
 *  Excludes hidden rows; ordered by upvotes desc, then recency desc. */
export async function listComments({
  db = defaultDb,
  marketId,
  viewerId,
}: {
  db?: DB;
  marketId: string;
  viewerId?: string;
}): Promise<CommentView[]> {
  const rows = await db
    .select({
      id: comments.id,
      marketId: comments.marketId,
      userId: comments.userId,
      authorHandle: sql<string>`coalesce(${users.handle}, ${FALLBACK_HANDLE})`,
      body: comments.body,
      upvotes: comments.upvotes,
      hidden: comments.hidden,
      createdAt: comments.createdAt,
      // mineUpvoted: true iff a comment_votes row exists for (comment, viewer).
      mineUpvoted: viewerId
        ? sql<boolean>`exists (
            select 1 from ${commentVotes}
            where ${commentVotes.commentId} = ${comments.id}
              and ${commentVotes.userId} = ${viewerId}
          )`
        : sql<boolean>`false`,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.marketId, marketId), eq(comments.hidden, false)))
    .orderBy(desc(comments.upvotes), desc(comments.createdAt));
  return rows;
}

/** Toggles the viewer's upvote on a comment, atomically keeping the cached
 *  `upvotes` count in step. Idempotent via the comment_votes composite PK:
 *  if a vote row exists → delete it + `upvotes − 1` → `{ upvoted: false }`;
 *  else insert it + `upvotes + 1` → `{ upvoted: true }`. Never double-counts. */
export async function toggleUpvote({
  db = defaultDb,
  commentId,
  userId,
}: {
  db?: DB;
  commentId: string;
  userId: string;
}): Promise<{ upvoted: boolean }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ commentId: commentVotes.commentId })
      .from(commentVotes)
      .where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, userId)));

    if (existing) {
      await tx
        .delete(commentVotes)
        .where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, userId)));
      await tx
        .update(comments)
        .set({ upvotes: sql`${comments.upvotes} - 1` })
        .where(eq(comments.id, commentId));
      return { upvoted: false };
    }

    await tx.insert(commentVotes).values({ commentId, userId });
    await tx
      .update(comments)
      .set({ upvotes: sql`${comments.upvotes} + 1` })
      .where(eq(comments.id, commentId));
    return { upvoted: true };
  });
}

/** Flips a comment's `hidden` flag (admin moderation). */
export async function setHidden({
  tx,
  db = defaultDb,
  commentId,
  hidden,
}: {
  tx?: Tx;
  db?: DB;
  commentId: string;
  hidden: boolean;
}): Promise<void> {
  const exec = tx ?? db;
  await exec.update(comments).set({ hidden }).where(eq(comments.id, commentId));
}
