import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, politicians, markets, outcomes, marketPoliticians, cardCollections } from "@/app/lib/schema";
import { isOwned, getOwnedPersonIds, listCollection, getProgressByPerson } from "./service";
import { resolveMarket, makePrediction } from "@/app/lib/markets/service";

// Mock push at the service boundary: push fires post-commit, fire-and-forget.
vi.mock("@/app/lib/push/service", () => ({ dispatchPush: vi.fn().mockResolvedValue(undefined) }));

let h: Awaited<ReturnType<typeof createTestDb>>;

// Stable politician seed helper — mirrors the shape of the politicians table.
const mkPolitician = (personId: number, nameHe: string, roleHe: string) => ({
  personId,
  nameHe,
  roleHe,
  sourceDataset: "test",
  sourceUrl: "https://example.test",
  fetchedAt: new Date("2026-01-01T00:00:00Z"),
  searchName: nameHe,
});

/** Seed one open market with two outcomes, linked to a politician via
 *  market_politicians. Returns the market + outcome ids. */
async function seedMarketForPolitician(personId: number) {
  const [m] = await h.db
    .insert(markets)
    .values({
      questionHe: "האם ינצח?",
      category: "coalition",
      status: "open",
      closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    .returning({ id: markets.id });

  const outs = await h.db
    .insert(outcomes)
    .values([
      { marketId: m.id, labelHe: "כן", ordinal: 0 },
      { marketId: m.id, labelHe: "לא", ordinal: 1 },
    ])
    .returning({ id: outcomes.id });

  await h.db.insert(marketPoliticians).values({ marketId: m.id, personId });

  return { marketId: m.id, yesId: outs[0].id, noId: outs[1].id };
}

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: "alice", name: "אליס", email: "alice@x.co" },
    { id: "bob", name: "בוב", email: "bob@x.co" },
  ]);
  // common role (חבר הכנסת) => threshold 2; easy to unlock in tests.
  await h.db.insert(politicians).values([
    mkPolitician(101, "ביבי", "חבר הכנסת"),   // common → threshold 2
    mkPolitician(102, "לפיד", "חבר הכנסת"),   // common → threshold 2
    mkPolitician(103, "גנץ", "שר הביטחון"),   // legendary → threshold 10
  ]);
});
afterEach(async () => h.close());

// ---------------------------------------------------------------------------
// Initial state — empty collection
// ---------------------------------------------------------------------------

test("getOwnedPersonIds is empty before any unlock", async () => {
  const owned = await getOwnedPersonIds({ db: h.db, userId: "alice" });
  expect(owned.size).toBe(0);
});

test("isOwned returns false before any unlock", async () => {
  expect(await isOwned({ db: h.db, userId: "alice", personId: 101 })).toBe(false);
});

test("listCollection is empty before any unlock", async () => {
  const list = await listCollection({ db: h.db, userId: "alice" });
  expect(list).toHaveLength(0);
});

test("getProgressByPerson is empty before any prediction resolves", async () => {
  const progress = await getProgressByPerson({ db: h.db, userId: "alice" });
  expect(progress.size).toBe(0);
});

// ---------------------------------------------------------------------------
// Card unlocks by accuracy (common MK, threshold = 2)
// ---------------------------------------------------------------------------

