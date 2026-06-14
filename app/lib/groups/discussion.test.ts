import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";

vi.mock("@/app/lib/push/service", () => ({ dispatchPush: vi.fn() }));

import { users, markets, comments, notifications } from "@/app/lib/schema";
import { createGroup, joinGroup } from "./service";
import { createGroupMotion } from "./motions";
import { postGroupAwareComment, parseMentionHandles } from "./discussion";
import { NotGroupMemberError } from "@/app/lib/errors";

let h: Awaited<ReturnType<typeof createTestDb>>;

async function seedUser(id: string, handle: string) {
  await h.db.insert(users).values({ id, name: id, email: `${id}@x.co`, handle });
}
async function mentions(userId: string) {
  return h.db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, "group_mention")));
}

beforeEach(async () => {
  h = await createTestDb();
});
afterEach(async () => {
  await h.close();
});

test("parseMentionHandles extracts distinct latin + hebrew handles", () => {
  expect(parseMentionHandles("שלום @bob_h ו-@דנה1 ושוב @bob_h")).toEqual(["bob_h", "דנה1"]);
  expect(parseMentionHandles("בלי תיוגים בכלל")).toEqual([]);
});

test("a @-mention on a group motion notifies the mentioned member AND the author, not the commenter", async () => {
  await seedUser("owner", "owner_h");
  await seedUser("cm", "cm_h");
  await seedUser("bob", "bob_h");
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "הקואליציה" } });
  await joinGroup({ db: h.db, userId: "cm", inviteCode: g.inviteCode });
  await joinGroup({ db: h.db, userId: "bob", inviteCode: g.inviteCode });
  const { marketId } = await createGroupMotion({
    db: h.db, userId: "owner", groupId: g.id,
    questionHe: "האם זה יקרה השבוע?", category: "coalition", closeAt: new Date(Date.now() + 86_400_000),
  });

  await postGroupAwareComment({ db: h.db, userId: "cm", actorName: "cm", marketId, body: "מה דעתך @bob_h?" });

  expect(await mentions("bob")).toHaveLength(1); // mentioned
  expect(await mentions("owner")).toHaveLength(1); // motion author
  expect(await mentions("cm")).toHaveLength(0); // the commenter is never self-notified
  // the comment itself was posted
  const c = await h.db.select().from(comments).where(eq(comments.marketId, marketId));
  expect(c).toHaveLength(1);
});

test("non-members cannot comment on a group motion", async () => {
  await seedUser("owner", "owner_h");
  await seedUser("stranger", "stranger_h");
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "הקואליציה" } });
  const { marketId } = await createGroupMotion({
    db: h.db, userId: "owner", groupId: g.id,
    questionHe: "האם זה יקרה השבוע?", category: "coalition", closeAt: new Date(Date.now() + 86_400_000),
  });
  await expect(
    postGroupAwareComment({ db: h.db, userId: "stranger", actorName: "stranger", marketId, body: "היי" }),
  ).rejects.toBeInstanceOf(NotGroupMemberError);
});

test("mentioning a NON-member resolves to nobody", async () => {
  await seedUser("owner", "owner_h");
  await seedUser("cm", "cm_h");
  await seedUser("outsider", "outsider_h");
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "הקואליציה" } });
  await joinGroup({ db: h.db, userId: "cm", inviteCode: g.inviteCode });
  const { marketId } = await createGroupMotion({
    db: h.db, userId: "owner", groupId: g.id,
    questionHe: "האם זה יקרה השבוע?", category: "coalition", closeAt: new Date(Date.now() + 86_400_000),
  });
  await postGroupAwareComment({ db: h.db, userId: "cm", actorName: "cm", marketId, body: "@outsider_h בוא הנה" });
  expect(await mentions("outsider")).toHaveLength(0); // not a member → no mention
  expect(await mentions("owner")).toHaveLength(1); // author still notified
});

test("a comment on a GLOBAL market posts with no group_mention", async () => {
  await seedUser("u", "u_h");
  await seedUser("v", "v_h");
  const [m] = await h.db
    .insert(markets)
    .values({ questionHe: "שאלה גלובלית", category: "coalition", closeAt: new Date(Date.now() + 86_400_000) })
    .returning({ id: markets.id });
  await postGroupAwareComment({ db: h.db, userId: "u", actorName: "u", marketId: m.id, body: "תגובה רגילה @v_h" });
  const c = await h.db.select().from(comments).where(eq(comments.marketId, m.id));
  expect(c).toHaveLength(1);
  expect(await mentions("v")).toHaveLength(0); // global market → no group mentions
});
