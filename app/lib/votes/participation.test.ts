import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { knessetVotes, mkVotes, factionStints } from "@/app/lib/schema";
import { getMkParticipation } from "./participation";

let h: Awaited<ReturnType<typeof createTestDb>>;
const prov = { sourceDataset: "test", sourceUrl: "https://knesset.gov.il/x", fetchedAt: new Date("2026-01-01") };

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(knessetVotes).values([
    { voteId: 1, knessetNum: 25, titleHe: "א", voteDate: new Date("2026-02-01T10:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov },
    { voteId: 2, knessetNum: 25, titleHe: "ב", voteDate: new Date("2026-02-01T12:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov },
    { voteId: 3, knessetNum: 25, titleHe: "ג", voteDate: new Date("2026-02-02T10:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov },
    { voteId: 4, knessetNum: 25, titleHe: "ד", voteDate: new Date("2025-01-01T10:00:00Z"), voteType: "roll_call", isDecisive: true, detailsStatus: "complete", ...prov },
  ]);
  await h.db.insert(factionStints).values({
    personToPositionId: 1, personId: 100, factionId: 50, knessetNum: 25,
    startDate: new Date("2026-01-15T00:00:00Z"), finishDate: null, ...prov,
  });
  await h.db.insert(mkVotes).values([
    { voteId: 1, personId: 100, result: "for", factionId: 50, ...prov },
    { voteId: 2, personId: 100, result: "against", factionId: 50, ...prov },
  ]);
});
afterEach(async () => { await h.close(); });

test("counts votes participated vs missed within the MK's tenure window", async () => {
  const p = await getMkParticipation({ db: h.db, personId: 100 });
  expect(p.votesInTenure).toBe(3);
  expect(p.participated).toBe(2);
  expect(p.missed).toBe(1);
  expect(p.presentDays).toBe(1);
  expect(p.plenumDaysInTenure).toBe(2);
});

test("an MK with no faction stint → all zeros, never null/NaN", async () => {
  const p = await getMkParticipation({ db: h.db, personId: 999 });
  expect(p).toEqual({ votesInTenure: 0, participated: 0, missed: 0, presentDays: 0, plenumDaysInTenure: 0 });
});
