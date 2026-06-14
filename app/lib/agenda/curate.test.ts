// Curation sweep on real PGlite: eligible current-Knesset bills (statusId in the
// 2nd-3rd-reading window) get exactly one announced agenda item; idempotent;
// never resurrects voted/dropped; drops items whose bill left the window without
// a decisive vote; leaves admin rows alone.
import { beforeEach, expect, test } from "vitest";
import { eq, type SQL } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { agendaItems, bills, knessetVotes } from "@/app/lib/schema";
import { CURRENT_KNESSET } from "@/app/lib/knesset/odata";
import { runAgendaCuration, ELIGIBLE_STATUS_IDS } from "./curate";

let h: Awaited<ReturnType<typeof createTestDb>>;
const FETCHED = new Date("2026-06-14T00:00:00Z");
const BILL_PROV = { sourceDataset: "KNS_Bill", sourceUrl: "https://k", fetchedAt: FETCHED };

async function seedBill(billId: number, statusId: number | null, knessetNum = CURRENT_KNESSET) {
  await h.db.insert(bills).values({ billId, knessetNum, nameHe: `חוק ${billId}`, statusId, ...BILL_PROV });
}
function countItems(where?: SQL) {
  return h.db.select().from(agendaItems).where(where);
}

beforeEach(async () => {
  h = await createTestDb();
});

test("creates one announced item per eligible current-Knesset bill", async () => {
  await seedBill(1, ELIGIBLE_STATUS_IDS[0]);           // eligible
  await seedBill(2, ELIGIBLE_STATUS_IDS[1]);           // eligible
  await seedBill(3, 104);                              // ineligible status
  await seedBill(4, ELIGIBLE_STATUS_IDS[0], 24);       // eligible status but wrong Knesset
  const res = await runAgendaCuration({ db: h.db, fetchedAt: FETCHED });
  expect(res.upserted).toBe(2);
  const items = await countItems();
  expect(items.map((i) => i.billId).sort()).toEqual([1, 2]);
  expect(items.every((i) => i.status === "announced" && i.addedBy === "ingest")).toBe(true);
  expect(items.find((i) => i.billId === 1)?.titleHe).toBe("חוק 1");
});

test("is idempotent — re-running creates no duplicates", async () => {
  await seedBill(1, ELIGIBLE_STATUS_IDS[0]);
  await runAgendaCuration({ db: h.db, fetchedAt: FETCHED });
  await runAgendaCuration({ db: h.db, fetchedAt: FETCHED });
  expect((await countItems()).length).toBe(1);
});

test("never resurrects a voted/dropped item to announced", async () => {
  await seedBill(1, ELIGIBLE_STATUS_IDS[0]);
  await runAgendaCuration({ db: h.db, fetchedAt: FETCHED });
  await h.db.update(agendaItems).set({ status: "voted" }).where(eq(agendaItems.billId, 1));
  await runAgendaCuration({ db: h.db, fetchedAt: FETCHED });
  const [item] = await countItems(eq(agendaItems.billId, 1));
  expect(item.status).toBe("voted");
});

test("drops an announced ingest item whose bill left the window with no decisive vote", async () => {
  await seedBill(1, ELIGIBLE_STATUS_IDS[0]);
  await runAgendaCuration({ db: h.db, fetchedAt: FETCHED });
  // bill leaves the window (e.g. halted) — no decisive vote
  await h.db.update(bills).set({ statusId: 177 }).where(eq(bills.billId, 1));
  const res = await runAgendaCuration({ db: h.db, fetchedAt: FETCHED });
  expect(res.dropped).toBe(1);
  const [item] = await countItems(eq(agendaItems.billId, 1));
  expect(item.status).toBe("dropped");
});

test("does NOT drop an item whose bill left the window because it got a decisive vote", async () => {
  await seedBill(1, ELIGIBLE_STATUS_IDS[0]);
  await runAgendaCuration({ db: h.db, fetchedAt: FETCHED });
  await h.db.update(bills).set({ statusId: 118 }).where(eq(bills.billId, 1)); // passed 3rd reading
  await h.db.insert(knessetVotes).values({
    voteId: 9001, knessetNum: CURRENT_KNESSET, billId: 1, titleHe: "חוק 1",
    voteDate: new Date("2026-06-13T10:00:00Z"), voteType: "electronic", isDecisive: true,
    sourceDataset: "votes", sourceUrl: "https://v", fetchedAt: FETCHED,
  });
  const res = await runAgendaCuration({ db: h.db, fetchedAt: FETCHED });
  expect(res.dropped).toBe(0);
  const [item] = await countItems(eq(agendaItems.billId, 1));
  expect(item.status).toBe("announced"); // left for the resolution sweep to mark voted
});

test("leaves admin-added items untouched", async () => {
  await h.db.insert(agendaItems).values({
    titleHe: "ידני", addedBy: "admin", status: "announced",
    sourceDataset: "admin", sourceUrl: "/admin", fetchedAt: FETCHED,
  });
  const res = await runAgendaCuration({ db: h.db, fetchedAt: FETCHED });
  expect(res.dropped).toBe(0);
  const [item] = await countItems(eq(agendaItems.addedBy, "admin"));
  expect(item.status).toBe("announced");
});
