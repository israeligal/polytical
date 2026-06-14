import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";

// markets/service imports push/service (resolveMarket path); mock the boundary.
vi.mock("@/app/lib/push/service", () => ({ dispatchPush: vi.fn() }));

import { users, markets, outcomes, bets, cardProgress } from "@/app/lib/schema";
import { createGroup, joinGroup } from "./service";
import { createGroupMotion, resolveGroupMotion } from "./motions";
import { getGroupScoreboard, getGroupMotionPicks, listGroupMarkets, getMembership } from "./repo";
import { makePrediction } from "@/app/lib/markets/service";
import {
  listOpenMarkets, getMarketOfTheDay, searchMarkets, getUserPredictions,
} from "@/app/lib/markets/repo";
import { getSeasonCorrect } from "@/app/lib/seasons/repo";
import { NotGroupMemberError, InsufficientGroupRoleError, AlreadyResolvedError, MarketNotFoundError } from "@/app/lib/errors";

let h: Awaited<ReturnType<typeof createTestDb>>;

async function seedUsers(ids: string[]) {
  await h.db.insert(users).values(ids.map((id) => ({ id, name: id, email: `${id}@x.co` })));
}

/** A normal global market (NULL groupId) with כן/לא outcomes. */
async function seedGlobalMarket(questionHe: string) {
  const [m] = await h.db
    .insert(markets)
    .values({ questionHe, category: "coalition", closeAt: new Date(Date.now() + 86_400_000) })
    .returning({ id: markets.id });
  await h.db.insert(outcomes).values([
    { marketId: m.id, labelHe: "כן", ordinal: 0 },
    { marketId: m.id, labelHe: "לא", ordinal: 1 },
  ]);
  return m.id;
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

test("createGroupMotion: a member creates a live group-scoped market; a non-member can't", async () => {
  await seedUsers(["owner", "stranger"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });

  const { marketId } = await createGroupMotion({
    db: h.db, userId: "owner", groupId: g.id,
    questionHe: "האם תעבור ההצעה?", category: "coalition", closeAt: new Date(Date.now() + 86_400_000),
  });
  const [m] = await h.db.select().from(markets).where(eq(markets.id, marketId));
  expect(m.groupId).toBe(g.id);
  expect(m.status).toBe("open");

  await expect(
    createGroupMotion({ db: h.db, userId: "stranger", groupId: g.id, questionHe: "לא חבר כאן בכלל", category: "coalition", closeAt: new Date(Date.now() + 86_400_000) }),
  ).rejects.toBeInstanceOf(NotGroupMemberError);
});

test("feed isolation: group motions never appear in global market reads", async () => {
  await seedUsers(["owner"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  const globalId = await seedGlobalMarket("שאלה גלובלית ייחודית זזזז");
  const { marketId: groupMid } = await createGroupMotion({
    db: h.db, userId: "owner", groupId: g.id,
    questionHe: "שאלה קבוצתית ייחודית זזזז", category: "coalition", closeAt: new Date(Date.now() + 86_400_000),
  });

  const open = await listOpenMarkets({ db: h.db });
  expect(open.map((m) => m.id)).toContain(globalId);
  expect(open.map((m) => m.id)).not.toContain(groupMid);

  const motd = await getMarketOfTheDay({ db: h.db });
  expect(motd?.id).not.toBe(groupMid); // never the group one

  // Give both a shared searchable token (bypassing Hebrew normalization noise),
  // then confirm search returns the global one and excludes the group motion.
  await h.db.update(markets).set({ searchText: "zzzneedle" }).where(eq(markets.id, globalId));
  await h.db.update(markets).set({ searchText: "zzzneedle" }).where(eq(markets.id, groupMid));
  const found = await searchMarkets({ db: h.db, q: "zzzneedle" });
  expect(found.map((m) => m.id)).toContain(globalId);
  expect(found.map((m) => m.id)).not.toContain(groupMid);

  const groupFeed = await listGroupMarkets({ db: h.db, groupId: g.id });
  expect(groupFeed.map((m) => m.id)).toEqual([groupMid]); // ONLY the group motion
});

test("makePrediction: non-members are rejected on a group motion", async () => {
  await seedUsers(["owner", "member", "stranger"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, userId: "member", inviteCode: g.inviteCode });
  const { marketId } = await createGroupMotion({
    db: h.db, userId: "owner", groupId: g.id, questionHe: "האם זה יקרה השבוע?", category: "coalition", closeAt: new Date(Date.now() + 86_400_000),
  });
  const [yes] = await outcomeIds(marketId);

  await expect(
    makePrediction({ db: h.db, userId: "stranger", marketId, outcomeId: yes }),
  ).rejects.toBeInstanceOf(NotGroupMemberError);

  // a member can predict
  await makePrediction({ db: h.db, userId: "member", marketId, outcomeId: yes });
  const rows = await h.db.select().from(bets).where(and(eq(bets.marketId, marketId), eq(bets.userId, "member")));
  expect(rows).toHaveLength(1);
});

test("reveal gate: friends' picks hidden until the viewer predicts", async () => {
  await seedUsers(["owner", "member"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, userId: "member", inviteCode: g.inviteCode });
  const { marketId } = await createGroupMotion({
    db: h.db, userId: "owner", groupId: g.id, questionHe: "האם זה יקרה השבוע?", category: "coalition", closeAt: new Date(Date.now() + 86_400_000),
  });
  const [yes, no] = await outcomeIds(marketId);
  await makePrediction({ db: h.db, userId: "owner", marketId, outcomeId: yes });

  // member hasn't predicted → hidden
  const before = await getGroupMotionPicks({ db: h.db, marketId, viewerId: "member" });
  expect(before.revealed).toBe(false);
  expect(before.picks).toHaveLength(0);

  // member predicts → now revealed, sees both picks
  await makePrediction({ db: h.db, userId: "member", marketId, outcomeId: no });
  const after = await getGroupMotionPicks({ db: h.db, marketId, viewerId: "member" });
  expect(after.revealed).toBe(true);
  expect(after.picks.map((p) => p.userId).sort()).toEqual(["member", "owner"]);
});

test("SANDBOX: resolveGroupMotion bumps group counters ONLY — global stats untouched", async () => {
  await seedUsers(["owner", "right", "wrong"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, userId: "right", inviteCode: g.inviteCode });
  await joinGroup({ db: h.db, userId: "wrong", inviteCode: g.inviteCode });
  const { marketId } = await createGroupMotion({
    db: h.db, userId: "owner", groupId: g.id, questionHe: "האם תקום ממשלה חדשה?", category: "coalition", closeAt: new Date(Date.now() + 86_400_000),
  });
  const [yes, no] = await outcomeIds(marketId);
  await makePrediction({ db: h.db, userId: "right", marketId, outcomeId: yes });
  await makePrediction({ db: h.db, userId: "wrong", marketId, outcomeId: no });

  await resolveGroupMotion({ db: h.db, actorId: "owner", groupId: g.id, marketId, winningOutcomeId: yes });

  // group counters reflect the result
  const right = await getMembership({ db: h.db, groupId: g.id, userId: "right" });
  const wrong = await getMembership({ db: h.db, groupId: g.id, userId: "wrong" });
  expect([right?.groupResolved, right?.groupWins]).toEqual([1, 1]);
  expect([wrong?.groupResolved, wrong?.groupWins]).toEqual([1, 0]);

  const board = await getGroupScoreboard({ db: h.db, groupId: g.id });
  expect(board[0].userId).toBe("right"); // 1 win ranks first
  expect(board.find((e) => e.userId === "right")?.accuracy).toBe(100);

  // GLOBAL stats are untouched — the sandbox invariant
  const all = await h.db.select().from(users);
  for (const u of all) {
    expect(u.totalResolved).toBe(0);
    expect(u.totalWins).toBe(0);
  }
  // no card progress granted by a group resolve
  expect(await h.db.select().from(cardProgress)).toHaveLength(0);
  // seasons ignore group motions (isNull(groupId) filter)
  const seasonCorrect = await getSeasonCorrect({
    db: h.db, userId: "right", startAt: new Date(Date.now() - DAY()), endAt: new Date(Date.now() + DAY()),
  });
  expect(seasonCorrect).toBe(0);
  // global portfolio excludes the group pick
  expect(await getUserPredictions({ db: h.db, userId: "right" })).toHaveLength(0);
});

test("resolveGroupMotion is terminal and permission-gated", async () => {
  await seedUsers(["owner", "member", "stranger"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  await joinGroup({ db: h.db, userId: "member", inviteCode: g.inviteCode });
  const { marketId } = await createGroupMotion({
    db: h.db, userId: "owner", groupId: g.id, questionHe: "האם זה יקרה השבוע?", category: "coalition", closeAt: new Date(Date.now() + 86_400_000),
  });
  const [yes] = await outcomeIds(marketId);

  // a plain member can't resolve
  await expect(
    resolveGroupMotion({ db: h.db, actorId: "member", groupId: g.id, marketId, winningOutcomeId: yes }),
  ).rejects.toBeInstanceOf(InsufficientGroupRoleError);
  // a non-member can't resolve
  await expect(
    resolveGroupMotion({ db: h.db, actorId: "stranger", groupId: g.id, marketId, winningOutcomeId: yes }),
  ).rejects.toBeInstanceOf(NotGroupMemberError);

  await resolveGroupMotion({ db: h.db, actorId: "owner", groupId: g.id, marketId, winningOutcomeId: yes });
  // terminal
  await expect(
    resolveGroupMotion({ db: h.db, actorId: "owner", groupId: g.id, marketId, winningOutcomeId: yes }),
  ).rejects.toBeInstanceOf(AlreadyResolvedError);
});

test("resolveGroupMotion refuses a market that isn't this group's", async () => {
  await seedUsers(["owner"]);
  const g = await createGroup({ db: h.db, userId: "owner", input: { nameHe: "קבוצה" } });
  const globalId = await seedGlobalMarket("שאלה גלובלית אחרת");
  const [yes] = await outcomeIds(globalId);
  await expect(
    resolveGroupMotion({ db: h.db, actorId: "owner", groupId: g.id, marketId: globalId, winningOutcomeId: yes }),
  ).rejects.toBeInstanceOf(MarketNotFoundError);
});

function DAY() {
  return 24 * 60 * 60 * 1000;
}
