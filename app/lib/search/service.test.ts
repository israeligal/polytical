import { beforeEach, afterEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { politicians, markets } from "@/app/lib/schema";
import { normalizeSearchName } from "@/app/lib/knesset/search-name";
import { createMarket } from "@/app/lib/markets/repo";
import { search } from "./service";

let h: Awaited<ReturnType<typeof createTestDb>>;

const mk = (personId: number, nameHe: string) => ({
  personId,
  nameHe,
  searchName: normalizeSearchName(nameHe),
  sourceDataset: "test",
  sourceUrl: "https://example.test",
  fetchedAt: new Date("2026-01-01T00:00:00Z"),
});

const binary = (questionHe: string, personIds: number[] = []) =>
  createMarket({
    db: h.db,
    questionHe,
    category: "coalition",
    closeAt: new Date(Date.now() + 7 * 864e5),
    outcomes: [
      { labelHe: "כן", ordinal: 0 },
      { labelHe: "לא", ordinal: 1 },
    ],
    personIds,
  });

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(politicians).values([
    mk(101, "בנימין נתניהו"),
    mk(102, "יאיר לפיד"),
  ]);
});
afterEach(async () => h.close());

test("matches markets by normalized question text", async () => {
  await binary("האם הקואליציה תשרוד את מושב הקיץ?");
  await binary("האם יהיו בחירות עד סוף השנה?");

  const res = await search({ db: h.db, q: "קואליציה" });
  expect(res.markets.length).toBe(1);
  expect(res.markets[0].market.question).toContain("הקואליציה");
});

test("matches politicians by normalized name", async () => {
  const res = await search({ db: h.db, q: "נתניהו" });
  expect(res.politicians.map((p) => p.name)).toContain("בנימין נתניהו");
  expect(res.politicians.some((p) => p.name === "יאיר לפיד")).toBe(false);
});

test("draft and voided markets are excluded from search", async () => {
  const { marketId } = await binary("האם תקום ועדת חקירה בנושא הקואליציה?");
  await h.db.update(markets).set({ status: "voided" }).where(eq(markets.id, marketId));

  const res = await search({ db: h.db, q: "קואליציה" });
  expect(res.markets.length).toBe(0);
});

test("niqqud / final-form variation still matches (normalized)", async () => {
  await h.db.insert(politicians).values(mk(103, "מֹשֶׁה גַּפְנִי")); // stored WITH niqqud
  const res = await search({ db: h.db, q: "משה גפני" }); // queried WITHOUT niqqud
  // The display name keeps its niqqud; assert on the stable id so we're testing
  // the normalized MATCH, not the raw-name substring.
  expect(res.politicians.some((p) => p.id === "103")).toBe(true);
});

test("a query shorter than the minimum returns empty", async () => {
  await binary("האם הקואליציה תשרוד?");
  const res = await search({ db: h.db, q: "א" });
  expect(res.politicians).toEqual([]);
  expect(res.markets).toEqual([]);
});

test("market results carry their featured politician portraits", async () => {
  await binary("האם נתניהו יישאר ראש הממשלה?", [101]);
  const res = await search({ db: h.db, q: "נתניהו" });
  expect(res.markets.length).toBe(1);
  expect(res.markets[0].featured.map((p) => p.id)).toContain("101");
});
