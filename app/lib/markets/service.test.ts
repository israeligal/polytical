import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";

// Mock at the push-service boundary: push fires AFTER commit, fire-and-forget.
// Asserting the call (and that a rejection cannot break settlement) IS the
// observable behavior for this boundary.
vi.mock("@/app/lib/push/service", () => ({ dispatchPush: vi.fn() }));
import { dispatchPush } from "@/app/lib/push/service";
const dispatchPushMock = vi.mocked(dispatchPush);
import { users, markets, outcomes, bets, transactions, notifications } from "@/app/lib/schema";
import { STARTING_STACK, MIN_BET } from "@/app/lib/economy";
import {
  AlreadyResolvedError,
  BelowMinBetError,
  InsufficientFundsError,
  MarketClosedError,
  InvalidOutcomeError,
} from "@/app/lib/errors";
import { applyEntry, grantStartingStack, getBalance } from "@/app/lib/ledger/service";
import { placeBet, resolveMarket, voidMarket, notifyClosingSoonMarkets } from "./service";
import { markClosingSoonNotified } from "./repo";

let h: Awaited<ReturnType<typeof createTestDb>>;
const UID = "u1";

// Identifiers filled by seed(): one open market with YES/NO, plus a stray
// outcome belonging to a DIFFERENT market (for the cross-market guard).
let marketId: string;
let yesId: string;
let noId: string;
let otherOutcomeId: string;

/** Seeds a funded user, an open market (closeAt in the future) with YES/NO, and
 *  a second market whose outcome is used to probe the InvalidOutcomeError path. */
async function seed(opts: { status?: "open" | "closed"; closeAt?: Date } = {}) {
  await h.db.insert(users).values({ id: UID, name: "Gal", email: "g@x.co" });
  await grantStartingStack({ db: h.db, userId: UID }); // → balance 1000

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

test("placeBet debits via applyEntry, bumps the pool, and writes bet + tx rows", async () => {
  await seed();
  const { betId } = await placeBet({ db: h.db, userId: UID, marketId, outcomeId: yesId, amount: 300 });

  // Balance debited by the stake.
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK - 300);

  // YES pool reflects the stake; NO untouched.
  const [yes] = await h.db.select().from(outcomes).where(eq(outcomes.id, yesId));
  const [no] = await h.db.select().from(outcomes).where(eq(outcomes.id, noId));
  expect(yes.poolTotal).toBe(300);
  expect(no.poolTotal).toBe(0);

  // Exactly one open bet row, on YES, for the staked amount.
  const betRows = await h.db.select().from(bets).where(eq(bets.marketId, marketId));
  expect(betRows.length).toBe(1);
  expect(betRows[0].id).toBe(betId);
  expect(betRows[0].outcomeId).toBe(yesId);
  expect(betRows[0].amount).toBe(300);
  expect(betRows[0].status).toBe("open");

  // One ledger row of type bet, amount −300, linked to this market + bet.
  const txRows = await h.db
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, UID), eq(transactions.type, "bet")));
  expect(txRows.length).toBe(1);
  expect(txRows[0].amount).toBe(-300);
  expect(txRows[0].balanceAfter).toBe(STARTING_STACK - 300);
  expect(txRows[0].refMarketId).toBe(marketId);
  expect(txRows[0].refBetId).toBe(betId);
});

test("placeBet below MIN_BET throws BelowMinBetError and writes nothing", async () => {
  await seed();
  await expect(
    placeBet({ db: h.db, userId: UID, marketId, outcomeId: yesId, amount: MIN_BET - 1 }),
  ).rejects.toBeInstanceOf(BelowMinBetError);

  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);
  expect((await h.db.select().from(bets)).length).toBe(0);
  const [yes] = await h.db.select().from(outcomes).where(eq(outcomes.id, yesId));
  expect(yes.poolTotal).toBe(0);
  expect(
    (await h.db.select().from(transactions)).filter((r) => r.type === "bet").length,
  ).toBe(0);
});

