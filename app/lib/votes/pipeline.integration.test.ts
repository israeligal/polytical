// Votes pipeline integration tests — real PGlite + real transactions; the ONLY
// mock is the website API (external boundary). Fixture shapes derive from the
// verbatim captures in test-payloads.ts.

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import {
  factionStints, knessetVotes, mkNameMappings, mkVotes, mkVotesRaw, politicians, unmappedMkNames, users,
} from "@/app/lib/schema";
import { eq } from "drizzle-orm";
import type { WsVoteDetailsResponse, WsVoteHeader } from "./website-types";
import { UnverifiedMappingsError } from "@/app/lib/errors";

vi.mock("./website-api", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./website-api")>();
  return { ...mod, fetchVoteHeaders: vi.fn(), fetchVoteDetails: vi.fn(), fetchMksDropdown: vi.fn() };
});
import { fetchVoteDetails, fetchVoteHeaders } from "./website-api";
import { ingestVotes } from "./service";
import { dismissUnmappedName, loadAttributionContext, resolveUnmappedName } from "./repo";
import { pickDecisiveVoteId, normalizeVoteDetails } from "./normalize";
import { nameKey } from "./name-key";

const mockHeaders = vi.mocked(fetchVoteHeaders);
const mockDetails = vi.mocked(fetchVoteDetails);

let h: Awaited<ReturnType<typeof createTestDb>>;

const PROV = { sourceDataset: "test", sourceUrl: "https://example.test", fetchedAt: new Date("2026-06-01T00:00:00Z") };

// --- local builders (shapes per test-payloads.ts captures) ---

function headerRow(over: Partial<WsVoteHeader> & Pick<WsVoteHeader, "VoteId">): WsVoteHeader {
  return {
    VoteProtocolNo: 1, VoteDate: "2026-06-09T19:00:00", VoteDateStr: "9.6.2026", VoteTimeStr: "19:00",
    VoteType: "אלקטרונית", ItemTitle: "חוק לדוגמה", KnessetId: 25, SessionId: 1, ...over,
  };
}

function detailResponse({
  voteId, itemId = 999, decision = "לקבל בקריאה שנייה", accepted = true,
  voters = [], counters,
}: {
  voteId: number; itemId?: number | null; decision?: string | null; accepted?: boolean | null;
  voters?: { name: string; faction?: string; resultId: number; title: string }[];
  counters?: { Title: string; countOfResult: number }[];
}): WsVoteDetailsResponse {
  return {
    VoteHeader: [{
      VoteId: voteId, VoteProtocolNo: 1, VoteDate: "2026-06-09T19:00:00", VoteType: "הצבעה אלקטרונית",
      VoteTypeId: 1, ItemTitle: "חוק לדוגמה", FK_ItemID: itemId, FK_Knesset: 25, Decision: decision,
      ChairmanName: null, IsForAccepted: accepted, AcceptedText: null, SessionNumber: 1,
    }],
    VoteCounters: (counters ?? [{ Title: "בעד", countOfResult: voters.length }]).map((c, i) => ({ ...c, rn: i + 1 })),
    VoteDetails: voters.map((v) => ({
      MkName: v.name, FactionName: v.faction ?? "סיעה א", VoteResultId: v.resultId, Title: v.title,
    })),
    DescreetVoteResults: [], HandsWithoutCountersAccepted: [], NextAndPrevVotes: [{ NextVote: null, PrevVote: null }],
  };
}

async function seedWorld() {
  // Liberman (427) + a party-switcher (901) with two stints split at 2024-01-01.
  await h.db.insert(politicians).values([
    { personId: 427, nameHe: "אביגדור ליברמן", searchName: "אביגדור ליברמנ", active: true, facts: {}, ...PROV },
    { personId: 901, nameHe: "עובר סיעות", searchName: "עובר סיעות", active: true, facts: {}, ...PROV },
  ]);
  // Keys MUST come from nameKey() — both sides of every lookup run through it
  // (hand-rolled keys silently miss the particle-strip normalization).
  await h.db.insert(mkNameMappings).values([
    { nameKey: nameKey("אביגדור ליברמן"), personId: 427, source: "crosswalk", verifiedAt: new Date("2026-06-01T00:00:00Z") },
    { nameKey: nameKey("עובר סיעות"), personId: 901, source: "crosswalk", verifiedAt: new Date("2026-06-01T00:00:00Z") },
  ]);
  await h.db.insert(factionStints).values([
    { personToPositionId: 1, personId: 427, factionId: 100, knessetNum: 25, startDate: new Date("2022-11-15T00:00:00Z"), finishDate: null, ...PROV },
    { personToPositionId: 2, personId: 901, factionId: 200, knessetNum: 25, startDate: new Date("2022-11-15T00:00:00Z"), finishDate: new Date("2024-01-01T00:00:00Z"), ...PROV },
    { personToPositionId: 3, personId: 901, factionId: 300, knessetNum: 25, startDate: new Date("2024-01-01T00:00:00Z"), finishDate: null, ...PROV },
  ]);
}

