import { afterEach, beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { politicians, factions } from "@/app/lib/schema";
import { upsertFactions, upsertMembers } from "./repo";
import type { FactionRow, MemberRow } from "./normalize";

let h: Awaited<ReturnType<typeof createTestDb>>;
const PROV = { sourceDataset: "KNS_Faction", sourceUrl: "https://x", fetchedAt: new Date("2026-05-31T00:00:00Z") };

beforeEach(async () => { h = await createTestDb(); });
afterEach(async () => { await h.close(); });

function faction(over: Partial<FactionRow>): FactionRow {
  return { factionId: 1, nameHe: "סיעה", knessetNum: 25, isCurrent: true, ...PROV, ...over };
}
function member(over: Partial<MemberRow>): MemberRow {
  return {
    personId: 1, nameHe: "פלוני", nameEn: null, party: null, factionId: null, roleHe: null,
    inKnessetSince: null, dob: null, facts: {}, active: true, gender: null, searchName: "פלוני",
    sourceDataset: "KNS_PersonToPosition", sourceUrl: "https://x", fetchedAt: PROV.fetchedAt, ...over,
  };
}

test("upsertFactions inserts then updates on conflict(factionId) — idempotent, provenance written", async () => {
  await upsertFactions({ db: h.db, rows: [faction({ factionId: 1095, nameHe: "א" })] });
  await upsertFactions({ db: h.db, rows: [faction({ factionId: 1095, nameHe: "ב", fetchedAt: new Date("2026-06-01T00:00:00Z") })] });
  const rows = await h.db.select().from(factions);
  expect(rows.length).toBe(1);                 // no duplicate
  expect(rows[0].nameHe).toBe("ב");            // updated
  expect(rows[0].fetchedAt.toISOString()).toBe("2026-06-01T00:00:00.000Z"); // provenance refreshed
});

test("upsertMembers batches > 100 rows and keys on personId", async () => {
  const many = Array.from({ length: 250 }, (_, i) => member({ personId: i + 1, searchName: `p${i}` }));
  await upsertMembers({ db: h.db, rows: many });
  const [{ n }] = await h.db.select({ n: politicians.personId }).from(politicians).where(eq(politicians.personId, 250));
  expect(n).toBe(250);
  const all = await h.db.select().from(politicians);
  expect(all.length).toBe(250);                // all 250 inserted across 3 batches
});

test("upsertMembers updates an existing politician on re-run (no dup)", async () => {
  await upsertMembers({ db: h.db, rows: [member({ personId: 30749, party: null })] });
  await upsertMembers({ db: h.db, rows: [member({ personId: 30749, party: "התאחדות הספרדים", factionId: 1095 })] });
  const rows = await h.db.select().from(politicians);
  expect(rows.length).toBe(1);
  expect(rows[0].party).toBe("התאחדות הספרדים");
  expect(rows[0].factionId).toBe(1095);
});
