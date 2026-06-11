import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { politicians } from "@/app/lib/schema";
import {
  getAllPoliticians,
  getFeaturedPoliticians,
  getPoliticianByPersonId,
} from "./repo";

// PGlite-backed repo tests: the read-side gallery queries run against real
// (PGlite) Postgres with the production schema/migrations applied. We override
// the module-level `db` so service-style helpers hit the test client.

let h: Awaited<ReturnType<typeof createTestDb>>;

const PROV = {
  sourceDataset: "KNS_PersonToPosition",
  sourceUrl: "https://knesset.gov.il/odata",
  fetchedAt: new Date("2026-01-01T00:00:00Z"),
} as const;

// Deliberately inserted out of gallery order (party, then searchName) so the
// ordering assertions below actually exercise the ORDER BY.
const SEED = [
  {
    personId: 30,
    nameHe: "ג",
    party: "ליכוד",
    factionId: 1,
    roleHe: "חבר כנסת",
    searchName: "g",
    ...PROV,
  },
  {
    personId: 10,
    nameHe: "א",
    party: "ליכוד",
    factionId: 1,
    roleHe: "ראש הממשלה",
    searchName: "a",
    ...PROV,
  },
  {
    personId: 20,
    nameHe: "ב",
    party: "הליכוד",
    factionId: 2,
    roleHe: "חבר כנסת",
    searchName: "b",
    ...PROV,
  },
];

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(politicians).values(SEED);
});
afterEach(async () => {
  await h.close();
});

test("getAllPoliticians returns every row, ordered by party then searchName", async () => {
  const rows = await getAllPoliticians({ db: h.db });
  expect(rows.map((r) => r.personId)).toEqual([20, 10, 30]);
});

test("getPoliticianByPersonId resolves by canonical personId; missing → null", async () => {
  const found = await getPoliticianByPersonId({ db: h.db, personId: 20 });
  expect(found?.nameHe).toBe("ב");
  expect(found?.party).toBe("הליכוד");

  expect(await getPoliticianByPersonId({ db: h.db, personId: 9999 })).toBeNull();
  // Non-integer ids are rejected before touching the DB.
  expect(await getPoliticianByPersonId({ db: h.db, personId: 1.5 })).toBeNull();
});

test("getFeaturedPoliticians caps to the requested limit, same gallery order", async () => {
  const rows = await getFeaturedPoliticians({ db: h.db, limit: 2 });
  expect(rows.map((r) => r.personId)).toEqual([20, 10]);
});

test("list reads exclude departed MKs (active=false); direct id lookup still serves them", async () => {
  await h.db.insert(politicians).values({
    personId: 40, nameHe: "פורש", searchName: "פורש", active: false, facts: {},
    sourceDataset: "test", sourceUrl: "https://example.test", fetchedAt: new Date("2026-06-01T00:00:00Z"),
  });
  const all = await getAllPoliticians({ db: h.db });
  expect(all.map((r) => r.personId)).not.toContain(40); // gallery filters departed
  const featured = await getFeaturedPoliticians({ db: h.db, limit: 10 });
  expect(featured.map((r) => r.personId)).not.toContain(40);
  // profile pages stay reachable by stable id
  expect((await getPoliticianByPersonId({ db: h.db, personId: 40 }))?.nameHe).toBe("פורש");
});
