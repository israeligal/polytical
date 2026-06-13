import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { bills, billSponsors, billDocuments, billStatuses, politicians, knessetVotes } from "@/app/lib/schema";
import { getBillById } from "./repo";

let h: Awaited<ReturnType<typeof createTestDb>>;
const prov = { sourceDataset: "test", sourceUrl: "https://knesset.gov.il/x", fetchedAt: new Date("2026-06-13") };

beforeEach(async () => {
  h = await createTestDb();
  await h.db.insert(politicians).values([
    { personId: 100, nameHe: "ראש יוזם", searchName: "a", ...prov },
    { personId: 200, nameHe: "חבר תומך", searchName: "b", ...prov },
  ]);
  await h.db.insert(billStatuses).values({ statusId: 104, descHe: "בהכנה לקריאה ראשונה", ...prov });
  await h.db.insert(bills).values({ billId: 900, knessetNum: 25, nameHe: "חוק לדוגמה", subTypeDesc: "פרטית", statusId: 104, ...prov });
  await h.db.insert(billSponsors).values([
    { billInitiatorId: 1, billId: 900, personId: 100, isInitiator: true, ordinal: 1, ...prov },
    { billInitiatorId: 2, billId: 900, personId: 200, isInitiator: false, ordinal: 2, ...prov },
  ]);
  await h.db.insert(billDocuments).values({ documentBillId: 5, billId: 900, format: "PDF", filePath: "https://fs.knesset.gov.il/x.pdf", ...prov });
});
afterEach(async () => { await h.close(); });

test("returns the bill with status desc, ordered initiators, and documents", async () => {
  const b = await getBillById({ db: h.db, billId: 900 });
  expect(b).not.toBeNull();
  expect(b!.nameHe).toBe("חוק לדוגמה");
  expect(b!.statusDesc).toBe("בהכנה לקריאה ראשונה");
  expect(b!.initiators.map((i) => i.personId)).toEqual([100, 200]); // initiator first, then ordinal
  expect(b!.initiators[0].isInitiator).toBe(true);
  expect(b!.documents.map((d) => d.format)).toEqual(["PDF"]);
  expect(b!.linkedVote).toBeNull();
});

test("surfaces the decisive vote when one is linked", async () => {
  await h.db.insert(knessetVotes).values({
    voteId: 7, knessetNum: 25, billId: 900, titleHe: "הצבעה על החוק",
    voteDate: new Date("2026-05-01"), voteType: "electronic", isDecisive: true, ...prov,
  });
  const b = await getBillById({ db: h.db, billId: 900 });
  expect(b!.linkedVote).toMatchObject({ voteId: 7 });
});

test("returns null for an unknown bill", async () => {
  expect(await getBillById({ db: h.db, billId: 12345 })).toBeNull();
});
