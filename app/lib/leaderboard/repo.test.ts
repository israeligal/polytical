import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, markets, outcomes, bets } from "@/app/lib/schema";
import { getLeaderboard, getUserStats } from "./repo";

let h: Awaited<ReturnType<typeof createTestDb>>;

// Identifiers filled by seed(): one market with a single outcome (just somewhere
// for the open bets to point), plus three users with hand-set balances + stat
// columns and open stakes that drive the net-worth + accuracy expectations.
let outcomeId: string;

/**
 * Seeds three users so the orderings are unambiguous:
 *
 *  user   balance   open stakes   netWorth   resolved/wins   accuracy
 *  alice    1000        500         1500         10 / 9         90
 *  bob      2000          0         2000          4 / 1         25
 *  carol     200        100          300          0 / 0          0  (never resolved → last by accuracy)
 *
 * net-worth order: bob (2000) > alice (1500) > carol (300)
 * accuracy  order: alice (90) > bob (25) > carol (0)
 */
async function seed() {
  await h.db.insert(users).values([
    { id: "alice", name: "Alice", email: "a@x.co", balance: 1000, totalResolved: 10, totalWins: 9 },
    { id: "bob", name: "Bob", email: "b@x.co", balance: 2000, totalResolved: 4, totalWins: 1 },
    { id: "carol", name: "Carol", email: "c@x.co", balance: 200, totalResolved: 0, totalWins: 0 },
  ]);

  const [m] = await h.db
    .insert(markets)
    .values({
      questionHe: "שוק לדוגמה",
      category: "coalition",
      status: "open",
      closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    .returning({ id: markets.id });
  const [o] = await h.db
    .insert(outcomes)
    .values({ marketId: m.id, labelHe: "כן", ordinal: 0 })
    .returning({ id: outcomes.id });
  outcomeId = o.id;

  // Open stakes — these add to net worth at cost. carol also has a *settled*
  // (won) bet that must NOT count toward net worth (already in her balance).
  await h.db.insert(bets).values([
    { userId: "alice", marketId: m.id, outcomeId, amount: 500, status: "open" },
    { userId: "carol", marketId: m.id, outcomeId, amount: 100, status: "open" },
    { userId: "carol", marketId: m.id, outcomeId, amount: 9999, status: "won", payout: 1 },
  ]);
}

beforeEach(async () => {
  h = await createTestDb();
});
afterEach(async () => {
  await h.close();
});

test("getLeaderboard by networth orders by balance + open stakes desc with ranks", async () => {
  await seed();
  const rows = await getLeaderboard({ db: h.db, by: "networth" });

  expect(rows.map((r) => r.userId)).toEqual(["bob", "alice", "carol"]);
  expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  expect(rows.map((r) => r.netWorth)).toEqual([2000, 1500, 300]);
  // names carried through (we surface name as the handle for now)
  expect(rows[0].name).toBe("Bob");
  // accuracy is computed even when ordering by net worth
  expect(rows[1].accuracy).toBe(90); // alice
});

test("getLeaderboard by accuracy orders by win ratio desc, 0-resolved last", async () => {
  await seed();
  const rows = await getLeaderboard({ db: h.db, by: "accuracy" });

  expect(rows.map((r) => r.userId)).toEqual(["alice", "bob", "carol"]);
  expect(rows.map((r) => r.accuracy)).toEqual([90, 25, 0]);
  expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
});

test("getLeaderboard respects limit", async () => {
  await seed();
  const rows = await getLeaderboard({ db: h.db, by: "networth", limit: 2 });
  expect(rows.map((r) => r.userId)).toEqual(["bob", "alice"]);
  expect(rows.length).toBe(2);
});

test("getUserStats returns balance, netWorth, accuracy, totals, and rank", async () => {
  await seed();

  // alice: balance 1000 + 500 open = 1500 net worth; rank 2 (bob is higher).
  expect(await getUserStats({ db: h.db, userId: "alice" })).toEqual({
    balance: 1000,
    netWorth: 1500,
    accuracy: 90,
    totalResolved: 10,
    totalWins: 9,
    rank: 2,
  });

  // bob: top net worth → rank 1; round(1*100/4) = 25.
  expect(await getUserStats({ db: h.db, userId: "bob" })).toEqual({
    balance: 2000,
    netWorth: 2000,
    accuracy: 25,
    totalResolved: 4,
    totalWins: 1,
    rank: 1,
  });

  // carol: never resolved → accuracy 0; lowest net worth → rank 3.
  expect(await getUserStats({ db: h.db, userId: "carol" })).toEqual({
    balance: 200,
    netWorth: 300,
    accuracy: 0,
    totalResolved: 0,
    totalWins: 0,
    rank: 3,
  });
});

test("getUserStats returns null for an unknown user", async () => {
  await seed();
  expect(await getUserStats({ db: h.db, userId: "nope" })).toBeNull();
});
