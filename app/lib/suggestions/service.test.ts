import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";

// Mock at the push-service boundary: push fires AFTER commit, fire-and-forget.
// Asserting the call (and that a rejection cannot break the approval) IS the
// observable behavior for this boundary.
vi.mock("@/app/lib/push/service", () => ({ dispatchPush: vi.fn() }));
import { dispatchPush } from "@/app/lib/push/service";
const dispatchPushMock = vi.mocked(dispatchPush);
import { users, politicians, markets, outcomes, marketPoliticians, marketSuggestions } from "@/app/lib/schema";
import {
  AlreadyReviewedError,
  ClosePastError,
  InvalidCategoryError,
  SuggestionTooLongError,
  SuggestionTooShortError,
  UnknownPoliticianError,
} from "@/app/lib/errors";
import {
  createSuggestion,
  approveSuggestion,
  rejectSuggestion,
  getMySuggestions,
  listSuggestions,
} from "./service";

let h: Awaited<ReturnType<typeof createTestDb>>;
const PROV = { sourceDataset: "test", sourceUrl: "https://knesset.gov.il/x", fetchedAt: new Date("2026-01-01") };
const CLOSE = new Date("2026-12-31T00:00:00Z");

beforeEach(async () => {
  h = await createTestDb();
  dispatchPushMock.mockReset();
  dispatchPushMock.mockResolvedValue(undefined);
  await h.db.insert(users).values([
    { id: "proposer", name: "מציע", email: "p@x.co" },
    { id: "other", name: "אחר", email: "o@x.co" },
    { id: "admin", name: "מנהל", email: "a@x.co", isAdmin: true },
  ]);
  await h.db.insert(politicians).values({ personId: 100, nameHe: "ח״כ פלוני", searchName: "ploni", ...PROV });
});
afterEach(async () => {
  await h.close();
});

test("createSuggestion inserts a pending row with a resolved politician", async () => {
  const { id } = await createSuggestion({
    db: h.db, userId: "proposer", questionHe: "האם יקודם חוק כלשהו?", category: "legislation", personId: 100,
  });
  const [row] = await h.db.select().from(marketSuggestions).where(eq(marketSuggestions.id, id));
  expect(row.status).toBe("pending");
  expect(row.personId).toBe(100);
  expect(row.category).toBe("legislation");
  expect(row.marketId).toBeNull();
});

test("createSuggestion rejects short / long / bad-category / unknown politician", async () => {
  const base = { db: h.db, userId: "proposer", category: "elections" as const };
  await expect(createSuggestion({ ...base, questionHe: "קצר" })).rejects.toBeInstanceOf(SuggestionTooShortError);
  await expect(createSuggestion({ ...base, questionHe: "א".repeat(201) })).rejects.toBeInstanceOf(SuggestionTooLongError);
  await expect(
    createSuggestion({ db: h.db, userId: "proposer", questionHe: "שאלה תקינה לגמרי", category: "not-a-category" }),
  ).rejects.toBeInstanceOf(InvalidCategoryError);
  await expect(
    createSuggestion({ ...base, questionHe: "שאלה תקינה עם חבר כנסת לא קיים", personId: 999 }),
  ).rejects.toBeInstanceOf(UnknownPoliticianError);
});

test("approveSuggestion creates an open binary market, links the MK, and flips status (idempotent)", async () => {
  const { id } = await createSuggestion({
    db: h.db, userId: "proposer", questionHe: "האם הקואליציה תשרוד את הקיץ?", category: "coalition", personId: 100,
  });
  const { marketId } = await approveSuggestion({ db: h.db, suggestionId: id, reviewerId: "admin", closeAt: CLOSE });

  const [m] = await h.db.select().from(markets).where(eq(markets.id, marketId));
  expect(m.status).toBe("open"); // approved suggestions go live immediately
  expect(m.questionHe).toBe("האם הקואליציה תשרוד את הקיץ?");
  expect(m.category).toBe("coalition");

  const outs = await h.db.select().from(outcomes).where(eq(outcomes.marketId, marketId));
  expect(outs.map((o) => o.labelHe).sort()).toEqual(["כן", "לא"]);

  const links = await h.db.select().from(marketPoliticians).where(eq(marketPoliticians.marketId, marketId));
  expect(links.map((l) => l.personId)).toEqual([100]);

  const [s] = await h.db.select().from(marketSuggestions).where(eq(marketSuggestions.id, id));
  expect(s.status).toBe("approved");
  expect(s.marketId).toBe(marketId);
  expect(s.reviewedBy).toBe("admin");

  // Re-approving a terminal suggestion is rejected (no duplicate market).
  await expect(
    approveSuggestion({ db: h.db, suggestionId: id, reviewerId: "admin", closeAt: CLOSE }),
  ).rejects.toBeInstanceOf(AlreadyReviewedError);
  expect((await h.db.select().from(markets)).length).toBe(1);
});

