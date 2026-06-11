import { beforeEach, afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import {
  users,
  markets,
  outcomes,
  bets,
  marketPoliticians,
  politicians,
} from "@/app/lib/schema";
import {
  getMarketOfTheDay,
  getMarketsForPolitician,
  createMarket,
  searchMarkets,
  upsertPrediction,
  listPredictions,
  getOutcomeCounts,
  getMarketPoliticianRoles,
  bumpUserStats,
  getUserPredictions,
} from "./repo";

let h: Awaited<ReturnType<typeof createTestDb>>;
const UID = "u1";
const UID2 = "u2";

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: UID, name: "Gal", email: "g@x.co" },
    { id: UID2, name: "Dana", email: "d@x.co" },
  ]);
});
afterEach(async () => {
  await h.close();
});

// --- Helpers ---

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

/** Inserts a second outcome for a market, returns its id. */
async function addOutcome(marketId: string, labelHe: string, ordinal = 1) {
  const [o] = await h.db
    .insert(outcomes)
    .values({ marketId, labelHe, ordinal })
    .returning({ id: outcomes.id });
  return o.id;
}

/** Places predictions for N distinct auto-generated users (for crowd-split tests).
 *  Ids are scoped by outcome so two calls on the same market don't collide. */
async function seedPredictions(marketId: string, outcomeId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const uid = `crowd-${marketId}-${outcomeId}-${i}`;
    await h.db.insert(users).values({ id: uid, name: `User ${i}`, email: `${uid}@x.co` });
    await h.db.insert(bets).values({ userId: uid, marketId, outcomeId });
  }
}

// ================================================================
// getMarketOfTheDay
// ================================================================

test("getMarketOfTheDay returns the open market with the most bets", async () => {
  const quiet = await newMarket("שוק שקט");
  const busy = await newMarket("שוק סוער");
  await seedPredictions(quiet.marketId, quiet.outcomeId, 1);
  await seedPredictions(busy.marketId, busy.outcomeId, 5);

  const motd = await getMarketOfTheDay({ db: h.db });
  expect(motd?.id).toBe(busy.marketId);
  expect(motd?.questionHe).toBe("שוק סוער");
});

