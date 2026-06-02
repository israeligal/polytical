import { beforeEach, afterEach, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, politicians, cardCollections, transactions } from "@/app/lib/schema";
import { grantStartingStack, getBalance } from "@/app/lib/ledger/service";
import { COLLECT_COST } from "@/app/lib/economy";
import { collectCard, isOwned, getOwnedPersonIds, listCollection } from "./service";
import { AlreadyOwnedError, InsufficientFundsError, UnknownPoliticianError } from "@/app/lib/errors";

let h: Awaited<ReturnType<typeof createTestDb>>;

const mk = (personId: number, nameHe: string) => ({
  personId,
  nameHe,
  sourceDataset: "test",
  sourceUrl: "https://example.test",
  fetchedAt: new Date("2026-01-01T00:00:00Z"),
});

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: "rich", name: "עשיר", email: "r@x.co" },
    { id: "broke", name: "מך", email: "b@x.co" }, // balance 0, no starting grant
  ]);
  await grantStartingStack({ db: h.db, userId: "rich" }); // 1000
  await h.db.insert(politicians).values([mk(101, "ביבי"), mk(102, "לפיד")]);
});
afterEach(async () => h.close());

test("collectCard debits COLLECT_COST, records ownership, writes one collect ledger row", async () => {
  const { balanceAfter } = await collectCard({ db: h.db, userId: "rich", personId: 101 });
  expect(balanceAfter).toBe(1000 - COLLECT_COST);
  expect(await getBalance({ db: h.db, userId: "rich" })).toBe(1000 - COLLECT_COST);
  expect(await isOwned({ db: h.db, userId: "rich", personId: 101 })).toBe(true);

  const ledger = await h.db
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, "rich"), eq(transactions.type, "collect")));
  expect(ledger.length).toBe(1);
  expect(ledger[0].amount).toBe(-COLLECT_COST);
});

test("collecting the same card twice is rejected; no double debit, one ownership row", async () => {
  await collectCard({ db: h.db, userId: "rich", personId: 101 });
  await expect(collectCard({ db: h.db, userId: "rich", personId: 101 })).rejects.toBeInstanceOf(AlreadyOwnedError);

  expect(await getBalance({ db: h.db, userId: "rich" })).toBe(1000 - COLLECT_COST); // unchanged
  const owned = await h.db
    .select()
    .from(cardCollections)
    .where(and(eq(cardCollections.userId, "rich"), eq(cardCollections.personId, 101)));
  expect(owned.length).toBe(1);
});

test("an unknown personId is rejected by stable id (never fuzzy)", async () => {
  await expect(collectCard({ db: h.db, userId: "rich", personId: 999 })).rejects.toBeInstanceOf(
    UnknownPoliticianError,
  );
});

test("insufficient funds: no ownership recorded and no debit", async () => {
  await expect(collectCard({ db: h.db, userId: "broke", personId: 101 })).rejects.toBeInstanceOf(
    InsufficientFundsError,
  );
  expect(await isOwned({ db: h.db, userId: "broke", personId: 101 })).toBe(false);
  expect(await getBalance({ db: h.db, userId: "broke" })).toBe(0);
});

test("getOwnedPersonIds + listCollection reflect collected cards", async () => {
  await collectCard({ db: h.db, userId: "rich", personId: 101 });
  await collectCard({ db: h.db, userId: "rich", personId: 102 });

  const owned = await getOwnedPersonIds({ db: h.db, userId: "rich" });
  expect(owned.has(101)).toBe(true);
  expect(owned.has(102)).toBe(true);
  expect(owned.size).toBe(2);

  const list = await listCollection({ db: h.db, userId: "rich" });
  expect(list.map((c) => c.personId).sort()).toEqual([101, 102]);
});
