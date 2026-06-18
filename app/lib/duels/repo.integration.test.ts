// Integration tests for the duels repo — PGlite in-memory, real Drizzle.
// Verifies: createChallenge persists; getChallengeByToken joins the challenger's
// @handle (coalesced) + their live pick; recordParticipant is idempotent;
// getParticipants returns picks; scope guards reject a missing user.

import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { bets, markets, outcomes, users } from "@/app/lib/schema";
import { MissingUserError } from "@/app/lib/errors";
import { FALLBACK_HANDLE } from "@/app/lib/onboarding/handle";
import {
  createChallenge,
  getChallengeByToken,
  getChallengeTokenById,
  getChallengesForMarket,
  getParticipantCount,
  getParticipants,
  recordParticipant,
} from "./repo";

const CHALLENGER = "user-duel-challenger";
const FRIEND = "user-duel-friend";
const NOHANDLE = "user-duel-nohandle";

let h: Awaited<ReturnType<typeof createTestDb>>;

async function newMarket() {
  const [m] = await h.db
    .insert(markets)
    .values({
      questionHe: "האם יוקדמו בחירות?",
      category: "elections",
      status: "open",
      closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    .returning({ id: markets.id });
  const [yes] = await h.db.insert(outcomes).values({ marketId: m.id, labelHe: "כן", ordinal: 0 }).returning({ id: outcomes.id });
  const [no] = await h.db.insert(outcomes).values({ marketId: m.id, labelHe: "לא", ordinal: 1 }).returning({ id: outcomes.id });
  return { marketId: m.id, yes: yes.id, no: no.id };
}

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: CHALLENGER, name: "Real Name A", email: "a@duel.co", handle: "nadav_b" },
    { id: FRIEND, name: "Real Name B", email: "b@duel.co", handle: "vera_m" },
    { id: NOHANDLE, name: "Real Name C", email: "c@duel.co" }, // handle null → FALLBACK
  ]);
});

afterEach(async () => h.close());

test("createChallenge persists a row addressable by its token", async () => {
  const { marketId } = await newMarket();
  const row = await createChallenge({ db: h.db, token: "tok-1", challengerUserId: CHALLENGER, marketId });
  expect(row.token).toBe("tok-1");
  const view = await getChallengeByToken({ db: h.db, token: "tok-1" });
  expect(view?.marketId).toBe(marketId);
  expect(view?.challengerUserId).toBe(CHALLENGER);
});

test("getChallengeByToken returns the challenger's @handle and live pick", async () => {
  const { marketId, yes } = await newMarket();
  await createChallenge({ db: h.db, token: "tok-2", challengerUserId: CHALLENGER, marketId });
  // No pick yet → null
  expect((await getChallengeByToken({ db: h.db, token: "tok-2" }))?.challengerOutcomeId).toBeNull();
  // Challenger picks → reflected live
  await h.db.insert(bets).values({ userId: CHALLENGER, marketId, outcomeId: yes });
  const view = await getChallengeByToken({ db: h.db, token: "tok-2" });
  expect(view?.challengerHandle).toBe("nadav_b"); // @handle, never the real name
  expect(view?.challengerOutcomeId).toBe(yes);
});

test("getChallengeByToken coalesces a null handle to FALLBACK_HANDLE", async () => {
  const { marketId } = await newMarket();
  await createChallenge({ db: h.db, token: "tok-3", challengerUserId: NOHANDLE, marketId });
  expect((await getChallengeByToken({ db: h.db, token: "tok-3" }))?.challengerHandle).toBe(FALLBACK_HANDLE);
});

test("getChallengeByToken returns null for an unknown token", async () => {
  expect(await getChallengeByToken({ db: h.db, token: "nope" })).toBeNull();
});

test("recordParticipant is idempotent on (challenge, user)", async () => {
  const { marketId } = await newMarket();
  const c = await createChallenge({ db: h.db, token: "tok-4", challengerUserId: CHALLENGER, marketId });
  await recordParticipant({ db: h.db, challengeId: c.id, userId: FRIEND });
  await recordParticipant({ db: h.db, challengeId: c.id, userId: FRIEND }); // re-accept
  expect(await getParticipantCount({ db: h.db, challengeId: c.id })).toBe(1);
});

test("getParticipants returns each participant's @handle and current pick", async () => {
  const { marketId, no } = await newMarket();
  const c = await createChallenge({ db: h.db, token: "tok-5", challengerUserId: CHALLENGER, marketId });
  await recordParticipant({ db: h.db, challengeId: c.id, userId: FRIEND });
  await h.db.insert(bets).values({ userId: FRIEND, marketId, outcomeId: no });
  const parts = await getParticipants({ db: h.db, challengeId: c.id, marketId });
  expect(parts).toHaveLength(1);
  expect(parts[0]).toMatchObject({ userId: FRIEND, handle: "vera_m", outcomeId: no });
});

test("scope guard: a missing user id is rejected", async () => {
  const { marketId } = await newMarket();
  await expect(createChallenge({ db: h.db, token: "x", challengerUserId: "", marketId })).rejects.toThrow(MissingUserError);
  const c = await createChallenge({ db: h.db, token: "tok-6", challengerUserId: CHALLENGER, marketId });
  await expect(recordParticipant({ db: h.db, challengeId: c.id, userId: "" })).rejects.toThrow(MissingUserError);
});

test("getChallengesForMarket returns every challenge on the market", async () => {
  const { marketId } = await newMarket();
  await createChallenge({ db: h.db, token: "m1", challengerUserId: CHALLENGER, marketId });
  await createChallenge({ db: h.db, token: "m2", challengerUserId: FRIEND, marketId });
  const list = await getChallengesForMarket({ db: h.db, marketId });
  expect(list.map((c) => c.token).sort()).toEqual(["m1", "m2"]);
});

test("getChallengeTokenById resolves id→token and guards malformed ids", async () => {
  const { marketId } = await newMarket();
  const c = await createChallenge({ db: h.db, token: "by-id-tok", challengerUserId: CHALLENGER, marketId });
  expect(await getChallengeTokenById({ db: h.db, challengeId: c.id })).toBe("by-id-tok");
  expect(await getChallengeTokenById({ db: h.db, challengeId: "not-a-uuid" })).toBeNull();
  expect(await getChallengeTokenById({ db: h.db, challengeId: "00000000-0000-0000-0000-000000000000" })).toBeNull();
});