test("placeBet over balance throws InsufficientFundsError and rolls the whole tx back", async () => {
  await seed();
  await expect(
    placeBet({ db: h.db, userId: UID, marketId, outcomeId: yesId, amount: STARTING_STACK + 1 }),
  ).rejects.toBeInstanceOf(InsufficientFundsError);

  // Balance intact, no bet row, pool untouched, no bet tx — the insert + pool
  // bump rolled back with the failed debit.
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);
  expect((await h.db.select().from(bets)).length).toBe(0);
  const [yes] = await h.db.select().from(outcomes).where(eq(outcomes.id, yesId));
  expect(yes.poolTotal).toBe(0);
  expect(
    (await h.db.select().from(transactions)).filter((r) => r.type === "bet").length,
  ).toBe(0);
});

test("placeBet on a closed market throws MarketClosedError", async () => {
  await seed({ status: "closed" });
  await expect(
    placeBet({ db: h.db, userId: UID, marketId, outcomeId: yesId, amount: 100 }),
  ).rejects.toBeInstanceOf(MarketClosedError);
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);
  expect((await h.db.select().from(bets)).length).toBe(0);
});

test("placeBet on a market past closeAt throws MarketClosedError", async () => {
  await seed({ status: "open", closeAt: new Date(Date.now() - 1000) });
  await expect(
    placeBet({ db: h.db, userId: UID, marketId, outcomeId: yesId, amount: 100 }),
  ).rejects.toBeInstanceOf(MarketClosedError);
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);
  expect((await h.db.select().from(bets)).length).toBe(0);
});

test("placeBet on an outcome from another market throws InvalidOutcomeError", async () => {
  await seed();
  await expect(
    placeBet({ db: h.db, userId: UID, marketId, outcomeId: otherOutcomeId, amount: 100 }),
  ).rejects.toBeInstanceOf(InvalidOutcomeError);
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);
  expect((await h.db.select().from(bets)).length).toBe(0);
});

// --- Resolution & void ---------------------------------------------------------

/** Creates a user funded to `balance` coins via a single `grant` ledger entry,
 *  so test stakes can exceed the 1000 starting stack (PRD pools reach 10000). */
async function fundedUser(id: string, balance: number) {
  await h.db.insert(users).values({ id, name: id, email: `${id}@x.co` });
  await h.db.transaction(async (tx) => {
    await applyEntry({ tx, userId: id, type: "grant", amount: balance });
  });
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

test("resolveMarket pays the PRD worked example: YES 7000 / NO 3000, resolve NO", async () => {
  // Three bettors stage pools YES=7000, NO=3000 (the PRD §6 worked example).
  await fundedUser("yesGuy", 7000);
  await fundedUser("noSmall", 1000); // the 300-on-NO worked-example bettor
  await fundedUser("noBig", 3000);
  const { marketId: mId, yesId, noId } = await seedMarket();

  await placeBet({ db: h.db, userId: "yesGuy", marketId: mId, outcomeId: yesId, amount: 7000 });
  await placeBet({ db: h.db, userId: "noSmall", marketId: mId, outcomeId: noId, amount: 300 });
  await placeBet({ db: h.db, userId: "noBig", marketId: mId, outcomeId: noId, amount: 2700 });

  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: noId });

  // total=10000, winningPool=3000. floor(10000×300/3000)=1000.
  const [smallBet] = await h.db
    .select()
    .from(bets)
    .where(and(eq(bets.userId, "noSmall"), eq(bets.marketId, mId)));
  expect(smallBet.status).toBe("won");
  expect(smallBet.payout).toBe(1000);
  // noSmall staked 300 of 1000, then credited 1000 → 1000 - 300 + 1000 = 1700.
  expect(await getBalance({ db: h.db, userId: "noSmall" })).toBe(1700);

  // noBig: floor(10000×2700/3000)=9000.
  const [bigBet] = await h.db
    .select()
    .from(bets)
    .where(and(eq(bets.userId, "noBig"), eq(bets.marketId, mId)));
  expect(bigBet.status).toBe("won");
  expect(bigBet.payout).toBe(9000);
  // noBig staked 2700 of 3000, then credited 9000 → 3000 - 2700 + 9000 = 9300.
  expect(await getBalance({ db: h.db, userId: "noBig" })).toBe(9300);

  // YES bettor lost: bet lost, payout 0, no credit (balance is the leftover 0).
  const [yesBet] = await h.db
    .select()
    .from(bets)
    .where(and(eq(bets.userId, "yesGuy"), eq(bets.marketId, mId)));
  expect(yesBet.status).toBe("lost");
  expect(yesBet.payout).toBe(0);
  expect(await getBalance({ db: h.db, userId: "yesGuy" })).toBe(0);

  // No payout ledger row for the loser.
  const yesPayouts = (await h.db.select().from(transactions)).filter(
    (r) => r.userId === "yesGuy" && r.type === "payout",
  );
  expect(yesPayouts.length).toBe(0);

  // Market is resolved with the winning outcome recorded.
  const [mkt] = await h.db.select().from(markets).where(eq(markets.id, mId));
  expect(mkt.status).toBe("resolved");
  expect(mkt.resolvedOutcomeId).toBe(noId);
  expect(mkt.resolvedAt).not.toBeNull();

  // Winners' payouts are funded entirely by the losing pool: total in = total out.
  expect(smallBet.payout + bigBet.payout).toBe(10000);
});

