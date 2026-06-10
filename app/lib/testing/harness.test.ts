import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./create-test-db";
import { users, markets, outcomes, bets, cardProgress } from "@/app/lib/schema";

test("PGlite applies migrations; new user has totalResolved=0 and totalWins=0", async () => {
  const { db, close } = await createTestDb();
  await db.insert(users).values({ id: "u1", name: "Gal", email: "g@x.co" });
  const [row] = await db.select().from(users).where(eq(users.id, "u1"));
  expect(row.totalResolved).toBe(0);
  expect(row.totalWins).toBe(0);
  expect(row.isAdmin).toBe(false);
  await close();
});

test("card_progress table exists and accepts inserts", async () => {
  const { db, close } = await createTestDb();
  await db.insert(users).values({ id: "u1", name: "Gal", email: "g@x.co" });

  await db.insert(cardProgress).values({ userId: "u1", personId: 1001, correctCount: 0 });

  const rows = await db.select().from(cardProgress);
  expect(rows).toHaveLength(1);
  expect(rows[0].userId).toBe("u1");
  expect(rows[0].personId).toBe(1001);
  expect(rows[0].correctCount).toBe(0);

  await close();
});

test("bets table exists; accepts a prediction insert", async () => {
  const { db, close } = await createTestDb();
  await db.insert(users).values({ id: "u1", name: "Gal", email: "g@x.co" });

  const closeAt = new Date(Date.now() + 86_400_000);
  const [market] = await db
    .insert(markets)
    .values({ questionHe: "האם יעבור החוק?", category: "legislation", closeAt })
    .returning();

  const [outcome] = await db
    .insert(outcomes)
    .values({ marketId: market.id, labelHe: "כן", ordinal: 0 })
    .returning();

  await db.insert(bets).values({ userId: "u1", marketId: market.id, outcomeId: outcome.id });

  const rows = await db.select().from(bets);
  expect(rows).toHaveLength(1);
  expect(rows[0].userId).toBe("u1");
  expect(rows[0].marketId).toBe(market.id);
  expect(rows[0].outcomeId).toBe(outcome.id);

  await close();
});

test("bets unique(userId, marketId) — second insert for same user+market throws", async () => {
  const { db, close } = await createTestDb();
  await db.insert(users).values({ id: "u1", name: "Gal", email: "g@x.co" });

  const closeAt = new Date(Date.now() + 86_400_000);
  const [market] = await db
    .insert(markets)
    .values({ questionHe: "האם יפרוש השר?", category: "politics", closeAt })
    .returning();

  const [outcomeA] = await db
    .insert(outcomes)
    .values({ marketId: market.id, labelHe: "כן", ordinal: 0 })
    .returning();

  const [outcomeB] = await db
    .insert(outcomes)
    .values({ marketId: market.id, labelHe: "לא", ordinal: 1 })
    .returning();

  await db.insert(bets).values({ userId: "u1", marketId: market.id, outcomeId: outcomeA.id });

  // A plain second insert (not an upsert) must violate the unique constraint.
  await expect(
    db.insert(bets).values({ userId: "u1", marketId: market.id, outcomeId: outcomeB.id }),
  ).rejects.toThrow();

  await close();
});
