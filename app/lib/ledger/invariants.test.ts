import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, transactions } from "@/app/lib/schema";
import { MAX_BALANCE } from "@/app/lib/economy";
import { BalanceOverflowError } from "@/app/lib/errors";
import { applyEntry, getBalance, grantStartingStack } from "./service";

let h: Awaited<ReturnType<typeof createTestDb>>;
const UID = "u1";
beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values({ id: UID, name: "Gal", email: "g@x.co" });
});
afterEach(async () => {
  await h.close();
});

test("applyEntry rejects a credit beyond MAX_BALANCE and rolls back", async () => {
  await grantStartingStack({ db: h.db, userId: UID });
  await expect(
    h.db.transaction((tx) => applyEntry({ tx, userId: UID, type: "payout", amount: MAX_BALANCE })),
  ).rejects.toBeInstanceOf(BalanceOverflowError);
  expect(await getBalance({ db: h.db, userId: UID })).toBe(1000); // unchanged
});

test("DB rejects a second grant row per user (one_grant_per_user partial unique index)", async () => {
  await grantStartingStack({ db: h.db, userId: UID });
  // even bypassing the service layer, the DB invariant blocks a duplicate grant
  await expect(
    h.db.insert(transactions).values({ userId: UID, type: "grant", amount: 1000, balanceAfter: 2000 }),
  ).rejects.toThrow();
});