test("resolveMarket with an empty winning pool refunds every bet in full", async () => {
  // Everyone bet YES; resolve NO (winningPool=0) → no divide-by-zero, refund all.
  await fundedUser("a", 1000);
  await fundedUser("b", 1000);
  const { marketId: mId, yesId, noId } = await seedMarket();

  await placeBet({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId, amount: 400 });
  await placeBet({ db: h.db, userId: "b", marketId: mId, outcomeId: yesId, amount: 600 });

  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: noId });

  // Both bets refunded in full; balances restored to pre-bet.
  for (const [id, stake] of [["a", 400], ["b", 600]] as const) {
    const [bet] = await h.db
      .select()
      .from(bets)
      .where(and(eq(bets.userId, id), eq(bets.marketId, mId)));
    expect(bet.status).toBe("refunded");
    expect(bet.payout).toBe(stake);
    expect(await getBalance({ db: h.db, userId: id })).toBe(1000);
  }

  const [mkt] = await h.db.select().from(markets).where(eq(markets.id, mId));
  expect(mkt.status).toBe("resolved");
});

test("voidMarket refunds every open bet and marks the market voided", async () => {
  await fundedUser("a", 1000);
  await fundedUser("b", 1000);
  const { marketId: mId, yesId, noId } = await seedMarket();

  await placeBet({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId, amount: 250 });
  await placeBet({ db: h.db, userId: "b", marketId: mId, outcomeId: noId, amount: 750 });

  await voidMarket({ db: h.db, marketId: mId });

  for (const [id, stake] of [["a", 250], ["b", 750]] as const) {
    const [bet] = await h.db
      .select()
      .from(bets)
      .where(and(eq(bets.userId, id), eq(bets.marketId, mId)));
    expect(bet.status).toBe("refunded");
    expect(bet.payout).toBe(stake);
    expect(await getBalance({ db: h.db, userId: id })).toBe(1000);
    // The refund is a ledger entry of type refund for the stake.
    const refunds = (await h.db.select().from(transactions)).filter(
      (r) => r.userId === id && r.type === "refund",
    );
    expect(refunds.length).toBe(1);
    expect(refunds[0].amount).toBe(stake);
  }

  const [mkt] = await h.db.select().from(markets).where(eq(markets.id, mId));
  expect(mkt.status).toBe("voided");
});