test("one correct prediction advances progress but does not unlock (need 2 for common)", async () => {
  const { marketId, yesId } = await seedMarketForPolitician(101);
  await makePrediction({ db: h.db, userId: "alice", marketId, outcomeId: yesId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  // Progress is 1 — still below threshold 2.
  const progress = await getProgressByPerson({ db: h.db, userId: "alice" });
  expect(progress.get(101)).toBe(1);

  // Card NOT yet granted.
  expect(await isOwned({ db: h.db, userId: "alice", personId: 101 })).toBe(false);
  const owned = await getOwnedPersonIds({ db: h.db, userId: "alice" });
  expect(owned.has(101)).toBe(false);
});

test("two correct predictions on markets featuring MK 101 unlock the card (common threshold = 2)", async () => {
  const m1 = await seedMarketForPolitician(101);
  const m2 = await seedMarketForPolitician(101);

  // First correct prediction.
  await makePrediction({ db: h.db, userId: "alice", marketId: m1.marketId, outcomeId: m1.yesId });
  await resolveMarket({ db: h.db, marketId: m1.marketId, winningOutcomeId: m1.yesId });

  expect(await isOwned({ db: h.db, userId: "alice", personId: 101 })).toBe(false);

  // Second correct prediction — crosses threshold.
  await makePrediction({ db: h.db, userId: "alice", marketId: m2.marketId, outcomeId: m2.yesId });
  await resolveMarket({ db: h.db, marketId: m2.marketId, winningOutcomeId: m2.yesId });

  expect(await isOwned({ db: h.db, userId: "alice", personId: 101 })).toBe(true);

  // getOwnedPersonIds reflects the unlocked card.
  const owned = await getOwnedPersonIds({ db: h.db, userId: "alice" });
  expect(owned.has(101)).toBe(true);
  expect(owned.size).toBe(1);

  // listCollection has exactly one entry for the right politician.
  const list = await listCollection({ db: h.db, userId: "alice" });
  expect(list.map((c) => c.personId)).toEqual([101]);

  // Progress bumped to 2.
  const progress = await getProgressByPerson({ db: h.db, userId: "alice" });
  expect(progress.get(101)).toBe(2);
});

test("a wrong prediction does not advance progress or unlock the card", async () => {
  const { marketId, yesId, noId } = await seedMarketForPolitician(101);
  await makePrediction({ db: h.db, userId: "alice", marketId, outcomeId: noId }); // picks NO
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId }); // YES wins → alice is wrong

  const progress = await getProgressByPerson({ db: h.db, userId: "alice" });
  expect(progress.get(101)).toBeUndefined(); // zero progress

  expect(await isOwned({ db: h.db, userId: "alice", personId: 101 })).toBe(false);
});

test("only the correct predictor gets progress; the wrong predictor does not", async () => {
  const { marketId, yesId, noId } = await seedMarketForPolitician(101);
  await makePrediction({ db: h.db, userId: "alice", marketId, outcomeId: yesId }); // correct
  await makePrediction({ db: h.db, userId: "bob", marketId, outcomeId: noId });    // wrong
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  const aliceProgress = await getProgressByPerson({ db: h.db, userId: "alice" });
  expect(aliceProgress.get(101)).toBe(1);

  const bobProgress = await getProgressByPerson({ db: h.db, userId: "bob" });
  expect(bobProgress.get(101)).toBeUndefined();

  expect(await isOwned({ db: h.db, userId: "bob", personId: 101 })).toBe(false);
});

test("each user's progress and collection are independent", async () => {
  const m1 = await seedMarketForPolitician(101);
  const m2 = await seedMarketForPolitician(101);

  // Alice is correct on both; Bob is correct on only one.
  await makePrediction({ db: h.db, userId: "alice", marketId: m1.marketId, outcomeId: m1.yesId });
  await makePrediction({ db: h.db, userId: "bob",   marketId: m1.marketId, outcomeId: m1.yesId });
  await resolveMarket({ db: h.db, marketId: m1.marketId, winningOutcomeId: m1.yesId });

  await makePrediction({ db: h.db, userId: "alice", marketId: m2.marketId, outcomeId: m2.yesId });
  await makePrediction({ db: h.db, userId: "bob",   marketId: m2.marketId, outcomeId: m2.noId }); // wrong
  await resolveMarket({ db: h.db, marketId: m2.marketId, winningOutcomeId: m2.yesId });

  // Alice unlocked the card; Bob did not.
  expect(await isOwned({ db: h.db, userId: "alice", personId: 101 })).toBe(true);
  expect(await isOwned({ db: h.db, userId: "bob",   personId: 101 })).toBe(false);

  const aliceProgress = await getProgressByPerson({ db: h.db, userId: "alice" });
  expect(aliceProgress.get(101)).toBe(2);

  const bobProgress = await getProgressByPerson({ db: h.db, userId: "bob" });
  expect(bobProgress.get(101)).toBe(1);
});

// ---------------------------------------------------------------------------
// Idempotency — re-resolving does not double-grant
// ---------------------------------------------------------------------------

