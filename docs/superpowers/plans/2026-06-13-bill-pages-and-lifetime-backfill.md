# Bill Pages & Lifetime Backfill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface every current MK's recent bills (current + earlier Knessets), make each bill a clickable link to a new internal `/bill/[billId]` page that shows official data + the real bill text, and group the politician page's recent bills by Knesset.

**Architecture:** Extend the existing per-MK Knesset OData ingest to backfill lifetime bills/sponsors/documents (one paged `KNS_BillInitiator?$expand=KNS_Bill/KNS_DocumentBills` call per MK — verified inline). Widen the `bills` table and add `bill_documents` + `bill_statuses` so we store everything once. Read via `getPoliticianActivity` (now Knesset-grouped) and a new `app/lib/bills/repo.ts`. Render an internal bill page; the politician page links into it. No new voting — a voted bill reuses the existing `/vote/[id]` + StanceWidget.

**Tech Stack:** Next 16 RSC, Drizzle + Neon Postgres, PGlite for integration tests, Vitest, Tailwind v4 (RTL/logical props), Knesset OData v4 (`ParliamentInfo.svc`).

**Spec:** `docs/superpowers/specs/2026-06-13-bill-pages-and-lifetime-backfill-design.md`

**Verified facts (live, 2026-06-13):**
- `KNS_BillInitiator?$filter=PersonID eq <id>&$expand=KNS_Bill/KNS_DocumentBills` returns each initiator with `KNS_Bill` inline and `KNS_Bill.KNS_DocumentBills` as a list (`DocumentBillID, BillID, GroupTypeID, GroupTypeDesc, ApplicationID, ApplicationDesc, FilePath, LastUpdatedDate`). `FilePath` → `fs.knesset.gov.il` (HTTP 200, real PDF/DOCX, NOT WAF'd; note the API sometimes emits a double slash `//` in the path — store verbatim).
- `KNS_Bill` fields: `BillID, KnessetNum, Name, SubTypeID, SubTypeDesc, PrivateNumber, CommitteeID, StatusID, Number, PublicationDate, SummaryLaw (~6.5% populated), IsContinuationBill, PublicationSeriesDesc, LastUpdatedDate`.
- `KNS_Status`: 81 rows, `{StatusID, Desc, TypeID, TypeDesc, ...}`.
- Public bill page: `https://main.knesset.gov.il/Activity/Legislation/Laws/Pages/LawBill.aspx?t=lawsuggestionssearch&lawitemid={billId}` — behind a Reblaze WAF (curl → 477-byte JS challenge); **must be browser-verified in Task 13**.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `app/lib/schema.ts` | Widen `bills`; add `billDocuments`, `billStatuses` | Modify |
| `drizzle/0024_*.sql` + `drizzle/meta/_journal.json` | Migration the PGlite test DB replays | Create |
| `app/lib/knesset/odata-types.ts` | Widen `KnsBill`; add `KnsDocumentBill`, `KnsStatus`, `KnsBillInitiatorExpanded` | Modify |
| `app/lib/knesset/odata.ts` | Add `KNS_DocumentBill`, `KNS_Status` to `KnsEntity` | Modify |
| `app/lib/knesset/normalize.ts` | Widen `normalizeBills`; add `normalizeBillDocuments`, `normalizeBillStatuses`, `splitExpandedInitiators` | Modify |
| `app/lib/knesset/normalize.test.ts` | Tests for the above | Modify |
| `app/lib/knesset/repo.ts` | Widen `upsertBills` SET; add `upsertBillDocuments`, `upsertBillStatuses` | Modify |
| `scripts/ingest-knesset.ts` | `ingestLifetimeBills` step + `ingestBillStatuses` | Modify |
| `app/lib/politicians/repo.ts` | `getPoliticianActivity` → Knesset-grouped `recentBills` | Modify |
| `app/lib/politicians/activity.test.ts` | Update for the grouped shape | Modify |
| `app/lib/bills/repo.ts` | `getBillById` (bill + initiators + docs + status + linked vote) | Create |
| `app/lib/bills/repo.test.ts` | Tests for `getBillById` | Create |
| `app/lib/bills/external.ts` | `knessetBillUrl(billId)` helper | Create |
| `components/icons.tsx` | `ArrowUpRight`, `Document` icons | Modify |
| `components/skeletons/containers.ts` | `BILL_CONTAINER` | Modify |
| `components/skeletons/bill-skeleton.tsx` | Named skeleton | Create |
| `app/bill/[billId]/page.tsx` | The bill page (RSC) | Create |
| `app/bill/[billId]/loading.tsx` | Loading state | Create |
| `app/politician/[id]/page.tsx` | Link recent bills + group by Knesset | Modify |

---

## Phase A — Schema & migration

### Task 1: Widen `bills` + add `bill_documents`, `bill_statuses`

**Files:**
- Modify: `app/lib/schema.ts:1-4` (imports), `app/lib/schema.ts:139-153` (bills table)
- Create: `drizzle/0024_bill_details.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Add `bigint` to the schema imports**

In `app/lib/schema.ts`, change the import block (lines 2-4) to add `bigint`:

```ts
import {
  pgTable, text, timestamp, boolean, integer, bigint, jsonb, date, uuid, pgEnum, index, uniqueIndex, unique, primaryKey,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Replace the `bills` table with the widened version**

Replace `app/lib/schema.ts:139-153` (the entire `export const bills = pgTable(...)` block) with:

```ts
export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: integer("billId").notNull().unique(),      // KNS_Bill.BillID
    knessetNum: integer("knessetNum"),
    nameHe: text("nameHe").notNull(),                  // KNS_Bill.Name
    subTypeId: integer("subTypeId"),                   // KNS_Bill.SubTypeID
    subTypeDesc: text("subTypeDesc"),                  // private/committee/government
    privateNumber: integer("privateNumber"),           // KNS_Bill.PrivateNumber
    committeeId: integer("committeeId"),               // KNS_Bill.CommitteeID
    number: integer("number"),                         // KNS_Bill.Number
    statusId: integer("statusId"),                     // KNS_Bill.StatusID -> bill_statuses.statusId
    publicationDate: timestamp("publicationDate"),     // KNS_Bill.PublicationDate (often null in-progress)
    summaryLaw: text("summaryLaw"),                    // KNS_Bill.SummaryLaw (sparse ~6.5%)
    isContinuationBill: boolean("isContinuationBill"), // KNS_Bill.IsContinuationBill
    publicationSeriesDesc: text("publicationSeriesDesc"),
    lastUpdatedDate: timestamp("lastUpdatedDate"),     // KNS_Bill.LastUpdatedDate
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [index("bills_knesset_idx").on(t.knessetNum)],
);

// Official bill-text documents (KNS_DocumentBill). FilePath -> fs.knesset.gov.il
// (NOT WAF'd). One DocumentBillID carries one row per format (PDF/DOC).
export const billDocuments = pgTable(
  "bill_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentBillId: bigint("documentBillId", { mode: "number" }).notNull(), // KNS_DocumentBill.DocumentBillID (Int64)
    billId: integer("billId").notNull(),               // -> bills.billId (FK-by-value)
    groupTypeId: integer("groupTypeId"),
    groupTypeDesc: text("groupTypeDesc"),              // e.g. "הצעת חוק לדיון מוקדם"
    format: text("format"),                            // ApplicationDesc: "PDF" | "DOC"
    filePath: text("filePath").notNull(),              // fs.knesset.gov.il URL (verbatim)
    lastUpdatedDate: timestamp("lastUpdatedDate"),
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [
    unique("bill_documents_doc_format_uq").on(t.documentBillId, t.format),
    index("bill_documents_bill_idx").on(t.billId),
  ],
);

// KNS_Status lookup (81 rows) — statusId -> Hebrew description, so the bill page
// shows readable status instead of a numeric code.
export const billStatuses = pgTable("bill_statuses", {
  statusId: integer("statusId").primaryKey(),          // KNS_Status.StatusID
  descHe: text("descHe").notNull(),                    // KNS_Status.Desc
  sourceDataset: text("sourceDataset").notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  fetchedAt: timestamp("fetchedAt").notNull(),
});
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/0024_<name>.sql` plus a `drizzle/meta/_journal.json` entry (idx 24). All changes are additive (nullable columns + new tables), so no destructive prompt.

**If `db:generate` fails (no TTY):** create `drizzle/0024_bill_details.sql` by hand with this exact SQL:

```sql
ALTER TABLE "bills" ADD COLUMN "subTypeId" integer;
ALTER TABLE "bills" ADD COLUMN "privateNumber" integer;
ALTER TABLE "bills" ADD COLUMN "committeeId" integer;
ALTER TABLE "bills" ADD COLUMN "number" integer;
ALTER TABLE "bills" ADD COLUMN "publicationDate" timestamp;
ALTER TABLE "bills" ADD COLUMN "summaryLaw" text;
ALTER TABLE "bills" ADD COLUMN "isContinuationBill" boolean;
ALTER TABLE "bills" ADD COLUMN "publicationSeriesDesc" text;
ALTER TABLE "bills" ADD COLUMN "lastUpdatedDate" timestamp;
--> statement-breakpoint
CREATE TABLE "bill_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documentBillId" bigint NOT NULL,
	"billId" integer NOT NULL,
	"groupTypeId" integer,
	"groupTypeDesc" text,
	"format" text,
	"filePath" text NOT NULL,
	"lastUpdatedDate" timestamp,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL,
	CONSTRAINT "bill_documents_doc_format_uq" UNIQUE("documentBillId","format")
);
--> statement-breakpoint
CREATE TABLE "bill_statuses" (
	"statusId" integer PRIMARY KEY NOT NULL,
	"descHe" text NOT NULL,
	"sourceDataset" text NOT NULL,
	"sourceUrl" text NOT NULL,
	"fetchedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bill_documents_bill_idx" ON "bill_documents" USING btree ("billId");
```

Then append to `drizzle/meta/_journal.json` `entries` (use a `when` value one larger than the previous entry's, since `Date.now()` is unavailable here):

```json
{"idx":24,"version":"7","when":1781196298731,"tag":"0024_bill_details","breakpoints":true}
```

- [ ] **Step 4: Verify the test DB replays the migration**

Run: `pnpm test app/lib/politicians/activity.test.ts`
Expected: PASS (existing tests still green — the new columns/tables are additive and `createTestDb` replays `./drizzle`). If migration SQL is malformed, PGlite throws at `migrate()` and every test in the file errors — fix the SQL.

- [ ] **Step 5: Commit**

```bash
git add app/lib/schema.ts drizzle/
git commit -m "feat(schema): widen bills + bill_documents + bill_statuses for lifetime bill detail"
```

---

## Phase B — OData types & normalizers (TDD)

### Task 2: Widen `KnsBill`, add `KnsDocumentBill`/`KnsStatus`/`KnsBillInitiatorExpanded`, register entities

**Files:**
- Modify: `app/lib/knesset/odata-types.ts:50-66`
- Modify: `app/lib/knesset/odata.ts:14-22`

- [ ] **Step 1: Replace `KnsBill` and add the new raw shapes**

Replace `app/lib/knesset/odata-types.ts:50-66` (the `KnsBill` and `KnsBillInitiator` interfaces) with:

```ts
export interface KnsBill {
  BillID: number;
  KnessetNum: number | null;
  Name: string;
  SubTypeID: number | null;
  SubTypeDesc: string | null;
  PrivateNumber: number | null;
  CommitteeID: number | null;
  Number: number | null;
  StatusID: number | null;
  PublicationDate: string | null;
  SummaryLaw: string | null;
  IsContinuationBill: boolean | null;
  PublicationSeriesDesc: string | null;
  LastUpdatedDate: string | null;
}

export interface KnsDocumentBill {
  DocumentBillID: number;       // Int64 in OData; values observed ~10^7, safe as JS number
  BillID: number;
  GroupTypeID: number | null;
  GroupTypeDesc: string | null;
  ApplicationDesc: string | null; // "PDF" | "DOC"
  FilePath: string;               // fs.knesset.gov.il URL (may contain a double slash — verbatim)
  LastUpdatedDate: string | null;
}

export interface KnsStatus {
  StatusID: number;
  Desc: string;
  TypeID: number | null;
  TypeDesc: string | null;
}

export interface KnsBillInitiator {
  BillInitiatorID: number;
  BillID: number;
  PersonID: number;
  IsInitiator: boolean | null;
  Ordinal: number | null;
  LastUpdatedDate: string | null;
}

/** Shape returned by `KNS_BillInitiator?$expand=KNS_Bill/KNS_DocumentBills`:
 *  each initiator carries its bill inline, and the bill carries its documents. */
export interface KnsBillInitiatorExpanded extends KnsBillInitiator {
  KNS_Bill?: (KnsBill & { KNS_DocumentBills?: KnsDocumentBill[] }) | null;
}
```

- [ ] **Step 2: Register the two new entities**

In `app/lib/knesset/odata.ts`, extend the `KnsEntity` union (lines 14-22) to add `"KNS_DocumentBill"` and `"KNS_Status"`:

```ts
export type KnsEntity =
  | "KNS_Person"
  | "KNS_PersonToPosition"
  | "KNS_Faction"
  | "KNS_Position"
  | "KNS_Bill"
  | "KNS_BillInitiator"
  | "KNS_Query"
  | "KNS_Committee"
  | "KNS_DocumentBill"
  | "KNS_Status";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: errors in `normalize.ts` (`normalizeBills` doesn't yet read the new fields) — those are fixed in Task 3. No errors in `odata-types.ts` / `odata.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/lib/knesset/odata-types.ts app/lib/knesset/odata.ts
git commit -m "feat(odata): widen KnsBill + add KnsDocumentBill/KnsStatus/expanded initiator types"
```

### Task 3: Normalizers — widen `normalizeBills`, add documents/statuses + `splitExpandedInitiators`

**Files:**
- Modify: `app/lib/knesset/normalize.ts:263-298`
- Test: `app/lib/knesset/normalize.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `app/lib/knesset/normalize.test.ts`:

```ts
import {
  normalizeBills, normalizeBillDocuments, normalizeBillStatuses, splitExpandedInitiators,
} from "./normalize";
import type { KnsBillInitiatorExpanded } from "./odata-types";

const billProv = { sourceUrl: "https://knesset.gov.il/x", fetchedAt: new Date("2026-06-13T00:00:00Z") };

test("normalizeBills carries the widened fields and parses dates", () => {
  const [row] = normalizeBills(
    [{
      BillID: 2243802, KnessetNum: 25, Name: "הצעת חוק כלשהי", SubTypeID: 54, SubTypeDesc: "פרטית",
      PrivateNumber: 6755, CommitteeID: null, Number: null, StatusID: 104,
      PublicationDate: null, SummaryLaw: null, IsContinuationBill: null,
      PublicationSeriesDesc: null, LastUpdatedDate: "2026-06-08T16:15:33.697",
    }],
    billProv,
  );
  expect(row.billId).toBe(2243802);
  expect(row.subTypeId).toBe(54);
  expect(row.privateNumber).toBe(6755);
  expect(row.statusId).toBe(104);
  expect(row.lastUpdatedDate).toEqual(new Date("2026-06-08T16:15:33.697"));
  expect(row.publicationDate).toBeNull();
  expect(row.sourceDataset).toBe("KNS_Bill");
});

test("normalizeBillDocuments maps file links per format", () => {
  const rows = normalizeBillDocuments(
    [
      { DocumentBillID: 11996526, BillID: 2243802, GroupTypeID: 1, GroupTypeDesc: "הצעת חוק לדיון מוקדם", ApplicationDesc: "DOC", FilePath: "https://fs.knesset.gov.il//25/law/x.docx", LastUpdatedDate: null },
      { DocumentBillID: 11996526, BillID: 2243802, GroupTypeID: 1, GroupTypeDesc: "הצעת חוק לדיון מוקדם", ApplicationDesc: "PDF", FilePath: "https://fs.knesset.gov.il//25/law/x.pdf", LastUpdatedDate: null },
    ],
    billProv,
  );
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.format).sort()).toEqual(["DOC", "PDF"]);
  expect(rows[0].documentBillId).toBe(11996526);
  expect(rows[0].sourceDataset).toBe("KNS_DocumentBill");
});

test("normalizeBillStatuses maps statusId -> Hebrew desc", () => {
  const rows = normalizeBillStatuses([{ StatusID: 104, Desc: "בהכנה לקריאה ראשונה", TypeID: 2, TypeDesc: "הצעת חוק" }], billProv);
  expect(rows[0]).toMatchObject({ statusId: 104, descHe: "בהכנה לקריאה ראשונה", sourceDataset: "KNS_Status" });
});

test("splitExpandedInitiators dedupes bills + documents, flattens sponsors", () => {
  const raw: KnsBillInitiatorExpanded[] = [
    {
      BillInitiatorID: 1, BillID: 900, PersonID: 30300, IsInitiator: true, Ordinal: 1, LastUpdatedDate: null,
      KNS_Bill: {
        BillID: 900, KnessetNum: 25, Name: "חוק א", SubTypeID: 54, SubTypeDesc: "פרטית", PrivateNumber: null,
        CommitteeID: null, Number: null, StatusID: 104, PublicationDate: null, SummaryLaw: null,
        IsContinuationBill: null, PublicationSeriesDesc: null, LastUpdatedDate: null,
        KNS_DocumentBills: [
          { DocumentBillID: 5, BillID: 900, GroupTypeID: 1, GroupTypeDesc: "x", ApplicationDesc: "PDF", FilePath: "p.pdf", LastUpdatedDate: null },
        ],
      },
    },
    {
      BillInitiatorID: 2, BillID: 900, PersonID: 999, IsInitiator: false, Ordinal: 2, LastUpdatedDate: null,
      KNS_Bill: {
        BillID: 900, KnessetNum: 25, Name: "חוק א", SubTypeID: 54, SubTypeDesc: "פרטית", PrivateNumber: null,
        CommitteeID: null, Number: null, StatusID: 104, PublicationDate: null, SummaryLaw: null,
        IsContinuationBill: null, PublicationSeriesDesc: null, LastUpdatedDate: null,
        KNS_DocumentBills: [
          { DocumentBillID: 5, BillID: 900, GroupTypeID: 1, GroupTypeDesc: "x", ApplicationDesc: "PDF", FilePath: "p.pdf", LastUpdatedDate: null },
        ],
      },
    },
  ];
  const { bills, sponsors, documents } = splitExpandedInitiators(raw);
  expect(bills.map((b) => b.BillID)).toEqual([900]);          // deduped
  expect(sponsors.map((s) => s.BillInitiatorID)).toEqual([1, 2]); // both kept
  expect(documents.map((d) => d.DocumentBillID)).toEqual([5]);  // deduped by id+format
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test app/lib/knesset/normalize.test.ts`
Expected: FAIL — `normalizeBillDocuments`/`normalizeBillStatuses`/`splitExpandedInitiators` are not exported; `normalizeBills` row lacks `subTypeId`.

- [ ] **Step 3: Widen `normalizeBills` and add the new functions**

In `app/lib/knesset/normalize.ts`, replace the `BillRow` interface + `normalizeBills` (lines 263-273) with the widened versions, and add the new normalizers + `splitExpandedInitiators` directly after `normalizeBillSponsors` (after line 298). First, add `KnsDocumentBill, KnsStatus, KnsBillInitiatorExpanded` to the existing import of raw types from `./odata-types` at the top of the file.

```ts
export interface BillRow {
  billId: number; knessetNum: number | null; nameHe: string;
  subTypeId: number | null; subTypeDesc: string | null; privateNumber: number | null;
  committeeId: number | null; number: number | null; statusId: number | null;
  publicationDate: Date | null; summaryLaw: string | null; isContinuationBill: boolean | null;
  publicationSeriesDesc: string | null; lastUpdatedDate: Date | null;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeBills(raw: KnsBill[], prov: Prov): BillRow[] {
  return raw.map((b) => ({
    billId: b.BillID, knessetNum: b.KnessetNum ?? null, nameHe: b.Name,
    subTypeId: b.SubTypeID ?? null, subTypeDesc: b.SubTypeDesc ?? null,
    privateNumber: b.PrivateNumber ?? null, committeeId: b.CommitteeID ?? null,
    number: b.Number ?? null, statusId: b.StatusID ?? null,
    publicationDate: parseODataDate(b.PublicationDate),
    summaryLaw: b.SummaryLaw ?? null, isContinuationBill: b.IsContinuationBill ?? null,
    publicationSeriesDesc: b.PublicationSeriesDesc ?? null,
    lastUpdatedDate: parseODataDate(b.LastUpdatedDate),
    sourceDataset: "KNS_Bill", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface BillDocumentRow {
  documentBillId: number; billId: number; groupTypeId: number | null; groupTypeDesc: string | null;
  format: string | null; filePath: string; lastUpdatedDate: Date | null;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeBillDocuments(raw: KnsDocumentBill[], prov: Prov): BillDocumentRow[] {
  return raw.map((d) => ({
    documentBillId: d.DocumentBillID, billId: d.BillID,
    groupTypeId: d.GroupTypeID ?? null, groupTypeDesc: d.GroupTypeDesc ?? null,
    format: d.ApplicationDesc ?? null, filePath: d.FilePath,
    lastUpdatedDate: parseODataDate(d.LastUpdatedDate),
    sourceDataset: "KNS_DocumentBill", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface BillStatusRow {
  statusId: number; descHe: string; sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeBillStatuses(raw: KnsStatus[], prov: Prov): BillStatusRow[] {
  return raw.map((s) => ({
    statusId: s.StatusID, descHe: s.Desc,
    sourceDataset: "KNS_Status", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

/** Flattens `$expand=KNS_Bill/KNS_DocumentBills` rows into the three raw arrays
 *  the upserts need: bills (deduped by BillID), sponsors (every initiator row),
 *  documents (deduped by DocumentBillID+ApplicationDesc). Pure — caller normalizes. */
export function splitExpandedInitiators(raw: KnsBillInitiatorExpanded[]): {
  bills: KnsBill[]; sponsors: KnsBillInitiator[]; documents: KnsDocumentBill[];
} {
  const billsById = new Map<number, KnsBill>();
  const documentsByKey = new Map<string, KnsDocumentBill>();
  const sponsors: KnsBillInitiator[] = [];
  for (const r of raw) {
    sponsors.push({
      BillInitiatorID: r.BillInitiatorID, BillID: r.BillID, PersonID: r.PersonID,
      IsInitiator: r.IsInitiator ?? null, Ordinal: r.Ordinal ?? null, LastUpdatedDate: r.LastUpdatedDate ?? null,
    });
    const b = r.KNS_Bill;
    if (!b) continue;
    if (!billsById.has(b.BillID)) {
      const { KNS_DocumentBills: _omit, ...bill } = b;
      billsById.set(b.BillID, bill);
    }
    for (const d of b.KNS_DocumentBills ?? []) {
      documentsByKey.set(`${d.DocumentBillID}:${d.ApplicationDesc ?? ""}`, d);
    }
  }
  return { bills: [...billsById.values()], sponsors, documents: [...documentsByKey.values()] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test app/lib/knesset/normalize.test.ts`
Expected: PASS (including the pre-existing normalize tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/knesset/normalize.ts app/lib/knesset/normalize.test.ts
git commit -m "feat(normalize): widen bills + bill documents/statuses + expand splitter"
```

---

## Phase C — Repo upserts

### Task 4: Widen `upsertBills` SET; add `upsertBillDocuments`, `upsertBillStatuses`

**Files:**
- Modify: `app/lib/knesset/repo.ts:3-9` (imports), `app/lib/knesset/repo.ts:93-108` (`upsertBills`)

- [ ] **Step 1: Extend the imports**

In `app/lib/knesset/repo.ts`, add the new tables and row types:

```ts
import {
  politicians, factions, bills, billSponsors, billDocuments, billStatuses, queries, committees, committeeMemberships, factionStints,
} from "@/app/lib/schema";
import { logger } from "@/app/lib/logger";
import type {
  MemberRow, FactionRow, BillRow, BillDocumentRow, BillStatusRow, BillSponsorRow, QueryRow, CommitteeRow, CommitteeMembershipRow, FactionStintRow,
} from "./normalize";
```

- [ ] **Step 2: Replace `upsertBills` with the widened SET**

Replace `app/lib/knesset/repo.ts:93-108`:

```ts
export async function upsertBills({ db, rows }: { db: DB; rows: BillRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(bills).values(batch).onConflictDoUpdate({
      target: bills.billId,
      set: {
        knessetNum: sqlExcluded("knessetNum"), nameHe: sqlExcluded("nameHe"),
        subTypeId: sqlExcluded("subTypeId"), subTypeDesc: sqlExcluded("subTypeDesc"),
        privateNumber: sqlExcluded("privateNumber"), committeeId: sqlExcluded("committeeId"),
        number: sqlExcluded("number"), statusId: sqlExcluded("statusId"),
        publicationDate: sqlExcluded("publicationDate"), summaryLaw: sqlExcluded("summaryLaw"),
        isContinuationBill: sqlExcluded("isContinuationBill"),
        publicationSeriesDesc: sqlExcluded("publicationSeriesDesc"),
        lastUpdatedDate: sqlExcluded("lastUpdatedDate"),
        sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "bills", rows: n });
  return n;
}

export async function upsertBillDocuments({ db, rows }: { db: DB; rows: BillDocumentRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(billDocuments).values(batch).onConflictDoUpdate({
      target: [billDocuments.documentBillId, billDocuments.format],
      set: {
        billId: sqlExcluded("billId"), groupTypeId: sqlExcluded("groupTypeId"),
        groupTypeDesc: sqlExcluded("groupTypeDesc"), filePath: sqlExcluded("filePath"),
        lastUpdatedDate: sqlExcluded("lastUpdatedDate"),
        sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "bill_documents", rows: n });
  return n;
}

export async function upsertBillStatuses({ db, rows }: { db: DB; rows: BillStatusRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(billStatuses).values(batch).onConflictDoUpdate({
      target: billStatuses.statusId,
      set: {
        descHe: sqlExcluded("descHe"),
        sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "bill_statuses", rows: n });
  return n;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS for `repo.ts` (it will still error in `ingest-knesset.ts` until Task 5 — that's fine; verify no NEW errors in `repo.ts`).

- [ ] **Step 4: Commit**

```bash
git add app/lib/knesset/repo.ts
git commit -m "feat(repo): widen upsertBills + add upsertBillDocuments/upsertBillStatuses"
```

---

## Phase D — Ingest extension

### Task 5: `ingestLifetimeBills` + `ingestBillStatuses` steps

**Files:**
- Modify: `scripts/ingest-knesset.ts`

> Not unit-tested (it's an I/O orchestration script); the normalizers + upserts it calls are covered in Tasks 3-4. It's exercised by the guarded run in Task 6.

- [ ] **Step 1: Extend the imports**

In `scripts/ingest-knesset.ts`, extend the type + normalize + repo imports:

```ts
import type {
  KnsBill, KnsBillInitiator, KnsBillInitiatorExpanded, KnsCommittee, KnsFaction, KnsPerson, KnsPersonToPosition, KnsPosition, KnsQuery, KnsStatus,
} from "@/app/lib/knesset/odata-types";
import {
  buildPositionLabelMap, normalizeFactions, normalizeK25Members, normalizeFactionStints, applyEnglishNames,
  normalizeBills, normalizeBillSponsors, normalizeBillDocuments, normalizeBillStatuses, splitExpandedInitiators,
  normalizeQueries, normalizeCommittees, normalizeCommitteeMemberships, SENTINEL_FACTION_ID,
} from "@/app/lib/knesset/normalize";
import {
  upsertFactions, upsertMembers, upsertBills, upsertBillSponsors, upsertBillDocuments, upsertBillStatuses, upsertQueries,
  upsertCommittees, upsertCommitteeMemberships, upsertFactionStints, upsertActivityCounts,
} from "@/app/lib/knesset/repo";
```

- [ ] **Step 2: Add the two ingest functions**

Insert after `ingestActivityCounts` (after line 174):

```ts
// KNS_Status lookup (81 rows) — statusId -> Hebrew desc, so the bill page renders
// readable status. Tiny; runs alongside the lifetime-bills backfill.
async function ingestBillStatuses(prov: { fetchedAt: Date }) {
  const sourceUrl = buildODataUrl({ entity: "KNS_Status" });
  const raw = await fetchAll<KnsStatus>({ entity: "KNS_Status" });
  const n = await upsertBillStatuses({ db, rows: normalizeBillStatuses(raw, { sourceUrl, fetchedAt: prov.fetchedAt }) });
  logger.info("knesset.ingest.entity_done", { entity: "bill_statuses", fetched: raw.length, upserted: n });
}

// LIFETIME bills for every roster MK (closes the כץ gap). KNS_BillInitiator has no
// KnessetNum, so we go per-PersonID and pull the bill + its documents inline via a
// nested $expand (verified live). Bounded: ~140 MKs, one paged call each. Upserts
// bills (all Knessets, no K25 filter), sponsors, and document links. Members first.
async function ingestLifetimeBills(prov: { fetchedAt: Date }) {
  await ingestBillStatuses(prov); // status lookup before bills so the page can join
  const mks = await db.select({ personId: politicians.personId }).from(politicians);
  if (mks.length === 0) {
    logger.warn("knesset.ingest.skip", { entity: "lifetime_bills", reason: "no politicians — run members first" });
    return;
  }
  let totalBills = 0, totalSponsors = 0, totalDocs = 0, failed = 0;
  for (const { personId } of mks) {
    const filter = `PersonID eq ${personId}`;
    const sourceUrl = `${buildODataUrl({ entity: "KNS_BillInitiator", filter })}&${encodeURIComponent("$expand")}=${encodeURIComponent("KNS_Bill/KNS_DocumentBills")}`;
    try {
      const raw = await fetchAll<KnsBillInitiatorExpanded>({
        entity: "KNS_BillInitiator",
        filter: `${filter}&${encodeURIComponent("$expand")}=${encodeURIComponent("KNS_Bill/KNS_DocumentBills")}`,
      });
      const { bills: rawBills, sponsors: rawSponsors, documents: rawDocs } = splitExpandedInitiators(raw);
      // bills first (sponsors/docs reference billId by value)
      totalBills += await upsertBills({ db, rows: normalizeBills(rawBills, { sourceUrl, fetchedAt: prov.fetchedAt }) });
      totalSponsors += await upsertBillSponsors({ db, rows: normalizeBillSponsors(rawSponsors, { sourceUrl, fetchedAt: prov.fetchedAt }) });
      if (rawDocs.length > 0) {
        totalDocs += await upsertBillDocuments({ db, rows: normalizeBillDocuments(rawDocs, { sourceUrl, fetchedAt: prov.fetchedAt }) });
      }
    } catch (err) {
      failed += 1;
      logger.warn("knesset.ingest.lifetime_bills_failed", { personId, err: String(err) });
    }
    await sleep(250);
  }
  if (totalBills === 0 && failed > 0) {
    throw new Error(`lifetime bills: all ${failed} MK fetches failed — API shape change?`);
  }
  logger.info("knesset.ingest.entity_done", {
    entity: "lifetime_bills", mks: mks.length, bills: totalBills, sponsors: totalSponsors, documents: totalDocs, failed,
  });
}
```

> **Note on the `$expand` encoding:** `buildODataUrl` does not take an `$expand` param, so it's appended manually (percent-encoded — `KNS_Bill%2FKNS_DocumentBills`). `fetchAll`'s `filter` is concatenated raw into the query then re-encoded by `buildODataUrl`'s `encodeURIComponent` on the whole `$filter` value — which would double-encode. **Instead, add `expand` support to `fetchAll`/`buildODataUrl`** (cleaner) — see Step 3.

- [ ] **Step 3: Add first-class `$expand` support to the client (replaces the manual concat)**

In `app/lib/knesset/odata.ts`, add `expand` to `BuildUrlArgs` and `FetchAllArgs`, thread it through. Replace `buildODataUrl` (lines 39-48):

```ts
interface BuildUrlArgs {
  entity: KnsEntity;
  filter?: string;
  expand?: string;          // raw OData $expand path, e.g. "KNS_Bill/KNS_DocumentBills"
  top?: number;
  skip?: number;
  base?: string;
}

export function buildODataUrl({ entity, filter, expand, top, skip, base = PARLIAMENT_BASE }: BuildUrlArgs): string {
  const pairs: [string, string][] = [["$format", "json"]];
  if (filter) pairs.push(["$filter", filter]);
  if (expand) pairs.push(["$expand", expand]);
  if (typeof top === "number") pairs.push(["$top", String(top)]);
  if (typeof skip === "number") pairs.push(["$skip", String(skip)]);
  const query = pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${base}${entity}?${query}`;
}
```

Then add `expand?: string;` to `FetchAllArgs` (after `filter?: string;`, line 52) and pass it into the initial `buildODataUrl` call in `fetchAll` (line 123):

```ts
  let url: string | undefined = buildODataUrl({ entity, filter, expand, top, base });
```

…and add `expand` to the destructured params of `fetchAll` (line 119): `entity, filter, expand, top = ALL_TOP, ...`.

- [ ] **Step 4: Simplify the ingest function to use `expand`**

Replace the `sourceUrl`/`fetchAll` lines inside `ingestLifetimeBills` (from Step 2) with the clean form:

```ts
    const expand = "KNS_Bill/KNS_DocumentBills";
    const sourceUrl = buildODataUrl({ entity: "KNS_BillInitiator", filter, expand });
    try {
      const raw = await fetchAll<KnsBillInitiatorExpanded>({ entity: "KNS_BillInitiator", filter, expand });
```

- [ ] **Step 5: Register the step in `main`'s step map + run orders**

In `scripts/ingest-knesset.ts:211-231`, add `lifetimeBills` to `steps`, to `heavy`, and to the `--full` order (after `billSponsors`):

```ts
  const steps: Record<string, () => Promise<void>> = {
    factions: () => ingestFactions(prov),
    members: () => ingestMembers(prov),
    activityCounts: () => ingestActivityCounts(prov),
    bills: () => ingestBills(prov),
    billSponsors: () => ingestBillSponsors(prov),
    lifetimeBills: () => ingestLifetimeBills(prov),
    queries: () => ingestQueries(prov),
    committees: () => ingestCommittees(prov),
    committeeMemberships: () => ingestCommitteeMemberships(prov),
  };

  const bounded = ["factions", "members", "activityCounts", "committees"];
  const heavy = ["bills", "billSponsors", "lifetimeBills", "queries", "committeeMemberships"];
  const order = full
    ? ["factions", "members", "activityCounts", "bills", "billSponsors", "lifetimeBills", "queries", "committees", "committeeMemberships"]
    : bounded;
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS across the board.

- [ ] **Step 7: Commit**

```bash
git add scripts/ingest-knesset.ts app/lib/knesset/odata.ts
git commit -m "feat(ingest): lifetime-bills backfill (nested expand) + bill statuses + client \$expand support"
```

### Task 6: Run the backfill (guarded, manual)

> **MANUAL / coordination step** (spec open question). `.env DATABASE_URL` is the single production DB; there is no dev DB, and `assertNonProductionDb()` does not catch the Neon host, so this run writes to prod intentionally — the same way the existing roster/votes ingests do. Run it once; it is idempotent.

- [ ] **Step 1: Ensure the roster exists first** (members must precede bills)

Run: `pnpm ingest:knesset` (bounded default — refreshes factions/members/activityCounts/committees)
Expected: log line `knesset.ingest.entity_done {"entity":"politicians",...}`.

- [ ] **Step 2: Run the lifetime-bills backfill**

Run: `pnpm ingest:knesset --only=lifetimeBills`
Expected: a `knesset.ingest.entity_done {"entity":"bill_statuses",...}` line, then per-MK progress, ending in `knesset.ingest.entity_done {"entity":"lifetime_bills","bills":<N>,"sponsors":<M>,"documents":<K>,"failed":0}` with N in the thousands and `failed` small/zero. Takes a few minutes (~140 MKs × ~250ms throttle + paging).

- [ ] **Step 3: Spot-check כץ (Israel Katz) now has bills**

Run:
```bash
tsx --env-file=.env -e "import {db} from './app/lib/db'; import {bills,billSponsors} from './app/lib/schema'; import {eq} from 'drizzle-orm'; const rows=await db.select({billId:billSponsors.billId,k:bills.knessetNum,name:bills.nameHe}).from(billSponsors).innerJoin(bills,eq(bills.billId,billSponsors.billId)).where(eq(billSponsors.personId, /* Katz personId */ 0)).limit(5); console.log(rows); process.exit(0)"
```
First replace `0` with Katz's `personId` (find via `KNS_Person` or the politicians table). Expected: ≥1 row across earlier Knessets.

---

## Phase E — Read path (TDD)

### Task 7: `getPoliticianActivity` → Knesset-grouped recent bills

**Files:**
- Modify: `app/lib/politicians/repo.ts:1-6` (imports), `app/lib/politicians/repo.ts:147-218`
- Test: `app/lib/politicians/activity.test.ts`

- [ ] **Step 1: Update the existing tests for the grouped shape**

In `app/lib/politicians/activity.test.ts`, the seed bills have no `knessetNum`. Set them so grouping is exercised — change the `bills` insert (lines 13-16) to:

```ts
  await h.db.insert(bills).values([
    { billId: 1, knessetNum: 25, nameHe: "חוק א", ...prov },
    { billId: 2, knessetNum: 25, nameHe: "חוק ב", ...prov },
    { billId: 3, knessetNum: 24, nameHe: "חוק ישן", ...prov },
  ]);
  await h.db.insert(billSponsors).values([
    { billInitiatorId: 10, billId: 1, personId: 100, isInitiator: true, ...prov },
    { billInitiatorId: 11, billId: 2, personId: 100, isInitiator: false, ...prov },
    { billInitiatorId: 13, billId: 3, personId: 100, isInitiator: true, ...prov },
    { billInitiatorId: 12, billId: 1, personId: 999, isInitiator: true, ...prov },
  ]);
```

Then replace the recent-bills assertions. In the first test (line 36-37):

```ts
  expect(a.recentBills.current.map((b) => b.billId).sort()).toEqual([1, 2]);
  expect(a.recentBills.earlier.map((b) => b.billId)).toEqual([3]);
  expect(a.recentBills.current.find((b) => b.billId === 2)?.nameHe).toBe("חוק ב");
```

In the second test (line 51): `expect(a.recentBills).toEqual({ current: [], earlier: [] });`
In the third test (lines 60-61): keep `current.bills` assertion; change recent-bills line to `expect(a.recentBills.current.map((b) => b.billId).sort()).toEqual([1, 2]);`
In the fourth test (line 66): `recentBills: { current: [], earlier: [] }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test app/lib/politicians/activity.test.ts`
Expected: FAIL — `recentBills` is still a flat array.

- [ ] **Step 3: Implement the grouped query**

In `app/lib/politicians/repo.ts`, add the import (line 10 area):

```ts
import { CURRENT_KNESSET } from "@/app/lib/knesset/odata";
```

Replace the `PoliticianActivity` type (lines 148-152):

```ts
export type RecentBill = { billId: number; nameHe: string; knessetNum: number | null };
export type PoliticianActivity = {
  current: ActivityCounts;          // the current Knesset
  lifetime: ActivityCounts | null;  // all Knessets — null until the activity-counts ingest runs
  recentBills: { current: RecentBill[]; earlier: RecentBill[] };
};
```

Replace the `recentBills` query block (lines 186-194) with two grouped queries:

```ts
  // Recent bills, grouped current-Knesset vs earlier — the page shows them in two
  // labeled sections. innerJoin so a sponsor row pointing outside our bill set never
  // surfaces. Lifetime backfill (ingestLifetimeBills) populates earlier Knessets.
  const RECENT_PER_GROUP = 5;
  const recentCurrent = await db
    .selectDistinct({ billId: bills.billId, nameHe: bills.nameHe, knessetNum: bills.knessetNum })
    .from(billSponsors)
    .innerJoin(bills, eq(bills.billId, billSponsors.billId))
    .where(and(eq(billSponsors.personId, personId), eq(bills.knessetNum, CURRENT_KNESSET)))
    .orderBy(desc(bills.billId))
    .limit(RECENT_PER_GROUP);
  const recentEarlier = await db
    .selectDistinct({ billId: bills.billId, nameHe: bills.nameHe, knessetNum: bills.knessetNum })
    .from(billSponsors)
    .innerJoin(bills, eq(bills.billId, billSponsors.billId))
    .where(and(eq(billSponsors.personId, personId), ne(bills.knessetNum, CURRENT_KNESSET)))
    .orderBy(desc(bills.knessetNum), desc(bills.billId))
    .limit(RECENT_PER_GROUP);
  const recentBills = { current: recentCurrent, earlier: recentEarlier };
```

Add `ne` to the drizzle-orm import at the top (line 2): `import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";`

Then update the two `return` statements (the fallback path ~line 210 and the main path ~line 213-217) so each returns the new `recentBills` object — both already reference `recentBills`, so they need no change beyond the variable now being the grouped object. Confirm both `return` sites use `recentBills` (they do).

> **Note:** `ne(bills.knessetNum, CURRENT_KNESSET)` excludes NULL `knessetNum` rows (SQL `<>` is NULL-unknown). That's acceptable — every KNS_Bill we ingest carries a `KnessetNum`. If a null slips in it simply won't appear in either group; not a correctness risk for the page.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test app/lib/politicians/activity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/politicians/repo.ts app/lib/politicians/activity.test.ts
git commit -m "feat(politicians): group recent bills by Knesset (current vs earlier)"
```

### Task 8: `app/lib/bills/repo.ts` — `getBillById`

**Files:**
- Create: `app/lib/bills/repo.ts`
- Test: `app/lib/bills/repo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/lib/bills/repo.test.ts`:

```ts
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
```

> The `knessetVotes` NOT-NULL columns (verified against `app/lib/schema-votes.ts`): `voteId, knessetNum, titleHe, voteDate, voteType` (enum `["electronic","hand","roll_call","secret"]`) + the provenance triplet (covered by `...prov`). `billId`/`isDecisive` are nullable/defaulted. The insert above satisfies all of them.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test app/lib/bills/repo.test.ts`
Expected: FAIL — `getBillById` is not defined.

- [ ] **Step 3: Implement `getBillById`**

Create `app/lib/bills/repo.ts`:

```ts
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { and, asc, desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { db as defaultDb } from "@/app/lib/db";
import * as schema from "@/app/lib/schema";
import { bills, billSponsors, billDocuments, billStatuses, politicians, knessetVotes } from "@/app/lib/schema";

type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type BillInitiator = { personId: number; nameHe: string; isInitiator: boolean };
export type BillDocument = { documentBillId: number; format: string | null; groupTypeDesc: string | null; filePath: string };
export type BillDetail = {
  billId: number;
  nameHe: string;
  knessetNum: number | null;
  subTypeDesc: string | null;
  statusDesc: string | null;
  publicationDate: Date | null;
  summaryLaw: string | null;
  initiators: BillInitiator[];
  documents: BillDocument[];
  linkedVote: { voteId: number; titleHe: string | null; voteDate: Date | null } | null;
};

/** One bill by its stable KNS_Bill.BillID, with human status, ordered initiators
 *  (linked to politician pages), official document links, and the decisive plenum
 *  vote if one exists. Returns null when the bill isn't stored. */
export async function getBillById({
  db = defaultDb,
  billId,
}: { db?: DB; billId: number }): Promise<BillDetail | null> {
  if (!Number.isInteger(billId)) return null;
  const [bill] = await db
    .select({
      billId: bills.billId, nameHe: bills.nameHe, knessetNum: bills.knessetNum,
      subTypeDesc: bills.subTypeDesc, statusDesc: billStatuses.descHe,
      publicationDate: bills.publicationDate, summaryLaw: bills.summaryLaw,
    })
    .from(bills)
    .leftJoin(billStatuses, eq(billStatuses.statusId, bills.statusId))
    .where(eq(bills.billId, billId))
    .limit(1);
  if (!bill) return null;

  const initiators = await db
    .select({ personId: politicians.personId, nameHe: politicians.nameHe, isInitiator: billSponsors.isInitiator })
    .from(billSponsors)
    .innerJoin(politicians, eq(politicians.personId, billSponsors.personId))
    .where(eq(billSponsors.billId, billId))
    .orderBy(desc(billSponsors.isInitiator), asc(billSponsors.ordinal));

  const documents = await db
    .select({
      documentBillId: billDocuments.documentBillId, format: billDocuments.format,
      groupTypeDesc: billDocuments.groupTypeDesc, filePath: billDocuments.filePath,
    })
    .from(billDocuments)
    .where(eq(billDocuments.billId, billId))
    .orderBy(asc(billDocuments.format));

  const [linkedVote] = await db
    .select({ voteId: knessetVotes.voteId, titleHe: knessetVotes.titleHe, voteDate: knessetVotes.voteDate })
    .from(knessetVotes)
    .where(and(eq(knessetVotes.billId, billId), eq(knessetVotes.isDecisive, true)))
    .orderBy(desc(knessetVotes.voteDate))
    .limit(1);

  return { ...bill, initiators, documents, linkedVote: linkedVote ?? null };
}
```

> Column names verified against `app/lib/schema-votes.ts`: `knessetVotes` carries `voteId`, `titleHe`, `voteDate`, `billId`, `isDecisive` exactly as used here.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test app/lib/bills/repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/bills/repo.ts app/lib/bills/repo.test.ts
git commit -m "feat(bills): getBillById — status, initiators, documents, linked vote"
```

---

## Phase F — UI

### Task 9: External-URL helper + icons + container

**Files:**
- Create: `app/lib/bills/external.ts`
- Modify: `components/icons.tsx` (append two icons)
- Modify: `components/skeletons/containers.ts`

- [ ] **Step 1: Create the external-URL helper**

Create `app/lib/bills/external.ts`:

```ts
/**
 * Canonical public Knesset bill page. Pattern verified by browser in the bill-pages
 * task (the page sits behind a Reblaze WAF, so it can't be curl-checked). Derived
 * from the stable BillID — never inferred per-bill.
 */
export function knessetBillUrl(billId: number): string {
  return `https://main.knesset.gov.il/Activity/Legislation/Laws/Pages/LawBill.aspx?t=lawsuggestionssearch&lawitemid=${billId}`;
}
```

- [ ] **Step 2: Append the two icons**

Append to `components/icons.tsx` (match the existing `IconProps` + 24×24 stroke style used by the other icons):

```tsx
export function ArrowUpRight({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

export function Document({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}
```

- [ ] **Step 3: Add the container class**

Append to `components/skeletons/containers.ts`:

```ts
export const BILL_CONTAINER = "mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8";
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add app/lib/bills/external.ts components/icons.tsx components/skeletons/containers.ts
git commit -m "feat(bills): external Knesset URL helper + ArrowUpRight/Document icons + container"
```

### Task 10: The `/bill/[billId]` page + skeleton + loading

**Files:**
- Create: `components/skeletons/bill-skeleton.tsx`
- Create: `app/bill/[billId]/page.tsx`
- Create: `app/bill/[billId]/loading.tsx`

- [ ] **Step 1: Create the skeleton**

Create `components/skeletons/bill-skeleton.tsx` (mirror the shimmer pattern used by sibling skeletons in the folder — open one, e.g. the politician/vote skeleton, and match its `animate-pulse`/`bg-muted` idiom):

```tsx
import { BILL_CONTAINER } from "./containers";

export function BillSkeleton() {
  return (
    <main className={BILL_CONTAINER}>
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="mt-6 h-8 w-3/4 animate-pulse rounded bg-muted" />
      <div className="mt-3 flex gap-2">
        <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
        <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="mt-8 h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-3 space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create `loading.tsx`**

Create `app/bill/[billId]/loading.tsx`:

```tsx
import { BillSkeleton } from "@/components/skeletons/bill-skeleton";

export default function Loading() {
  return <BillSkeleton />;
}
```

- [ ] **Step 3: Create the page**

Create `app/bill/[billId]/page.tsx`. Uses logical Tailwind props (RTL), `formatDate` from `@/lib/time`, and reuses the row/link styling from the politician page.

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBillById } from "@/app/lib/bills/repo";
import { knessetBillUrl } from "@/app/lib/bills/external";
import { ChevronForward, ArrowUpRight, Document } from "@/components/icons";
import { formatDate } from "@/lib/time";
import { CURRENT_KNESSET } from "@/app/lib/knesset/odata";
import { BILL_CONTAINER } from "@/components/skeletons/containers";

export default async function BillPage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId: raw } = await params;
  const billId = Number(raw);
  const bill = Number.isInteger(billId) ? await getBillById({ billId }) : null;
  if (!bill) notFound();

  const meta: { label: string; value: string }[] = [];
  if (bill.subTypeDesc) meta.push({ label: "סוג", value: bill.subTypeDesc });
  if (bill.statusDesc) meta.push({ label: "סטטוס", value: bill.statusDesc });
  if (bill.knessetNum != null) meta.push({ label: "כנסת", value: `ה-${bill.knessetNum}` });
  if (bill.publicationDate) meta.push({ label: "פורסם", value: formatDate(bill.publicationDate) });

  return (
    <main className={BILL_CONTAINER}>
      <Link
        href="/politicians"
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        חזרה לפוליטיקאים
      </Link>

      <h1 className="font-display text-2xl font-black text-foreground sm:text-3xl">{bill.nameHe}</h1>

      {meta.length > 0 && (
        <dl className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {meta.map((m) => (
            <div key={m.label} className="flex items-center justify-between gap-3 bg-card px-4 py-3">
              <dt className="text-sm text-muted-foreground">{m.label}</dt>
              <dd className="text-sm font-bold text-foreground">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {bill.summaryLaw && (
        <>
          <h2 className="mb-2 mt-8 font-display text-xl font-bold text-foreground">תקציר</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{bill.summaryLaw}</p>
        </>
      )}

      {bill.initiators.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">יוזמי ההצעה</h2>
          <ul className="flex flex-wrap gap-2">
            {bill.initiators.map((i) => (
              <li key={i.personId}>
                <Link
                  href={`/politician/${i.personId}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-muted/60 ${
                    i.isInitiator ? "border-primary text-primary" : "border-border text-foreground"
                  }`}
                >
                  {i.nameHe}
                  {i.isInitiator && <span className="text-xs text-muted-foreground">· יוזם</span>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {bill.documents.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">נוסח רשמי</h2>
          <ul className="space-y-2">
            {bill.documents.map((d) => (
              <li key={`${d.documentBillId}-${d.format}`}>
                <a
                  href={d.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
                >
                  <Document className="h-4 w-4 text-muted-foreground" />
                  <span>{d.groupTypeDesc ?? "מסמך"}</span>
                  {d.format && <span className="text-xs text-muted-foreground">({d.format})</span>}
                  <ArrowUpRight className="ms-auto h-4 w-4 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      {bill.linkedVote && (
        <>
          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">הצבעה במליאה</h2>
          <Link
            href={`/vote/${bill.linkedVote.voteId}`}
            className="block rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground transition-colors hover:bg-muted/60"
          >
            <span className="line-clamp-2 font-semibold">{bill.linkedVote.titleHe ?? bill.nameHe}</span>
            {bill.linkedVote.voteDate && (
              <span className="mt-0.5 block text-xs text-muted-foreground nums">{formatDate(bill.linkedVote.voteDate)}</span>
            )}
            <span className="mt-1 block text-xs font-semibold text-primary">לצפייה בהצבעה ולקביעת עמדה ←</span>
          </Link>
        </>
      )}

      <a
        href={knessetBillUrl(bill.billId)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        בדף ההצעה באתר הכנסת
        <ArrowUpRight className="h-4 w-4" />
      </a>
      <p className="mt-3 text-xs text-muted-foreground">נתונים ממקור רשמי · הכנסת (OData)</p>
    </main>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add app/bill components/skeletons/bill-skeleton.tsx
git commit -m "feat(bill): /bill/[billId] page — official data, initiators, text links, vote"
```

### Task 11: Politician page — link recent bills + Knesset grouping

**Files:**
- Modify: `app/politician/[id]/page.tsx:162-178`

- [ ] **Step 1: Replace the recent-bills block**

Replace `app/politician/[id]/page.tsx:162-178` (the `{activity.recentBills.length > 0 && (...)}` block) with a two-group, clickable version:

```tsx
          {(activity.recentBills.current.length > 0 || activity.recentBills.earlier.length > 0) && (
            <>
              {(
                [
                  { key: "current", title: `הצעות חוק · כנסת ה-${CURRENT_KNESSET}`, bills: activity.recentBills.current },
                  { key: "earlier", title: "הצעות חוק · כנסות קודמות", bills: activity.recentBills.earlier },
                ] as const
              ).map((group) =>
                group.bills.length > 0 ? (
                  <div key={group.key}>
                    <h3 className="mb-2 mt-5 text-sm font-bold text-primary">{group.title}</h3>
                    <ul className="space-y-2">
                      {group.bills.map((b) => (
                        <li key={b.billId}>
                          <Link
                            href={`/bill/${b.billId}`}
                            className="block rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/60"
                          >
                            {b.nameHe}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </>
          )}
```

`CURRENT_KNESSET` is already imported in this file (line 10). No other change needed.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add app/politician/[id]/page.tsx
git commit -m "feat(politician): clickable recent bills, grouped current vs earlier Knesset"
```

---

## Phase G — Verify

### Task 12: Full suite + lint + typecheck

- [ ] **Step 1: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all PASS. Fix any failure before proceeding (do not `--no-verify` later).

- [ ] **Step 2: Commit any fixes**

```bash
git add -A && git commit -m "chore: lint/typecheck fixes for bill pages"
```

### Task 13: Browser-verify the external URL + smoke the pages

> Uses the `browser-qa` skill / Chrome MCP. The Knesset page is WAF'd, so this is the ONLY way to confirm the link pattern.

- [ ] **Step 1: Verify the external bill URL renders the right bill**

Open `https://main.knesset.gov.il/Activity/Legislation/Laws/Pages/LawBill.aspx?t=lawsuggestionssearch&lawitemid=2243802` in a real browser (Chrome MCP). Confirm it loads the bill "הצעת חוק משפחות חיילים שנספו במערכה…" (not an error/search page).
- If it does NOT resolve to that bill, find the correct pattern on the live site (e.g. different `t=` value) and update `knessetBillUrl` in `app/lib/bills/external.ts`. Re-commit.

- [ ] **Step 2: Smoke the app** (dev server on port 3210)

Run: `pnpm dev` (port 3210 — do NOT `pnpm build` in this checkout while dev runs). Then in a browser:
- `/politician/<Katz personId>` → "הצעות חוק · כנסות קודמות" group now shows clickable rows.
- Click a row → `/bill/<billId>` renders name, סוג/סטטוס/כנסת, יוזמי ההצעה (each links to a politician), נוסח רשמי (PDF/DOC opens on fs.knesset.gov.il), and "בדף ההצעה באתר הכנסת" opens the WAF'd page in the browser fine.
- A bill with a known plenum vote shows the "הצבעה במליאה" section linking to `/vote/[id]`.

- [ ] **Step 3: `/code-review` before pushing**

Run the `/code-review` skill on the diff; address findings. Then push the branch.

---

## Self-Review (against the spec)

- **P0-1 Lifetime backfill** → Tasks 5-6 (`ingestLifetimeBills`). ✔
- **P0-2 Store-everything** → Task 1 (schema) + Tasks 3-4 (normalize/upsert) cover all KNS_Bill fields, documents, statuses. ✔
- **P0-3 Internal bill page** → Tasks 8-10. ✔
- **P0-4 Clickable rows** → Task 11. ✔
- **P0-5 Knesset separation** → Tasks 7 + 11. ✔
- **P0-6 External URL browser-verified** → Task 13. ✔
- **P1-1 Decisive-vote link** → Task 8 (`linkedVote`) + Task 10 (render). ✔
- **P1-2 SummaryLaw render** → Task 10. ✔
- **P2-1 Pre-voting host** → bill page layout leaves room; not built. ✔ (out of scope, by design)

**Type consistency:** `recentBills: { current; earlier }` defined in Task 7 and consumed in Task 11; `BillDetail` shape defined in Task 8 and consumed in Task 10; `splitExpandedInitiators` return shape (Task 3) consumed in Task 5. `knessetBillUrl` (Task 9) consumed in Task 10. Consistent.

**Open items flagged for the engineer (not blocking the plan):**
- The prod backfill (Task 6) is a manual, intentional prod write — coordinate per the single-prod-DB constraint.
- Task 13's external-URL browser check is the one genuinely unverified fact; everything else is confirmed against live OData + the current schema.
