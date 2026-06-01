import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { politicians, bills, billSponsors, queries } from "@/app/lib/schema";
import { getPoliticianActivity } from "./repo";

let h: Awaited<ReturnType<typeof createTestDb>>;
const prov = { sourceDataset: "test", sourceUrl: "https://knesset.gov.il/x", fetchedAt: new Date("2026-01-01") };

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(politicians).values({ personId: 100, nameHe: "פלוני אלמוני", searchName: "ploni", ...prov });
  await h.db.insert(bills).values([
    { billId: 1, nameHe: "חוק א", ...prov },
    { billId: 2, nameHe: "חוק ב", ...prov },
  ]);
  await h.db.insert(billSponsors).values([
    { billInitiatorId: 10, billId: 1, personId: 100, isInitiator: true, ...prov },
    { billInitiatorId: 11, billId: 2, personId: 100, isInitiator: false, ...prov },
    { billInitiatorId: 12, billId: 1, personId: 999, isInitiator: true, ...prov }, // a different MK
  ]);
  await h.db.insert(queries).values([
    { queryId: 1, personId: 100, ...prov },
    { queryId: 2, personId: 100, ...prov },
    { queryId: 3, personId: 999, ...prov },
  ]);
});
afterEach(async () => {
  await h.close();
});

test("getPoliticianActivity counts distinct bills + queries and lists recent bills", async () => {
  const a = await getPoliticianActivity({ db: h.db, personId: 100 });
  expect(a.billCount).toBe(2); // bills 1 + 2 (distinct billId)
  expect(a.queryCount).toBe(2); // only this MK's queries, not 999's
  expect(a.recentBills.map((b) => b.billId).sort()).toEqual([1, 2]);
  expect(a.recentBills.find((b) => b.billId === 2)?.nameHe).toBe("חוק ב");
});

test("a sponsor row pointing at a bill we don't store is excluded from the count", async () => {
  // Orphan: references billId 777, which is NOT in the bills table. The join must
  // drop it so billCount + recentBills only reflect bills we actually hold.
  await h.db.insert(billSponsors).values({
    billInitiatorId: 99, billId: 777, personId: 100, isInitiator: true, ...prov,
  });
  const a = await getPoliticianActivity({ db: h.db, personId: 100 });
  expect(a.billCount).toBe(2); // still just bills 1 + 2 — orphan 777 ignored
  expect(a.recentBills.map((b) => b.billId).sort()).toEqual([1, 2]);
});

test("an MK with no parliamentary activity returns zeros", async () => {
  const a = await getPoliticianActivity({ db: h.db, personId: 12345 });
  expect(a).toEqual({ billCount: 0, queryCount: 0, recentBills: [] });
});
