import { beforeEach, afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, markets, outcomes, bets, marketPoliticians } from "@/app/lib/schema";
import { getMarketOfTheDay, getMarketsForPolitician, createMarket, searchMarkets } from "./repo";

let h: Awaited<ReturnType<typeof createTestDb>>;
const UID = "u1";

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values({ id: UID, name: "Gal", email: "g@x.co", balance: 100000 });
});
afterEach(async () => {
  await h.close();
});

async function newMarket(question: string, status: "open" | "resolved" = "open") {
  const [m] = await h.db
    .insert(markets)
    .values({
      questionHe: question,
      category: "coalition",
      status,
      closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    .returning({ id: markets.id });
  const [o] = await h.db
    .insert(outcomes)
    .values({ marketId: m.id, labelHe: "כן", ordinal: 0 })
    .returning({ id: outcomes.id });
  return { marketId: m.id, outcomeId: o.id };
}

async function placeBets(marketId: string, outcomeId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await h.db.insert(bets).values({ userId: UID, marketId, outcomeId, amount: 10 });
  }
}

test("getMarketOfTheDay returns the open market with the most bets", async () => {
  const quiet = await newMarket("שוק שקט");
  const busy = await newMarket("שוק סוער");
  await placeBets(quiet.marketId, quiet.outcomeId, 1);
  await placeBets(busy.marketId, busy.outcomeId, 5);

  const motd = await getMarketOfTheDay({ db: h.db });
  expect(motd?.id).toBe(busy.marketId);
  expect(motd?.questionHe).toBe("שוק סוער");
});

test("getMarketOfTheDay ignores non-open markets even if busier", async () => {
  const open = await newMarket("שוק פתוח");
  const resolved = await newMarket("שוק סגור", "resolved");
  await placeBets(open.marketId, open.outcomeId, 1);
  await placeBets(resolved.marketId, resolved.outcomeId, 9); // busier but not open

  const motd = await getMarketOfTheDay({ db: h.db });
  expect(motd?.id).toBe(open.marketId);
});

test("getMarketOfTheDay surfaces a zero-bet open market (fresh app)", async () => {
  const only = await newMarket("שוק חדש");
  const motd = await getMarketOfTheDay({ db: h.db });
  expect(motd?.id).toBe(only.marketId);
});

test("getMarketOfTheDay returns null when nothing is open", async () => {
  await newMarket("הוכרע", "resolved");
  expect(await getMarketOfTheDay({ db: h.db })).toBeNull();
});

test("getMarketsForPolitician returns only OPEN markets featuring the MK, as bundles", async () => {
  const mine = await newMarket("שוק על ח״כ 100");
  const other = await newMarket("שוק על מישהו אחר");
  const settled = await newMarket("שוק שהוכרע על ח״כ 100", "resolved");
  await h.db.insert(marketPoliticians).values([
    { marketId: mine.marketId, personId: 100 },
    { marketId: other.marketId, personId: 200 },
    { marketId: settled.marketId, personId: 100 }, // linked to 100 but resolved → excluded
  ]);

  const bundles = await getMarketsForPolitician({ db: h.db, personId: 100 });
  expect(bundles.length).toBe(1); // the resolved market is filtered out
  expect(bundles[0].market.id).toBe(mine.marketId);
  expect(bundles[0].personIds).toEqual([100]);
  expect(bundles[0].outcomes.map((o) => o.labelHe)).toEqual(["כן"]);

  expect(await getMarketsForPolitician({ db: h.db, personId: 999 })).toEqual([]);
});

test("createMarket joins an existing tx when passed one (atomic with a caller's tx)", async () => {
  // Proves the tx-aware refactor: createMarket inside a rolled-back tx leaves nothing.
  await expect(
    h.db.transaction(async (tx) => {
      await createMarket({
        tx,
        questionHe: "שוק בתוך טרנזקציה",
        category: "coalition",
        type: "binary",
        closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        outcomes: [{ labelHe: "כן", ordinal: 0 }, { labelHe: "לא", ordinal: 1 }],
        personIds: [100],
      });
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  // The whole composite rolled back — no market, no link leaked.
  expect((await h.db.select().from(markets)).length).toBe(0);
  expect((await h.db.select().from(marketPoliticians)).length).toBe(0);
});

test("createMarket populates the normalized searchText; searchMarkets finds it", async () => {
  const { marketId } = await createMarket({
    db: h.db,
    questionHe: "האם הקואליציה תשרוד את מושב הקיץ?",
    category: "coalition",
    closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    outcomes: [{ labelHe: "כן", ordinal: 0 }, { labelHe: "לא", ordinal: 1 }],
  });
  const [row] = await h.db.select().from(markets).where(eq(markets.id, marketId));
  expect(row.searchText).toContain("קואליציה"); // normalized, non-empty

  const hits = await searchMarkets({ db: h.db, q: "קואליציה" });
  expect(hits.map((m) => m.id)).toContain(marketId);

  // A draft market is not discoverable.
  await h.db.update(markets).set({ status: "draft" }).where(eq(markets.id, marketId));
  expect(await searchMarkets({ db: h.db, q: "קואליציה" })).toEqual([]);
});
