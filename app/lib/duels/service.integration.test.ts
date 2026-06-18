// Integration tests for the duels service — PGlite, real Drizzle + makePrediction.
// Verifies: createChallenge validates the market (global only); joinDuel records
// a real pick AND idempotent participation; bad token + closed market are rejected.

import { afterEach, beforeEach, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { bets, groups, markets, notifications, outcomes, users } from "@/app/lib/schema";
import { MarketClosedError, MarketNotFoundError, NotDuelableMarketError } from "@/app/lib/errors";
import { createChallenge, joinDuel, notifyDuelSettlements } from "./service";
import { createChallenge as insertChallengeRow, getChallengeByToken, getParticipantCount } from "./repo";

const CHALLENGER = "user-svc-challenger";
const FRIEND = "user-svc-friend";
const FRIEND2 = "user-svc-friend2";

let h: Awaited<ReturnType<typeof createTestDb>>;

async function newMarket(status: "open" | "closed" = "open", groupId?: string) {
  const [m] = await h.db
    .insert(markets)
    .values({
      questionHe: "שאלה",
      category: "elections",
      status,
      closeAt: new Date(Date.now() + (status === "open" ? 7 : -1) * 24 * 3600 * 1000),
      groupId: groupId ?? null,
    })
    .returning({ id: markets.id });
  const [yes] = await h.db.insert(outcomes).values({ marketId: m.id, labelHe: "כן", ordinal: 0 }).returning({ id: outcomes.id });
  const [no] = await h.db.insert(outcomes).values({ marketId: m.id, labelHe: "לא", ordinal: 1 }).returning({ id: outcomes.id });
  return { marketId: m.id, yes: yes.id, no: no.id };
}

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: CHALLENGER, name: "A", email: "a@svc.co", handle: "chal" },
    { id: FRIEND, name: "B", email: "b@svc.co", handle: "friend" },
    { id: FRIEND2, name: "C", email: "c@svc.co", handle: "friend2" },
  ]);
});

afterEach(async () => h.close());

test("createChallenge mints a token for a global market", async () => {
  const { marketId } = await newMarket("open");
  const { token } = await createChallenge({ db: h.db, challengerUserId: CHALLENGER, marketId });
  const view = await getChallengeByToken({ db: h.db, token });
  expect(view?.marketId).toBe(marketId);
});

test("createChallenge rejects a missing market", async () => {
  await expect(
    createChallenge({ db: h.db, challengerUserId: CHALLENGER, marketId: "00000000-0000-0000-0000-000000000000" }),
  ).rejects.toThrow(MarketNotFoundError);
});

test("createChallenge rejects a group motion (sandbox)", async () => {
  const [g] = await h.db
    .insert(groups)
    .values({ slug: "g1", nameHe: "קבוצה", ownerId: CHALLENGER, inviteCode: "inv1" })
    .returning({ id: groups.id });
  const { marketId } = await newMarket("open", g.id);
  await expect(createChallenge({ db: h.db, challengerUserId: CHALLENGER, marketId })).rejects.toThrow(NotDuelableMarketError);
});

test("joinDuel records the pick AND idempotent participation", async () => {
  const { marketId, yes, no } = await newMarket("open");
  const { token } = await createChallenge({ db: h.db, challengerUserId: CHALLENGER, marketId });

  await joinDuel({ db: h.db, token, userId: FRIEND, outcomeId: yes });
  let bet = await h.db.select().from(bets).where(and(eq(bets.userId, FRIEND), eq(bets.marketId, marketId)));
  expect(bet[0]?.outcomeId).toBe(yes);
  expect(await getParticipantCount({ db: h.db, challengeId: (await getChallengeByToken({ db: h.db, token }))!.id })).toBe(1);

  // Re-accept with a changed pick → pick updates, still ONE participant row.
  await joinDuel({ db: h.db, token, userId: FRIEND, outcomeId: no });
  bet = await h.db.select().from(bets).where(and(eq(bets.userId, FRIEND), eq(bets.marketId, marketId)));
  expect(bet).toHaveLength(1);
  expect(bet[0]?.outcomeId).toBe(no);
  expect(await getParticipantCount({ db: h.db, challengeId: (await getChallengeByToken({ db: h.db, token }))!.id })).toBe(1);
});

