import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";

// Mock at the push-service boundary — push fires after commit, best-effort.
vi.mock("@/app/lib/push/service", () => ({ dispatchPush: vi.fn() }));
import { dispatchPush } from "@/app/lib/push/service";
const dispatchPushMock = vi.mocked(dispatchPush);

import { users, markets, outcomes, bets } from "@/app/lib/schema";
import { makePrediction, resolveMarket, voidMarket } from "@/app/lib/markets/service";
import { getCelebrations, acknowledgeCelebrations } from "./service";

let h: Awaited<ReturnType<typeof createTestDb>>;

// Identifiers filled by seedMarket().
let marketId: string;
let yesId: string;
let noId: string;

/** Seeds two users (no balance needed — stake-less) and one open market. */
async function seedUsers() {
  await h.db.insert(users).values([
    { id: "winner", name: "מנצח", email: "w@x.co" },
    { id: "loser", name: "מפסיד", email: "l@x.co" },
  ]);
}

/** Seeds an open market with YES/NO outcomes; fills module-level ids. */
async function seedMarket(opts: { status?: "open" | "closed"; closeAt?: Date } = {}) {
  const [m] = await h.db
    .insert(markets)
    .values({
      questionHe: "האם זה יקרה?",
      category: "coalition",
      status: opts.status ?? "open",
      closeAt: opts.closeAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    .returning({ id: markets.id });
  marketId = m.id;

  const outs = await h.db
    .insert(outcomes)
    .values([
      { marketId, labelHe: "כן", ordinal: 0 },
      { marketId, labelHe: "לא", ordinal: 1 },
    ])
    .returning({ id: outcomes.id });
  yesId = outs[0].id;
  noId = outs[1].id;
}

beforeEach(async () => {
  h = await createTestDb();
  dispatchPushMock.mockReset();
  dispatchPushMock.mockResolvedValue(undefined);
});
afterEach(async () => h.close());

// ---------------------------------------------------------------------------
// getCelebrations
// ---------------------------------------------------------------------------

test("getCelebrations returns empty before any resolution", async () => {
  await seedUsers();
  await seedMarket();
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  expect(await getCelebrations({ db: h.db, userId: "winner" })).toEqual([]);
});

test("getCelebrations returns correct=true for the winning predictor", async () => {
  await seedUsers();
  await seedMarket();
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const celebrations = await getCelebrations({ db: h.db, userId: "winner" });
  expect(celebrations.length).toBe(1);
  expect(celebrations[0].correct).toBe(true);
  expect(celebrations[0].marketId).toBe(marketId);
  expect(celebrations[0].outcomeLabelHe).toBe("כן");
  expect(celebrations[0].questionHe).toBe("האם זה יקרה?");
  expect(typeof celebrations[0].predictionId).toBe("string");
});

test("getCelebrations returns correct=false for the losing predictor", async () => {
  await seedUsers();
  await seedMarket();
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "loser", marketId, outcomeId: noId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const celebrations = await getCelebrations({ db: h.db, userId: "loser" });
  expect(celebrations.length).toBe(1);
  expect(celebrations[0].correct).toBe(false);
  expect(celebrations[0].outcomeLabelHe).toBe("לא");
});

test("getCelebrations excludes voided markets — no right/wrong to reveal", async () => {
  await seedUsers();
  await seedMarket();
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await voidMarket({ db: h.db, marketId });

  expect(await getCelebrations({ db: h.db, userId: "winner" })).toEqual([]);
});

test("getCelebrations excludes already-seen predictions", async () => {
  await seedUsers();
  await seedMarket();
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const [c] = await getCelebrations({ db: h.db, userId: "winner" });
  await acknowledgeCelebrations({ db: h.db, userId: "winner", predictionIds: [c.predictionId] });

  expect(await getCelebrations({ db: h.db, userId: "winner" })).toEqual([]);
});

test("getCelebrations scopes to the calling user only", async () => {
  await seedUsers();
  await seedMarket();
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "loser", marketId, outcomeId: noId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const winnerC = await getCelebrations({ db: h.db, userId: "winner" });
  const loserC = await getCelebrations({ db: h.db, userId: "loser" });

  expect(winnerC.length).toBe(1);
  expect(winnerC[0].correct).toBe(true);
  expect(loserC.length).toBe(1);
  expect(loserC[0].correct).toBe(false);
  // Each user sees only their own prediction.
  expect(winnerC[0].predictionId).not.toBe(loserC[0].predictionId);
});

test("getCelebrations marketId scoping narrows to that one market", async () => {
  await seedUsers();
  await seedMarket();

  // Second market.
  const [m2] = await h.db
    .insert(markets)
    .values({ questionHe: "שאלה שנייה?", category: "elections", closeAt: new Date(Date.now() + 7 * 864e5) })
    .returning({ id: markets.id });
  const [out2] = await h.db
    .insert(outcomes)
    .values({ marketId: m2.id, labelHe: "כן", ordinal: 0 })
    .returning({ id: outcomes.id });

  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "winner", marketId: m2.id, outcomeId: out2.id });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });
  await resolveMarket({ db: h.db, marketId: m2.id, winningOutcomeId: out2.id });

  // Scoped to first market only.
  const scoped = await getCelebrations({ db: h.db, userId: "winner", marketId });
  expect(scoped.length).toBe(1);
  expect(scoped[0].marketId).toBe(marketId);

  // Unscoped returns both.
  const all = await getCelebrations({ db: h.db, userId: "winner" });
  expect(all.length).toBe(2);

  // Wrong id returns nothing.
  expect(await getCelebrations({ db: h.db, userId: "winner", marketId: yesId })).toEqual([]);
});