test("getMarketOfTheDay ignores non-open markets even if busier", async () => {
  const open = await newMarket("שוק פתוח");
  const resolved = await newMarket("שוק סגור", "resolved");
  await seedPredictions(open.marketId, open.outcomeId, 1);
  await seedPredictions(resolved.marketId, resolved.outcomeId, 9); // busier but not open

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

// ================================================================
// getMarketsForPolitician
// ================================================================

test("getMarketsForPolitician returns only OPEN markets featuring the MK, as bundles", async () => {
  const mine = await newMarket("שוק על ח״כ 100");
  const other = await newMarket("שוק על מישהו אחר");
  const settled = await newMarket("שוק שהוכרע על ח״כ 100", "resolved");
  await h.db.insert(marketPoliticians).values([
    { marketId: mine.marketId, personId: 100 },
    { marketId: other.marketId, personId: 200 },
    { marketId: settled.marketId, personId: 100 }, // resolved → excluded
  ]);

  const bundles = await getMarketsForPolitician({ db: h.db, personId: 100 });
  expect(bundles.length).toBe(1);
  expect(bundles[0].market.id).toBe(mine.marketId);
  expect(bundles[0].personIds).toEqual([100]);
  expect(bundles[0].outcomes.map((o) => o.labelHe)).toEqual(["כן"]);

  expect(await getMarketsForPolitician({ db: h.db, personId: 999 })).toEqual([]);
});

// ================================================================
// createMarket (composite write)
// ================================================================

test("createMarket joins an existing tx when passed one (atomic with a caller's tx)", async () => {
  await expect(
    h.db.transaction(async (tx) => {
      await createMarket({
        tx,
        questionHe: "שוק בתוך טרנזקציה",
        category: "coalition",
        type: "binary",
        closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        outcomes: [
          { labelHe: "כן", ordinal: 0 },
          { labelHe: "לא", ordinal: 1 },
        ],
        personIds: [100],
      });
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect((await h.db.select().from(markets)).length).toBe(0);
  expect((await h.db.select().from(marketPoliticians)).length).toBe(0);
});

test("createMarket populates the normalized searchText; searchMarkets finds it", async () => {
  const { marketId } = await createMarket({
    db: h.db,
    questionHe: "האם הקואליציה תשרוד את מושב הקיץ?",
    category: "coalition",
    closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    outcomes: [
      { labelHe: "כן", ordinal: 0 },
      { labelHe: "לא", ordinal: 1 },
    ],
  });
  const [row] = await h.db.select().from(markets).where(eq(markets.id, marketId));
  expect(row.searchText).toContain("קואליציה");

  const hits = await searchMarkets({ db: h.db, q: "קואליציה" });
  expect(hits.map((m) => m.id)).toContain(marketId);

  // A draft market is not discoverable.
  await h.db.update(markets).set({ status: "draft" }).where(eq(markets.id, marketId));
  expect(await searchMarkets({ db: h.db, q: "קואליציה" })).toEqual([]);
});

test("createMarket auto-features outcome-linked politicians (union with explicit ids, deduped)", async () => {
  const { marketId } = await createMarket({
    db: h.db,
    questionHe: "מי ירכיב את הממשלה הבאה?",
    category: "coalition",
    type: "multi",
    closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    outcomes: [
      { labelHe: "מועמד א", cat: 1, ordinal: 0, personId: 90 },
      { labelHe: "מועמד ב", cat: 2, ordinal: 1, personId: 2107 },
      { labelHe: "אחר", cat: 3, ordinal: 2 },
    ],
    // 90 is ALSO outcome-linked → must not produce a duplicate link row.
    personIds: [90, 555],
  });

  const links = await h.db
    .select()
    .from(marketPoliticians)
    .where(eq(marketPoliticians.marketId, marketId));
  expect(links.map((l) => l.personId).sort((a, b) => a - b)).toEqual([90, 555, 2107]);

  const outs = await h.db.select().from(outcomes).where(eq(outcomes.marketId, marketId));
  outs.sort((a, b) => a.ordinal - b.ordinal);
  expect(outs.map((o) => o.personId)).toEqual([90, 2107, null]);
});

// ================================================================
// upsertPrediction — one-per-market, changeable pick
// ================================================================

test("upsertPrediction creates a prediction and returns its id", async () => {
  const { marketId, outcomeId } = await newMarket("שוק חדש");

  const { id } = await h.db.transaction(async (tx) =>
    upsertPrediction({ tx, userId: UID, marketId, outcomeId }),
  );

  expect(id).toBeTruthy();
  const rows = await h.db.select().from(bets).where(eq(bets.marketId, marketId));
  expect(rows.length).toBe(1);
  expect(rows[0].outcomeId).toBe(outcomeId);
});

test("upsertPrediction enforces one pick per user+market — second call updates the pick", async () => {
  const { marketId, outcomeId } = await newMarket("שוק בחירה");
  const altOutcomeId = await addOutcome(marketId, "לא", 1);

  const first = await h.db.transaction(async (tx) =>
    upsertPrediction({ tx, userId: UID, marketId, outcomeId }),
  );
  const second = await h.db.transaction(async (tx) =>
    upsertPrediction({ tx, userId: UID, marketId, outcomeId: altOutcomeId }),
  );

  // Same row id is returned and the outcome was updated in place.
  const rows = await h.db.select().from(bets).where(eq(bets.marketId, marketId));
  expect(rows.length).toBe(1);
  expect(rows[0].id).toBe(first.id);
  expect(rows[0].id).toBe(second.id);
  expect(rows[0].outcomeId).toBe(altOutcomeId);
});

test("upsertPrediction is isolated per user — two users each get their own row", async () => {
  const { marketId, outcomeId } = await newMarket("שוק משותף");
  const altOutcomeId = await addOutcome(marketId, "לא", 1);

  await h.db.transaction(async (tx) =>
    upsertPrediction({ tx, userId: UID, marketId, outcomeId }),
  );
  await h.db.transaction(async (tx) =>
    upsertPrediction({ tx, userId: UID2, marketId, outcomeId: altOutcomeId }),
  );

  const rows = await h.db.select().from(bets).where(eq(bets.marketId, marketId));
  expect(rows.length).toBe(2);
  const byUser = new Map(rows.map((r) => [r.userId, r.outcomeId]));
  expect(byUser.get(UID)).toBe(outcomeId);
  expect(byUser.get(UID2)).toBe(altOutcomeId);
});

// ================================================================
// listPredictions
// ================================================================

test("listPredictions returns all predictions on a market, empty for others", async () => {
  const m1 = await newMarket("שוק א");
  const m2 = await newMarket("שוק ב");

  await h.db.transaction(async (tx) =>
    upsertPrediction({ tx, userId: UID, marketId: m1.marketId, outcomeId: m1.outcomeId }),
  );
  await h.db.transaction(async (tx) =>
    upsertPrediction({ tx, userId: UID2, marketId: m1.marketId, outcomeId: m1.outcomeId }),
  );

  const m1Preds = await h.db.transaction(async (tx) =>
    listPredictions({ tx, marketId: m1.marketId }),
  );
  expect(m1Preds.length).toBe(2);
  expect(m1Preds.every((p) => p.marketId === m1.marketId)).toBe(true);

  const m2Preds = await h.db.transaction(async (tx) =>
    listPredictions({ tx, marketId: m2.marketId }),
  );
  expect(m2Preds.length).toBe(0);
});

// ================================================================
// getOutcomeCounts — crowd-split Map
// ================================================================

test("getOutcomeCounts returns correct per-outcome counts as a Map", async () => {
  const { marketId, outcomeId } = await newMarket("שוק ספירה");
  const altId = await addOutcome(marketId, "לא", 1);

  // 3 predictors on outcomeId, 2 on altId
  await seedPredictions(marketId, outcomeId, 3);
  await seedPredictions(marketId, altId, 2);

  const counts = await getOutcomeCounts({ db: h.db, marketId });
  expect(counts.get(outcomeId)).toBe(3);
  expect(counts.get(altId)).toBe(2);
});

test("getOutcomeCounts returns an empty Map for a market with no predictions", async () => {
  const { marketId } = await newMarket("שוק ריק");
  const counts = await getOutcomeCounts({ db: h.db, marketId });
  expect(counts.size).toBe(0);
});

// ================================================================
// getMarketPoliticianRoles
// ================================================================

test("getMarketPoliticianRoles returns personId+roleHe for linked politicians", async () => {
  const { marketId } = await newMarket("שוק עם פוליטיקאים");

  // Insert a politician with a known role
  await h.db.insert(politicians).values({
    personId: 42,
    nameHe: "ח״כ לדוגמה",
    roleHe: "חבר הכנסת",
    sourceDataset: "test",
    sourceUrl: "https://example.com",
    fetchedAt: new Date("2024-01-01T00:00:00Z"),
  });
  await h.db.insert(marketPoliticians).values([
    { marketId, personId: 42 },
    { marketId, personId: 99 }, // no politicians row → roleHe will be null
  ]);

  const roles = await h.db.transaction(async (tx) =>
    getMarketPoliticianRoles({ tx, marketId }),
  );

  expect(roles.length).toBe(2);
  const byPerson = new Map(roles.map((r) => [r.personId, r.roleHe]));
  expect(byPerson.get(42)).toBe("חבר הכנסת");
  expect(byPerson.get(99)).toBeNull(); // left-join miss
});

test("getMarketPoliticianRoles returns empty array for a market with no linked politicians", async () => {
  const { marketId } = await newMarket("שוק בלי פוליטיקאים");
  const roles = await h.db.transaction(async (tx) =>
    getMarketPoliticianRoles({ tx, marketId }),
  );
  expect(roles).toEqual([]);
});

// ================================================================
// bumpUserStats — accuracy counters
// ================================================================

test("bumpUserStats increments totalResolved for both right and wrong predictions", async () => {
  await h.db.transaction(async (tx) => {
    await bumpUserStats({ tx, userId: UID, won: false });
    await bumpUserStats({ tx, userId: UID, won: false });
  });

  const [row] = await h.db.select().from(users).where(eq(users.id, UID));
  expect(row.totalResolved).toBe(2);
  expect(row.totalWins).toBe(0);
});

test("bumpUserStats increments totalWins only when won=true", async () => {
  await h.db.transaction(async (tx) => {
    await bumpUserStats({ tx, userId: UID, won: true });
    await bumpUserStats({ tx, userId: UID, won: false });
    await bumpUserStats({ tx, userId: UID, won: true });
  });

  const [row] = await h.db.select().from(users).where(eq(users.id, UID));
  expect(row.totalResolved).toBe(3);
  expect(row.totalWins).toBe(2);
});

test("bumpUserStats is scoped to the target user — other users are untouched", async () => {
  await h.db.transaction(async (tx) => {
    await bumpUserStats({ tx, userId: UID, won: true });
  });

  const [u2row] = await h.db.select().from(users).where(eq(users.id, UID2));
  expect(u2row.totalResolved).toBe(0);
  expect(u2row.totalWins).toBe(0);
});

// ================================================================
// getUserPredictions — portfolio shape
// ================================================================

test("getUserPredictions returns PortfolioPrediction rows with the correct shape", async () => {
  const { marketId, outcomeId } = await newMarket("שוק לפורטפוליו");

  await h.db.transaction(async (tx) =>
    upsertPrediction({ tx, userId: UID, marketId, outcomeId }),
  );

  const predictions = await getUserPredictions({ db: h.db, userId: UID });
  expect(predictions.length).toBe(1);

  const p = predictions[0];
  expect(p.predictionId).toBeTruthy();
  expect(p.marketId).toBe(marketId);
  expect(p.questionHe).toBe("שוק לפורטפוליו");
  expect(p.marketStatus).toBe("open");
  expect(p.outcomeId).toBe(outcomeId);
  expect(p.outcomeLabelHe).toBe("כן");
  expect(p.resolvedOutcomeId).toBeNull();
  expect(p.createdAt).toBeInstanceOf(Date);
  // marketType is present (binary default)
  expect(p.marketType).toBe("binary");
});

test("getUserPredictions returns empty array for a user with no predictions", async () => {
  expect(await getUserPredictions({ db: h.db, userId: UID })).toEqual([]);
});

test("getUserPredictions is scoped to the requesting user — never returns other users' picks", async () => {
  const { marketId, outcomeId } = await newMarket("שוק פרטי");

  await h.db.transaction(async (tx) =>
    upsertPrediction({ tx, userId: UID2, marketId, outcomeId }),
  );

  const predictions = await getUserPredictions({ db: h.db, userId: UID });
  expect(predictions.length).toBe(0);
});

test("getUserPredictions returns newest predictions first", async () => {
  const m1 = await newMarket("שוק ראשון");
  const m2 = await newMarket("שוק שני");

  await h.db.transaction(async (tx) =>
    upsertPrediction({ tx, userId: UID, marketId: m1.marketId, outcomeId: m1.outcomeId }),
  );
  await h.db.transaction(async (tx) =>
    upsertPrediction({ tx, userId: UID, marketId: m2.marketId, outcomeId: m2.outcomeId }),
  );

  const predictions = await getUserPredictions({ db: h.db, userId: UID });
  expect(predictions.length).toBe(2);
  // Newest (m2) should be first
  expect(predictions[0].marketId).toBe(m2.marketId);
  expect(predictions[1].marketId).toBe(m1.marketId);
});
