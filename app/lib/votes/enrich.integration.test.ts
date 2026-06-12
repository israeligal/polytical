// Enrichment integration — real PGlite + real transactions. Mocks ONLY the
// external boundaries: OData fetchAll + the fs.knesset binary download.
// Payload shapes derive from the verbatim captures in test-payloads-items.ts.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { bills, knessetVotes, politicians, voteItems } from "@/app/lib/schema";
import { eq } from "drizzle-orm";

vi.mock("@/app/lib/knesset/odata", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/app/lib/knesset/odata")>();
  return { ...mod, fetchAll: vi.fn() };
});
vi.mock("./files-api", () => ({ fetchBinaryFile: vi.fn() }));
import { fetchAll } from "@/app/lib/knesset/odata";
import { fetchBinaryFile } from "./files-api";
import { enrichVoteItems } from "./enrich";
import {
  CAPTURED_AGENDA, CAPTURED_AGENDA_DOCS, CAPTURED_BILL_DOCS_MULTISTAGE, CAPTURED_BILL_DOCS_PRELIMINARY,
  CAPTURED_BILL_WITH_SUMMARY, CAPTURED_BILL_WITHOUT_SUMMARY,
} from "./test-payloads-items";

const mockFetchAll = vi.mocked(fetchAll);
const mockBinary = vi.mocked(fetchBinaryFile);

const billDocx = new Uint8Array(readFileSync(join(__dirname, "fixtures", "25_lst_7584510.docx")));
const agendaDocx = new Uint8Array(readFileSync(join(__dirname, "fixtures", "25_as_13440018.docx")));

let h: Awaited<ReturnType<typeof createTestDb>>;

const PROV = { sourceDataset: "test", sourceUrl: "https://example.test", fetchedAt: new Date("2026-06-01T00:00:00Z") };

/** A complete-details vote pointing at an item. */
function voteRow({ voteId, itemId, itemTypeId, voteDate = new Date("2026-06-10T17:00:00Z") }: {
  voteId: number; itemId: number; itemTypeId: number; voteDate?: Date;
}) {
  return {
    voteId, knessetNum: 25, itemId, itemTypeId, billId: itemTypeId === 2 ? itemId : null,
    titleHe: `הצבעה ${voteId}`, voteDate, voteType: "electronic" as const,
    detailsStatus: "complete" as const, ...PROV,
  };
}

/** Routes mocked fetchAll by entity, from the verbatim captures. */
function mockOdata({ bill, billDocs, agenda, agendaDocs }: {
  bill?: unknown[]; billDocs?: unknown[]; agenda?: unknown[]; agendaDocs?: unknown[];
}) {
  mockFetchAll.mockImplementation(async ({ entity }: { entity: string }) => {
    if (entity === "KNS_Bill") return bill ?? [];
    if (entity === "KNS_DocumentBill") return billDocs ?? [];
    if (entity === "KNS_Agenda") return agenda ?? [];
    if (entity === "KNS_DocumentAgenda") return agendaDocs ?? [];
    throw new Error(`unexpected entity ${entity}`);
  });
}

beforeEach(async () => {
  h = await createTestDb();
  mockFetchAll.mockReset();
  mockBinary.mockReset();
});
afterEach(async () => h.close());

