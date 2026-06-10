import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";

// Mock at the push-service boundary: push fires AFTER commit, fire-and-forget.
// Asserting the call (and that a rejection cannot break settlement) IS the
// observable behavior for this boundary.
vi.mock("@/app/lib/push/service", () => ({ dispatchPush: vi.fn() }));
import { dispatchPush } from "@/app/lib/push/service";
const dispatchPushMock = vi.mocked(dispatchPush);
import {
  users,
  markets,
  outcomes,
  bets,
  comments,
  notifications,
  politicians,
  marketPoliticians,
  cardProgress,
  cardCollections,
} from "@/app/lib/schema";
import {
  AlreadyResolvedError,
  MarketClosedError,
  MarketNotFoundError,
  InvalidOutcomeError,
} from "@/app/lib/errors";
import {
  makePrediction,
  resolveMarket,
  voidMarket,
  deleteMarket,
  notifyClosingSoonMarkets,
} from "./service";
import { markClosingSoonNotified } from "./repo";

let h: Awaited<ReturnType<typeof createTestDb>>;
const UID = "u1";

// Identifiers filled by seed(): one open market with YES/NO, plus a stray
// outcome belonging to a DIFFERENT market (for the cross-market guard).
let marketId: string;
let yesId: string;
let noId: string;
let otherOutcomeId: string;

/** Seeds a user and an open market (closeAt in the future) with YES/NO, and
 *  a second market whose outcome is used to probe the InvalidOutcomeError path. */
