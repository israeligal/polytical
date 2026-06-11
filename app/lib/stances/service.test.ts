// Stance behavior on real PGlite: set/flip/retract, decisive-only validation,
// scoreable counting, k-gated aggregate, account-deletion cascade.

import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { knessetVotes, userStances, users } from "@/app/lib/schema";
import { eq } from "drizzle-orm";
import { getStanceState, setStance, AGGREGATE_MIN_STANCERS } from "./service";
import { VoteNotFoundError, VoteNotStanceableError } from "@/app/lib/errors";

let h: Awaited<ReturnType<typeof createTestDb>>;

const PROV = { sourceDataset: "test", sourceUrl: "https://example.test", fetchedAt: new Date("2026-06-01T00:00:00Z") };

function vote(over: Partial<typeof knessetVotes.$inferInsert> & { voteId: number }): typeof knessetVotes.$inferInsert {
  return {
    knessetNum: 25, titleHe: "הצעה", voteDate: new Date("2026-06-01T12:00:00Z"),
    voteType: "electronic", isDecisive: true, detailsStatus: "complete", ...PROV, ...over,
  };
}

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: "u1", name: "אחת", email: "u1@x.co" },
    { id: "u2", name: "שתיים", email: "u2@x.co" },
  ]);
  await h.db.insert(knessetVotes).values([
    vote({ voteId: 1 }),
    vote({ voteId: 2, isDecisive: false }),         // reservation — not stance-able
    vote({ voteId: 3, voteType: "hand" }),           // decisive hand — stance-able, NOT scoreable
  ]);
});
afterEach(async () => h.close());

test("set → flip → retract round-trip, reading rows back", async () => {
  let s = await setStance({ db: h.db, userId: "u1", voteId: 1, stance: "for" });
  expect(s.stance).toBe("for");
  s = await setStance({ db: h.db, userId: "u1", voteId: 1, stance: "against" }); // flip in place
  expect(s.stance).toBe("against");
  expect(await h.db.select().from(userStances)).toHaveLength(1);
  s = await setStance({ db: h.db, userId: "u1", voteId: 1, stance: "against" }); // same again = retract
  expect(s.stance).toBeNull();
  expect(await h.db.select().from(userStances)).toHaveLength(0);
});

test("stances attach only to decisive votes; unknown vote 404s", async () => {
  await expect(setStance({ db: h.db, userId: "u1", voteId: 2, stance: "for" })).rejects.toBeInstanceOf(VoteNotStanceableError);
  await expect(setStance({ db: h.db, userId: "u1", voteId: 999, stance: "for" })).rejects.toBeInstanceOf(VoteNotFoundError);
});

test("scoreableCount counts decisive electronic/roll_call stances only", async () => {
  await setStance({ db: h.db, userId: "u1", voteId: 1, stance: "for" }); // electronic → counts
  const s = await setStance({ db: h.db, userId: "u1", voteId: 3, stance: "for" }); // hand → opinion, not scoreable
  expect(s.scoreableCount).toBe(1);
});

test("aggregate hidden below k stancers, visible at k, and only post-stance", async () => {
  // k-1 OTHER users stance vote 1
  const others = Array.from({ length: AGGREGATE_MIN_STANCERS - 1 }, (_, i) => `bulk${i}`);
  await h.db.insert(users).values(others.map((id) => ({ id, name: id, email: `${id}@x.co` })));
  for (const id of others) await setStance({ db: h.db, userId: id, voteId: 1, stance: "for" });

  // u2 has no stance → no aggregate even though counts exist
  const noStance = await getStanceState({ db: h.db, userId: "u2", voteId: 1 });
  expect(noStance.aggregate).toBeNull();

  // u1's stance is the k-th → aggregate unlocks, with the base size
  const s = await setStance({ db: h.db, userId: "u1", voteId: 1, stance: "against" });
  expect(s.aggregate).toEqual({ forPct: 90, total: AGGREGATE_MIN_STANCERS });
});

test("deleting the account cascades its stances (sensitive data dies with it)", async () => {
  await setStance({ db: h.db, userId: "u1", voteId: 1, stance: "for" });
  await h.db.delete(users).where(eq(users.id, "u1"));
  expect(await h.db.select().from(userStances)).toHaveLength(0);
});