test("getCelebrations returns the updated pick after a prediction is changed", async () => {
  await seedUsers();
  await seedMarket();

  // winner initially picks YES, then changes to NO before close.
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: noId });

  // Only one prediction row per user+market (upsert).
  const rows = await h.db.select().from(bets).where(eq(bets.marketId, marketId));
  expect(rows.filter((r) => r.userId === "winner").length).toBe(1);

  // Resolve YES — winner's final pick (NO) is wrong.
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const celebrations = await getCelebrations({ db: h.db, userId: "winner" });
  expect(celebrations.length).toBe(1);
  expect(celebrations[0].correct).toBe(false);
  expect(celebrations[0].outcomeLabelHe).toBe("לא");
});

// ---------------------------------------------------------------------------
// acknowledgeCelebrations
// ---------------------------------------------------------------------------

test("acknowledgeCelebrations marks a prediction seen and returns count 1", async () => {
  await seedUsers();
  await seedMarket();
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const [c] = await getCelebrations({ db: h.db, userId: "winner" });
  const result = await acknowledgeCelebrations({
    db: h.db,
    userId: "winner",
    predictionIds: [c.predictionId],
  });
  expect(result.count).toBe(1);

  // seenAt is now set; getCelebrations returns nothing.
  expect(await getCelebrations({ db: h.db, userId: "winner" })).toEqual([]);
});

test("acknowledgeCelebrations is idempotent: re-ack returns count 0", async () => {
  await seedUsers();
  await seedMarket();
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const [c] = await getCelebrations({ db: h.db, userId: "winner" });
  await acknowledgeCelebrations({ db: h.db, userId: "winner", predictionIds: [c.predictionId] });

  // Second ack on the already-seen prediction is a no-op.
  const second = await acknowledgeCelebrations({
    db: h.db,
    userId: "winner",
    predictionIds: [c.predictionId],
  });
  expect(second.count).toBe(0);
});

test("acknowledgeCelebrations is scope-guarded: another user cannot mark the prediction seen", async () => {
  await seedUsers();
  await seedMarket();
  await makePrediction({ db: h.db, userId: "winner", marketId, outcomeId: yesId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const [c] = await getCelebrations({ db: h.db, userId: "winner" });

  // loser tries to ack winner's prediction — must not update anything.
  const result = await acknowledgeCelebrations({
    db: h.db,
    userId: "loser",
    predictionIds: [c.predictionId],
  });
  expect(result.count).toBe(0);

  // winner's prediction is still unseen.
  expect((await getCelebrations({ db: h.db, userId: "winner" })).length).toBe(1);
});

test("acknowledgeCelebrations with an empty array returns count 0 without throwing", async () => {
  await seedUsers();
  const result = await acknowledgeCelebrations({ db: h.db, userId: "winner", predictionIds: [] });
  expect(result.count).toBe(0);
});

test("acknowledgeCelebrations filters out non-string/empty entries gracefully", async () => {
  await seedUsers();
  // Pass a mix of empty strings — the service strips them out.
  const result = await acknowledgeCelebrations({
    db: h.db,
    userId: "winner",
    predictionIds: ["", "  ".trim(), ""],
  });
  expect(result.count).toBe(0);
});

test("acknowledgeCelebrations on an unseen prediction of a lost bet still marks it seen", async () => {
  await seedUsers();
  await seedMarket();
  await makePrediction({ db: h.db, userId: "loser", marketId, outcomeId: noId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const [c] = await getCelebrations({ db: h.db, userId: "loser" });
  expect(c.correct).toBe(false);

  const result = await acknowledgeCelebrations({
    db: h.db,
    userId: "loser",
    predictionIds: [c.predictionId],
  });
  expect(result.count).toBe(1);
  expect(await getCelebrations({ db: h.db, userId: "loser" })).toEqual([]);
});