async function seed(opts: { status?: "open" | "closed"; closeAt?: Date } = {}) {
  await h.db.insert(users).values({ id: UID, name: "Gal", email: "g@x.co" });

  const [m] = await h.db
    .insert(markets)
    .values({
      questionHe: "האם הקואליציה תשרוד?",
      category: "coalition",
      status: opts.status ?? "open",
      closeAt: opts.closeAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    .returning({ id: markets.id });
  marketId = m.id;

  const outs = await h.db
    .insert(outcomes)
    .values([
      { marketId, labelHe: "כן", ordinal: 0 },
      { marketId, labelHe: "לא", ordinal: 1 },
    ])
    .returning({ id: outcomes.id });
  yesId = outs[0].id;
  noId = outs[1].id;

  const [other] = await h.db
    .insert(markets)
    .values({
      questionHe: "שוק אחר",
      category: "elections",
      status: "open",
      closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    .returning({ id: markets.id });
  const [o] = await h.db
    .insert(outcomes)
    .values({ marketId: other.id, labelHe: "כן", ordinal: 0 })
    .returning({ id: outcomes.id });
  otherOutcomeId = o.id;
}

beforeEach(async () => {
  h = await createTestDb();
  dispatchPushMock.mockReset();
  dispatchPushMock.mockResolvedValue(undefined);
});
afterEach(async () => {
  await h.close();
});

// ---------------------------------------------------------------------------
// makePrediction: open-only guard, cross-market guard, one-per-market upsert
// ---------------------------------------------------------------------------

test("makePrediction records a prediction and returns a predictionId", async () => {
  await seed();
  const { predictionId } = await makePrediction({ db: h.db, userId: UID, marketId, outcomeId: yesId });

  expect(predictionId).toBeTruthy();
  const rows = await h.db.select().from(bets).where(eq(bets.marketId, marketId));
  expect(rows.length).toBe(1);
  expect(rows[0].id).toBe(predictionId);
  expect(rows[0].outcomeId).toBe(yesId);
  expect(rows[0].userId).toBe(UID);
});

test("makePrediction on a closed market throws MarketClosedError and writes nothing", async () => {
  await seed({ status: "closed" });
  await expect(
    makePrediction({ db: h.db, userId: UID, marketId, outcomeId: yesId }),
  ).rejects.toBeInstanceOf(MarketClosedError);
  expect((await h.db.select().from(bets)).length).toBe(0);
});

test("makePrediction on a market past closeAt throws MarketClosedError", async () => {
  await seed({ status: "open", closeAt: new Date(Date.now() - 1000) });
  await expect(
    makePrediction({ db: h.db, userId: UID, marketId, outcomeId: yesId }),
  ).rejects.toBeInstanceOf(MarketClosedError);
  expect((await h.db.select().from(bets)).length).toBe(0);
});

test("makePrediction on an outcome from another market throws InvalidOutcomeError", async () => {
  await seed();
  await expect(
    makePrediction({ db: h.db, userId: UID, marketId, outcomeId: otherOutcomeId }),
  ).rejects.toBeInstanceOf(InvalidOutcomeError);
  expect((await h.db.select().from(bets)).length).toBe(0);
});

test("makePrediction upserts: re-predicting changes the pick, still one row", async () => {
  await seed();

  // First prediction: YES
  const { predictionId: firstId } = await makePrediction({ db: h.db, userId: UID, marketId, outcomeId: yesId });

  // Change to NO
  const { predictionId: secondId } = await makePrediction({ db: h.db, userId: UID, marketId, outcomeId: noId });

  // Still exactly one row per (userId, marketId)
  const rows = await h.db.select().from(bets).where(eq(bets.marketId, marketId));
  expect(rows.length).toBe(1);
  // The returned id is the same row (upsert, not insert)
  expect(firstId).toBe(secondId);
  // Pick updated to NO
  expect(rows[0].outcomeId).toBe(noId);
});

// ---------------------------------------------------------------------------
// resolveMarket: stat bumps, terminal guard, notifications, push dispatch
// ---------------------------------------------------------------------------

/** Seeds a user directly (no coins/ledger). */
async function seedUser(id: string) {
  await h.db.insert(users).values({ id, name: id, email: `${id}@x.co` });
}

/** Seeds an open market with YES/NO outcomes and returns its ids. */
async function seedMarket() {
  const [m] = await h.db
    .insert(markets)
    .values({
      questionHe: "האם הקואליציה תשרוד?",
      category: "coalition",
      status: "open",
      closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    .returning({ id: markets.id });
  const outs = await h.db
    .insert(outcomes)
    .values([
      { marketId: m.id, labelHe: "כן", ordinal: 0 },
      { marketId: m.id, labelHe: "לא", ordinal: 1 },
    ])
    .returning({ id: outcomes.id });
  return { marketId: m.id, yesId: outs[0].id, noId: outs[1].id };
}

/** A user's accuracy stat columns after a resolve. */
async function userStats(id: string) {
  const [u] = await h.db.select().from(users).where(eq(users.id, id));
  return { totalResolved: u.totalResolved, totalWins: u.totalWins };
}

test("resolveMarket bumps the winner's stats: totalResolved 1, totalWins 1", async () => {
  await seedUser("winner");
  await seedUser("loser");
  const { marketId: mId, yesId, noId } = await seedMarket();

  await makePrediction({ db: h.db, userId: "winner", marketId: mId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "loser", marketId: mId, outcomeId: noId });

  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  expect(await userStats("winner")).toEqual({ totalResolved: 1, totalWins: 1 });
});

test("resolveMarket bumps a losing predictor: totalResolved 1, totalWins 0", async () => {
  await seedUser("winner");
  await seedUser("loser");
  const { marketId: mId, yesId, noId } = await seedMarket();

  await makePrediction({ db: h.db, userId: "winner", marketId: mId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "loser", marketId: mId, outcomeId: noId });

  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  expect(await userStats("loser")).toEqual({ totalResolved: 1, totalWins: 0 });
});

test("resolveMarket marks the market resolved with the winning outcome and resolvedAt", async () => {
  await seedUser("a");
  const { marketId: mId, yesId } = await seedMarket();
  await makePrediction({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId });

  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  const [mkt] = await h.db.select().from(markets).where(eq(markets.id, mId));
  expect(mkt.status).toBe("resolved");
  expect(mkt.resolvedOutcomeId).toBe(yesId);
  expect(mkt.resolvedAt).not.toBeNull();
});

test("resolveMarket on an already-resolved market throws AlreadyResolvedError", async () => {
  await seedUser("a");
  const { marketId: mId, yesId, noId } = await seedMarket();
  await makePrediction({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId });
  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  await expect(
    resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: noId }),
  ).rejects.toBeInstanceOf(AlreadyResolvedError);
});

test("resolveMarket fires dispatchPush once after commit with the winner's bet_won event", async () => {
  await seedUser("winner");
  await seedUser("loser");
  const { marketId: mId, yesId, noId } = await seedMarket();

  await makePrediction({ db: h.db, userId: "winner", marketId: mId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "loser", marketId: mId, outcomeId: noId });

  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  // Exactly one dispatch, post-commit, carrying the event batch built in the tx.
  expect(dispatchPushMock).toHaveBeenCalledTimes(1);
  const { events } = dispatchPushMock.mock.calls[0][0];

  // The winner's bet_won event is present with the right shape.
  const won = events.find((e: { type: string; userId: string }) => e.type === "bet_won" && e.userId === "winner");
  expect(won).toMatchObject({
    type: "bet_won",
    userId: "winner",
    marketId: mId,
  });
  // No payout field — predictions are stake-less.
  expect(won).not.toHaveProperty("payout");

  // market_resolved is emitted for every participant (winner + loser).
  const resolvedFor = events
    .filter((e: { type: string; userId: string }) => e.type === "market_resolved")
    .map((e: { type: string; userId: string }) => e.userId)
    .sort();
  expect(resolvedFor).toEqual(["loser", "winner"]);
});

test("resolveMarket settles correctly even when dispatchPush rejects (push cannot break settlement)", async () => {
  dispatchPushMock.mockRejectedValueOnce(new Error("push service down"));

  await seedUser("winner");
  await seedUser("loser");
  const { marketId: mId, yesId, noId } = await seedMarket();
  await makePrediction({ db: h.db, userId: "winner", marketId: mId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "loser", marketId: mId, outcomeId: noId });

  // Must NOT throw — the post-commit push failure is swallowed.
  await expect(
    resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId }),
  ).resolves.toBeUndefined();
  expect(dispatchPushMock).toHaveBeenCalledTimes(1);

  // Stats are fully committed despite the push failure.
  expect(await userStats("winner")).toEqual({ totalResolved: 1, totalWins: 1 });
  expect(await userStats("loser")).toEqual({ totalResolved: 1, totalWins: 0 });

  const [mkt] = await h.db.select().from(markets).where(eq(markets.id, mId));
  expect(mkt.status).toBe("resolved");
  expect(mkt.resolvedOutcomeId).toBe(yesId);
});

// ---------------------------------------------------------------------------
// voidMarket: no stat change, market_voided notification, push dispatch
// ---------------------------------------------------------------------------

test("voidMarket marks the market voided without changing accuracy stats", async () => {
  await seedUser("a");
  await seedUser("b");
  const { marketId: mId, yesId, noId } = await seedMarket();

  await makePrediction({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "b", marketId: mId, outcomeId: noId });

  await voidMarket({ db: h.db, marketId: mId });

  const [mkt] = await h.db.select().from(markets).where(eq(markets.id, mId));
  expect(mkt.status).toBe("voided");

  // Stats untouched — no coins, no refund, no accuracy change.
  expect(await userStats("a")).toEqual({ totalResolved: 0, totalWins: 0 });
  expect(await userStats("b")).toEqual({ totalResolved: 0, totalWins: 0 });
});

test("voidMarket dispatches a market_voided push to each predictor after commit", async () => {
  await seedUser("a");
  await seedUser("b");
  const { marketId: mId, yesId, noId } = await seedMarket();

  await makePrediction({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "b", marketId: mId, outcomeId: noId });

  await voidMarket({ db: h.db, marketId: mId });

  // In-app market_voided rows for both predictors, linked to the market.
  const voided = (await h.db.select().from(notifications)).filter((n) => n.type === "market_voided");
  expect(voided.map((n) => n.userId).sort()).toEqual(["a", "b"]);
  expect(voided.every((n) => n.refMarketId === mId)).toBe(true);

  // One post-commit dispatch carrying both market_voided events.
  expect(dispatchPushMock).toHaveBeenCalledTimes(1);
  const { events } = dispatchPushMock.mock.calls[0][0];
  expect(
    events
      .filter((e: { type: string; userId: string }) => e.type === "market_voided")
      .map((e: { type: string; userId: string }) => e.userId)
      .sort(),
  ).toEqual(["a", "b"]);
});

test("voidMarket on an already-resolved market throws AlreadyResolvedError", async () => {
  await seedUser("a");
  const { marketId: mId, yesId } = await seedMarket();
  await makePrediction({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId });
  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  await expect(voidMarket({ db: h.db, marketId: mId })).rejects.toBeInstanceOf(
    AlreadyResolvedError,
  );
});

// ---------------------------------------------------------------------------
// Card unlock by accuracy (resolveMarket)
// ---------------------------------------------------------------------------

/** Seeds a politician with roleHe "חבר הכנסת" (common → threshold 2), links them
 *  to a market, and returns the personId. The caller seeds predictions before
 *  calling resolveMarket. */
async function seedPoliticianLinkedToMarket(mId: string) {
  const personId = 9001;
  // sourceDataset / sourceUrl / fetchedAt are required (NOT NULL) in the schema.
  await h.db.insert(politicians).values({
    personId,
    nameHe: "חבר כנסת בדיקה",
    roleHe: "חבר הכנסת",
    sourceDataset: "test",
    sourceUrl: "https://test.example",
    fetchedAt: new Date(),
    searchName: "חבר כנסת בדיקה",
  });
  await h.db.insert(marketPoliticians).values({ marketId: mId, personId });
  return personId;
}

test("resolveMarket grants a card after 2 correct predictions on a common-threshold politician", async () => {
  // common rarity requires 2 correct calls. Two markets, each featuring the same
  // MK. One predictor who is correct on both → card granted after the 2nd resolve.
  await seedUser("predictor");

  const [m1] = await h.db
    .insert(markets)
    .values({ questionHe: "שאלה 1", category: "coalition", status: "open", closeAt: new Date(Date.now() + 86400_000) })
    .returning({ id: markets.id });
  const [out1] = await h.db
    .insert(outcomes)
    .values({ marketId: m1.id, labelHe: "כן", ordinal: 0 })
    .returning({ id: outcomes.id });

  const [m2] = await h.db
    .insert(markets)
    .values({ questionHe: "שאלה 2", category: "coalition", status: "open", closeAt: new Date(Date.now() + 86400_000) })
    .returning({ id: markets.id });
  const [out2] = await h.db
    .insert(outcomes)
    .values({ marketId: m2.id, labelHe: "כן", ordinal: 0 })
    .returning({ id: outcomes.id });

  // Link the same politician to both markets.
  const personId = await seedPoliticianLinkedToMarket(m1.id);
  await h.db.insert(marketPoliticians).values({ marketId: m2.id, personId });

  // Predictor picks the winning outcome on both markets.
  await makePrediction({ db: h.db, userId: "predictor", marketId: m1.id, outcomeId: out1.id });
  await makePrediction({ db: h.db, userId: "predictor", marketId: m2.id, outcomeId: out2.id });

  // After 1st resolve: progress = 1, card NOT yet granted (threshold is 2).
  await resolveMarket({ db: h.db, marketId: m1.id, winningOutcomeId: out1.id });

  const [prog1] = await h.db
    .select()
    .from(cardProgress)
    .where(and(eq(cardProgress.userId, "predictor"), eq(cardProgress.personId, personId)));
  expect(prog1?.correctCount).toBe(1);
  const collections1 = await h.db
    .select()
    .from(cardCollections)
    .where(and(eq(cardCollections.userId, "predictor"), eq(cardCollections.personId, personId)));
  expect(collections1.length).toBe(0); // not yet

  // After 2nd resolve: progress = 2 (≥ threshold 2), card IS granted.
  await resolveMarket({ db: h.db, marketId: m2.id, winningOutcomeId: out2.id });

  const [prog2] = await h.db
    .select()
    .from(cardProgress)
    .where(and(eq(cardProgress.userId, "predictor"), eq(cardProgress.personId, personId)));
  expect(prog2?.correctCount).toBe(2);

  const collections2 = await h.db
    .select()
    .from(cardCollections)
    .where(and(eq(cardCollections.userId, "predictor"), eq(cardCollections.personId, personId)));
  expect(collections2.length).toBe(1); // card granted!
});

test("resolveMarket does NOT grant a card to a predictor who picked the wrong outcome", async () => {
  await seedUser("loser");

  const [m] = await h.db
    .insert(markets)
    .values({ questionHe: "שאלה", category: "coalition", status: "open", closeAt: new Date(Date.now() + 86400_000) })
    .returning({ id: markets.id });
  const outs = await h.db
    .insert(outcomes)
    .values([
      { marketId: m.id, labelHe: "כן", ordinal: 0 },
      { marketId: m.id, labelHe: "לא", ordinal: 1 },
    ])
    .returning({ id: outcomes.id });

  const personId = await seedPoliticianLinkedToMarket(m.id);
  // Loser picks NO; YES wins.
  await makePrediction({ db: h.db, userId: "loser", marketId: m.id, outcomeId: outs[1].id });

  await resolveMarket({ db: h.db, marketId: m.id, winningOutcomeId: outs[0].id });

  const progress = await h.db
    .select()
    .from(cardProgress)
    .where(and(eq(cardProgress.userId, "loser"), eq(cardProgress.personId, personId)));
  expect(progress.length).toBe(0); // no progress bump on a wrong pick

  const collections = await h.db
    .select()
    .from(cardCollections)
    .where(and(eq(cardCollections.userId, "loser"), eq(cardCollections.personId, personId)));
  expect(collections.length).toBe(0);
});

test("card unlock is idempotent: a third correct prediction does not grant a second card row", async () => {
  // Predictor already at 2/2 (card owned). A third market resolve should not
  // insert a duplicate ownership row (the unique index + onConflictDoNothing guard).
  await seedUser("predictor");

  async function seedOpenMarket() {
    const [m] = await h.db
      .insert(markets)
      .values({ questionHe: "שאלה", category: "coalition", status: "open", closeAt: new Date(Date.now() + 86400_000) })
      .returning({ id: markets.id });
    const [o] = await h.db
      .insert(outcomes)
      .values({ marketId: m.id, labelHe: "כן", ordinal: 0 })
      .returning({ id: outcomes.id });
    return { marketId: m.id, outcomeId: o.id };
  }

  const personId = 9002;
  await h.db.insert(politicians).values({
    personId,
    nameHe: "חברת כנסת בדיקה",
    roleHe: "חברת כנסת",
    sourceDataset: "test",
    sourceUrl: "https://test.example",
    fetchedAt: new Date(),
    searchName: "חברת כנסת בדיקה",
  });

  // Three markets, all featuring the same MK.
  const m1 = await seedOpenMarket();
  const m2 = await seedOpenMarket();
  const m3 = await seedOpenMarket();
  for (const { marketId: mId } of [m1, m2, m3])
    await h.db.insert(marketPoliticians).values({ marketId: mId, personId });

  await makePrediction({ db: h.db, userId: "predictor", marketId: m1.marketId, outcomeId: m1.outcomeId });
  await makePrediction({ db: h.db, userId: "predictor", marketId: m2.marketId, outcomeId: m2.outcomeId });
  await makePrediction({ db: h.db, userId: "predictor", marketId: m3.marketId, outcomeId: m3.outcomeId });

  await resolveMarket({ db: h.db, marketId: m1.marketId, winningOutcomeId: m1.outcomeId });
  await resolveMarket({ db: h.db, marketId: m2.marketId, winningOutcomeId: m2.outcomeId });
  await resolveMarket({ db: h.db, marketId: m3.marketId, winningOutcomeId: m3.outcomeId });

  // Still exactly one ownership row, not three.
  const collections = await h.db
    .select()
    .from(cardCollections)
    .where(and(eq(cardCollections.userId, "predictor"), eq(cardCollections.personId, personId)));
  expect(collections.length).toBe(1);
});

// ---------------------------------------------------------------------------
// notifyClosingSoonMarkets: idempotent claim, TOCTOU guard
// ---------------------------------------------------------------------------

/** Seeds a market with an explicit closeAt + YES/NO outcomes. */
async function seedMarketClosingAt(closeAt: Date, status: "open" | "closed" = "open") {
  const [m] = await h.db
    .insert(markets)
    .values({ questionHe: "סוגרים בקרוב?", category: "coalition", status, closeAt })
    .returning({ id: markets.id });
  const outs = await h.db
    .insert(outcomes)
    .values([
      { marketId: m.id, labelHe: "כן", ordinal: 0 },
      { marketId: m.id, labelHe: "לא", ordinal: 1 },
    ])
    .returning({ id: outcomes.id });
  return { marketId: m.id, yesId: outs[0].id };
}

test("notifyClosingSoonMarkets notifies predictors of a soon-closing market once and stamps it", async () => {
  await seedUser("a");
  await seedUser("b");
  const soon = await seedMarketClosingAt(new Date(Date.now() + 2 * 3600 * 1000)); // due (within 24h)
  const later = await seedMarketClosingAt(new Date(Date.now() + 5 * 24 * 3600 * 1000)); // not due

  await makePrediction({ db: h.db, userId: "a", marketId: soon.marketId, outcomeId: soon.yesId });
  await makePrediction({ db: h.db, userId: "b", marketId: soon.marketId, outcomeId: soon.yesId });
  // User "a" also has a pick on the later market; it must NOT get a closing-soon notice.
  await makePrediction({ db: h.db, userId: "a", marketId: later.marketId, outcomeId: later.yesId });

  const { notified } = await notifyClosingSoonMarkets({ db: h.db });
  expect(notified).toBe(1); // one market, not one-per-predictor

  // In-app closing-soon notice for each distinct predictor of the SOON market only.
  const cs = (await h.db.select().from(notifications)).filter((n) => n.type === "market_closing_soon");
  expect(cs.map((n) => n.userId).sort()).toEqual(["a", "b"]);
  expect(cs.every((n) => n.refMarketId === soon.marketId)).toBe(true);

  // The soon market is stamped; the later one is untouched.
  const [soonRow] = await h.db.select().from(markets).where(eq(markets.id, soon.marketId));
  const [laterRow] = await h.db.select().from(markets).where(eq(markets.id, later.marketId));
  expect(soonRow.closingSoonNotifiedAt).not.toBeNull();
  expect(laterRow.closingSoonNotifiedAt).toBeNull();

  // One post-commit push dispatch (for the soon market).
  expect(dispatchPushMock).toHaveBeenCalledTimes(1);
});

test("notifyClosingSoonMarkets is idempotent: a second sweep notifies nobody", async () => {
  await seedUser("a");
  const soon = await seedMarketClosingAt(new Date(Date.now() + 2 * 3600 * 1000));
  await makePrediction({ db: h.db, userId: "a", marketId: soon.marketId, outcomeId: soon.yesId });

  expect((await notifyClosingSoonMarkets({ db: h.db })).notified).toBe(1);
  dispatchPushMock.mockClear();
  expect((await notifyClosingSoonMarkets({ db: h.db })).notified).toBe(0);
  expect(dispatchPushMock).not.toHaveBeenCalled();

  // Still exactly one closing-soon notice — no duplicate on the re-sweep.
  const cs = (await h.db.select().from(notifications)).filter((n) => n.type === "market_closing_soon");
  expect(cs.length).toBe(1);
});

test("notifyClosingSoonMarkets ignores markets past closeAt or not open", async () => {
  await seedUser("a");
  const past = await seedMarketClosingAt(new Date(Date.now() - 1000)); // open but already past close
  const closed = await seedMarketClosingAt(new Date(Date.now() + 2 * 3600 * 1000), "closed"); // not open
  // Insert predictions directly (makePrediction would reject a past/closed market).
  await h.db.insert(bets).values({ userId: "a", marketId: past.marketId, outcomeId: past.yesId });
  await h.db.insert(bets).values({ userId: "a", marketId: closed.marketId, outcomeId: closed.yesId });

  expect((await notifyClosingSoonMarkets({ db: h.db })).notified).toBe(0);
  expect((await h.db.select().from(notifications)).length).toBe(0);
});

test("markClosingSoonNotified won't claim a market that stopped being open (TOCTOU guard)", async () => {
  const m = await seedMarketClosingAt(new Date(Date.now() + 2 * 3600 * 1000)); // open + due
  // Simulate the market resolving in the gap between the cron's (unlocked) list
  // read and its per-market claim — the claim must NOT stamp/notify it.
  await h.db.update(markets).set({ status: "resolved" }).where(eq(markets.id, m.marketId));

  const won = await h.db.transaction((tx) =>
    markClosingSoonNotified({ tx, marketId: m.marketId, now: new Date() }),
  );
  expect(won).toBe(false);

  const [row] = await h.db.select().from(markets).where(eq(markets.id, m.marketId));
  expect(row.closingSoonNotifiedAt).toBeNull(); // never stamped
});

// ---------------------------------------------------------------------------
// Review-flagged coverage: multi-politician unlock, pick-change, void/zero edges
// ---------------------------------------------------------------------------

test("resolveMarket advances card progress for EVERY featured politician independently", async () => {
  // One market featuring a common MK (threshold 2) AND a minister (sapphire/uncommon,
  // threshold 3 under the stature ladder). 2 correct calls unlock the MK but not the minister.
  await seedUser("multi");
  const m1 = await seedMarket();
  const commonId = await seedPoliticianLinkedToMarket(m1.marketId); // 9001, "חבר הכנסת" → common (2)
  const ministerId = 9002;
  await h.db.insert(politicians).values({
    personId: ministerId, nameHe: "שר האוצר בדיקה", roleHe: "שר האוצר",
    sourceDataset: "test", sourceUrl: "https://test.example", fetchedAt: new Date(),
    searchName: "שר האוצר בדיקה",
  });
  await h.db.insert(marketPoliticians).values({ marketId: m1.marketId, personId: ministerId });

  await makePrediction({ db: h.db, userId: "multi", marketId: m1.marketId, outcomeId: m1.yesId });
  await resolveMarket({ db: h.db, marketId: m1.marketId, winningOutcomeId: m1.yesId });

  // A second market featuring the SAME two politicians; correct again.
  const m2 = await seedMarket();
  await h.db.insert(marketPoliticians).values([
    { marketId: m2.marketId, personId: commonId },
    { marketId: m2.marketId, personId: ministerId },
  ]);
  await makePrediction({ db: h.db, userId: "multi", marketId: m2.marketId, outcomeId: m2.yesId });
  await resolveMarket({ db: h.db, marketId: m2.marketId, winningOutcomeId: m2.yesId });

  // Common MK: 2 correct ≥ 2 → card granted. Minister: 2 correct < 10 → not granted.
  const owned = await h.db.select().from(cardCollections).where(eq(cardCollections.userId, "multi"));
  const ownedIds = owned.map((o) => o.personId);
  expect(ownedIds).toContain(commonId);
  expect(ownedIds).not.toContain(ministerId);
});

test("changing a prediction to a losing outcome before resolve tallies the user as wrong", async () => {
  await seedUser("flipper");
  const { marketId: mId, yesId, noId } = await seedMarket();
  await makePrediction({ db: h.db, userId: "flipper", marketId: mId, outcomeId: yesId }); // initially the winner
  await makePrediction({ db: h.db, userId: "flipper", marketId: mId, outcomeId: noId });  // changes to the loser
  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });
  expect(await userStats("flipper")).toEqual({ totalResolved: 1, totalWins: 0 });
});

