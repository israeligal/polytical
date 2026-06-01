import { beforeEach, afterEach, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, markets, outcomes, bets, transactions } from "@/app/lib/schema";
import { STARTING_STACK, MIN_BET } from "@/app/lib/economy";
import {
  BelowMinBetError,
  InsufficientFundsError,
  MarketClosedError,
  InvalidOutcomeError,
} from "@/app/lib/errors";
import { grantStartingStack, getBalance } from "@/app/lib/ledger/service";
import { placeBet } from "./service";

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
