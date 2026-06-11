import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { politicians, bills, billSponsors, queries } from "@/app/lib/schema";
import { getPoliticianActivity } from "./repo";

let h: Awaited<ReturnType<typeof createTestDb>>;
const prov = { sourceDataset: "test", sourceUrl: "https://knesset.gov.il/x", fetchedAt: new Date("2026-01-01") };

beforeEach(async () => {
  h = await createTestDb();
  // MK 100: stored K25 bills/queries, but NO activity-count columns yet (pre-ingest state).
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

test("before the activity-counts ingest, falls back to the stored-bill join for the current term (no lifetime)", async () => {
  const a = await getPoliticianActivity({ db: h.db, personId: 100 });
  expect(a.current).toEqual({ bills: 2, queries: 2 }); // distinct K25 bills + only this MK's queries
  expect(a.lifetime).toBeNull(); // counts not ingested yet — never a bogus 0
  expect(a.recentBills.map((b) => b.billId).sort()).toEqual([1, 2]);
  expect(a.recentBills.find((b) => b.billId === 2)?.nameHe).toBe("חוק ב");
});

test("with populated count columns, reports current + lifetime from the official totals (not the join)", async () => {
  // MK 200 has NO stored bills, but the activity-counts ingest wrote its official totals.
  // Proves lifetime comes from the columns, not a join over our K25-only tables.
  await h.db.insert(politicians).values({
    personId: 200, nameHe: "אמיר אוחנה", searchName: "ohana",
    billsCurrent: 2, billsLifetime: 213, queriesCurrent: 0, queriesLifetime: 11,
    activityCountsFetchedAt: new Date("2026-06-11"), ...prov,
  });
  const a = await getPoliticianActivity({ db: h.db, personId: 200 });
  expect(a.current).toEqual({ bills: 2, queries: 0 });
  expect(a.lifetime).toEqual({ bills: 213, queries: 11 });
  expect(a.recentBills).toEqual([]); // no stored bills for this MK
});

test("a sponsor row pointing at a bill we don't store is excluded from the fallback count", async () => {
  // Orphan: references billId 777, which is NOT in the bills table. The join must drop it.
  await h.db.insert(billSponsors).values({
    billInitiatorId: 99, billId: 777, personId: 100, isInitiator: true, ...prov,
  });
  const a = await getPoliticianActivity({ db: h.db, personId: 100 });
  expect(a.current.bills).toBe(2); // still just bills 1 + 2 — orphan 777 ignored
  expect(a.recentBills.map((b) => b.billId).sort()).toEqual([1, 2]);
});

test("an unknown MK returns zero current activity and no lifetime", async () => {
  const a = await getPoliticianActivity({ db: h.db, personId: 12345 });
  expect(a).toEqual({ current: { bills: 0, queries: 0 }, lifetime: null, recentBills: [] });
});