test("resolveMarket with zero predictors resolves cleanly and changes no stats", async () => {
  await seedUser("bystander");
  const { marketId: mId, yesId } = await seedMarket();
  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });
  const [row] = await h.db.select().from(markets).where(eq(markets.id, mId));
  expect(row.status).toBe("resolved");
  expect(row.resolvedOutcomeId).toBe(yesId);
  expect(await userStats("bystander")).toEqual({ totalResolved: 0, totalWins: 0 });
});

test("resolveMarket on a VOIDED market throws AlreadyResolvedError (terminal)", async () => {
  const { marketId: mId, yesId } = await seedMarket();
  await voidMarket({ db: h.db, marketId: mId });
  await expect(
    resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId }),
  ).rejects.toBeInstanceOf(AlreadyResolvedError);
});

test("voidMarket on an already-voided market throws AlreadyResolvedError (terminal)", async () => {
  const { marketId: mId } = await seedMarket();
  await voidMarket({ db: h.db, marketId: mId });
  await expect(voidMarket({ db: h.db, marketId: mId })).rejects.toBeInstanceOf(AlreadyResolvedError);
});

// ---------------------------------------------------------------------------
// deleteMarket: hard removal — cascades, predictor notice, resolved guard
// ---------------------------------------------------------------------------

