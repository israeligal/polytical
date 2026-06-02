import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, markets, outcomes } from "@/app/lib/schema";
import { grantStartingStack } from "@/app/lib/ledger/service";
import { placeBet, resolveMarket } from "@/app/lib/markets/service";
import { getCelebrations, acknowledgeCelebrations } from "./service";

let h: Awaited<ReturnType<typeof createTestDb>>;
let marketId: string;
let yesId: string;
let noId: string;

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: "winner", name: "מנצח", email: "w@x.co" },
    { id: "loser", name: "מפסיד", email: "l@x.co" },
  ]);
  await grantStartingStack({ db: h.db, userId: "winner" });
  await grantStartingStack({ db: h.db, userId: "loser" });
  const [m] = await h.db
    .insert(markets)
    .values({ questionHe: "האם זה יקרה?", category: "coalition", closeAt: new Date(Date.now() + 7 * 864e5) })
    .returning({ id: markets.id });
  marketId = m.id;
  const outs = await h.db
    .insert(outcomes)
    .values([{ marketId, labelHe: "כן", ordinal: 0 }, { marketId, labelHe: "לא", ordinal: 1 }])
    .returning({ id: outcomes.id });
  yesId = outs[0].id;
  noId = outs[1].id;
});
afterEach(async () => h.close());

test("getCelebrations returns won/lost unseen bets; open bets are excluded", async () => {
  await placeBet({ db: h.db, userId: "winner", marketId, outcomeId: yesId, amount: 100 });
  await placeBet({ db: h.db, userId: "loser", marketId, outcomeId: noId, amount: 100 });
  // Before resolution: bets are open → nothing to celebrate.
  expect(await getCelebrations({ db: h.db, userId: "winner" })).toEqual([]);

  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const winC = await getCelebrations({ db: h.db, userId: "winner" });
  expect(winC.length).toBe(1);
  expect(winC[0].status).toBe("won");
  expect(winC[0].payout).toBeGreaterThan(0);

  const loseC = await getCelebrations({ db: h.db, userId: "loser" });
  expect(loseC.length).toBe(1);
  expect(loseC[0].status).toBe("lost");
});

test("acknowledgeCelebrations is idempotent and scope-guarded", async () => {
  await placeBet({ db: h.db, userId: "winner", marketId, outcomeId: yesId, amount: 100 });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });
  const [c] = await getCelebrations({ db: h.db, userId: "winner" });

  // Another user can't mark the winner's bet seen.
  expect((await acknowledgeCelebrations({ db: h.db, userId: "loser", betIds: [c.betId] })).count).toBe(0);
  expect((await getCelebrations({ db: h.db, userId: "winner" })).length).toBe(1);

  expect((await acknowledgeCelebrations({ db: h.db, userId: "winner", betIds: [c.betId] })).count).toBe(1);
  expect(await getCelebrations({ db: h.db, userId: "winner" })).toEqual([]); // seen now
  // Second ack is a no-op (seenAt already set).
  expect((await acknowledgeCelebrations({ db: h.db, userId: "winner", betIds: [c.betId] })).count).toBe(0);
});

test("marketId scoping narrows celebrations to one market", async () => {
  await placeBet({ db: h.db, userId: "winner", marketId, outcomeId: yesId, amount: 100 });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });
  expect((await getCelebrations({ db: h.db, userId: "winner", marketId })).length).toBe(1);
  expect(await getCelebrations({ db: h.db, userId: "winner", marketId: yesId })).toEqual([]); // wrong id
});
