// Integration tests for getUnansweredDeckVotes — PGlite in-memory, real queries.
// Verifies: non-decisive excluded, stanced excluded, excludeVoteId excluded,
// ordering desc, limit respected, other-user stances don't contaminate the filter.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { knessetVotes, userStances, users } from "@/app/lib/schema";
import { MissingUserError } from "@/app/lib/errors";
import { getUnansweredDeckVotes } from "./read-repo";

const PROV = {
  sourceDataset: "test",
  sourceUrl: "https://example.test",
  fetchedAt: new Date("2026-06-01T00:00:00Z"),
};

const UID = "user-deck-1";
const UID2 = "user-deck-2";

let h: Awaited<ReturnType<typeof createTestDb>>;

function voteRow(
  voteId: number,
  voteDate: Date,
  isDecisive: boolean,
): typeof knessetVotes.$inferInsert {
  return {
    voteId,
    knessetNum: 25,
    titleHe: `הצעה ${voteId}`,
    voteDate,
    voteType: "electronic",
    isDecisive,
    detailsStatus: "complete",
    ...PROV,
  };
}

const d = (n: number) => new Date(`2026-06-${String(n).padStart(2, "0")}T12:00:00Z`);

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: UID, name: "User One", email: "one@test.co" },
    { id: UID2, name: "User Two", email: "two@test.co" },
  ]);
  // Seed: 3 decisive + 1 non-decisive, with varying dates
  await h.db.insert(knessetVotes).values([
    voteRow(1001, d(9), true),  // decisive, newest
    voteRow(1002, d(8), true),  // decisive
    voteRow(1003, d(7), true),  // decisive
    voteRow(1004, d(6), false), // NOT decisive — must be excluded
  ]);
});

afterEach(async () => h.close());

test("returns only decisive votes, ordered newest-first", async () => {
  const deck = await getUnansweredDeckVotes({ db: h.db, userId: UID });
  expect(deck.map((v) => v.voteId)).toEqual([1001, 1002, 1003]);
});

test("excludes votes the user already has a stance on", async () => {
  // User has a stance on 1001
  await h.db.insert(userStances).values({ userId: UID, voteId: 1001, stance: "for" });

  const deck = await getUnansweredDeckVotes({ db: h.db, userId: UID });
  expect(deck.map((v) => v.voteId)).toEqual([1002, 1003]);
});

test("other users' stances do NOT filter out votes for the requesting user", async () => {
  // UID2 has a stance on 1002 — must NOT affect UID's deck
  await h.db.insert(userStances).values({ userId: UID2, voteId: 1002, stance: "against" });

  const deck = await getUnansweredDeckVotes({ db: h.db, userId: UID });
  expect(deck.map((v) => v.voteId)).toContain(1002);
  expect(deck).toHaveLength(3); // all decisive still present for UID
});

test("excludeVoteId removes one specific vote from the deck", async () => {
  const deck = await getUnansweredDeckVotes({ db: h.db, userId: UID, excludeVoteId: 1002 });
  expect(deck.map((v) => v.voteId)).toEqual([1001, 1003]);
});

test("limit is respected", async () => {
  const deck = await getUnansweredDeckVotes({ db: h.db, userId: UID, limit: 2 });
  expect(deck).toHaveLength(2);
  // Must be the 2 newest decisive votes
  expect(deck.map((v) => v.voteId)).toEqual([1001, 1002]);
});

test("ordering is voteDate DESC then voteId DESC (tie-safe)", async () => {
  // Two decisive votes on the same date — voteId DESC as tie-breaker
  const sameDay = d(9);
  await h.db.insert(knessetVotes).values([
    voteRow(1010, sameDay, true),
    voteRow(1011, sameDay, true),
  ]);
  const deck = await getUnansweredDeckVotes({ db: h.db, userId: UID });
  const ids = deck.map((v) => v.voteId);
  // Both share d(9) — higher voteId first
  expect(ids[0]).toBe(1011);
  expect(ids[1]).toBe(1010);
});

test("returns empty array when all decisive votes are stanced", async () => {
  await h.db.insert(userStances).values([
    { userId: UID, voteId: 1001, stance: "for" },
    { userId: UID, voteId: 1002, stance: "against" },
    { userId: UID, voteId: 1003, stance: "for" },
  ]);
  const deck = await getUnansweredDeckVotes({ db: h.db, userId: UID });
  expect(deck).toHaveLength(0);
});

test("throws MissingUserError when userId is empty", async () => {
  await expect(getUnansweredDeckVotes({ db: h.db, userId: "" })).rejects.toBeInstanceOf(
    MissingUserError,
  );
});

describe("returned row shape", () => {
  test("exposes voteId, titleHe, voteDate, isAccepted, voteType", async () => {
    const deck = await getUnansweredDeckVotes({ db: h.db, userId: UID, limit: 1 });
    expect(deck).toHaveLength(1);
    const row = deck[0];
    expect(row.voteId).toBe(1001);
    expect(row.titleHe).toBe("הצעה 1001");
    expect(row.voteDate).toBeInstanceOf(Date);
    expect(row.isAccepted).toBeNull(); // we didn't set it
    expect(row.voteType).toBe("electronic");
  });
});