beforeEach(async () => {
  h = await createTestDb();
  await seedWorld();
  mockHeaders.mockReset();
  mockDetails.mockReset();
});
afterEach(async () => h.close());

test("ingest is idempotent and the admin `featured` flag survives re-ingest", async () => {
  mockHeaders.mockResolvedValue([headerRow({ VoteId: 1001 })]);
  mockDetails.mockResolvedValue(detailResponse({
    voteId: 1001,
    voters: [{ name: "ליברמן אביגדור", resultId: 7, title: "בעד" }],
  }));

  const r1 = await ingestVotes({ db: h.db, fromDate: "2026-06-01", toDate: "2026-06-10" });
  expect(r1.attributed).toBe(1);

  await h.db.update(knessetVotes).set({ featured: true }).where(eq(knessetVotes.voteId, 1001));
  await ingestVotes({ db: h.db, fromDate: "2026-06-01", toDate: "2026-06-10", refetchDetails: true });

  const votes = await h.db.select().from(knessetVotes);
  expect(votes).toHaveLength(1);
  expect(votes[0].featured).toBe(true); // carve-out held
  expect(votes[0].detailsStatus).toBe("complete");
  expect(votes[0].voteDate.toISOString()).toBe("2026-06-09T16:00:00.000Z"); // IDT → UTC
  const attributed = await h.db.select().from(mkVotes);
  expect(attributed).toHaveLength(1);
  expect(attributed[0]).toMatchObject({ voteId: 1001, personId: 427, result: "for", factionId: 100 });
});

test("a failed detail fetch leaves pending_details and the next run completes it", async () => {
  mockHeaders.mockResolvedValue([headerRow({ VoteId: 1002 })]);
  mockDetails.mockRejectedValueOnce(new Error("HTTP 500"));

  const r1 = await ingestVotes({ db: h.db, fromDate: "2026-06-01", toDate: "2026-06-10" });
  expect(r1.detailsFailed).toBe(1);
  let [vote] = await h.db.select().from(knessetVotes).where(eq(knessetVotes.voteId, 1002));
  expect(vote.detailsStatus).toBe("pending_details");
  expect(vote.totalFor).toBeNull();

  mockDetails.mockResolvedValue(detailResponse({ voteId: 1002, voters: [{ name: "ליברמן אביגדור", resultId: 7, title: "בעד" }] }));
  const r2 = await ingestVotes({ db: h.db, fromDate: "2026-06-01", toDate: "2026-06-10" });
  expect(r2.detailsFetched).toBe(1);
  [vote] = await h.db.select().from(knessetVotes).where(eq(knessetVotes.voteId, 1002));
  expect(vote.detailsStatus).toBe("complete");
});

test("hand votes store counters and never produce per-MK rows", async () => {
  mockHeaders.mockResolvedValue([headerRow({ VoteId: 1003, VoteType: "הרמת יד" })]);
  mockDetails.mockResolvedValue(detailResponse({
    voteId: 1003, voters: [],
    counters: [{ Title: "בעד", countOfResult: 28 }, { Title: "נגד", countOfResult: 5 }],
  }));
  await ingestVotes({ db: h.db, fromDate: "2026-06-01", toDate: "2026-06-10" });
  const [vote] = await h.db.select().from(knessetVotes).where(eq(knessetVotes.voteId, 1003));
  expect(vote.voteType).toBe("hand");
  expect(vote.totalFor).toBe(28);
  expect(await h.db.select().from(mkVotes)).toHaveLength(0);
  expect(await h.db.select().from(mkVotesRaw)).toHaveLength(0);
});

test("unknown VoteResultId throws — never guessed", () => {
  const bad = detailResponse({ voteId: 1, voters: [{ name: "ליברמן אביגדור", resultId: 99, title: "???" }] });
  expect(() => normalizeVoteDetails(1, bad, { fetchedAt: new Date("2026-06-01T00:00:00Z") })).toThrow(/unknown VoteResultId 99/);
});

test("party-switcher: faction-at-vote-time follows the stint covering the vote date", async () => {
  mockHeaders.mockResolvedValue([
    headerRow({ VoteId: 2001, VoteDate: "2023-06-01T12:00:00" }), // inside stint #2 (faction 200)
    headerRow({ VoteId: 2002, VoteDate: "2025-06-01T12:00:00" }), // inside stint #3 (faction 300)
  ]);
  mockDetails.mockImplementation(async ({ voteId }) =>
    detailResponse({ voteId, itemId: voteId, voters: [{ name: "עובר סיעות", resultId: 8, title: "נגד" }] }),
  );
  await ingestVotes({ db: h.db, fromDate: "2023-06-01", toDate: "2025-06-02" });
  const rows = await h.db.select().from(mkVotes).orderBy(mkVotes.voteId);
  expect(rows.map((r) => r.factionId)).toEqual([200, 300]);
  expect(rows.every((r) => r.result === "against")).toBe(true);
});

