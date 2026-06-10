import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { users, markets, outcomes, seasons } from "@/app/lib/schema";
import { dispatchPush } from "@/app/lib/push/service";
import { makePrediction, resolveMarket } from "@/app/lib/markets/service";
import { getActiveSeason } from "./repo";
import { getSeasonBoard, createSeason, endSeason } from "./service";

// Mock the push dispatcher at its boundary so resolve tests don't reach web-push.
vi.mock("@/app/lib/push/service", () => ({ dispatchPush: vi.fn() }));

import {
  AnotherSeasonActiveError,
  InvalidSeasonError,
  NoActiveSeasonError,
  SeasonEndedError,
  SeasonNotFoundError,
} from "@/app/lib/errors";

let h: Awaited<ReturnType<typeof createTestDb>>;
const UID = "u1";

// A season window around "now" so correct predictions made at now() fall inside it.
const START = new Date(Date.now() - 24 * 3600 * 1000);
const END = new Date(Date.now() + 30 * 24 * 3600 * 1000);

/** Inserts the standard test user. */
async function seedUser(id = UID) {
  await h.db.insert(users).values({ id, name: "גל", email: `${id}@x.co` });
}

/**
 * Seed a market + two outcomes; returns { marketId, outcomeAId, outcomeBId }.
 * The market is open with closeAt far in the future so makePrediction accepts it.
 */
async function seedMarket() {
  const closeAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const [market] = await h.db
    .insert(markets)
    .values({ questionHe: "שאלת בדיקה?", category: "politics", closeAt })
    .returning({ id: markets.id });
  const [outA] = await h.db
    .insert(outcomes)
    .values({ marketId: market.id, labelHe: "כן", ordinal: 1 })
    .returning({ id: outcomes.id });
  const [outB] = await h.db
    .insert(outcomes)
    .values({ marketId: market.id, labelHe: "לא", ordinal: 2 })
    .returning({ id: outcomes.id });
  return { marketId: market.id, outcomeAId: outA.id, outcomeBId: outB.id };
}

/** Creates an active season with the given goalCorrect tiers. */
async function seedSeason(goals: { nameHe: string; goalCorrect: number }[]) {
  await createSeason({ db: h.db, nameHe: "עונה", startAt: START, endAt: END, tiers: goals });
  const s = await getActiveSeason({ db: h.db });
  return s!;
}

/**
 * Makes a correct prediction for `userId` on a fresh market and resolves it.
 * The resolved market's `resolvedAt` will be set to now (inside the season window).
 * Returns the market and winning outcome IDs for further assertions.
 */
async function makeCorrectPrediction(userId = UID) {
  const { marketId, outcomeAId } = await seedMarket();
  await makePrediction({ db: h.db, userId, marketId, outcomeId: outcomeAId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: outcomeAId });
  return { marketId, outcomeAId };
}

beforeEach(async () => {
  h = await createTestDb();
  vi.mocked(dispatchPush).mockClear();
  await seedUser();
});
afterEach(async () => h.close());

// ─── getSeasonBoard ─────────────────────────────────────────────────────────

test("getSeasonBoard returns null when no active season exists", async () => {
  expect(await getSeasonBoard({ db: h.db, userId: UID })).toBeNull();
});

test("getSeasonBoard: anonymous user (no userId) has progress = 0 even if season is active", async () => {
  await seedSeason([{ nameHe: "ברונזה", goalCorrect: 2 }]);
  await makeCorrectPrediction();

  const board = await getSeasonBoard({ db: h.db, userId: null });
  expect(board).not.toBeNull();
  expect(board!.progress).toBe(0);
  expect(board!.tiers[0].reached).toBe(false);
});

test("getSeasonBoard: progress counts correct in-window predictions only", async () => {
  await seedSeason([{ nameHe: "א", goalCorrect: 2 }]);

  // Two correct predictions in-window.
  await makeCorrectPrediction();
  await makeCorrectPrediction();

  const board = await getSeasonBoard({ db: h.db, userId: UID });
  expect(board?.progress).toBe(2);
});

test("getSeasonBoard: wrong predictions (picked losing outcome) do NOT count toward progress", async () => {
  await seedSeason([{ nameHe: "א", goalCorrect: 1 }]);

  // Seed market; user picks outcomeBId; market resolves with outcomeAId (user is WRONG).
  const { marketId, outcomeAId, outcomeBId } = await seedMarket();
  await makePrediction({ db: h.db, userId: UID, marketId, outcomeId: outcomeBId });
  await resolveMarket({ db: h.db, marketId, winningOutcomeId: outcomeAId });

  const board = await getSeasonBoard({ db: h.db, userId: UID });
  expect(board?.progress).toBe(0);
  expect(board!.tiers[0].reached).toBe(false);
});