test("resolveMarket on an already-resolved market throws AlreadyResolvedError", async () => {
  await fundedUser("a", 1000);
  const { marketId: mId, yesId, noId } = await seedMarket();
  await placeBet({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId, amount: 100 });
  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  await expect(
    resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: noId }),
  ).rejects.toBeInstanceOf(AlreadyResolvedError);
});

test("voidMarket on an already-resolved market throws AlreadyResolvedError", async () => {
  await fundedUser("a", 1000);
  const { marketId: mId, yesId } = await seedMarket();
  await placeBet({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId, amount: 100 });
  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  await expect(voidMarket({ db: h.db, marketId: mId })).rejects.toBeInstanceOf(
    AlreadyResolvedError,
  );
});

// --- Accuracy stats on resolution ---------------------------------------------

/** A user's accuracy stat columns after a resolve. */
async function userStats(id: string) {
  const [u] = await h.db.select().from(users).where(eq(users.id, id));
  return { totalResolved: u.totalResolved, totalWins: u.totalWins };
}

test("resolveMarket bumps the winner's stats: totalResolved 1, totalWins 1", async () => {
  await fundedUser("winner", 1000);
  await fundedUser("loser", 1000);
  const { marketId: mId, yesId, noId } = await seedMarket();
  // winner stakes YES (the winning outcome); loser stakes NO.
  await placeBet({ db: h.db, userId: "winner", marketId: mId, outcomeId: yesId, amount: 500 });
  await placeBet({ db: h.db, userId: "loser", marketId: mId, outcomeId: noId, amount: 500 });

  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  expect(await userStats("winner")).toEqual({ totalResolved: 1, totalWins: 1 });
});

test("resolveMarket bumps a losing-only bettor: totalResolved 1, totalWins 0", async () => {
  await fundedUser("winner", 1000);
  await fundedUser("loser", 1000);
  const { marketId: mId, yesId, noId } = await seedMarket();
  await placeBet({ db: h.db, userId: "winner", marketId: mId, outcomeId: yesId, amount: 500 });
  await placeBet({ db: h.db, userId: "loser", marketId: mId, outcomeId: noId, amount: 500 });

  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  expect(await userStats("loser")).toEqual({ totalResolved: 1, totalWins: 0 });
});

test("resolveMarket: bigger loss than win → totalWins 0 (top stake on the loser)", async () => {
  // hedger bets a little on the winner (YES) but MORE on the loser (NO);
  // their top single-outcome stake is on the losing side, so it is not a win.
  await fundedUser("hedger", 1000);
  await fundedUser("opp", 1000); // keeps the winning pool non-empty
  const { marketId: mId, yesId, noId } = await seedMarket();
  await placeBet({ db: h.db, userId: "opp", marketId: mId, outcomeId: yesId, amount: 100 });
  await placeBet({ db: h.db, userId: "hedger", marketId: mId, outcomeId: yesId, amount: 100 });
  await placeBet({ db: h.db, userId: "hedger", marketId: mId, outcomeId: noId, amount: 400 });

  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  expect(await userStats("hedger")).toEqual({ totalResolved: 1, totalWins: 0 });
});

test("voidMarket leaves accuracy stats unchanged", async () => {
  await fundedUser("a", 1000);
  await fundedUser("b", 1000);
  const { marketId: mId, yesId, noId } = await seedMarket();
  await placeBet({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId, amount: 250 });
  await placeBet({ db: h.db, userId: "b", marketId: mId, outcomeId: noId, amount: 750 });

  await voidMarket({ db: h.db, marketId: mId });

  expect(await userStats("a")).toEqual({ totalResolved: 0, totalWins: 0 });
  expect(await userStats("b")).toEqual({ totalResolved: 0, totalWins: 0 });
});

// --- Post-commit push dispatch -------------------------------------------------