test("deleteMarket removes the market and cascades outcomes, predictions and comments", async () => {
  await seedUser("a");
  const { marketId: mId, yesId } = await seedMarket();
  await makePrediction({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId });
  await h.db.insert(comments).values({ marketId: mId, userId: "a", body: "תגובה" });

  await deleteMarket({ db: h.db, marketId: mId });

  expect((await h.db.select().from(markets).where(eq(markets.id, mId))).length).toBe(0);
  expect((await h.db.select().from(outcomes).where(eq(outcomes.marketId, mId))).length).toBe(0);
  expect((await h.db.select().from(bets).where(eq(bets.marketId, mId))).length).toBe(0);
  expect((await h.db.select().from(comments).where(eq(comments.marketId, mId))).length).toBe(0);
});

test("deleteMarket notifies each predictor (rows survive the delete) and pushes once after commit", async () => {
  await seedUser("a");
  await seedUser("b");
  const { marketId: mId, yesId, noId } = await seedMarket();
  await makePrediction({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "b", marketId: mId, outcomeId: noId });

  await deleteMarket({ db: h.db, marketId: mId });

  // In-app market_voided rows survive (notifications carry no FK to markets).
  const voided = (await h.db.select().from(notifications)).filter((n) => n.type === "market_voided");
  expect(voided.map((n) => n.userId).sort()).toEqual(["a", "b"]);
  expect(voided.every((n) => n.refMarketId === mId)).toBe(true);

  expect(dispatchPushMock).toHaveBeenCalledTimes(1);
  const { events } = dispatchPushMock.mock.calls[0][0];
  expect(
    events
      .filter((e: { type: string; userId: string }) => e.type === "market_voided")
      .map((e: { type: string; userId: string }) => e.userId)
      .sort(),
  ).toEqual(["a", "b"]);
});