test("unmapped name queues once, withholds attribution, dismissal is sticky, resolution backfills", async () => {
  const run = () => ingestVotes({ db: h.db, fromDate: "2026-06-01", toDate: "2026-06-10", refetchDetails: true });
  mockHeaders.mockResolvedValue([headerRow({ VoteId: 3001 })]);
  mockDetails.mockResolvedValue(detailResponse({
    voteId: 3001,
    voters: [
      { name: "פלוני אלמוני", resultId: 9, title: "נמנע" },
      { name: "ליברמן אביגדור", resultId: 7, title: "בעד" },
    ],
  }));

  const r1 = await run();
  expect(r1.queued).toBe(1);
  expect(r1.attributed).toBe(1); // Liberman attributes; the stranger is withheld
  const queue = await h.db.select().from(unmappedMkNames);
  expect(queue).toHaveLength(1);
  expect(queue[0].status).toBe("pending");
  expect(await h.db.select().from(mkVotesRaw)).toHaveLength(2); // evidence retained for BOTH

  // dismissal is sticky across re-ingest
  await dismissUnmappedName({ db: h.db, nameKey: queue[0].nameKey, reviewedBy: await seedAdmin() });
  await run();
  const afterDismiss = await h.db.select().from(unmappedMkNames);
  expect(afterDismiss).toHaveLength(1);
  expect(afterDismiss[0].status).toBe("dismissed");

  // resolution: map the stranger to the switcher and backfill from RETAINED raw rows
  const ctx = await loadAttributionContext({ db: h.db });
  const { backfilled } = await resolveUnmappedName({
    db: h.db, nameKey: queue[0].nameKey, personId: 901, reviewedBy: (await h.db.select().from(users))[0].id, ctx,
  });
  expect(backfilled).toBe(1);
  const all = await h.db.select().from(mkVotes).orderBy(mkVotes.personId);
  expect(all).toHaveLength(2);
  expect(all[1]).toMatchObject({ personId: 901, result: "abstain", factionId: 300 });
});

async function seedAdmin(): Promise<string> {
  const existing = await h.db.select().from(users);
  if (existing.length) return existing[0].id;
  const [u] = await h.db.insert(users).values({ id: "admin1", name: "אדמין", email: "a@x.co", isAdmin: true }).returning({ id: users.id });
  return u.id;
}

test("any unverified mapping aborts ingestion before any write", async () => {
  await h.db.insert(mkNameMappings).values({ nameKey: "חדש לא מאומת", personId: 427, source: "admin" }); // no verifiedAt
  mockHeaders.mockResolvedValue([headerRow({ VoteId: 4001 })]);
  await expect(ingestVotes({ db: h.db, fromDate: "2026-06-01", toDate: "2026-06-10" })).rejects.toBeInstanceOf(UnverifiedMappingsError);
  expect(await h.db.select().from(knessetVotes)).toHaveLength(0);
});

test("decisive: accepted 2nd reading beats later reservation votes; reservations never decisive", async () => {
  mockHeaders.mockResolvedValue([
    headerRow({ VoteId: 5001, VoteDate: "2026-06-09T18:00:00" }), // reservation (rejected)
    headerRow({ VoteId: 5002, VoteDate: "2026-06-09T18:30:00" }), // 2nd reading accepted
    headerRow({ VoteId: 5003, VoteDate: "2026-06-09T19:00:00" }), // later reservation
  ]);
  mockDetails.mockImplementation(async ({ voteId }) => {
    const byId: Record<number, { decision: string; accepted: boolean }> = {
      5001: { decision: "לדחות את ההסתייגות", accepted: false },
      5002: { decision: "לקבל בקריאה שנייה", accepted: true },
      5003: { decision: "לדחות את ההסתייגות", accepted: false },
    };
    return detailResponse({ voteId, itemId: 777, ...byId[voteId], voters: [{ name: "ליברמן אביגדור", resultId: 7, title: "בעד" }] });
  });
  await ingestVotes({ db: h.db, fromDate: "2026-06-01", toDate: "2026-06-10" });
  const votes = await h.db.select().from(knessetVotes).orderBy(knessetVotes.voteId);
  expect(votes.map((v) => v.isDecisive)).toEqual([false, true, false]);
});

test("pickDecisiveVoteId: hand/secret-only items fall back to the latest vote (feed spine, never scored)", () => {
  expect(
    pickDecisiveVoteId([
      { voteId: 1, voteType: "hand", decisionHe: null, isAccepted: true, voteDate: new Date("2026-06-01T00:00:00Z") },
      { voteId: 2, voteType: "secret", decisionHe: null, isAccepted: null, voteDate: new Date("2026-06-02T00:00:00Z") },
    ]),
  ).toBe(2);
  expect(pickDecisiveVoteId([])).toBeNull();
});