test("resolveMarket fires dispatchPush once after commit with the winner's bet_won event", async () => {
  await fundedUser("winner", 1000);
  await fundedUser("loser", 1000);
  const { marketId: mId, yesId, noId } = await seedMarket();
  // winner stakes YES (the winning outcome); loser stakes NO so YES has a payout.
  await placeBet({ db: h.db, userId: "winner", marketId: mId, outcomeId: yesId, amount: 600 });
  await placeBet({ db: h.db, userId: "loser", marketId: mId, outcomeId: noId, amount: 400 });

  await resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId });

  // Exactly one dispatch, post-commit, carrying the event batch built in the tx.
  expect(dispatchPushMock).toHaveBeenCalledTimes(1);
  const { events } = dispatchPushMock.mock.calls[0][0];
  // The winner's bet_won event is present with the right shape.
  const won = events.find((e) => e.type === "bet_won" && e.userId === "winner");
  expect(won).toMatchObject({
    type: "bet_won",
    userId: "winner",
    marketId: mId,
    payout: 1000, // total 1000, winningPool 600 → floor(1000×600/600)=1000
  });
  // market_resolved is emitted for every participant (winner + loser).
  const resolvedFor = events.filter((e) => e.type === "market_resolved").map((e) => e.userId).sort();
  expect(resolvedFor).toEqual(["loser", "winner"]);
});

test("resolveMarket settles correctly even when dispatchPush rejects (push cannot break settlement)", async () => {
  dispatchPushMock.mockRejectedValueOnce(new Error("push service down"));

  await fundedUser("winner", 1000);
  await fundedUser("loser", 1000);
  const { marketId: mId, yesId, noId } = await seedMarket();
  await placeBet({ db: h.db, userId: "winner", marketId: mId, outcomeId: yesId, amount: 600 });
  await placeBet({ db: h.db, userId: "loser", marketId: mId, outcomeId: noId, amount: 400 });

  // Must NOT throw — the post-commit push failure is swallowed.
  await expect(
    resolveMarket({ db: h.db, marketId: mId, winningOutcomeId: yesId }),
  ).resolves.toBeUndefined();
  expect(dispatchPushMock).toHaveBeenCalledTimes(1);

  // Settlement is fully committed despite the push failure (assert DB state).
  const [winnerBet] = await h.db
    .select()
    .from(bets)
    .where(and(eq(bets.userId, "winner"), eq(bets.marketId, mId)));
  expect(winnerBet.status).toBe("won");
  expect(winnerBet.payout).toBe(1000);
  // winner staked 600 of 1000 → 1000 - 600 + 1000 = 1400.
  expect(await getBalance({ db: h.db, userId: "winner" })).toBe(1400);

  const [loserBet] = await h.db
    .select()
    .from(bets)
    .where(and(eq(bets.userId, "loser"), eq(bets.marketId, mId)));
  expect(loserBet.status).toBe("lost");
  expect(loserBet.payout).toBe(0);
  // loser staked 400 of 1000, no credit → 600.
  expect(await getBalance({ db: h.db, userId: "loser" })).toBe(600);

  const [mkt] = await h.db.select().from(markets).where(eq(markets.id, mId));
  expect(mkt.status).toBe("resolved");
  expect(mkt.resolvedOutcomeId).toBe(yesId);
});

test("voidMarket dispatches a market_voided push to each bettor after commit", async () => {
  await fundedUser("a", 1000);
  await fundedUser("b", 1000);
  const { marketId: mId, yesId, noId } = await seedMarket();
  await placeBet({ db: h.db, userId: "a", marketId: mId, outcomeId: yesId, amount: 250 });
  await placeBet({ db: h.db, userId: "b", marketId: mId, outcomeId: noId, amount: 750 });

  await voidMarket({ db: h.db, marketId: mId });

  // In-app market_voided rows for both bettors, linked to the market.
  const voided = (await h.db.select().from(notifications)).filter((n) => n.type === "market_voided");
  expect(voided.map((n) => n.userId).sort()).toEqual(["a", "b"]);
  expect(voided.every((n) => n.refMarketId === mId)).toBe(true);

  // One post-commit dispatch carrying both market_voided events.
  expect(dispatchPushMock).toHaveBeenCalledTimes(1);
  const { events } = dispatchPushMock.mock.calls[0][0];
  expect(events.filter((e) => e.type === "market_voided").map((e) => e.userId).sort()).toEqual(["a", "b"]);
});