test("deleteMarket on a resolved market throws AlreadyResolvedError and deletes nothing", async () => {
  await seedUser("a");
  const { marketId: mId, yesId } = await seedMarket();
  await makePrediction({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId });
  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  await expect(deleteMarket({ db: h.db, marketId: mId })).rejects.toBeInstanceOf(AlreadyResolvedError);
  expect((await h.db.select().from(markets).where(eq(markets.id, mId))).length).toBe(1);
});

test("deleteMarket on an unknown market throws MarketNotFoundError", async () => {
  await expect(
    deleteMarket({ db: h.db, marketId: "00000000-0000-0000-0000-000000000000" }),
  ).rejects.toBeInstanceOf(MarketNotFoundError);
});

test("deleteMarket CAN remove a voided market (cleanup path)", async () => {
  const { marketId: mId } = await seedMarket();
  await voidMarket({ db: h.db, marketId: mId });

  await deleteMarket({ db: h.db, marketId: mId });
  expect((await h.db.select().from(markets).where(eq(markets.id, mId))).length).toBe(0);
});

test("deleteMarket survives a push rejection — the delete is not undone", async () => {
  await seedUser("a");
  const { marketId: mId, yesId } = await seedMarket();
  await makePrediction({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId });
  dispatchPushMock.mockRejectedValueOnce(new Error("push down"));

  await deleteMarket({ db: h.db, marketId: mId });
  expect((await h.db.select().from(markets).where(eq(markets.id, mId))).length).toBe(0);
});
