// Integration tests for the duel-candidate reads — PGlite, real Drizzle.
// Verifies listDuelableMarkets (open + global + closing-soon, ordering, exclude,
// limit) and getSuggestedDuelMarkets (the MarketCardData view-model).

import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { markets, outcomes, groups, users } from "@/app/lib/schema";
import { listDuelableMarkets } from "./repo";
import { getSuggestedDuelMarkets } from "./feed";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

let h: Awaited<ReturnType<typeof createTestDb>>;

async function mkt(opts: {
  q: string;
  status?: "open" | "closed" | "resolved";
  closeAt?: Date;
  groupId?: string | null;
  hot?: boolean;
}) {
  const [m] = await h.db
    .insert(markets)
    .values({
      questionHe: opts.q,
      category: "other",
      status: opts.status ?? "open",
      closeAt: opts.closeAt ?? inDays(3),
      groupId: opts.groupId ?? null,
      hot: opts.hot ?? false,
    })
    .returning({ id: markets.id });
  await h.db.insert(outcomes).values([
    { marketId: m.id, labelHe: "כן", ordinal: 0 },
    { marketId: m.id, labelHe: "לא", ordinal: 1 },
  ]);
  return m.id;
}

beforeEach(async () => {
  h = await createTestDb();
});
afterEach(async () => h.close());

test("listDuelableMarkets returns ONLY open, global, closing-soon markets", async () => {
  await mkt({ q: "soon", closeAt: inDays(2) });
  await mkt({ q: "far", closeAt: inDays(30) }); // outside the 7d window
  await mkt({ q: "closed", status: "closed" });
  await mkt({ q: "past", closeAt: inDays(-1) }); // already past closeAt
  // a group motion (must be excluded — sandbox)
  await h.db.insert(users).values({ id: "u-duelable", name: "A", email: "a@duelable.co" });
  const [g] = await h.db
    .insert(groups)
    .values({ slug: "g-d", nameHe: "ק", ownerId: "u-duelable", inviteCode: "inv-d" })
    .returning({ id: groups.id });
  await mkt({ q: "group", groupId: g.id });

  const rows = await listDuelableMarkets({ db: h.db });
  expect(rows.map((r) => r.questionHe)).toEqual(["soon"]);
});

test("listDuelableMarkets orders hot-first then soonest, and respects limit + exclude", async () => {
  const aSoon = await mkt({ q: "a-soon", closeAt: inDays(1) });
  await mkt({ q: "b-hot", closeAt: inDays(5), hot: true });
  await mkt({ q: "c-mid", closeAt: inDays(3) });

  const rows = await listDuelableMarkets({ db: h.db, limit: 2 });
  expect(rows[0].questionHe).toBe("b-hot"); // hot wins over soonest
  expect(rows).toHaveLength(2); // limit honored

  const excl = await listDuelableMarkets({ db: h.db, excludeMarketId: aSoon });
  expect(excl.map((r) => r.questionHe)).not.toContain("a-soon");
});

test("getSuggestedDuelMarkets returns the MarketCardData view-model; empty when none", async () => {
  await mkt({ q: "duelable", closeAt: inDays(2) });
  const cards = await getSuggestedDuelMarkets({ db: h.db });
  expect(cards).toHaveLength(1);
  expect(cards[0].market.question).toBe("duelable");
  expect(cards[0].market.outcomes).toHaveLength(2);
  expect(Array.isArray(cards[0].featured)).toBe(true);

  await h.db.delete(markets); // cascade-drops outcomes
  await mkt({ q: "far", closeAt: inDays(30) });
  expect(await getSuggestedDuelMarkets({ db: h.db })).toHaveLength(0);
});