// --- Closing-soon sweep --------------------------------------------------------

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

test("notifyClosingSoonMarkets notifies bettors of a soon-closing market once and stamps it", async () => {
  await fundedUser("a", 1000);
  await fundedUser("b", 1000);
  const soon = await seedMarketClosingAt(new Date(Date.now() + 2 * 3600 * 1000)); // due (within 24h)
  const later = await seedMarketClosingAt(new Date(Date.now() + 5 * 24 * 3600 * 1000)); // not due
  await placeBet({ db: h.db, userId: "a", marketId: soon.marketId, outcomeId: soon.yesId, amount: 100 });
  await placeBet({ db: h.db, userId: "b", marketId: soon.marketId, outcomeId: soon.yesId, amount: 100 });
  await placeBet({ db: h.db, userId: "a", marketId: later.marketId, outcomeId: later.yesId, amount: 100 });

  const { notified } = await notifyClosingSoonMarkets({ db: h.db });
  expect(notified).toBe(1); // one market, not one-per-bettor

  // In-app closing-soon notice for each distinct bettor of the SOON market only.
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
  await fundedUser("a", 1000);
  const soon = await seedMarketClosingAt(new Date(Date.now() + 2 * 3600 * 1000));
  await placeBet({ db: h.db, userId: "a", marketId: soon.marketId, outcomeId: soon.yesId, amount: 100 });

  expect((await notifyClosingSoonMarkets({ db: h.db })).notified).toBe(1);
  dispatchPushMock.mockClear();
  expect((await notifyClosingSoonMarkets({ db: h.db })).notified).toBe(0);
  expect(dispatchPushMock).not.toHaveBeenCalled();

  // Still exactly one closing-soon notice — no duplicate on the re-sweep.
  const cs = (await h.db.select().from(notifications)).filter((n) => n.type === "market_closing_soon");
  expect(cs.length).toBe(1);
});

test("notifyClosingSoonMarkets ignores markets past closeAt or not open", async () => {
  await fundedUser("a", 1000);
  const past = await seedMarketClosingAt(new Date(Date.now() - 1000)); // open but already past close
  const closed = await seedMarketClosingAt(new Date(Date.now() + 2 * 3600 * 1000), "closed"); // not open
  // Bet rows inserted directly (placeBet would reject a past/closed market).
  await h.db.insert(bets).values({ userId: "a", marketId: past.marketId, outcomeId: past.yesId, amount: 100 });
  await h.db.insert(bets).values({ userId: "a", marketId: closed.marketId, outcomeId: closed.yesId, amount: 100 });

  expect((await notifyClosingSoonMarkets({ db: h.db })).notified).toBe(0);
  expect((await h.db.select().from(notifications)).length).toBe(0);
});

test("markClosingSoonNotified won't claim a market that stopped being open (TOCTOU guard)", async () => {
  const m = await seedMarketClosingAt(new Date(Date.now() + 2 * 3600 * 1000)); // open + due
  // Simulate the market resolving in the gap between the cron's (unlocked) list
  // read and its per-market claim — the claim must NOT stamp/notify it.
  await h.db.update(markets).set({ status: "resolved" }).where(eq(markets.id, m.marketId));

  const won = await h.db.transaction((tx) => markClosingSoonNotified({ tx, marketId: m.marketId, now: new Date() }));
  expect(won).toBe(false);

  const [row] = await h.db.select().from(markets).where(eq(markets.id, m.marketId));
  expect(row.closingSoonNotifiedAt).toBeNull(); // never stamped
});
