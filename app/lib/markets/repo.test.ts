import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, markets, outcomes, bets } from "@/app/lib/schema";
import { getMarketOfTheDay } from "./repo";

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