test("summary_law path: enacted bill stores the official summary + both links + bills upsert", async () => {
  await h.db.insert(knessetVotes).values(voteRow({ voteId: 1, itemId: 2229413, itemTypeId: 2 }));
  mockOdata({ bill: CAPTURED_BILL_WITH_SUMMARY.value, billDocs: CAPTURED_BILL_DOCS_MULTISTAGE.value });

  const r = await enrichVoteItems({ db: h.db, throttleMs: 0 });
  expect(r).toMatchObject({ candidates: 1, enriched: 1, failed: 0 });

  const [item] = await h.db.select().from(voteItems).where(eq(voteItems.itemId, 2229413));
  expect(item.descriptionSource).toBe("summary_law");
  expect(item.descriptionHe).toContain("שפת הסימנים הישראלית");
  expect(item.legislationUrl).toBe("https://main.knesset.gov.il/apps/legislation/main/bills/2229413");
  expect(item.docUrl).toBe("https://fs.knesset.gov.il/25/law/25_lsr_13479239.pdf"); // stage 9 wins
  expect(mockBinary).not.toHaveBeenCalled(); // SummaryLaw present → no DOCX download

  const [bill] = await h.db.select().from(bills).where(eq(bills.billId, 2229413));
  expect(bill).toBeDefined(); // fresh bill row landed without the manual ingest
});

test("explanatory_notes path: no SummaryLaw → verbatim דברי הסבר from the real DOCX", async () => {
  await h.db.insert(knessetVotes).values(voteRow({ voteId: 2, itemId: 2233112, itemTypeId: 2 }));
  mockOdata({ bill: CAPTURED_BILL_WITHOUT_SUMMARY.value, billDocs: CAPTURED_BILL_DOCS_PRELIMINARY.value });
  mockBinary.mockResolvedValue(billDocx);

  await enrichVoteItems({ db: h.db, throttleMs: 0 });

  const [item] = await h.db.select().from(voteItems).where(eq(voteItems.itemId, 2233112));
  expect(item.descriptionSource).toBe("explanatory_notes");
  expect(item.descriptionHe).toMatch(/^סעיף 22א לחוק זכויות נפגעי עבירה/);
  expect(item.docUrl).toBe("https://fs.knesset.gov.il/25/law/25_lst_7584510.pdf"); // preliminary is the only stage
});

test("links-only TERMINAL row: bill with no summary and no DOCX is not retried", async () => {
  await h.db.insert(knessetVotes).values(voteRow({ voteId: 3, itemId: 2220111, itemTypeId: 2 }));
  // multistage docs MINUS the DOC variant → PDF-only bill
  const pdfOnly = CAPTURED_BILL_DOCS_MULTISTAGE.value!.filter((d) => d.ApplicationDesc !== "DOC");
  mockOdata({ bill: CAPTURED_BILL_WITHOUT_SUMMARY.value!.map((b) => ({ ...b, BillID: 2220111 })), billDocs: pdfOnly });

  const r1 = await enrichVoteItems({ db: h.db, throttleMs: 0 });
  expect(r1).toMatchObject({ candidates: 1, enriched: 1 });
  const [item] = await h.db.select().from(voteItems).where(eq(voteItems.itemId, 2220111));
  expect(item.descriptionHe).toBeNull();
  expect(item.descriptionSource).toBeNull();
  expect(item.docUrl).toContain("25_lsr_"); // links still present

  const r2 = await enrichVoteItems({ db: h.db, throttleMs: 0 });
  expect(r2.candidates).toBe(0); // terminal — row exists, never re-fetched
});

test("agenda path: motion_text from the real DOCX + initiator personId", async () => {
  await h.db.insert(politicians).values({ personId: 30895, nameHe: "עדי עזוז", searchName: "עדי עזוז", active: true, facts: {}, ...PROV });
  await h.db.insert(knessetVotes).values(voteRow({ voteId: 4, itemId: 2243980, itemTypeId: 4 }));
  mockOdata({ agenda: CAPTURED_AGENDA.value, agendaDocs: CAPTURED_AGENDA_DOCS.value });
  mockBinary.mockResolvedValue(agendaDocx);

  await enrichVoteItems({ db: h.db, throttleMs: 0 });

  const [item] = await h.db.select().from(voteItems).where(eq(voteItems.itemId, 2243980));
  expect(item.descriptionSource).toBe("motion_text");
  expect(item.descriptionHe).toMatch(/^מדינת ישראל מצויה/);
  expect(item.initiatorPersonId).toBe(30895);
  expect(item.legislationUrl).toBeNull();
  // backslash FilePath normalized
  expect(item.docUrl).toBe("https://fs.knesset.gov.il/25/agendasuggestion/25_as_13440018.pdf");
  // binary fetch got the NORMALIZED docx url
  expect(mockBinary).toHaveBeenCalledWith({ url: "https://fs.knesset.gov.il/25/agendasuggestion/25_as_13440018.docx" });
});

