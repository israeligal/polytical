import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users } from "@/app/lib/schema";
import { getLeaderboard, getUserStats } from "./repo";

let h: Awaited<ReturnType<typeof createTestDb>>;

/**
 * Seeds three users with hand-set prediction-record columns so the orderings
 * are unambiguous:
 *
 *  user   totalResolved   totalWins   accuracy
 *  alice       10              9         90
 *  bob          4              1         25
 *  carol        0              0          0   (never resolved → last by accuracy)
 *
 * wins order:    alice (9) > bob (1) > carol (0)
 * accuracy order: alice (90) > bob (25) > carol (0)
 */
async function seed() {
  await h.db.insert(users).values([
    { id: "alice", name: "Alice", email: "a@x.co", totalResolved: 10, totalWins: 9 },
    { id: "bob",   name: "Bob",   email: "b@x.co", totalResolved:  4, totalWins: 1 },
    { id: "carol", name: "Carol", email: "c@x.co", totalResolved:  0, totalWins: 0 },
  ]);
}

beforeEach(async () => {
  h = await createTestDb();
});
afterEach(async () => {
  await h.close();
});

test("getLeaderboard by wins orders by totalWins desc with accuracy tiebreak and ranks", async () => {
  await seed();
  const rows = await getLeaderboard({ db: h.db, by: "wins" });

  expect(rows.map((r) => r.userId)).toEqual(["alice", "bob", "carol"]);
  expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  expect(rows.map((r) => r.totalWins)).toEqual([9, 1, 0]);
  expect(rows[0].name).toBe("Alice");
  // accuracy is included even when ordering by wins
  expect(rows[0].accuracy).toBe(90);
  expect(rows[1].accuracy).toBe(25);
  expect(rows[2].accuracy).toBe(0);
});

test("getLeaderboard by accuracy orders by win ratio desc, then wins, 0-resolved last", async () => {
  await seed();
  const rows = await getLeaderboard({ db: h.db, by: "accuracy" });

  expect(rows.map((r) => r.userId)).toEqual(["alice", "bob", "carol"]);
  expect(rows.map((r) => r.accuracy)).toEqual([90, 25, 0]);
  expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
});

test("getLeaderboard accuracy tiebreak: same ratio ordered by totalWins desc", async () => {
  // Add two users with identical 100% accuracy but different win counts.
  await h.db.insert(users).values([
    { id: "high", name: "High", email: "high@x.co", totalResolved: 5, totalWins: 5 },
    { id: "low",  name: "Low",  email: "low@x.co",  totalResolved: 1, totalWins: 1 },
  ]);

  const rows = await getLeaderboard({ db: h.db, by: "accuracy" });

  // Both 100% — "high" (5 wins) should rank ahead of "low" (1 win).
  expect(rows[0].userId).toBe("high");
  expect(rows[1].userId).toBe("low");
  expect(rows[0].accuracy).toBe(100);
  expect(rows[1].accuracy).toBe(100);
});

test("getLeaderboard wins tiebreak: same wins ordered by accuracy desc", async () => {
  // Two users with the same totalWins but different accuracy.
  await h.db.insert(users).values([
    { id: "accurate", name: "Accurate", email: "acc@x.co", totalResolved: 2, totalWins: 2 },
    { id: "lucky",    name: "Lucky",    email: "lky@x.co", totalResolved: 10, totalWins: 2 },
  ]);

  const rows = await getLeaderboard({ db: h.db, by: "wins" });

  // Same wins (2) — "accurate" (100%) should rank ahead of "lucky" (20%).
  expect(rows[0].userId).toBe("accurate");
  expect(rows[1].userId).toBe("lucky");
});

test("getLeaderboard respects limit", async () => {
  await seed();
  const rows = await getLeaderboard({ db: h.db, by: "wins", limit: 2 });
  expect(rows.map((r) => r.userId)).toEqual(["alice", "bob"]);
  expect(rows.length).toBe(2);
});

test("getLeaderboard returns correct totalResolved on each entry", async () => {
  await seed();
  const rows = await getLeaderboard({ db: h.db, by: "wins" });

  expect(rows.find((r) => r.userId === "alice")?.totalResolved).toBe(10);
  expect(rows.find((r) => r.userId === "bob")?.totalResolved).toBe(4);
  expect(rows.find((r) => r.userId === "carol")?.totalResolved).toBe(0);
});

test("getUserStats returns accuracy, totals, totalWrong, and rank", async () => {
  await seed();

  // alice: 10 resolved, 9 wins → 1 wrong, 90% accuracy; rank 1 (most wins).
  expect(await getUserStats({ db: h.db, userId: "alice" })).toEqual({
    totalResolved: 10,
    totalWins: 9,
    totalWrong: 1,
    accuracy: 90,
    rank: 1,
  });

  // bob: 4 resolved, 1 win → 3 wrong, round(1*100/4)=25%; rank 2 (alice has more wins).
  expect(await getUserStats({ db: h.db, userId: "bob" })).toEqual({
    totalResolved: 4,
    totalWins: 1,
    totalWrong: 3,
    accuracy: 25,
    rank: 2,
  });

  // carol: never resolved → accuracy 0, 0 wrong; rank 3 (fewest wins).
  expect(await getUserStats({ db: h.db, userId: "carol" })).toEqual({
    totalResolved: 0,
    totalWins: 0,
    totalWrong: 0,
    accuracy: 0,
    rank: 3,
  });
});

test("getUserStats rank reflects count of users with strictly more wins", async () => {
  // Single user: no one has more wins → rank 1.
  await h.db.insert(users).values([
    { id: "solo", name: "Solo", email: "solo@x.co", totalResolved: 5, totalWins: 5 },
  ]);

  const stats = await getUserStats({ db: h.db, userId: "solo" });
  expect(stats?.rank).toBe(1);
});

test("getUserStats returns null for an unknown user", async () => {
  await seed();
  expect(await getUserStats({ db: h.db, userId: "nope" })).toBeNull();
});