test("re-resolving an already-resolved market throws AlreadyResolvedError and does not double-bump progress", async () => {
  const { marketId, yesId } = await seedMarketForPolitician(101);
  await makePrediction({ db: h.db, userId: "alice", marketId, outcomeId: yesId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId });

  // Attempt to resolve again — must be rejected.
  const { AlreadyResolvedError } = await import("@/app/lib/errors");
  await expect(
    resolveMarket({ db: h.db, marketId, winningOutcomeId: yesId }),
  ).rejects.toBeInstanceOf(AlreadyResolvedError);

  // Progress must still be 1, not 2 (no double-bump).
  const progress = await getProgressByPerson({ db: h.db, userId: "alice" });
  expect(progress.get(101)).toBe(1);
});

test("card granted once: the unique index prevents double-ownership even if threshold is crossed again", async () => {
  // Unlock the card via 2 correct predictions.
  const m1 = await seedMarketForPolitician(101);
  const m2 = await seedMarketForPolitician(101);
  await makePrediction({ db: h.db, userId: "alice", marketId: m1.marketId, outcomeId: m1.yesId });
  await resolveMarket({ db: h.db, marketId: m1.marketId, winningOutcomeId: m1.yesId });
  await makePrediction({ db: h.db, userId: "alice", marketId: m2.marketId, outcomeId: m2.yesId });
  await resolveMarket({ db: h.db, marketId: m2.marketId, winningOutcomeId: m2.yesId });

  expect(await isOwned({ db: h.db, userId: "alice", personId: 101 })).toBe(true);

  // A third correct prediction beyond threshold must not insert a duplicate row.
  const m3 = await seedMarketForPolitician(101);
  await makePrediction({ db: h.db, userId: "alice", marketId: m3.marketId, outcomeId: m3.yesId });
  await resolveMarket({ db: h.db, marketId: m3.marketId, winningOutcomeId: m3.yesId });

  // Still exactly one card_collections row for (alice, 101).
  const rows = await h.db
    .select()
    .from(cardCollections)
    .where(eq(cardCollections.userId, "alice"));
  expect(rows.filter((r) => r.personId === 101).length).toBe(1);

  // Progress is now 3 — the count keeps growing even after the card is owned.
  const progress = await getProgressByPerson({ db: h.db, userId: "alice" });
  expect(progress.get(101)).toBe(3);
});

// ---------------------------------------------------------------------------
// Multiple politicians in one market
// ---------------------------------------------------------------------------

test("resolveMarket bumps progress for ALL featured politicians when the predictor is correct", async () => {
  // Create a market featuring both MK 101 and MK 102.
  const [m] = await h.db
    .insert(markets)
    .values({ questionHe: "שאלה עם שניים?", category: "coalition", status: "open", closeAt: new Date(Date.now() + 86400 * 1000) })
    .returning({ id: markets.id });
  const outs = await h.db
    .insert(outcomes)
    .values([{ marketId: m.id, labelHe: "כן", ordinal: 0 }, { marketId: m.id, labelHe: "לא", ordinal: 1 }])
    .returning({ id: outcomes.id });
  await h.db.insert(marketPoliticians).values([
    { marketId: m.id, personId: 101 },
    { marketId: m.id, personId: 102 },
  ]);

  await makePrediction({ db: h.db, userId: "alice", marketId: m.id, outcomeId: outs[0].id });
  await resolveMarket({ db: h.db, marketId: m.id, winningOutcomeId: outs[0].id });

  const progress = await getProgressByPerson({ db: h.db, userId: "alice" });
  expect(progress.get(101)).toBe(1);
  expect(progress.get(102)).toBe(1);
});

test("one correct prediction on a dual-politician market does not unlock either card (threshold 2)", async () => {
  const [m] = await h.db
    .insert(markets)
    .values({ questionHe: "שאלה עם שניים?", category: "coalition", status: "open", closeAt: new Date(Date.now() + 86400 * 1000) })
    .returning({ id: markets.id });
  const outs = await h.db
    .insert(outcomes)
    .values([{ marketId: m.id, labelHe: "כן", ordinal: 0 }, { marketId: m.id, labelHe: "לא", ordinal: 1 }])
    .returning({ id: outcomes.id });
  await h.db.insert(marketPoliticians).values([
    { marketId: m.id, personId: 101 },
    { marketId: m.id, personId: 102 },
  ]);

  await makePrediction({ db: h.db, userId: "alice", marketId: m.id, outcomeId: outs[0].id });
  await resolveMarket({ db: h.db, marketId: m.id, winningOutcomeId: outs[0].id });

  expect(await isOwned({ db: h.db, userId: "alice", personId: 101 })).toBe(false);
  expect(await isOwned({ db: h.db, userId: "alice", personId: 102 })).toBe(false);
});