test("failure isolation: a fetch error writes NO row, other items still enrich, item retries next run", async () => {
  await h.db.insert(knessetVotes).values([
    voteRow({ voteId: 5, itemId: 2229413, itemTypeId: 2, voteDate: new Date("2026-06-10T18:00:00Z") }),
    voteRow({ voteId: 6, itemId: 2243980, itemTypeId: 4, voteDate: new Date("2026-06-10T17:00:00Z") }),
  ]);
  mockFetchAll.mockImplementation(async ({ entity }: { entity: string }) => {
    if (entity === "KNS_Bill") throw new Error("HTTP 503");
    if (entity === "KNS_DocumentBill") throw new Error("HTTP 503");
    if (entity === "KNS_Agenda") return CAPTURED_AGENDA.value!;
    if (entity === "KNS_DocumentAgenda") return CAPTURED_AGENDA_DOCS.value!;
    throw new Error(`unexpected entity ${entity}`);
  });
  mockBinary.mockResolvedValue(agendaDocx);

  const r1 = await enrichVoteItems({ db: h.db, throttleMs: 0 });
  expect(r1).toMatchObject({ candidates: 2, enriched: 1, failed: 1 });
  expect(await h.db.select().from(voteItems)).toHaveLength(1); // only the agenda

  // service recovers: next run re-offers the failed bill
  mockOdata({ bill: CAPTURED_BILL_WITH_SUMMARY.value, billDocs: CAPTURED_BILL_DOCS_MULTISTAGE.value });
  const r2 = await enrichVoteItems({ db: h.db, throttleMs: 0 });
  expect(r2).toMatchObject({ candidates: 1, enriched: 1, failed: 0 });
  expect(await h.db.select().from(voteItems)).toHaveLength(2);
});

test("sibling votes share one item row; re-run is idempotent", async () => {
  await h.db.insert(knessetVotes).values([
    voteRow({ voteId: 7, itemId: 2229413, itemTypeId: 2, voteDate: new Date("2026-06-09T12:00:00Z") }),
    voteRow({ voteId: 8, itemId: 2229413, itemTypeId: 2, voteDate: new Date("2026-06-10T12:00:00Z") }),
  ]);
  mockOdata({ bill: CAPTURED_BILL_WITH_SUMMARY.value, billDocs: CAPTURED_BILL_DOCS_MULTISTAGE.value });

  const r = await enrichVoteItems({ db: h.db, throttleMs: 0 });
  expect(r.candidates).toBe(1); // ONE candidate for two sibling votes
  expect(await h.db.select().from(voteItems)).toHaveLength(1);
});

test("respects the per-run limit, newest vote first", async () => {
  await h.db.insert(knessetVotes).values([
    voteRow({ voteId: 9, itemId: 111, itemTypeId: 2, voteDate: new Date("2026-06-01T12:00:00Z") }),
    voteRow({ voteId: 10, itemId: 2229413, itemTypeId: 2, voteDate: new Date("2026-06-10T12:00:00Z") }),
  ]);
  mockOdata({ bill: CAPTURED_BILL_WITH_SUMMARY.value, billDocs: CAPTURED_BILL_DOCS_MULTISTAGE.value });

  const r = await enrichVoteItems({ db: h.db, limit: 1, throttleMs: 0 });
  expect(r.candidates).toBe(1);
  const rows = await h.db.select().from(voteItems);
  expect(rows).toHaveLength(1);
  expect(rows[0].itemId).toBe(2229413); // the newer vote's item won the slot
});
