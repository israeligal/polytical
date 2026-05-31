import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, transactions } from "@/app/lib/schema";
import { STARTING_STACK, DAILY_FAUCET, FAUCET_COOLDOWN_MS } from "@/app/lib/economy";
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

test("faucet at the exact 24h boundary clears; one ms short is still on cooldown", async () => {
  // Freeze the wall clock: the guard compares Date.now() against lastFaucetAt,
  // so a fixed "now" lets us probe the EXACT boundary instead of racing the
  // real clock between the setup UPDATE and the guard read. The guard is
  // `elapsed < COOLDOWN` (strict), i.e. blocked only while STRICTLY under 24h.
  const T0 = new Date("2026-05-31T12:00:00.000Z");
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  try {
    await grantStartingStack({ db: h.db, userId: UID });

    // 1 ms short of 24h: elapsed === COOLDOWN − 1 < COOLDOWN → still blocked.
    await h.db
      .update(users)
      .set({ lastFaucetAt: new Date(T0.getTime() - FAUCET_COOLDOWN_MS + 1) })
      .where(eq(users.id, UID));
    await expect(claimDailyFaucet({ db: h.db, userId: UID })).rejects.toBeInstanceOf(
      FaucetCooldownError,
    );
    expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);

    // Exactly 24h elapsed: elapsed === COOLDOWN, NOT < COOLDOWN → claim clears.
    await h.db
      .update(users)
      .set({ lastFaucetAt: new Date(T0.getTime() - FAUCET_COOLDOWN_MS) })
      .where(eq(users.id, UID));
    await claimDailyFaucet({ db: h.db, userId: UID });
    expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK + DAILY_FAUCET);
  } finally {
    vi.useRealTimers();
  }
});

test("two sequential grants for two different users isolate (no cross-contamination)", async () => {
  const OTHER = "u2";
  await h.db.insert(users).values({ id: OTHER, name: "Dana", email: "d@x.co" });

  await grantStartingStack({ db: h.db, userId: UID });
  await grantStartingStack({ db: h.db, userId: OTHER });

  expect(await getBalance({ db: h.db, userId: UID })).toBe(STARTING_STACK);
  expect(await getBalance({ db: h.db, userId: OTHER })).toBe(STARTING_STACK);

  // Each user owns exactly one grant row; ledgers do not bleed across users.
  for (const id of [UID, OTHER]) {
    const grants = await h.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.userId, id), eq(transactions.type, "grant")));
    expect(grants.length).toBe(1);
    expect(grants[0].balanceAfter).toBe(STARTING_STACK);
  }
});

test("a payout credit then a bet debit leave correct balanceAfter on each row", async () => {
  await grantStartingStack({ db: h.db, userId: UID }); // 1000

  // payout +300 → 1300, then bet -500 → 800. Run inside one tx each, since
  // applyEntry joins an existing tx (it is the authoritative writer).
  const payout = await h.db.transaction((tx) =>
    applyEntry({ tx, userId: UID, type: "payout", amount: 300, refMarketId: "m1", refBetId: "b1" }),
  );
  expect(payout.balanceAfter).toBe(STARTING_STACK + 300);

  const bet = await h.db.transaction((tx) =>
    applyEntry({ tx, userId: UID, type: "bet", amount: -500, refMarketId: "m1", refBetId: "b2" }),
  );
  expect(bet.balanceAfter).toBe(STARTING_STACK + 300 - 500);

  expect(await getBalance({ db: h.db, userId: UID })).toBe(800);

  // The per-row balanceAfter snapshots match the running balance in order.
  const ledger = await h.db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, UID))
    .orderBy(transactions.createdAt);
  expect(ledger.map((r) => [r.type, r.amount, r.balanceAfter])).toEqual([
    ["grant", STARTING_STACK, STARTING_STACK],
    ["payout", 300, 1300],
    ["bet", -500, 800],
  ]);
});

// helper used only by the overdraft test (wraps applyEntry in a tx)
async function applyEntryInTx(a: { db: typeof h.db; userId: string; type: "bet"; amount: number }) {
  return a.db.transaction((tx) => applyEntry({ tx, userId: a.userId, type: a.type, amount: a.amount }));
}