test("joinDuel rejects a bad token", async () => {
  await expect(joinDuel({ db: h.db, token: "nope", userId: FRIEND, outcomeId: "x" })).rejects.toThrow(MarketNotFoundError);
});

test("createChallenge rejects a closed market (no dead share links)", async () => {
  const { marketId } = await newMarket("closed");
  await expect(createChallenge({ db: h.db, challengerUserId: CHALLENGER, marketId })).rejects.toThrow(MarketClosedError);
});

test("joinDuel on a closed market is rejected and records no participant", async () => {
  const { marketId, yes } = await newMarket("closed");
  // Persist the row directly via the repo — service.createChallenge now status-guards,
  // so we set up the closed-market join scenario without it.
  const c = await insertChallengeRow({ db: h.db, token: "closed-tok", challengerUserId: CHALLENGER, marketId });
  await expect(joinDuel({ db: h.db, token: "closed-tok", userId: FRIEND, outcomeId: yes })).rejects.toThrow(MarketClosedError);
  expect(await getParticipantCount({ db: h.db, challengeId: c.id })).toBe(0);
});

test("notifyDuelSettlements emits a head-to-head result per player (won / tie / lost)", async () => {
  const { marketId, yes, no } = await newMarket("open");
  await h.db.insert(bets).values({ userId: CHALLENGER, marketId, outcomeId: yes }); // challenger: YES (will be correct)
  const { token } = await createChallenge({ db: h.db, challengerUserId: CHALLENGER, marketId });
  await joinDuel({ db: h.db, token, userId: FRIEND, outcomeId: yes }); // correct → tie with the (correct) challenger
  await joinDuel({ db: h.db, token, userId: FRIEND2, outcomeId: no }); // wrong → lost to the correct challenger
  const challengeId = (await getChallengeByToken({ db: h.db, token }))!.id;

  await notifyDuelSettlements({ db: h.db, marketId, winningOutcomeId: yes });

  const rows = await h.db.select().from(notifications).where(eq(notifications.type, "duel_settled"));
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.refChallengeId === challengeId)).toBe(true);
  const title = new Map(rows.map((r) => [r.userId, r.titleHe]));
  expect(title.get(CHALLENGER)).toBe("ניצחת בדו-קרב! 🥊"); // challenger correct → won
  expect(title.get(FRIEND)).toBe("תיקו בדו-קרב 🤝"); // both correct → tie
  expect(title.get(FRIEND2)).toBe("הדו-קרב הוכרע"); // wrong vs a correct challenger → lost
});

test("notifyDuelSettlements is a no-op when the market has no duels", async () => {
  const { marketId, yes } = await newMarket("open");
  await notifyDuelSettlements({ db: h.db, marketId, winningOutcomeId: yes });
  expect(await h.db.select().from(notifications)).toHaveLength(0);
});

test("the challenger joining their own duel is NOT recorded as a participant", async () => {
  const { marketId, yes } = await newMarket("open");
  const { token } = await createChallenge({ db: h.db, challengerUserId: CHALLENGER, marketId });
  await joinDuel({ db: h.db, token, userId: CHALLENGER, outcomeId: yes }); // self-join
  const challengeId = (await getChallengeByToken({ db: h.db, token }))!.id;
  expect(await getParticipantCount({ db: h.db, challengeId })).toBe(0);
});

test("a self-joined challenger gets exactly ONE (non-contradictory) duel_settled", async () => {
  const { marketId, yes } = await newMarket("open");
  await h.db.insert(bets).values({ userId: CHALLENGER, marketId, outcomeId: yes });
  const { token } = await createChallenge({ db: h.db, challengerUserId: CHALLENGER, marketId });
  await joinDuel({ db: h.db, token, userId: CHALLENGER, outcomeId: yes }); // self-join no-ops the participant row
  await notifyDuelSettlements({ db: h.db, marketId, winningOutcomeId: yes });
  const rows = await h.db.select().from(notifications).where(eq(notifications.userId, CHALLENGER));
  expect(rows).toHaveLength(1);
  expect(rows[0].titleHe).toBe("ניצחת בדו-קרב! 🥊"); // the challenger 'won' notice, no duplicate 'tie'
});
