import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as repo from "@/app/lib/comments/repo";
import type { CommentView } from "@/app/lib/comments/repo";
import * as schema from "@/app/lib/schema";
import { EmptyCommentError, CommentTooLongError, CommentNotFoundError } from "@/app/lib/errors";
import { isForeignKeyViolation } from "@/app/lib/pg-errors";
import { isUuid } from "@/app/lib/ids";

// Comments service. Pure discussion data — no game state. Mirrors
// the markets service's driver-agnostic `db` injection so the same code runs on
// production postgres-js and the PGlite test db without an `as any`.
type DB = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Max comment length (chars, post-trim). */
export const MAX_COMMENT_LEN = 500;

/** Posts a comment: trims, enforces 1..500 chars, inserts. No market-status
 *  check — comments are allowed on any market (draft → resolved). */
export async function postComment({
  db = defaultDb,
  marketId,
  userId,
  body,
}: {
  db?: DB;
  marketId: string;
  userId: string;
  body: string;
}): Promise<{ id: string }> {
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new EmptyCommentError();
  if (trimmed.length > MAX_COMMENT_LEN) throw new CommentTooLongError();
  return repo.insertComment({ db, marketId, userId, body: trimmed });
}

/** Visible comments on a market, with author name + the viewer's vote state. */
export async function getComments({
  db = defaultDb,
  marketId,
  viewerId,
}: {
  db?: DB;
  marketId: string;
  viewerId?: string;
}): Promise<CommentView[]> {
  return repo.listComments({ db, marketId, viewerId });
}

/** Toggles the viewer's upvote on a comment (idempotent, never double-counts). */
export async function toggleCommentUpvote({
  db = defaultDb,
  commentId,
  userId,
}: {
  db?: DB;
  commentId: string;
  userId: string;
}): Promise<{ upvoted: boolean }> {
  // Guard a malformed id (would hit the uuid column → raw 22P02); translate the
  // FK violation a valid-but-unknown id raises on insert → clean domain error.
  if (!isUuid(commentId)) throw new CommentNotFoundError();
  try {
    return await repo.toggleUpvote({ db, commentId, userId });
  } catch (e) {
    if (isForeignKeyViolation(e)) throw new CommentNotFoundError();
    throw e;
  }
}

/** Hides a comment (admin moderation). */
export async function hideComment({
  db = defaultDb,
  commentId,
}: {
  db?: DB;
  commentId: string;
}): Promise<void> {
  return repo.setHidden({ db, commentId, hidden: true });
}