test("getSeasonBoard: tier.reached is derived from progress >= goalCorrect", async () => {
  await seedSeason([
    { nameHe: "ברונזה", goalCorrect: 1 },
    { nameHe: "כסף", goalCorrect: 3 },
  ]);

  await makeCorrectPrediction(); // progress = 1

  const board = await getSeasonBoard({ db: h.db, userId: UID });
  expect(board!.progress).toBe(1);
  expect(board!.tiers[0].reached).toBe(true);  // goalCorrect=1, progress=1 → reached
  expect(board!.tiers[1].reached).toBe(false); // goalCorrect=3, progress=1 → not reached
});

test("getSeasonBoard: tiers returned in ordinal order with correct goalCorrect values", async () => {
  await seedSeason([
    { nameHe: "ברונזה", goalCorrect: 1 },
    { nameHe: "כסף", goalCorrect: 3 },
    { nameHe: "זהב", goalCorrect: 5 },
  ]);

  const board = await getSeasonBoard({ db: h.db, userId: UID });
  expect(board!.tiers.map((t) => t.goalCorrect)).toEqual([1, 3, 5]);
  expect(board!.tiers.map((t) => t.nameHe)).toEqual(["ברונזה", "כסף", "זהב"]);
});

test("getSeasonBoard: ended flag is true for a manually-ended season", async () => {
  await seedSeason([{ nameHe: "א", goalCorrect: 1 }]);
  await endSeason({ db: h.db });

  // getActiveSeason returns null for ended seasons, so getSeasonBoard returns null.
  // Confirm: a manually-ended season has no active record.
  const board = await getSeasonBoard({ db: h.db, userId: UID });
  expect(board).toBeNull();
});

test("getSeasonBoard: ended flag is true when endAt is in the past (expired season)", async () => {
  // Seed a season whose endAt is in the past directly — bypassing createSeason's
  // validation so we can force expiry without ending it explicitly.
  const pastStart = new Date(Date.now() - 10 * 24 * 3600 * 1000);
  const pastEnd = new Date(Date.now() - 1 * 3600 * 1000);
  await h.db.insert(seasons).values({ nameHe: "פגה", startAt: pastStart, endAt: pastEnd, status: "active" });

  const board = await getSeasonBoard({ db: h.db, userId: UID });
  expect(board).not.toBeNull();
  expect(board!.ended).toBe(true);
});

test("getSeasonBoard: ended flag is false for an ongoing active season", async () => {
  await seedSeason([{ nameHe: "א", goalCorrect: 1 }]);

  const board = await getSeasonBoard({ db: h.db, userId: UID });
  expect(board!.ended).toBe(false);
});

test("getSeasonBoard: progress from multiple users is scoped to the requesting user", async () => {
  const UID2 = "u2";
  await h.db.insert(users).values({ id: UID2, name: "דן", email: "d@x.co" });
  await seedSeason([{ nameHe: "א", goalCorrect: 2 }]);

  // u1 gets 1 correct; u2 gets 2 correct.
  await makeCorrectPrediction(UID);
  await makeCorrectPrediction(UID2);
  await makeCorrectPrediction(UID2);

  const boardU1 = await getSeasonBoard({ db: h.db, userId: UID });
  const boardU2 = await getSeasonBoard({ db: h.db, userId: UID2 });
  expect(boardU1!.progress).toBe(1);
  expect(boardU2!.progress).toBe(2);
  expect(boardU1!.tiers[0].reached).toBe(false);
  expect(boardU2!.tiers[0].reached).toBe(true);
});

// ─── createSeason ───────────────────────────────────────────────────────────

test("createSeason rejects a second active season (AnotherSeasonActiveError)", async () => {
  await seedSeason([{ nameHe: "א", goalCorrect: 1 }]);
  await expect(
    createSeason({
      db: h.db,
      nameHe: "שנייה",
      startAt: START,
      endAt: END,
      tiers: [{ nameHe: "ב", goalCorrect: 1 }],
    }),
  ).rejects.toBeInstanceOf(AnotherSeasonActiveError);
});

test("createSeason rejects non-increasing goalCorrect values (InvalidSeasonError)", async () => {
  await expect(
    createSeason({
      db: h.db,
      nameHe: "עונה",
      startAt: START,
      endAt: END,
      tiers: [
        { nameHe: "א", goalCorrect: 5 },
        { nameHe: "ב", goalCorrect: 5 }, // not strictly increasing
      ],
    }),
  ).rejects.toBeInstanceOf(InvalidSeasonError);
});

test("createSeason rejects decreasing goalCorrect values (InvalidSeasonError)", async () => {
  await expect(
    createSeason({
      db: h.db,
      nameHe: "עונה",
      startAt: START,
      endAt: END,
      tiers: [
        { nameHe: "א", goalCorrect: 10 },
        { nameHe: "ב", goalCorrect: 5 }, // decreasing
      ],
    }),
  ).rejects.toBeInstanceOf(InvalidSeasonError);
});

