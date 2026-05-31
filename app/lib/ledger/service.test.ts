import { beforeEach, afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, transactions } from "@/app/lib/schema";
import { STARTING_STACK, DAILY_FAUCET } from "@/app/lib/economy";
import { FaucetCooldownError, InsufficientFundsError } from "@/app/lib/errors";
import { applyEntry, grantStartingStack, claimDailyFaucet, getBalance } from "./service";

let h: Awaited<ReturnType<typeof createTestDb>>;
const UID = "u1";
beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values({ id: UID, name: "Gal", email: "g@x.co" });
});
afterEach(async () => {
  await h.close();
});

test("grantStartingStack credits 1000 once and is idempotent", async () => {
  await grantStartingStack({ db: h.db, userId: UID });
  await grantStartingStack({ db: h.db, userId: UID });
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);
  const rows = await h.db.select().from(transactions);
  expect(rows.filter((r) => r.type === "grant").length).toBe(1);
  expect(rows[0].balanceAfter).toBe(STARTING_STACK);
});

test("claimDailyFaucet adds 200, blocks within 24h, allows after", async () => {
  await grantStartingStack({ db: h.db, userId: UID });
  await claimDailyFaucet({ db: h.db, userId: UID });
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK + DAILY_FAUCET);
  await expect(claimDailyFaucet({ db: h.db, userId: UID })).rejects.toBeInstanceOf(FaucetCooldownError);
  await h.db
    .update(users)
    .set({ lastFaucetAt: new Date(Date.now() - 25 * 3600 * 1000) })
    .where(eq(users.id, UID));
  await claimDailyFaucet({ db: h.db, userId: UID });
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK + 2 * DAILY_FAUCET);
});

test("overdraft is rejected and rolls back (no row, balance unchanged)", async () => {
  await grantStartingStack({ db: h.db, userId: UID });
  await expect(
    applyEntryInTx({ db: h.db, userId: UID, type: "bet", amount: -(STARTING_STACK + 1) }),
  ).rejects.toBeInstanceOf(InsufficientFundsError);
  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);
  expect((await h.db.select().from(transactions)).filter((r) => r.type === "bet").length).toBe(0);
});

// helper used only by the overdraft test (wraps applyEntry in a tx)
async function applyEntryInTx(a: { db: typeof h.db; userId: string; type: "bet"; amount: number }) {
  return a.db.transaction((tx) => applyEntry({ tx, userId: a.userId, type: a.type, amount: a.amount }));
}
