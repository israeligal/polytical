// Matching math on real PGlite: agreement, exclusions, thresholds, re-lock,
// tie-breaks, faction-majority party match. Seeds real mk_votes/faction rows.

import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { factions, knessetVotes, mkVotes, politicians, users } from "@/app/lib/schema";
import { setStance } from "@/app/lib/stances/service";
import { computeMatch } from "./service";

let h: Awaited<ReturnType<typeof createTestDb>>;

const PROV = { sourceDataset: "test", sourceUrl: "https://example.test", fetchedAt: new Date("2026-06-01T00:00:00Z") };

function vote(over: Partial<typeof knessetVotes.$inferInsert> & { voteId: number }): typeof knessetVotes.$inferInsert {
  return {
    knessetNum: 25, titleHe: `הצעה ${over.voteId}`, voteDate: new Date("2026-06-01T12:00:00Z"),
    voteType: "electronic", isDecisive: true, detailsStatus: "complete", ...PROV, ...over,
  };
}

function mk(voteId: number, personId: number, result: "for" | "against" | "abstain" | "didnt_vote", factionId = 100) {
  return { voteId, personId, result, factionId, ...PROV };
}

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values({ id: "u1", name: "אחת", email: "u1@x.co" });
  await h.db.insert(politicians).values([
    { personId: 427, nameHe: "אביגדור ליברמן", searchName: "x", active: true, facts: {}, ...PROV },
    { personId: 901, nameHe: "מתנגדת תמיד", searchName: "y", active: true, facts: {}, ...PROV },
    { personId: 902, nameHe: "פורש", searchName: "z", active: false, facts: {}, ...PROV }, // departed
  ]);
  await h.db.insert(factions).values([
    { factionId: 100, nameHe: "סיעת הבעד", ...PROV },
    { factionId: 200, nameHe: "סיעת הנגד", ...PROV },
  ]);
  // 6 decisive electronic votes: Liberman (faction 100) always FOR,
  // person 901 (faction 200) always AGAINST, departed 902 always FOR.
  for (let v = 1; v <= 6; v++) {
    await h.db.insert(knessetVotes).values(vote({ voteId: v }));
    await h.db.insert(mkVotes).values([
      mk(v, 427, "for", 100),
      mk(v, 901, "against", 200),
      mk(v, 902, "for", 100),
    ]);
  }
});
afterEach(async () => h.close());

async function stanceAll(stance: "for" | "against", n = 5) {
  for (let v = 1; v <= n; v++) await setStance({ db: h.db, userId: "u1", voteId: v, stance });
}

test("locked below the threshold; unlocks at 5; retraction re-locks", async () => {
  await stanceAll("for", 4);
  let r = await computeMatch({ db: h.db, userId: "u1" });
  expect(r).toMatchObject({ state: "locked", scoreableCount: 4, needed: 1 });

  await setStance({ db: h.db, userId: "u1", voteId: 5, stance: "for" });
  r = await computeMatch({ db: h.db, userId: "u1" });
  expect(r.state).toBe("unlocked");

  await setStance({ db: h.db, userId: "u1", voteId: 5, stance: "for" }); // retract the 5th
  r = await computeMatch({ db: h.db, userId: "u1" });
  expect(r.state).toBe("locked");
});

test("a user who always agrees with Liberman gets him at 100% and the contrarian at 0%", async () => {
  await stanceAll("for", 5);
  const r = await computeMatch({ db: h.db, userId: "u1" });
  if (r.state !== "unlocked") throw new Error("expected unlocked");
  expect(r.mode).toBe("partial"); // only 2 qualified active MKs (< 6)
  const lib = r.top.find((m) => m.politician.personId === 427)!;
  expect(lib).toMatchObject({ shared: 5, matches: 5, agreementPct: 100, lowConfidence: true });
  const contrarian = r.top.find((m) => m.politician.personId === 901)!;
  expect(contrarian.agreementPct).toBe(0);
  // departed MK (902) never appears even at 100% agreement
  expect(r.top.some((m) => m.politician.personId === 902)).toBe(false);
});

test("abstain/didnt_vote/absence are excluded from shared", async () => {
  // vote 7: Liberman abstains, 901 didn't vote — neither contributes
  await h.db.insert(knessetVotes).values(vote({ voteId: 7 }));
  await h.db.insert(mkVotes).values([mk(7, 427, "abstain", 100), mk(7, 901, "didnt_vote", 200)]);
  await stanceAll("for", 5);
  await setStance({ db: h.db, userId: "u1", voteId: 7, stance: "for" });
  const r = await computeMatch({ db: h.db, userId: "u1" });
  if (r.state !== "unlocked") throw new Error("expected unlocked");
  expect(r.top.find((m) => m.politician.personId === 427)!.shared).toBe(5); // 7 didn't count
});

test("non-scoreable votes never enter the math even when decisive", async () => {
  // a decisive HAND vote with (impossible in prod, but guard the filter) mk rows
  await h.db.insert(knessetVotes).values(vote({ voteId: 8, voteType: "hand" }));
  await h.db.insert(mkVotes).values([mk(8, 427, "against", 100)]);
  await stanceAll("for", 5);
  await setStance({ db: h.db, userId: "u1", voteId: 8, stance: "for" });
  const r = await computeMatch({ db: h.db, userId: "u1" });
  if (r.state !== "unlocked") throw new Error("expected unlocked");
  expect(r.top.find((m) => m.politician.personId === 427)!.shared).toBe(5);
});

test("party match follows the faction MAJORITY per vote; a 1-1 split skips that vote", async () => {
  await stanceAll("for", 5);
  // faction 200's only member is 901 (against). Add a second member voting FOR
  // on vote 1 → 1-1 split → vote 1 yields NO majority for faction 200, leaving
  // it 4 scored votes (< qualify threshold 5) → it drops from the party lists.
  await h.db.insert(politicians).values({ personId: 903, nameHe: "שובר שוויון", searchName: "w", active: true, facts: {}, ...PROV });
  await h.db.insert(mkVotes).values([mk(1, 903, "for", 200)]);
  const r = await computeMatch({ db: h.db, userId: "u1" });
  if (r.state !== "unlocked") throw new Error("expected unlocked");
  expect(r.bestParty).toMatchObject({ factionId: 100, shared: 5, agreementPct: 100 });
  expect(r.worstParty).toBeNull(); // faction 200 unqualified → only one party left
});

test("party match: best and worst factions resolve deterministically", async () => {
  await stanceAll("for", 5);
  const r = await computeMatch({ db: h.db, userId: "u1" });
  if (r.state !== "unlocked") throw new Error("expected unlocked");
  expect(r.bestParty).toMatchObject({ factionId: 100, agreementPct: 100, shared: 5 });
  expect(r.worstParty).toMatchObject({ factionId: 200, agreementPct: 0 });
});
