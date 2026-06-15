// Agenda feed read on real PGlite: only announced items, joined to the bill's
// current status label, with raw community counts (k-gate is applied by the
// page), ordered most-imminent-first.
import { beforeEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { agendaItems, agendaStances, billSplits, billSponsors, billStatuses, bills, politicians, users } from "@/app/lib/schema";
import { CURRENT_KNESSET } from "@/app/lib/knesset/odata";
import { getAgendaFeed, getAnnouncedAgendaItemByBill } from "./read-repo";

let h: Awaited<ReturnType<typeof createTestDb>>;
const FETCHED = new Date("2026-06-14T00:00:00Z");
const PROV = { sourceDataset: "t", sourceUrl: "https://t", fetchedAt: FETCHED };

async function seedItem(over: Partial<typeof agendaItems.$inferInsert> & { billId: number; titleHe: string }): Promise<string> {
  await h.db.insert(bills).values({ billId: over.billId, knessetNum: CURRENT_KNESSET, nameHe: over.titleHe, statusId: 113, ...PROV }).onConflictDoNothing();
  const [row] = await h.db
    .insert(agendaItems)
    .values({ addedBy: "ingest", status: "announced", ...PROV, ...over })
    .returning({ id: agendaItems.id });
  return row.id;
}

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(users).values([
    { id: "u1", name: "א", email: "u1@x.co" },
    { id: "u2", name: "ב", email: "u2@x.co" },
  ]);
  await h.db.insert(billStatuses).values({ statusId: 113, descHe: "הכנה לקריאה שנייה ושלישית", ...PROV });
});

test("returns only announced items with bill status label + raw counts", async () => {
  const a = await seedItem({ billId: 1, titleHe: "חוק א", expectedDate: "2026-06-20" });
  await seedItem({ billId: 2, titleHe: "חוק ב", status: "voted" }); // excluded
  await h.db.insert(agendaStances).values([
    { userId: "u1", agendaItemId: a, stance: "for" },
    { userId: "u2", agendaItemId: a, stance: "against" },
  ]);
  const feed = await getAgendaFeed({ db: h.db });
  expect(feed).toHaveLength(1);
  expect(feed[0]).toMatchObject({
    billId: 1, titleHe: "חוק א", statusDescHe: "הכנה לקריאה שנייה ושלישית",
    forCount: 1, againstCount: 1,
  });
});

test("attaches the bill's initiating MKs (ordinal order), capped, with a true total count", async () => {
  await h.db.insert(politicians).values(
    Array.from({ length: 8 }, (_, i) => ({
      personId: 100 + i, nameHe: `ח״כ ${i}`, searchName: `mk${i}`, active: true, facts: {}, ...PROV,
    })),
  );
  await seedItem({ billId: 1, titleHe: "חוק עם יוזמים" });
  await h.db.insert(billSponsors).values([
    // out-of-order ordinals + a non-initiator co-signer that must be excluded
    { billInitiatorId: 1, billId: 1, personId: 102, isInitiator: true, ordinal: 3, ...PROV },
    { billInitiatorId: 2, billId: 1, personId: 100, isInitiator: true, ordinal: 1, ...PROV },
    { billInitiatorId: 3, billId: 1, personId: 101, isInitiator: true, ordinal: 2, ...PROV },
    { billInitiatorId: 4, billId: 1, personId: 103, isInitiator: false, ordinal: 4, ...PROV }, // co-signer
    ...Array.from({ length: 4 }, (_, i) => ({
      billInitiatorId: 5 + i, billId: 1, personId: 104 + i, isInitiator: true, ordinal: 5 + i, ...PROV,
    })),
  ]);
  const [row] = await getAgendaFeed({ db: h.db });
  expect(row.initiatorCount).toBe(7); // 7 initiators, co-signer excluded
  expect(row.initiators).toHaveLength(6); // capped at MAX_INITIATORS_PER_ITEM
  expect(row.initiators.slice(0, 3).map((p) => p.personId)).toEqual([100, 101, 102]); // ordinal order
});

test("an item whose bill has no initiators reports an empty cluster", async () => {
  await seedItem({ billId: 1, titleHe: "חוק" });
  const [row] = await getAgendaFeed({ db: h.db });
  expect(row.initiators).toEqual([]);
  expect(row.initiatorCount).toBe(0);
});

test("orders by expectedDate asc (nulls last)", async () => {
  await seedItem({ billId: 1, titleHe: "מאוחר", expectedDate: "2026-07-01" });
  await seedItem({ billId: 2, titleHe: "מוקדם", expectedDate: "2026-06-18" });
  await seedItem({ billId: 3, titleHe: "ללא תאריך" });
  const feed = await getAgendaFeed({ db: h.db });
  expect(feed.map((f) => f.titleHe)).toEqual(["מוקדם", "מאוחר", "ללא תאריך"]);
});

test("items with no stances report zero counts", async () => {
  await seedItem({ billId: 1, titleHe: "חוק" });
  const [row] = await getAgendaFeed({ db: h.db });
  expect({ f: row.forCount, a: row.againstCount }).toEqual({ f: 0, a: 0 });
});

test("getAnnouncedAgendaItemByBill returns the announced item, null otherwise", async () => {
  const id = await seedItem({ billId: 1, titleHe: "חוק" });
  await seedItem({ billId: 2, titleHe: "חוק ב", status: "voted" });
  expect((await getAnnouncedAgendaItemByBill({ db: h.db, billId: 1 }))?.id).toBe(id);
  expect(await getAnnouncedAgendaItemByBill({ db: h.db, billId: 2 })).toBeNull(); // voted
  expect(await getAnnouncedAgendaItemByBill({ db: h.db, billId: 999 })).toBeNull(); // none
});

test("attaches the split parent when the agenda item's bill is a split child", async () => {
  // parent bill exists; the agenda item's bill (1) is a split child of it
  await h.db.insert(bills).values({ billId: 500, knessetNum: CURRENT_KNESSET, nameHe: "חוק האב התקציבי", statusId: 113, ...PROV }).onConflictDoNothing();
  await seedItem({ billId: 1, titleHe: "פרק שפוצל" });
  await h.db.insert(billSplits).values({ splitBillId: 1, mainBillId: 500, nameHe: "פרק שפוצל", ...PROV });
  await seedItem({ billId: 2, titleHe: "חוק רגיל" }); // not a split child

  const feed = await getAgendaFeed({ db: h.db });
  const byBill = new Map(feed.map((f) => [f.billId, f]));
  expect(byBill.get(1)!.splitParent).toMatchObject({ billId: 500, nameHe: "חוק האב התקציבי" });
  expect(byBill.get(2)!.splitParent).toBeNull();
});
