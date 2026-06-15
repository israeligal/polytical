import { beforeEach, afterEach, expect, test } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import {
  bills, billSponsors, billDocuments, billStatuses, politicians, knessetVotes,
  israelLaws, israelLawTopics, israelLawBills, billSplits,
} from "@/app/lib/schema";
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

test("no enacted law / not a split child → empty array + null", async () => {
  const b = await getBillById({ db: h.db, billId: 900 });
  expect(b!.enactedLaws).toEqual([]);
  expect(b!.splitParent).toBeNull();
});

test("surfaces enacted laws (many-per-bill) with deduped topic tags", async () => {
  await h.db.insert(israelLaws).values([
    { israelLawId: 5001, knessetNum: 25, nameHe: "חוק א", validityDesc: "תקף", publicationDate: new Date("2023-04-03"), ...prov },
    { israelLawId: 5002, knessetNum: 25, nameHe: "חוק ב", validityDesc: "פקע", publicationDate: new Date("2023-01-01"), ...prov },
  ]);
  // bill 900 produced BOTH laws (a budget bill spawning several enacted laws)
  await h.db.insert(israelLawBills).values([
    { israelLawId: 5001, billId: 900, ...prov },
    { israelLawId: 5002, billId: 900, ...prov },
  ]);
  await h.db.insert(israelLawTopics).values([
    { israelLawId: 5001, classificationId: 1, descHe: "ביטחון", ...prov },
    { israelLawId: 5001, classificationId: 2, descHe: "מיסוי", ...prov },
    { israelLawId: 5002, classificationId: 3, descHe: "חינוך", ...prov },
  ]);

  const b = await getBillById({ db: h.db, billId: 900 });
  // newest publicationDate first
  expect(b!.enactedLaws.map((l) => l.israelLawId)).toEqual([5001, 5002]);
  expect(b!.enactedLaws[0]).toMatchObject({ nameHe: "חוק א", validityDesc: "תקף" });
  expect(b!.enactedLaws[0].topics.sort()).toEqual(["ביטחון", "מיסוי"]);
  expect(b!.enactedLaws[1].topics).toEqual(["חינוך"]);
});

test("surfaces the split parent when the bill is a split child", async () => {
  await h.db.insert(bills).values({ billId: 800, knessetNum: 25, nameHe: "חוק האב", subTypeDesc: "ממשלתית", statusId: 104, ...prov });
  await h.db.insert(billSplits).values({ splitBillId: 900, mainBillId: 800, nameHe: "פרק שפוצל", ...prov });

  const b = await getBillById({ db: h.db, billId: 900 });
  expect(b!.splitParent).toMatchObject({ billId: 800, nameHe: "חוק האב" });
});