// ---------------------------------------------------------------------------
// Markets with no featured politicians — no progress rows are written
// ---------------------------------------------------------------------------

test("resolveMarket on a market with no market_politicians writes no card_progress rows", async () => {
  const [m] = await h.db
    .insert(markets)
    .values({ questionHe: "שאלה ללא מדינאים", category: "coalition", status: "open", closeAt: new Date(Date.now() + 86400 * 1000) })
    .returning({ id: markets.id });
  const [out] = await h.db
    .insert(outcomes)
    .values([{ marketId: m.id, labelHe: "כן", ordinal: 0 }])
    .returning({ id: outcomes.id });

  await makePrediction({ db: h.db, userId: "alice", marketId: m.id, outcomeId: out.id });
  await resolveMarket({ db: h.db, marketId: m.id, winningOutcomeId: out.id });

  const progress = await getProgressByPerson({ db: h.db, userId: "alice" });
  expect(progress.size).toBe(0);
});

// ---------------------------------------------------------------------------
// listCollection ordering + getOwnedPersonIds completeness
// ---------------------------------------------------------------------------

test("getOwnedPersonIds + listCollection reflect all unlocked cards for the user", async () => {
  // Unlock MK 101 via 2 correct predictions.
  const m1 = await seedMarketForPolitician(101);
  const m2 = await seedMarketForPolitician(101);
  await makePrediction({ db: h.db, userId: "alice", marketId: m1.marketId, outcomeId: m1.yesId });
  await resolveMarket({ db: h.db, marketId: m1.marketId, winningOutcomeId: m1.yesId });
  await makePrediction({ db: h.db, userId: "alice", marketId: m2.marketId, outcomeId: m2.yesId });
  await resolveMarket({ db: h.db, marketId: m2.marketId, winningOutcomeId: m2.yesId });

  // Unlock MK 102 via 2 correct predictions.
  const m3 = await seedMarketForPolitician(102);
  const m4 = await seedMarketForPolitician(102);
  await makePrediction({ db: h.db, userId: "alice", marketId: m3.marketId, outcomeId: m3.yesId });
  await resolveMarket({ db: h.db, marketId: m3.marketId, winningOutcomeId: m3.yesId });
  await makePrediction({ db: h.db, userId: "alice", marketId: m4.marketId, outcomeId: m4.yesId });
  await resolveMarket({ db: h.db, marketId: m4.marketId, winningOutcomeId: m4.yesId });

  const owned = await getOwnedPersonIds({ db: h.db, userId: "alice" });
  expect(owned.has(101)).toBe(true);
  expect(owned.has(102)).toBe(true);
  expect(owned.size).toBe(2);

  const list = await listCollection({ db: h.db, userId: "alice" });
  expect(list.map((c) => c.personId).sort((a, b) => a - b)).toEqual([101, 102]);
  // collectedAt is a real Date on every entry.
  expect(list.every((c) => c.collectedAt instanceof Date)).toBe(true);
});

test("getOwnedPersonIds for a different user is empty even after alice unlocks cards", async () => {
  const m1 = await seedMarketForPolitician(101);
  const m2 = await seedMarketForPolitician(101);
  await makePrediction({ db: h.db, userId: "alice", marketId: m1.marketId, outcomeId: m1.yesId });
  await resolveMarket({ db: h.db, marketId: m1.marketId, winningOutcomeId: m1.yesId });
  await makePrediction({ db: h.db, userId: "alice", marketId: m2.marketId, outcomeId: m2.yesId });
  await resolveMarket({ db: h.db, marketId: m2.marketId, winningOutcomeId: m2.yesId });

  const owned = await getOwnedPersonIds({ db: h.db, userId: "bob" });
  expect(owned.size).toBe(0);
});
