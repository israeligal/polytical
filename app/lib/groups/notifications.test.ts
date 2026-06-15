import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";

vi.mock("@/app/lib/push/service", () => ({ dispatchPush: vi.fn() }));

import { users, notifications, outcomes } from "@/app/lib/schema";
import { createGroup, joinGroup } from "./service";
import { createGroupMotion, resolveGroupMotion } from "./motions";
import { makePrediction } from "@/app/lib/markets/service";

let h: Awaited<ReturnType<typeof createTestDb>>;

async function seedUsers(ids: string[]) {
  await h.db.insert(users).values(ids.map((id) => ({ id, name: id, handle: id, email: `${id}@x.co` })));
}
async function notifs(userId: string, type: string) {
  return h.db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, type as never)));
}
async function outcomeIds(marketId: string) {
  const outs = await h.db.select().from(outcomes).where(eq(outcomes.marketId, marketId)).orderBy(outcomes.ordinal);
  return outs.map((o) => o.id);
}

beforeEach(async () => {
  h = await createTestDb();
});
afterEach(async () => {
  await h.close();
});

test("joinGroup notifies existing members, not the joiner", async () => {
  await seedUsers(["owner", "joiner"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "הקואליציה" } });
  await joinGroup({ db: h.db, userId: "joiner", inviteCode: g.inviteCode });

  const ownerN = await notifs("owner", "group_member_joined");
  expect(ownerN).toHaveLength(1);
  expect(ownerN[0].refGroupId).toBe(g.id);
  expect(ownerN[0].bodyHe).toContain("@joiner"); // actor @handle in the body, never the real name
  expect(await notifs("joiner", "group_member_joined")).toHaveLength(0); // not self
});

test("createGroupMotion notifies other members, not the author", async () => {
  await seedUsers(["owner", "member"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "הקואליציה" } });
  await joinGroup({ db: h.db, userId: "member", inviteCode: g.inviteCode });

  const { marketId } = await createGroupMotion({
    db: h.db, userId: "member", groupId: g.id,
    questionHe: "האם זה יקרה השבוע?", category: "coalition", closeAt: new Date(Date.now() + 86_400_000),
  });

  const ownerN = await notifs("owner", "group_motion_posted");
  expect(ownerN).toHaveLength(1);
  expect(ownerN[0].refGroupId).toBe(g.id);
  expect(ownerN[0].refMarketId).toBe(marketId);
  expect(await notifs("member", "group_motion_posted")).toHaveLength(0); // author excluded
});

test("resolveGroupMotion notifies each predictor with their result", async () => {
  await seedUsers(["owner", "right", "wrong"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "הקואליציה" } });
  await joinGroup({ db: h.db, userId: "right", inviteCode: g.inviteCode });
  await joinGroup({ db: h.db, userId: "wrong", inviteCode: g.inviteCode });
  const { marketId } = await createGroupMotion({
    db: h.db, userId: "owner", groupId: g.id,
    questionHe: "האם תקום ממשלה?", category: "coalition", closeAt: new Date(Date.now() + 86_400_000),
  });
  const [yes, no] = await outcomeIds(marketId);
  await makePrediction({ db: h.db, userId: "right", marketId, outcomeId: yes });
  await makePrediction({ db: h.db, userId: "wrong", marketId, outcomeId: no });

  await resolveGroupMotion({ db: h.db, actorId: "owner", groupId: g.id, marketId, winningOutcomeId: yes });

  const rightN = await notifs("right", "group_motion_resolved");
  const wrongN = await notifs("wrong", "group_motion_resolved");
  expect(rightN).toHaveLength(1);
  expect(rightN[0].titleHe).toContain("צדקת"); // won copy
  expect(rightN[0].refGroupId).toBe(g.id);
  expect(wrongN).toHaveLength(1);
  expect(wrongN[0].titleHe).not.toContain("צדקת"); // lost copy
});
