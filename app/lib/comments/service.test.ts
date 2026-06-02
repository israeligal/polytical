import { beforeEach, afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, markets, comments, commentVotes } from "@/app/lib/schema";
import { EmptyCommentError, CommentTooLongError } from "@/app/lib/errors";
import { hideComment } from "@/app/lib/comments/service";
import {
  postComment,
  getComments,
  toggleCommentUpvote,
  MAX_COMMENT_LEN,
} from "./service";

let h: Awaited<ReturnType<typeof createTestDb>>;
const UID = "u1";
const UID2 = "u2";
let marketId: string;

/** Seeds two users and one market (comments need neither a balance nor any
 *  particular market status — they're allowed on any market). */
async function seed() {
  await h.db.insert(users).values([
    { id: UID, name: "גל", email: "g@x.co" },
    { id: UID2, name: "דנה", email: "d@x.co" },
  ]);
  const [m] = await h.db
    .insert(markets)
    .values({
      questionHe: "האם הקואליציה תשרוד?",
      category: "coalition",
      status: "open",
      closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    .returning({ id: markets.id });
  marketId = m.id;
}

beforeEach(async () => {
  h = await createTestDb();
  await seed();
});
afterEach(async () => {
  await h.close();
});

test("postComment inserts and the comment appears in getComments with author name", async () => {
  const { id } = await postComment({ db: h.db, marketId, userId: UID, body: "  דעה חמה  " });

  const list = await getComments({ db: h.db, marketId, viewerId: UID });
  expect(list).toHaveLength(1);
  expect(list[0].id).toBe(id);
  expect(list[0].body).toBe("דעה חמה"); // trimmed
  expect(list[0].authorName).toBe("גל");
  expect(list[0].upvotes).toBe(0);
  expect(list[0].mineUpvoted).toBe(false);
});

test("empty and whitespace-only bodies throw EmptyCommentError (nothing inserted)", async () => {
  await expect(postComment({ db: h.db, marketId, userId: UID, body: "" })).rejects.toBeInstanceOf(
    EmptyCommentError,
  );
  await expect(
    postComment({ db: h.db, marketId, userId: UID, body: "    \n\t  " }),
  ).rejects.toBeInstanceOf(EmptyCommentError);

  const rows = await h.db.select().from(comments).where(eq(comments.marketId, marketId));
  expect(rows).toHaveLength(0);
});

test("a 501-char body throws CommentTooLongError; exactly 500 is allowed", async () => {
  await expect(
    postComment({ db: h.db, marketId, userId: UID, body: "x".repeat(MAX_COMMENT_LEN + 1) }),
  ).rejects.toBeInstanceOf(CommentTooLongError);

  const { id } = await postComment({
    db: h.db,
    marketId,
    userId: UID,
    body: "x".repeat(MAX_COMMENT_LEN),
  });
  const [row] = await h.db.select().from(comments).where(eq(comments.id, id));
  expect(row.body).toHaveLength(MAX_COMMENT_LEN);
});

test("hidden comments are excluded from getComments", async () => {
  const { id } = await postComment({ db: h.db, marketId, userId: UID, body: "להסתיר אותי" });
  await postComment({ db: h.db, marketId, userId: UID2, body: "אני נשארת" });

  await hideComment({ db: h.db, commentId: id });

  const list = await getComments({ db: h.db, marketId, viewerId: UID });
  expect(list).toHaveLength(1);
  expect(list[0].body).toBe("אני נשארת");
});

test("toggleCommentUpvote twice by the same user → 1 then 0; at most one vote row", async () => {
  const { id } = await postComment({ db: h.db, marketId, userId: UID, body: "תגובה" });

  const first = await toggleCommentUpvote({ db: h.db, commentId: id, userId: UID2 });
  expect(first.upvoted).toBe(true);
  let [row] = await h.db.select().from(comments).where(eq(comments.id, id));
  expect(row.upvotes).toBe(1);
  let votes = await h.db.select().from(commentVotes).where(eq(commentVotes.commentId, id));
  expect(votes).toHaveLength(1);

  const second = await toggleCommentUpvote({ db: h.db, commentId: id, userId: UID2 });
  expect(second.upvoted).toBe(false);
  [row] = await h.db.select().from(comments).where(eq(comments.id, id));
  expect(row.upvotes).toBe(0);
  votes = await h.db.select().from(commentVotes).where(eq(commentVotes.commentId, id));
  expect(votes).toHaveLength(0);
});

test("two different users upvoting → upvotes 2, and each sees mineUpvoted", async () => {
  const { id } = await postComment({ db: h.db, marketId, userId: UID, body: "תגובה" });

  await toggleCommentUpvote({ db: h.db, commentId: id, userId: UID });
  await toggleCommentUpvote({ db: h.db, commentId: id, userId: UID2 });

  const [row] = await h.db.select().from(comments).where(eq(comments.id, id));
  expect(row.upvotes).toBe(2);

  const asU1 = await getComments({ db: h.db, marketId, viewerId: UID });
  expect(asU1[0].mineUpvoted).toBe(true);
  const asU2 = await getComments({ db: h.db, marketId, viewerId: UID2 });
  expect(asU2[0].mineUpvoted).toBe(true);
});

test("getComments orders by upvotes desc, then recency desc", async () => {
  const a = await postComment({ db: h.db, marketId, userId: UID, body: "ראשון (ישן)" });
  const b = await postComment({ db: h.db, marketId, userId: UID, body: "שני" });
  const c = await postComment({ db: h.db, marketId, userId: UID, body: "שלישי (חדש)" });

  // b gets 2 upvotes, a gets 1, c gets 0. Tie-break (none here) would fall to recency.
  await toggleCommentUpvote({ db: h.db, commentId: b.id, userId: UID });
  await toggleCommentUpvote({ db: h.db, commentId: b.id, userId: UID2 });
  await toggleCommentUpvote({ db: h.db, commentId: a.id, userId: UID });

  const list = await getComments({ db: h.db, marketId, viewerId: UID });
  expect(list.map((x) => x.id)).toEqual([b.id, a.id, c.id]);
});

test("with no viewerId, mineUpvoted is false even for upvoted comments", async () => {
  const { id } = await postComment({ db: h.db, marketId, userId: UID, body: "תגובה" });
  await toggleCommentUpvote({ db: h.db, commentId: id, userId: UID });

  const list = await getComments({ db: h.db, marketId });
  expect(list[0].upvotes).toBe(1);
  expect(list[0].mineUpvoted).toBe(false);
});

test("ties on upvotes are broken by recency desc (newest first)", async () => {
  // Two comments, both zero upvotes → newest first. Pin distinct createdAt
  // values so the ordering is deterministic — two rapid inserts can otherwise
  // share a now() microsecond on in-memory PGlite, making the tiebreak a coin flip.
  const older = await postComment({ db: h.db, marketId, userId: UID, body: "ישן" });
  const newer = await postComment({ db: h.db, marketId, userId: UID, body: "חדש" });
  await h.db.update(comments).set({ createdAt: new Date("2026-01-01T00:00:00Z") }).where(eq(comments.id, older.id));
  await h.db.update(comments).set({ createdAt: new Date("2026-01-01T00:00:01Z") }).where(eq(comments.id, newer.id));

  const list = await getComments({ db: h.db, marketId, viewerId: UID });
  expect(list.map((x) => x.id)).toEqual([newer.id, older.id]);
});