test("approveSuggestion rejects a past closeAt (no un-bettable market is minted)", async () => {
  const { id } = await createSuggestion({ db: h.db, userId: "proposer", questionHe: "שאלה עם מועד עבר", category: "elections" });
  await expect(
    approveSuggestion({ db: h.db, suggestionId: id, reviewerId: "admin", closeAt: new Date("2020-01-01T00:00:00Z") }),
  ).rejects.toBeInstanceOf(ClosePastError);
  // Nothing was created, and the suggestion stays pending so it can still be approved properly.
  expect((await h.db.select().from(markets)).length).toBe(0);
  const [s] = await h.db.select().from(marketSuggestions).where(eq(marketSuggestions.id, id));
  expect(s.status).toBe("pending");
});

test("rejectSuggestion records the note and is terminal", async () => {
  const { id } = await createSuggestion({ db: h.db, userId: "proposer", questionHe: "שאלה שתידחה בסוף", category: "scandals" });
  await rejectSuggestion({ db: h.db, suggestionId: id, reviewerId: "admin", note: "לא מספיק ספציפי" });

  const [s] = await h.db.select().from(marketSuggestions).where(eq(marketSuggestions.id, id));
  expect(s.status).toBe("rejected");
  expect(s.reviewNote).toBe("לא מספיק ספציפי");
  expect(s.marketId).toBeNull();

  await expect(
    rejectSuggestion({ db: h.db, suggestionId: id, reviewerId: "admin" }),
  ).rejects.toBeInstanceOf(AlreadyReviewedError);
});

test("getMySuggestions returns only the caller's rows; listSuggestions filters by status", async () => {
  await createSuggestion({ db: h.db, userId: "proposer", questionHe: "הצעה של המציע הראשון", category: "security" });
  await createSuggestion({ db: h.db, userId: "other", questionHe: "הצעה של מישהו אחר לגמרי", category: "personnel" });

  const mine = await getMySuggestions({ db: h.db, userId: "proposer" });
  expect(mine.length).toBe(1);
  expect(mine[0].proposerName).toBe("מציע");

  const pending = await listSuggestions({ db: h.db, status: "pending" });
  expect(pending.length).toBe(2);
  const approved = await listSuggestions({ db: h.db, status: "approved" });
  expect(approved.length).toBe(0);
});

// --- Post-commit push dispatch -------------------------------------------------

test("approveSuggestion fires dispatchPush once after commit with the suggestion_approved event", async () => {
  const { id } = await createSuggestion({
    db: h.db, userId: "proposer", questionHe: "האם תוקם ועדת חקירה?", category: "scandals",
  });

  const { marketId } = await approveSuggestion({ db: h.db, suggestionId: id, reviewerId: "admin", closeAt: CLOSE });

  expect(dispatchPushMock).toHaveBeenCalledTimes(1);
  const { events } = dispatchPushMock.mock.calls[0][0];
  expect(events).toEqual([
    {
      type: "suggestion_approved",
      userId: "proposer",
      suggestionId: id,
      marketId,
      questionHe: "האם תוקם ועדת חקירה?",
    },
  ]);
});

test("approveSuggestion succeeds even when dispatchPush rejects (push cannot break approval)", async () => {
  dispatchPushMock.mockRejectedValueOnce(new Error("push service down"));

  const { id } = await createSuggestion({
    db: h.db, userId: "proposer", questionHe: "האם יתקיימו בחירות מוקדמות?", category: "elections",
  });

  // Must NOT throw — the post-commit push failure is swallowed.
  const { marketId } = await approveSuggestion({ db: h.db, suggestionId: id, reviewerId: "admin", closeAt: CLOSE });
  expect(dispatchPushMock).toHaveBeenCalledTimes(1);

  // The approval fully committed despite the push failure (assert DB state).
  const [m] = await h.db.select().from(markets).where(eq(markets.id, marketId));
  expect(m.status).toBe("open");
  const [s] = await h.db.select().from(marketSuggestions).where(eq(marketSuggestions.id, id));
  expect(s.status).toBe("approved");
  expect(s.marketId).toBe(marketId);
});

test("rejectSuggestion fires dispatchPush once after commit with the suggestion_rejected event", async () => {
  const { id } = await createSuggestion({
    db: h.db, userId: "proposer", questionHe: "הצעה שתידחה עם פוש", category: "security",
  });

  await rejectSuggestion({ db: h.db, suggestionId: id, reviewerId: "admin", note: "לא ספציפי מספיק" });

  expect(dispatchPushMock).toHaveBeenCalledTimes(1);
  const { events } = dispatchPushMock.mock.calls[0][0];
  expect(events).toEqual([
    {
      type: "suggestion_rejected",
      userId: "proposer",
      suggestionId: id,
      questionHe: "הצעה שתידחה עם פוש",
      note: "לא ספציפי מספיק",
    },
  ]);
});