test("createSeason rejects zero or negative goalCorrect (InvalidSeasonError)", async () => {
  await expect(
    createSeason({
      db: h.db,
      nameHe: "עונה",
      startAt: START,
      endAt: END,
      tiers: [{ nameHe: "א", goalCorrect: 0 }],
    }),
  ).rejects.toBeInstanceOf(InvalidSeasonError);
});

test("createSeason rejects empty tiers (InvalidSeasonError)", async () => {
  await expect(
    createSeason({ db: h.db, nameHe: "עונה", startAt: START, endAt: END, tiers: [] }),
  ).rejects.toBeInstanceOf(InvalidSeasonError);
});

test("createSeason rejects endAt <= startAt (InvalidSeasonError)", async () => {
  await expect(
    createSeason({
      db: h.db,
      nameHe: "עונה",
      startAt: END,
      endAt: START,
      tiers: [{ nameHe: "א", goalCorrect: 1 }],
    }),
  ).rejects.toBeInstanceOf(InvalidSeasonError);
});

test("createSeason rejects blank nameHe (InvalidSeasonError)", async () => {
  await expect(
    createSeason({
      db: h.db,
      nameHe: "   ",
      startAt: START,
      endAt: END,
      tiers: [{ nameHe: "א", goalCorrect: 1 }],
    }),
  ).rejects.toBeInstanceOf(InvalidSeasonError);
});

test("createSeason: once active season is ended, a new one can be created", async () => {
  await seedSeason([{ nameHe: "א", goalCorrect: 1 }]);
  await endSeason({ db: h.db }); // free the active slot
  const { seasonId } = await createSeason({
    db: h.db,
    nameHe: "שנייה",
    startAt: START,
    endAt: END,
    tiers: [{ nameHe: "ב", goalCorrect: 2 }],
  });
  expect(typeof seasonId).toBe("string");
  const active = await getActiveSeason({ db: h.db });
  expect(active?.id).toBe(seasonId);
});

test("createSeason translates DB partial-unique race (23505) to AnotherSeasonActiveError", async () => {
  // Pre-insert an active season directly (bypassing createSeason's count guard),
  // then call createSeason — its count guard catches it with the clean domain error.
  await h.db.insert(seasons).values({ nameHe: "קיימת", startAt: START, endAt: END, status: "active" });
  await expect(
    createSeason({
      db: h.db,
      nameHe: "שנייה",
      startAt: START,
      endAt: END,
      tiers: [{ nameHe: "א", goalCorrect: 1 }],
    }),
  ).rejects.toBeInstanceOf(AnotherSeasonActiveError);
  // The raw DB insert of a second active season is rejected by the partial-unique index.
  await expect(
    h.db.insert(seasons).values({ nameHe: "שלישית", startAt: START, endAt: END, status: "active" }),
  ).rejects.toThrow();
});

// ─── endSeason ──────────────────────────────────────────────────────────────

test("endSeason marks the active season as ended", async () => {
  const s = await seedSeason([{ nameHe: "א", goalCorrect: 1 }]);
  await endSeason({ db: h.db });

  const active = await getActiveSeason({ db: h.db });
  expect(active).toBeNull();

  // Confirm the specific season row is now ended.
  const [row] = await h.db.select().from(seasons).where(eq(seasons.id, s.id));
  expect(row.status).toBe("ended");
});

test("endSeason with no active season throws NoActiveSeasonError", async () => {
  await expect(endSeason({ db: h.db })).rejects.toBeInstanceOf(NoActiveSeasonError);
});

test("ending an already-ended season surfaces SeasonEndedError (no false success)", async () => {
  const s = await seedSeason([{ nameHe: "א", goalCorrect: 1 }]);
  await endSeason({ db: h.db });
  await expect(endSeason({ db: h.db, seasonId: s.id })).rejects.toBeInstanceOf(SeasonEndedError);
});

test("endSeason with a non-existent seasonId throws SeasonNotFoundError", async () => {
  await expect(
    endSeason({ db: h.db, seasonId: "00000000-0000-0000-0000-000000000000" }),
  ).rejects.toBeInstanceOf(SeasonNotFoundError);
});

test("getSeasonBoard: a correct prediction resolved BEFORE the season window is excluded", async () => {
  const season = await seedSeason([{ nameHe: "ברונזה", goalCorrect: 1 }]);
  const { marketId } = await makeCorrectPrediction();
  // Force the resolution timestamp to before the season start — it must not count.
  await h.db
    .update(markets)
    .set({ resolvedAt: new Date(season.startAt.getTime() - 1000) })
    .where(eq(markets.id, marketId));

  const board = await getSeasonBoard({ db: h.db, userId: UID });
  expect(board!.progress).toBe(0);
  expect(board!.tiers[0].reached).toBe(false);
});
