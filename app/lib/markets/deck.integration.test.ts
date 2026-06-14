// Integration tests for getUnpredictedOpenMarketCards — PGlite in-memory.
// Verifies: closed excluded, predicted excluded, excludeMarketId excluded,
// limit respected, and that returned cards carry outcomes with predictor counts.

import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { bets, markets, outcomes, users } from "@/app/lib/schema";
import { MissingUserError } from "@/app/lib/errors";
import { getUnpredictedOpenMarketCards } from "./feed";

const UID = "user-deck-mkt-1";
const UID2 = "user-deck-mkt-2";
const CROWD = "user-crowd";

let h: Awaited<ReturnType<typeof createTestDb>>;

async function newMarket(
  label: string,
  status: "open" | "closed" | "resolved" = "open",
  closeAt?: Date,
) {
  const [m] = await h.db
    .insert(markets)
    .values({
      questionHe: label,
      category: "coalition",
      status,
      closeAt: closeAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    .returning({ id: markets.id });

  const [o1] = await h.db
    .insert(outcomes)
    .values({ marketId: m.id, labelHe: "כן", ordinal: 0 })
    .returning({ id: outcomes.id });
  const [o2] = await h.db
    .insert(outcomes)
    .values({ marketId: m.id, labelHe: "לא", ordinal: 1 })
    .returning({ id: outcomes.id });

  return { marketId: m.id, outcomeYes: o1.id, outcomeNo: o2.id };
}

async function bet(userId: string, marketId: string, outcomeId: string) {
  await h.db.insert(bets).values({ userId, marketId, outcomeId });
}

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: UID, name: "User One", email: "one@mkt.co" },
    { id: UID2, name: "User Two", email: "two@mkt.co" },
    { id: CROWD, name: "Crowd", email: "crowd@mkt.co" },
  ]);
});

afterEach(async () => h.close());

test("returns open markets the user has not predicted on", async () => {
  const m1 = await newMarket("שוק א");
  const m2 = await newMarket("שוק ב");

  const cards = await getUnpredictedOpenMarketCards({ db: h.db, userId: UID });
  const ids = cards.map((c) => c.market.id);
  expect(ids).toContain(m1.marketId);
  expect(ids).toContain(m2.marketId);
});

test("excludes markets the user has already predicted on", async () => {
  const predicted = await newMarket("שוק עם ניחוש");
  const fresh = await newMarket("שוק חדש");

  await bet(UID, predicted.marketId, predicted.outcomeYes);

  const cards = await getUnpredictedOpenMarketCards({ db: h.db, userId: UID });
  const ids = cards.map((c) => c.market.id);
  expect(ids).not.toContain(predicted.marketId);
  expect(ids).toContain(fresh.marketId);
});

test("other users' predictions do NOT filter out markets for the requesting user", async () => {
  const m = await newMarket("שוק משותף");
  // UID2 has predicted — must not affect UID
  await bet(UID2, m.marketId, m.outcomeYes);

  const cards = await getUnpredictedOpenMarketCards({ db: h.db, userId: UID });
  expect(cards.map((c) => c.market.id)).toContain(m.marketId);
});

test("excludes closed (non-open) markets", async () => {
  const open = await newMarket("שוק פתוח");
  await newMarket("שוק סגור", "closed");
  await newMarket("שוק שהוכרע", "resolved");

  const cards = await getUnpredictedOpenMarketCards({ db: h.db, userId: UID });
  expect(cards).toHaveLength(1);
  expect(cards[0].market.id).toBe(open.marketId);
});

test("excludes markets whose closeAt is in the past", async () => {
  const live = await newMarket("שוק פתוח עתידי");
  // Status is 'open' but closeAt already passed
  await newMarket("שוק שעבר", "open", new Date(Date.now() - 1000));

  const cards = await getUnpredictedOpenMarketCards({ db: h.db, userId: UID });
  expect(cards).toHaveLength(1);
  expect(cards[0].market.id).toBe(live.marketId);
});

test("excludeMarketId removes one specific market from the deck", async () => {
  const m1 = await newMarket("שוק א");
  const m2 = await newMarket("שוק ב");

  const cards = await getUnpredictedOpenMarketCards({
    db: h.db,
    userId: UID,
    excludeMarketId: m1.marketId,
  });
  const ids = cards.map((c) => c.market.id);
  expect(ids).not.toContain(m1.marketId);
  expect(ids).toContain(m2.marketId);
});

test("limit is respected", async () => {
  for (let i = 0; i < 5; i++) await newMarket(`שוק ${i}`);
  const cards = await getUnpredictedOpenMarketCards({ db: h.db, userId: UID, limit: 3 });
  expect(cards).toHaveLength(3);
});

test("returned cards carry outcomes with live predictor counts", async () => {
  const m = await newMarket("שוק עם קולות");
  // 2 predictors on YES, 1 on NO from crowd users
  const crowd1 = `crowd-a`;
  const crowd2 = `crowd-b`;
  const crowd3 = `crowd-c`;
  await h.db.insert(users).values([
    { id: crowd1, name: "C1", email: "c1@mkt.co" },
    { id: crowd2, name: "C2", email: "c2@mkt.co" },
    { id: crowd3, name: "C3", email: "c3@mkt.co" },
  ]);
  await bet(crowd1, m.marketId, m.outcomeYes);
  await bet(crowd2, m.marketId, m.outcomeYes);
  await bet(crowd3, m.marketId, m.outcomeNo);

  const cards = await getUnpredictedOpenMarketCards({ db: h.db, userId: UID });
  expect(cards).toHaveLength(1);

  const card = cards[0];
  expect(card.market.outcomes).toHaveLength(2);

  const yes = card.market.outcomes.find((o) => o.label === "כן");
  const no = card.market.outcomes.find((o) => o.label === "לא");
  expect(yes?.predictors).toBe(2);
  expect(no?.predictors).toBe(1);
});

test("returns empty array when all open markets are already predicted", async () => {
  const m = await newMarket("שוק יחיד");
  await bet(UID, m.marketId, m.outcomeYes);

  const cards = await getUnpredictedOpenMarketCards({ db: h.db, userId: UID });
  expect(cards).toHaveLength(0);
});

test("throws MissingUserError when userId is empty", async () => {
  await expect(
    getUnpredictedOpenMarketCards({ db: h.db, userId: "" }),
  ).rejects.toBeInstanceOf(MissingUserError);
});
