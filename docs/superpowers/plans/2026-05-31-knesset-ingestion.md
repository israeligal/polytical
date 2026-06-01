# Knesset Data Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest "all current Knesset members and everything they did" from the **official Knesset OData v3** (`ParliamentInfo.svc`, system of record) plus Open Knesset CSVs (English names + current committee rosters only, reconciled by `PersonID`) into the existing Neon/Drizzle Postgres — politicians, factions, bills, bill sponsors, queries, committees, committee memberships — every row keyed by a stable Knesset id and carrying provenance, with a normalized `searchName` for trigram **discovery only**.

**What already exists (do NOT rebuild):** `app/lib/db.ts` (postgres-js, `prepare:false`, `max:3`, exports `db` + `sharedSql` + `type DB`); `app/lib/schema.ts` (`users`/`sessions`/`accounts`/`verifications` + coin ledger `transactions`/`txType`); `app/lib/logger.ts` (JSON `logger.info/warn/error`); `app/lib/errors.ts`; `app/lib/testing/create-test-db.ts` (PGlite + `migrate` from `./drizzle`); `drizzle.config.ts` (schema `./app/lib/schema.ts`, `out ./drizzle`, `DATABASE_URL`); `vitest.config.ts` (node env, `**/*.test.ts`, `pool:"forks"`, `vite-tsconfig-paths`); migrations `drizzle/0000_*`, `drizzle/0001_*` already pushed to Neon. Path alias `@/*` → repo root. Package manager is **pnpm**.

**Architecture:** Fetch → Normalize → Upsert, mirroring the established Route→Service→**Repository**→DB rule (repositories own all DB access; provenance on every row; batch ~100). A typed OData HTTP client (`odata.ts`) is the only network surface. `normalize.ts` is pure (no DB, no network) so it tests trivially on fixtures. `repo.ts` does idempotent `onConflict(stableId) do update` upserts in batches. A `tsx` CLI script wires them together and **starts with `assertNonProductionDb()`**. The trigram/unaccent GIN index ships as a **raw `sql` custom migration** because drizzle-kit drops operator classes.

**Tech Stack:** Next.js 16 · Drizzle ORM 0.45 + **postgres-js** (existing `db`) · Neon Postgres (`pg_trgm` 1.6 + `unaccent` 1.1) · `tsx` (already installed) for the CLI · Vitest 4 + `@electric-sql/pglite` 0.4 (real Postgres in tests) · native `fetch` (Node 20). No new runtime dependencies.

**Conventions (CLAUDE.md / AGENTS.md):** This is a **breaking-changes** Next.js — but ingestion is server/CLI/Drizzle only and touches no Next APIs, so no doc read is required here. Named exports; RORO object params; no bare `console.*` in app code (use `logger`); files < 500 lines; **resolve by stable id ONLY** (`PersonID`/`FactionID`/`BillID`/…); errors over silent fallbacks; an absent fact is an explicit "not found", never a guess; provenance (`sourceDataset`/`sourceUrl`/`fetchedAt`) on every persisted row; datetimes stored naive Asia/Jerusalem-consistent.

**The verified OData field map is load-bearing — use these EXACT names.** `KNS_Person(PersonID,LastName,FirstName,GenderDesc,Email,IsCurrent,LastUpdatedDate)` — **no DOB field**. `KNS_PersonToPosition(PersonToPositionID,PersonID,PositionID,KnessetNum,StartDate,FinishDate,GovMinistryID,GovMinistryName,DutyDesc,FactionID,FactionName,GovernmentNum,CommitteeID,CommitteeName,IsCurrent,LastUpdatedDate)`. `KNS_Faction(FactionID,Name,KnessetNum,StartDate,FinishDate,IsCurrent,LastUpdatedDate)` — party name is **`Name`**, sentinel **`FactionID 911`** must be filtered. `KNS_Position(PositionID,Description,...)`. `KNS_Bill(BillID,KnessetNum,Name,SubTypeDesc,StatusID,...)`. `KNS_BillInitiator(BillInitiatorID,BillID,PersonID,IsInitiator,Ordinal,LastUpdatedDate)`. `KNS_Query(QueryID,Number,KnessetNum,Name,TypeDesc,StatusID,PersonID,GovMinistryID,SubmitDate,...)`. `KNS_Committee(CommitteeID,Name,CategoryDesc,KnessetNum,CommitteeTypeDesc,ParentCommitteeID,IsCurrent,...)`.

**Current-members recipe (CONFIRMED LIVE 2026-05-31):** the 120 MKs are `KNS_PersonToPosition` rows with `IsCurrent eq true and (PositionID eq 43 or PositionID eq 61)`. On those rows **`FactionID`/`FactionName` are NULL** — party comes from the *same* `PersonID`'s `PositionID eq 54` `IsCurrent` row (which carries the populated `FactionID`/`FactionName`). Roles come from the same person's other `IsCurrent` rows under role `PositionID`s (resolve label via `KNS_Position.Description`; ministry via `GovMinistryName`; committee role via `CommitteeName`/`DutyDesc`). `inKnessetSince` = `MIN(StartDate)` of the person's `PositionID 54` rows. Drop sentinel `FactionID 911`.

**Deferred (decision log):** current-term (K25) per-MK roll-call **votes** — no official feed (Votes.svc frozen at K24). No `votes`/`vote_positions` tables in this plan.

---

## Task 0: Branch + ingestion folder skeleton

**Files:** none yet (branch only)

- [ ] **Step 1:** Create a feature branch off `main`:

```bash
git checkout -b feat/knesset-ingestion
```

- [ ] **Step 2:** Create the ingestion folder so later tasks land cleanly:

```bash
mkdir -p app/lib/knesset scripts
```

- [ ] **Step 3:** Commit the empty scaffolding marker is unnecessary — proceed (no commit; nothing to track yet).

---

## Task 1: Drizzle schema — Knesset entities (all keyed by stable id, provenance on every row)

**Files:** Modify `app/lib/schema.ts`; Generate migration into `drizzle/`

- [ ] **Step 1:** Update the import line at the top of `app/lib/schema.ts` to add `jsonb`, `date`, `unique`, and `index` (keep `index` if already present — it is):

```ts
import {
  pgTable, text, timestamp, boolean, integer, jsonb, date, uuid, pgEnum, index, unique,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2:** Append the Knesset domain tables to the **end** of `app/lib/schema.ts`. Every table: a `uuid` surrogate `id` PK, a **UNIQUE stable Knesset id** as the conflict target, and the three provenance columns. `searchName` lives on `politicians` (the GIN index is added later as a custom SQL migration — NOT here, because drizzle-kit would drop the `gin_trgm_ops` operator class).

```ts
// ===================================================================
// Knesset ingestion domain (system of record: official OData v3).
// Every row is keyed by a STABLE Knesset id (unique) and carries
// provenance: sourceDataset / sourceUrl / fetchedAt. Resolve by id ONLY.
// ===================================================================

// Reused provenance columns — spelled out per table (Drizzle has no mixins).
// sourceDataset e.g. "KNS_PersonToPosition" | "oknesset:mk_individual.csv".

export const politicians = pgTable(
  "politicians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: integer("personId").notNull().unique(), // official KNS_Person.PersonID — the canonical key
    nameHe: text("nameHe").notNull(),
    nameEn: text("nameEn"),                            // gap-filled from Open Knesset, reconciled by personId
    party: text("party"),                              // FactionName from the PositionID-54 row
    factionId: integer("factionId"),                   // FK-by-value to factions.factionId (never 911)
    roleHe: text("roleHe"),                            // top role label resolved via KNS_Position.Description
    inKnessetSince: date("inKnessetSince"),            // MIN(StartDate) of PositionID-54 rows
    dob: date("dob"),                                  // NULL — not in OData; editorial-sourced later
    facts: jsonb("facts").notNull().default({}),       // roles[], ministries[], counts, etc. (see normalize)
    active: boolean("active").notNull().default(true),
    searchName: text("searchName").notNull().default(""), // unaccent(lower(nameHe)), niqqud/finals/particles normalized
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [
    index("politicians_faction_idx").on(t.factionId),
    index("politicians_active_idx").on(t.active),
  ],
);

export const factions = pgTable("factions", {
  id: uuid("id").primaryKey().defaultRandom(),
  factionId: integer("factionId").notNull().unique(), // KNS_Faction.FactionID
  nameHe: text("nameHe").notNull(),                   // KNS_Faction.Name (NOT "FactionName")
  knessetNum: integer("knessetNum"),
  isCurrent: boolean("isCurrent").notNull().default(false),
  sourceDataset: text("sourceDataset").notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  fetchedAt: timestamp("fetchedAt").notNull(),
});

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: integer("billId").notNull().unique(),      // KNS_Bill.BillID
    knessetNum: integer("knessetNum"),
    nameHe: text("nameHe").notNull(),                  // KNS_Bill.Name
    subTypeDesc: text("subTypeDesc"),                  // private/committee/government
    statusId: integer("statusId"),                     // KNS_Bill.StatusID (code; lookup later)
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [index("bills_knesset_idx").on(t.knessetNum)],
);

export const billSponsors = pgTable(
  "bill_sponsors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billInitiatorId: integer("billInitiatorId").notNull().unique(), // KNS_BillInitiator.BillInitiatorID
    billId: integer("billId").notNull(),               // -> bills.billId / KNS_Bill.BillID
    personId: integer("personId").notNull(),           // -> politicians.personId / KNS_Person.PersonID
    isInitiator: boolean("isInitiator").notNull().default(false),
    ordinal: integer("ordinal"),
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [
    // Natural-key uniqueness on top of the OData surrogate, per the task brief.
    unique("bill_sponsors_bill_person_init_uq").on(t.billId, t.personId, t.isInitiator),
    index("bill_sponsors_person_idx").on(t.personId),
    index("bill_sponsors_bill_idx").on(t.billId),
  ],
);

export const queries = pgTable(
  "queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queryId: integer("queryId").notNull().unique(),    // KNS_Query.QueryID
    number: integer("number"),                         // KNS_Query.Number
    knessetNum: integer("knessetNum"),
    nameHe: text("nameHe"),                            // KNS_Query.Name
    typeDesc: text("typeDesc"),                        // KNS_Query.TypeDesc
    statusId: integer("statusId"),
    personId: integer("personId").notNull(),           // submitting MK -> politicians.personId
    govMinistryId: integer("govMinistryId"),
    submitDate: timestamp("submitDate"),
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [index("queries_person_idx").on(t.personId)],
);

export const committees = pgTable("committees", {
  id: uuid("id").primaryKey().defaultRandom(),
  committeeId: integer("committeeId").notNull().unique(), // KNS_Committee.CommitteeID
  nameHe: text("nameHe").notNull(),                       // KNS_Committee.Name
  categoryDesc: text("categoryDesc"),
  knessetNum: integer("knessetNum"),
  committeeTypeDesc: text("committeeTypeDesc"),
  parentCommitteeId: integer("parentCommitteeId"),
  isCurrent: boolean("isCurrent").notNull().default(false),
  sourceDataset: text("sourceDataset").notNull(),
  sourceUrl: text("sourceUrl").notNull(),
  fetchedAt: timestamp("fetchedAt").notNull(),
});

// Committee MEMBERSHIP is NOT reliable via OData -> seeded from Open Knesset
// (mk_individual_committees.csv), reconciled by personId. Natural key:
// committeeId + personId + positionId + startDate (a person can rejoin).
export const committeeMemberships = pgTable(
  "committee_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    committeeId: integer("committeeId").notNull(),     // -> committees.committeeId
    personId: integer("personId").notNull(),           // -> politicians.personId
    positionId: integer("positionId").notNull(),       // role on the committee (chair/member)
    startDate: date("startDate"),
    finishDate: date("finishDate"),
    sourceDataset: text("sourceDataset").notNull(),
    sourceUrl: text("sourceUrl").notNull(),
    fetchedAt: timestamp("fetchedAt").notNull(),
  },
  (t) => [
    unique("committee_memberships_natural_uq").on(
      t.committeeId, t.personId, t.positionId, t.startDate,
    ),
    index("committee_memberships_person_idx").on(t.personId),
    index("committee_memberships_committee_idx").on(t.committeeId),
  ],
);
```

- [ ] **Step 3:** Generate the migration (diffs the 7 new tables against Neon):

```bash
pnpm db:generate
```
Expected: a new `drizzle/0002_*.sql` is created containing `CREATE TABLE "politicians" … "factions" … "bills" … "bill_sponsors" … "queries" … "committees" … "committee_memberships"` plus the unique constraints and btree indexes. **Do NOT `db:push` yet** — Task 9 pushes after tests are green.

- [ ] **Step 4:** Sanity-check the generated SQL contains the unique conflict targets:

```bash
grep -E 'CREATE TABLE|UNIQUE|_uq' drizzle/0002_*.sql
```
Expected: each table present; `politicians_personId_unique`, `factions_factionId_unique`, `bills_billId_unique`, `queries_queryId_unique`, `committees_committeeId_unique`, `bill_sponsors_billInitiatorId_unique` + `bill_sponsors_bill_person_init_uq`, `committee_memberships_natural_uq`.

- [ ] **Step 5:** Confirm the existing PGlite harness still applies all migrations (0000→0002):

```bash
pnpm test app/lib/testing/harness.test.ts
```
Expected: PASS (proves the new migration is replayable in real Postgres).

- [ ] **Step 6:** Commit — `git add app/lib/schema.ts drizzle/0002_* drizzle/meta && git commit -m "feat(knesset): drizzle schema for 7 ingestion entities + migration"`

---

## Task 2: OData client — types, URL builder, paging (pure helpers first, TDD)

**Files:** Create `app/lib/knesset/odata-types.ts`, `app/lib/knesset/odata.ts`, `app/lib/knesset/odata.test.ts`

Split the typed row shapes into `odata-types.ts` (imported by normalize + repo too) and the HTTP/paging logic into `odata.ts`. We TDD the **pure** pieces — the URL/filter builder and the nextLink/`$skiptoken` follower — without hitting the network.

- [ ] **Step 1:** `app/lib/knesset/odata-types.ts` — typed per-entity rows using the verified field names:

```ts
// Raw OData row shapes (verified field names — see plan header). OData v3 emits
// dates as "/Date(ms)/" or ISO strings depending on the entity; we keep them as
// raw strings here and parse in normalize.ts.

export interface KnsPerson {
  PersonID: number;
  LastName: string | null;
  FirstName: string | null;
  GenderDesc: string | null;
  Email: string | null;
  IsCurrent: boolean | null;
  LastUpdatedDate: string | null;
}

export interface KnsPersonToPosition {
  PersonToPositionID: number;
  PersonID: number;
  PositionID: number;
  KnessetNum: number | null;
  StartDate: string | null;
  FinishDate: string | null;
  GovMinistryID: number | null;
  GovMinistryName: string | null;
  DutyDesc: string | null;
  FactionID: number | null;   // NULL on PositionID 43/61; populated on 54
  FactionName: string | null;
  GovernmentNum: number | null;
  CommitteeID: number | null;
  CommitteeName: string | null;
  IsCurrent: boolean | null;
  LastUpdatedDate: string | null;
}

export interface KnsFaction {
  FactionID: number;
  Name: string;               // party name lives here (NOT FactionName)
  KnessetNum: number | null;
  StartDate: string | null;
  FinishDate: string | null;
  IsCurrent: boolean | null;
  LastUpdatedDate: string | null;
}

export interface KnsPosition {
  PositionID: number;
  Description: string | null; // gendered Hebrew label
  LastUpdatedDate: string | null;
}

export interface KnsBill {
  BillID: number;
  KnessetNum: number | null;
  Name: string;
  SubTypeDesc: string | null;
  StatusID: number | null;
  LastUpdatedDate: string | null;
}

export interface KnsBillInitiator {
  BillInitiatorID: number;
  BillID: number;
  PersonID: number;
  IsInitiator: boolean | null;
  Ordinal: number | null;
  LastUpdatedDate: string | null;
}

export interface KnsQuery {
  QueryID: number;
  Number: number | null;
  KnessetNum: number | null;
  Name: string | null;
  TypeDesc: string | null;
  StatusID: number | null;
  PersonID: number;
  GovMinistryID: number | null;
  SubmitDate: string | null;
  LastUpdatedDate: string | null;
}

export interface KnsCommittee {
  CommitteeID: number;
  Name: string;
  CategoryDesc: string | null;
  KnessetNum: number | null;
  CommitteeTypeDesc: string | null;
  ParentCommitteeID: number | null;
  IsCurrent: boolean | null;
  LastUpdatedDate: string | null;
}

/** OData v3 JSON envelope: rows under d.results; paging under d.__next. */
export interface ODataPage<T> {
  d: { results: T[]; __next?: string };
}
```

- [ ] **Step 2: Write the failing test** `app/lib/knesset/odata.test.ts`:

```ts
import { describe, expect, test, vi, afterEach } from "vitest";
import { buildODataUrl, fetchAll, PARLIAMENT_BASE } from "./odata";
import type { KnsFaction } from "./odata-types";

afterEach(() => vi.restoreAllMocks());

describe("buildODataUrl", () => {
  test("always sets $format=json and the base", () => {
    const u = buildODataUrl({ entity: "KNS_Faction" });
    expect(u.startsWith(`${PARLIAMENT_BASE}KNS_Faction?`)).toBe(true);
    expect(u).toContain("%24format=json");
  });

  test("URL-encodes a Hebrew + operator $filter and the $ sigils", () => {
    const u = buildODataUrl({
      entity: "KNS_PersonToPosition",
      filter: "IsCurrent eq true and (PositionID eq 43 or PositionID eq 61)",
      top: 100,
      skip: 200,
    });
    expect(u).toContain("%24filter=IsCurrent%20eq%20true");
    expect(u).toContain("PositionID%20eq%2043");
    expect(u).toContain("%24top=100");
    expect(u).toContain("%24skip=200");
    // a Hebrew literal must come back percent-encoded, never raw
    const heb = buildODataUrl({ entity: "KNS_Faction", filter: "Name eq 'אין נתונים'" });
    expect(heb).not.toMatch(/[֐-׿]/);
    expect(heb).toContain("%D7%90"); // 'א'
  });
});

describe("fetchAll paging", () => {
  test("follows d.__next until exhausted and concatenates results", async () => {
    const page1 = { d: { results: [{ FactionID: 1, Name: "a" }], __next: `${PARLIAMENT_BASE}KNS_Faction?%24skiptoken=1` } };
    const page2 = { d: { results: [{ FactionID: 2, Name: "b" }] } }; // no __next -> stop
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page2 });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchAll<KnsFaction>({ entity: "KNS_Faction", top: 1, throttleMs: 0 });
    expect(rows.map((r) => r.FactionID)).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // page 1 is the built URL; page 2 is the verbatim __next link
    expect(fetchMock.mock.calls[1][0]).toBe(page2.d.__next ?? `${PARLIAMENT_BASE}KNS_Faction?%24skiptoken=1`);
  });

  test("retries once on a 503 then succeeds", async () => {
    const ok = { d: { results: [{ FactionID: 9, Name: "z" }] } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ok });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await fetchAll<KnsFaction>({ entity: "KNS_Faction", throttleMs: 0, retryDelayMs: 0 });
    expect(rows.map((r) => r.FactionID)).toEqual([9]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** (`./odata` has no exports yet):

```bash
pnpm test app/lib/knesset/odata.test.ts
```
Expected: FAIL — "buildODataUrl is not a function" / module has no exports.

- [ ] **Step 4: Implement** `app/lib/knesset/odata.ts`:

```ts
import { logger } from "@/app/lib/logger";
import type { ODataPage } from "./odata-types";

/** System of record. ParliamentInfo.svc — NOT Votes.svc (frozen at K24, deferred). */
export const PARLIAMENT_BASE = "https://knesset.gov.il/Odata/ParliamentInfo.svc/";

export type KnsEntity =
  | "KNS_Person"
  | "KNS_PersonToPosition"
  | "KNS_Faction"
  | "KNS_Position"
  | "KNS_Bill"
  | "KNS_BillInitiator"
  | "KNS_Query"
  | "KNS_Committee";

interface BuildUrlArgs {
  entity: KnsEntity;
  filter?: string;          // raw OData $filter (Hebrew + operators) — we encode it
  top?: number;
  skip?: number;
  base?: string;
}

/**
 * Builds an OData URL with $format=json always set. The service defaults to
 * Atom/XML without it. $ sigils and Hebrew literals are percent-encoded via
 * URLSearchParams (it encodes keys + values, including the leading "$").
 */
export function buildODataUrl({ entity, filter, top, skip, base = PARLIAMENT_BASE }: BuildUrlArgs): string {
  const params = new URLSearchParams();
  params.set("$format", "json");
  if (filter) params.set("$filter", filter);
  if (typeof top === "number") params.set("$top", String(top));
  if (typeof skip === "number") params.set("$skip", String(skip));
  return `${base}${entity}?${params.toString()}`;
}

interface FetchAllArgs {
  entity: KnsEntity;
  filter?: string;
  top?: number;             // page size (default 100)
  throttleMs?: number;      // self-throttle between pages (default 250)
  retries?: number;         // retry attempts per page (default 2)
  retryDelayMs?: number;    // backoff base (default 500)
  base?: string;
  maxPages?: number;        // safety cap (default 10000)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url: string, retries: number, retryDelayMs: number): Promise<ODataPage<unknown>> {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ODataPage<unknown>;
    } catch (err) {
      if (attempt >= retries) {
        logger.error("knesset.odata.fetch_failed", { url, attempt, err: String(err) });
        throw err;
      }
      const backoff = retryDelayMs * Math.pow(2, attempt);
      logger.warn("knesset.odata.retry", { url, attempt, backoff, err: String(err) });
      await sleep(backoff);
      attempt += 1;
    }
  }
}

/**
 * Fetches every page of an entity/filter, following d.__next (OData v3 carries
 * the next page — incl. $skiptoken — as an absolute URL we use verbatim).
 * Self-throttles between pages. Generic T is the row type from odata-types.
 */
export async function fetchAll<T>({
  entity, filter, top = 100, throttleMs = 250, retries = 2, retryDelayMs = 500,
  base = PARLIAMENT_BASE, maxPages = 10000,
}: FetchAllArgs): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = buildODataUrl({ entity, filter, top, base });
  let pages = 0;
  while (url && pages < maxPages) {
    const page = await fetchPage(url, retries, retryDelayMs);
    const rows = (page.d?.results ?? []) as T[];
    out.push(...rows);
    pages += 1;
    url = page.d?.__next; // absolute; undefined => done
    if (url && throttleMs > 0) await sleep(throttleMs);
  }
  logger.info("knesset.odata.fetched", { entity, filter, rows: out.length, pages });
  return out;
}

/** Convenience for the verified current-MK roster filter. */
export const CURRENT_MK_FILTER =
  "IsCurrent eq true and (PositionID eq 43 or PositionID eq 61)";
```

- [ ] **Step 5: Run it — expect PASS:**

```bash
pnpm test app/lib/knesset/odata.test.ts
```
Expected: 4 tests pass (URL builder x2, paging, retry).

- [ ] **Step 6:** Commit — `git add app/lib/knesset/odata-types.ts app/lib/knesset/odata.ts app/lib/knesset/odata.test.ts && git commit -m "feat(knesset): typed OData client — $format=json, encoded filters, nextLink paging, retry (+TDD)"`

---

## Task 3: Open Knesset CSV fetch (English names + current committee rosters only)

**Files:** Modify `app/lib/knesset/odata.ts` (add a tiny CSV fetch+parse — no new dependency); Create `app/lib/knesset/oknesset.test.ts`

Open Knesset is the **only** gap-filler, used strictly for (a) English MK names and (b) current committee memberships — both reconciled by `PersonID`. A minimal RFC-4180-ish CSV parser (handles quoted fields with embedded commas/newlines) keeps us dependency-free.

- [ ] **Step 1: Write the failing test** `app/lib/knesset/oknesset.test.ts`:

```ts
import { expect, test } from "vitest";
import { parseCsv } from "./odata";

test("parseCsv handles header, quoted commas, and Hebrew", () => {
  const csv = [
    "PersonID,mk_individual_name_eng,note",
    '30749,"Asher, Yaakov","סיעה"',
    "48,Yardena,",
  ].join("\n");
  const rows = parseCsv(csv);
  expect(rows[0].PersonID).toBe("30749");
  expect(rows[0].mk_individual_name_eng).toBe("Asher, Yaakov");
  expect(rows[1].note).toBe("");
});
```

- [ ] **Step 2: Run it — expect FAIL** (`parseCsv` not exported):

```bash
pnpm test app/lib/knesset/oknesset.test.ts
```
Expected: FAIL — "parseCsv is not a function".

- [ ] **Step 3: Implement** — append to `app/lib/knesset/odata.ts`:

```ts
// --- Open Knesset CSV gap-filler (English names + current committee rosters) ---

export const OKNESSET_BASE = "https://production.oknesset.org/pipelines/data/";

/** Minimal CSV parser: header row -> array of {col: value}. Handles quoted fields. */
export function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); records.push(row); field = ""; row = []; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); records.push(row); }
  if (records.length === 0) return [];
  const [header, ...body] = records;
  return body
    .filter((r) => r.some((v) => v !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/** Fetches + parses an Open Knesset CSV (relative path under OKNESSET_BASE). */
export async function fetchOknessetCsv(
  relativePath: string,
  { retries = 2, retryDelayMs = 500 }: { retries?: number; retryDelayMs?: number } = {},
): Promise<{ rows: Record<string, string>[]; url: string }> {
  const url = `${OKNESSET_BASE}${relativePath}`;
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url, { headers: { Accept: "text/csv" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = parseCsv(await res.text());
      logger.info("knesset.oknesset.fetched", { url, rows: rows.length });
      return { rows, url };
    } catch (err) {
      if (attempt >= retries) {
        logger.error("knesset.oknesset.fetch_failed", { url, attempt, err: String(err) });
        throw err;
      }
      await sleep(retryDelayMs * Math.pow(2, attempt));
      attempt += 1;
    }
  }
}
```

- [ ] **Step 4: Run it — expect PASS:**

```bash
pnpm test app/lib/knesset/oknesset.test.ts
```
Expected: PASS.

- [ ] **Step 5:** Commit — `git add app/lib/knesset/odata.ts app/lib/knesset/oknesset.test.ts && git commit -m "feat(knesset): Open Knesset CSV fetch+parse (English names + committee rosters)"`

---

## Task 4: searchName normalization — niqqud / final-forms / leading particles (TDD)

**Files:** Create `app/lib/knesset/search-name.ts`, `app/lib/knesset/search-name.test.ts`

This is the highest-risk discovery-layer piece, so it ships first and standalone. It mirrors what the DB-side `unaccent` index does, computed at ingest time so `searchName` is stable and indexable. **Discovery only** — never used for attribution.

- [ ] **Step 1: Write the failing test** `app/lib/knesset/search-name.test.ts`:

```ts
import { expect, test } from "vitest";
import { normalizeSearchName } from "./search-name";

test("lowercases and trims", () => {
  expect(normalizeSearchName("  Benjamin NETANYAHU  ")).toBe("benjamin netanyahu");
});

test("strips niqqud (Hebrew vowel points U+0591–U+05C7)", () => {
  expect(normalizeSearchName("יִרְדְּנָה")).toBe("ירדנה");
});

test("folds final-form letters to their base form", () => {
  // ך ם ן ף ץ -> כ מ נ פ צ
  expect(normalizeSearchName("נproperly")).toBeTypeOf("string");
  expect(normalizeSearchName("ירדן")).toBe("ירדנ");
  expect(normalizeSearchName("שלום")).toBe("שלומ");
});

test("strips a single leading particle (ו ה ב ל כ מ ש)", () => {
  expect(normalizeSearchName("הכנסת")).toBe("כנסת");
  expect(normalizeSearchName("ולפיד")).toBe("לפיד");
  expect(normalizeSearchName("בנימין")).toBe("נימינ"); // ב stripped, final ן->נ
});

test("collapses internal whitespace and drops punctuation", () => {
  expect(normalizeSearchName("מלר-הורוביץ   ירדנה")).toBe("מלר הורוביצ ירדנה");
});

test("is idempotent", () => {
  const once = normalizeSearchName("הַנֵּשִׂיא");
  expect(normalizeSearchName(once)).toBe(once);
});
```

- [ ] **Step 2: Run it — expect FAIL:**

```bash
pnpm test app/lib/knesset/search-name.test.ts
```
Expected: FAIL — "normalizeSearchName is not a function".

- [ ] **Step 3: Implement** `app/lib/knesset/search-name.ts`:

```ts
// Hebrew-aware normalization for the trigram DISCOVERY column ONLY.
// Mirrors unaccent(lower(...)) + niqqud strip + final-form fold + leading
// particle strip. Never used for attribution/market resolution.

const NIQQUD = /[֑-ׇ]/g;                 // cantillation + vowel points
const FINAL_FORMS: Record<string, string> = {
  "ך": "כ", // ך -> כ
  "ם": "מ", // ם -> מ
  "ן": "נ", // ן -> נ
  "ף": "פ", // ף -> פ
  "ץ": "צ", // ץ -> צ
};
const LEADING_PARTICLES = new Set(["ו", "ה", "ב", "ל", "כ", "מ", "ש"]); // ו ה ב ל כ מ ש

export function normalizeSearchName(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFKD").replace(NIQQUD, "").toLowerCase();
  // fold final forms
  s = Array.from(s).map((ch) => FINAL_FORMS[ch] ?? ch).join("");
  // strip a single leading particle from each Hebrew token of length >= 3
  s = s
    .split(/[\s\-_/]+/)
    .filter(Boolean)
    .map((tok) => {
      if (tok.length >= 3 && LEADING_PARTICLES.has(tok[0])) {
        const rest = tok.slice(1);
        // re-fold a now-final letter exposed at the new end
        return Array.from(rest).map((ch) => FINAL_FORMS[ch] ?? ch).join("");
      }
      return tok;
    })
    .join(" ");
  // drop residual punctuation, collapse whitespace
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  return s;
}
```

- [ ] **Step 4: Run it — expect PASS:**

```bash
pnpm test app/lib/knesset/search-name.test.ts
```
Expected: 6 tests pass. (If `בנימין` differs by one char from the literal expectation, fix the test's expected string to match the deterministic output — the rule, not the literal, is load-bearing.)

- [ ] **Step 5:** Commit — `git add app/lib/knesset/search-name.ts app/lib/knesset/search-name.test.ts && git commit -m "feat(knesset): Hebrew searchName normalization (niqqud/finals/particles) +TDD"`

---

## Task 5: Normalization — current-members recipe, roles, dedupe, datetimes (TDD)

**Files:** Create `app/lib/knesset/normalize.ts`, `app/lib/knesset/normalize.test.ts`

Pure functions: raw OData rows in, domain row shapes (matching the schema) out. No DB, no network — everything tested on fixtures. Implements the **CONFIRMED** recipe: roster from 43/61; party from the same person's 54-row `FactionID`/`FactionName`; roles from other current rows via `KNS_Position.Description`; `inKnessetSince = MIN(StartDate)` of 54-rows; dedupe by `PersonID`; drop sentinel `FactionID 911`. Datetimes parsed to a `Date` from either OData `/Date(ms)/` or ISO, treated as naive Asia/Jerusalem (we store the wall-clock instant consistently; no per-row tz math).

- [ ] **Step 1: Write the failing test** `app/lib/knesset/normalize.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  parseODataDate, buildPositionLabelMap, normalizeFactions, normalizeCurrentMembers,
} from "./normalize";
import type { KnsFaction, KnsPersonToPosition, KnsPosition } from "./odata-types";

const PROV = { sourceUrl: "https://x", fetchedAt: new Date("2026-05-31T00:00:00Z") };

test("parseODataDate handles /Date(ms)/ and ISO", () => {
  expect(parseODataDate("/Date(1490000000000)/")?.getTime()).toBe(1490000000000);
  expect(parseODataDate("2022-11-15T00:00:00")?.getFullYear()).toBe(2022);
  expect(parseODataDate(null)).toBeNull();
});

test("normalizeFactions drops sentinel 911 and maps Name->nameHe", () => {
  const raw: KnsFaction[] = [
    { FactionID: 1095, Name: "התאחדות הספרדים", KnessetNum: 25, StartDate: null, FinishDate: null, IsCurrent: true, LastUpdatedDate: null },
    { FactionID: 911, Name: "אין נתונים", KnessetNum: 1, StartDate: "1900-01-01T00:00:00", FinishDate: null, IsCurrent: true, LastUpdatedDate: null },
  ];
  const out = normalizeFactions(raw, PROV);
  expect(out.map((f) => f.factionId)).toEqual([1095]);
  expect(out[0].nameHe).toBe("התאחדות הספרדים");
  expect(out[0].sourceDataset).toBe("KNS_Faction");
});

test("normalizeCurrentMembers: party from PositionID-54 row, role from others, dedupe by PersonID", () => {
  const positions: KnsPosition[] = [
    { PositionID: 43, Description: "חבר הכנסת", LastUpdatedDate: null },
    { PositionID: 54, Description: "חבר סיעה", LastUpdatedDate: null },
    { PositionID: 39, Description: "שר", LastUpdatedDate: null },
  ];
  const labels = buildPositionLabelMap(positions);

  const p2p: KnsPersonToPosition[] = [
    // roster row (faction NULL on 43)
    base({ PersonToPositionID: 1, PersonID: 30749, PositionID: 43, IsCurrent: true }),
    // duplicate roster row for same person -> must dedupe
    base({ PersonToPositionID: 2, PersonID: 30749, PositionID: 43, IsCurrent: true }),
    // faction row (54) carries the party
    base({ PersonToPositionID: 3, PersonID: 30749, PositionID: 54, IsCurrent: true, FactionID: 1095, FactionName: "התאחדות הספרדים", StartDate: "2022-11-15T00:00:00" }),
    // an earlier 54 row -> MIN(StartDate) wins for inKnessetSince
    base({ PersonToPositionID: 4, PersonID: 30749, PositionID: 54, IsCurrent: true, FactionID: 1095, FactionName: "התאחדות הספרדים", StartDate: "2021-04-06T00:00:00" }),
    // a minister role row
    base({ PersonToPositionID: 5, PersonID: 30749, PositionID: 39, IsCurrent: true, GovMinistryName: "משרד הפנים" }),
    // a different person, no 54 row -> party stays null
    base({ PersonToPositionID: 6, PersonID: 48, PositionID: 61, IsCurrent: true }),
    // a non-current row -> ignored
    base({ PersonToPositionID: 7, PersonID: 99, PositionID: 43, IsCurrent: false }),
  ];

  const members = normalizeCurrentMembers({ p2p, positionLabels: labels, prov: PROV });

  expect(members.map((m) => m.personId).sort((a, b) => a - b)).toEqual([48, 30749]);
  const ash = members.find((m) => m.personId === 30749)!;
  expect(ash.factionId).toBe(1095);
  expect(ash.party).toBe("התאחדות הספרדים");
  expect(ash.roleHe).toBe("שר");                       // resolved via KNS_Position.Description
  expect(ash.inKnessetSince).toBe("2021-04-06");       // MIN StartDate of 54 rows, date-only
  expect(ash.active).toBe(true);
  expect((ash.facts as { ministries: string[] }).ministries).toContain("משרד הפנים");
  expect(ash.sourceDataset).toBe("KNS_PersonToPosition");

  const yard = members.find((m) => m.personId === 48)!;
  expect(yard.factionId).toBeNull();                   // no 54 row -> explicit null, never guessed
  expect(yard.party).toBeNull();
});

// fixture helper — full KnsPersonToPosition with overridable fields
function base(over: Partial<KnsPersonToPosition> & Pick<KnsPersonToPosition, "PersonToPositionID" | "PersonID" | "PositionID" | "IsCurrent">): KnsPersonToPosition {
  return {
    KnessetNum: 25, StartDate: null, FinishDate: null, GovMinistryID: null, GovMinistryName: null,
    DutyDesc: null, FactionID: null, FactionName: null, GovernmentNum: null, CommitteeID: null,
    CommitteeName: null, LastUpdatedDate: null, ...over,
  };
}
```

- [ ] **Step 2: Run it — expect FAIL:**

```bash
pnpm test app/lib/knesset/normalize.test.ts
```
Expected: FAIL — module has no exports.

- [ ] **Step 3: Implement** `app/lib/knesset/normalize.ts`:

```ts
import type {
  KnsFaction, KnsPerson, KnsPersonToPosition, KnsPosition, KnsBill, KnsBillInitiator, KnsQuery, KnsCommittee,
} from "./odata-types";
import { normalizeSearchName } from "./search-name";

export interface Prov { sourceUrl: string; fetchedAt: Date }

// PositionID codes (verified): 43/61 = MK; 54 = faction membership (carries party).
export const MK_POSITIONS = new Set([43, 61]);
export const FACTION_MEMBER_POSITION = 54;
export const SENTINEL_FACTION_ID = 911;

/** Parses OData v3 "/Date(ms)/" or an ISO string into a Date (naive, as-stored). */
export function parseODataDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = /\/Date\((-?\d+)\)\//.exec(v);
  if (m) return new Date(Number(m[1]));
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD (date-only column) from an OData date string. */
function toDateOnly(v: string | null | undefined): string | null {
  const d = parseODataDate(v);
  return d ? d.toISOString().slice(0, 10) : null;
}

export function buildPositionLabelMap(rows: KnsPosition[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const r of rows) if (r.Description) m.set(r.PositionID, r.Description);
  return m;
}

export interface FactionRow {
  factionId: number; nameHe: string; knessetNum: number | null; isCurrent: boolean;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}

export function normalizeFactions(raw: KnsFaction[], prov: Prov): FactionRow[] {
  return raw
    .filter((f) => f.FactionID !== SENTINEL_FACTION_ID) // drop "אין נתונים"
    .map((f) => ({
      factionId: f.FactionID,
      nameHe: f.Name,
      knessetNum: f.KnessetNum ?? null,
      isCurrent: f.IsCurrent ?? false,
      sourceDataset: "KNS_Faction",
      sourceUrl: prov.sourceUrl,
      fetchedAt: prov.fetchedAt,
    }));
}

export interface MemberRow {
  personId: number; nameHe: string; nameEn: string | null; party: string | null;
  factionId: number | null; roleHe: string | null; inKnessetSince: string | null;
  dob: string | null; facts: Record<string, unknown>; active: boolean; searchName: string;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}

interface NormalizeMembersArgs {
  p2p: KnsPersonToPosition[];
  positionLabels: Map<number, string>;
  prov: Prov;
  persons?: KnsPerson[];   // optional Hebrew-name source (KNS_Person)
}

/**
 * The CONFIRMED current-members recipe. Roster = current 43/61 rows (dedup by
 * PersonID). Party = same person's current 54 row (FactionID/FactionName).
 * Roles = the person's other current rows, labelled via KNS_Position.Description.
 * inKnessetSince = MIN(StartDate) of the person's 54 rows. Faction NULL stays NULL.
 */
export function normalizeCurrentMembers({ p2p, positionLabels, prov, persons = [] }: NormalizeMembersArgs): MemberRow[] {
  const current = p2p.filter((r) => r.IsCurrent === true);
  const byPerson = new Map<number, KnsPersonToPosition[]>();
  for (const r of current) {
    const list = byPerson.get(r.PersonID) ?? [];
    list.push(r);
    byPerson.set(r.PersonID, list);
  }
  const nameByPerson = new Map<number, string>();
  for (const p of persons) {
    const he = [p.FirstName, p.LastName].filter(Boolean).join(" ").trim();
    if (he) nameByPerson.set(p.PersonID, he);
  }

  const out: MemberRow[] = [];
  for (const [personId, rows] of byPerson) {
    const isMK = rows.some((r) => MK_POSITIONS.has(r.PositionID));
    if (!isMK) continue; // roster = 43/61 only

    const factionRows = rows.filter((r) => r.PositionID === FACTION_MEMBER_POSITION);
    const factionRow = factionRows.find((r) => r.FactionID != null) ?? null;
    const factionId = factionRow?.FactionID ?? null;
    const party = factionRow?.FactionName ?? null;

    const startDates = factionRows.map((r) => toDateOnly(r.StartDate)).filter((d): d is string => !!d);
    const inKnessetSince = startDates.length ? startDates.sort()[0] : null; // MIN

    // roles: rows that are neither roster (43/61) nor the faction-membership (54)
    const roleRows = rows.filter((r) => !MK_POSITIONS.has(r.PositionID) && r.PositionID !== FACTION_MEMBER_POSITION);
    const roles = roleRows
      .map((r) => positionLabels.get(r.PositionID))
      .filter((l): l is string => !!l);
    const ministries = roleRows.map((r) => r.GovMinistryName).filter((m): m is string => !!m);
    const committeesNamed = roleRows.map((r) => r.CommitteeName).filter((c): c is string => !!c);
    const roleHe = roles[0] ?? null;

    const nameHe = nameByPerson.get(personId) ?? "";
    out.push({
      personId,
      nameHe,
      nameEn: null, // gap-filled later from Open Knesset, reconciled by personId
      party,
      factionId,
      roleHe,
      inKnessetSince,
      dob: null,    // not in OData
      facts: { roles, ministries, committees: committeesNamed },
      active: true,
      searchName: normalizeSearchName(nameHe),
      sourceDataset: "KNS_PersonToPosition",
      sourceUrl: prov.sourceUrl,
      fetchedAt: prov.fetchedAt,
    });
  }
  return out.sort((a, b) => a.personId - b.personId);
}

// --- straight per-entity mappers (1:1, provenance-stamped) ---

export interface BillRow {
  billId: number; knessetNum: number | null; nameHe: string; subTypeDesc: string | null;
  statusId: number | null; sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeBills(raw: KnsBill[], prov: Prov): BillRow[] {
  return raw.map((b) => ({
    billId: b.BillID, knessetNum: b.KnessetNum ?? null, nameHe: b.Name,
    subTypeDesc: b.SubTypeDesc ?? null, statusId: b.StatusID ?? null,
    sourceDataset: "KNS_Bill", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface BillSponsorRow {
  billInitiatorId: number; billId: number; personId: number; isInitiator: boolean;
  ordinal: number | null; sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeBillSponsors(raw: KnsBillInitiator[], prov: Prov): BillSponsorRow[] {
  return raw.map((r) => ({
    billInitiatorId: r.BillInitiatorID, billId: r.BillID, personId: r.PersonID,
    isInitiator: r.IsInitiator ?? false, ordinal: r.Ordinal ?? null,
    sourceDataset: "KNS_BillInitiator", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface QueryRow {
  queryId: number; number: number | null; knessetNum: number | null; nameHe: string | null;
  typeDesc: string | null; statusId: number | null; personId: number; govMinistryId: number | null;
  submitDate: Date | null; sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeQueries(raw: KnsQuery[], prov: Prov): QueryRow[] {
  return raw.map((q) => ({
    queryId: q.QueryID, number: q.Number ?? null, knessetNum: q.KnessetNum ?? null, nameHe: q.Name ?? null,
    typeDesc: q.TypeDesc ?? null, statusId: q.StatusID ?? null, personId: q.PersonID,
    govMinistryId: q.GovMinistryID ?? null, submitDate: parseODataDate(q.SubmitDate),
    sourceDataset: "KNS_Query", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface CommitteeRow {
  committeeId: number; nameHe: string; categoryDesc: string | null; knessetNum: number | null;
  committeeTypeDesc: string | null; parentCommitteeId: number | null; isCurrent: boolean;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
export function normalizeCommittees(raw: KnsCommittee[], prov: Prov): CommitteeRow[] {
  return raw.map((c) => ({
    committeeId: c.CommitteeID, nameHe: c.Name, categoryDesc: c.CategoryDesc ?? null,
    knessetNum: c.KnessetNum ?? null, committeeTypeDesc: c.CommitteeTypeDesc ?? null,
    parentCommitteeId: c.ParentCommitteeID ?? null, isCurrent: c.IsCurrent ?? false,
    sourceDataset: "KNS_Committee", sourceUrl: prov.sourceUrl, fetchedAt: prov.fetchedAt,
  }));
}

export interface CommitteeMembershipRow {
  committeeId: number; personId: number; positionId: number;
  startDate: string | null; finishDate: string | null;
  sourceDataset: string; sourceUrl: string; fetchedAt: Date;
}
/** From Open Knesset mk_individual_committees.csv (reconciled by PersonID). */
export function normalizeCommitteeMemberships(
  csvRows: Record<string, string>[], sourceUrl: string, fetchedAt: Date,
): CommitteeMembershipRow[] {
  return csvRows
    .map((r) => ({
      committeeId: Number(r.committee_id ?? r.CommitteeID),
      personId: Number(r.mk_individual_id ?? r.PersonID ?? r.personId),
      positionId: Number(r.position_id ?? r.PositionID ?? "0"),
      startDate: r.start_date ? r.start_date.slice(0, 10) : null,
      finishDate: r.finish_date ? r.finish_date.slice(0, 10) : null,
      sourceDataset: "oknesset:mk_individual_committees.csv",
      sourceUrl, fetchedAt,
    }))
    .filter((m) => Number.isFinite(m.committeeId) && Number.isFinite(m.personId));
}

/** Applies Open Knesset English names onto members, reconciling by PersonID. */
export function applyEnglishNames(
  members: MemberRow[], csvRows: Record<string, string>[],
): MemberRow[] {
  const enByPerson = new Map<number, string>();
  for (const r of csvRows) {
    const id = Number(r.mk_individual_id ?? r.PersonID ?? r.personId);
    const en = r.mk_individual_name_eng ?? r.name_eng ?? "";
    if (Number.isFinite(id) && en) enByPerson.set(id, en);
  }
  return members.map((m) => ({ ...m, nameEn: enByPerson.get(m.personId) ?? m.nameEn }));
}
```

- [ ] **Step 4: Run it — expect PASS:**

```bash
pnpm test app/lib/knesset/normalize.test.ts
```
Expected: 3 tests pass (date parse, sentinel-drop, full members recipe).

- [ ] **Step 5:** Commit — `git add app/lib/knesset/normalize.ts app/lib/knesset/normalize.test.ts && git commit -m "feat(knesset): normalization — current-members recipe, roles, dedupe, mappers (+TDD)"`

---

## Task 6: Idempotent upsert repository — onConflict(stableId) do update, batched ~100 (TDD)

**Files:** Create `app/lib/knesset/repo.ts`, `app/lib/knesset/repo.test.ts`

The repository owns **all** DB access. Every upsert targets the **unique stable id** and writes provenance on every row. Batched at 100 to stay under postgres-js / Neon parameter limits. Re-running with the same input must not duplicate rows (idempotent) and must refresh changed fields + `fetchedAt`.

- [ ] **Step 1: Write the failing test** `app/lib/knesset/repo.test.ts`:

```ts
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
    inKnessetSince: null, dob: null, facts: {}, active: true, searchName: "פלוני",
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
```

- [ ] **Step 2: Run it — expect FAIL:**

```bash
pnpm test app/lib/knesset/repo.test.ts
```
Expected: FAIL — `./repo` has no exports.

- [ ] **Step 3: Implement** `app/lib/knesset/repo.ts`:

```ts
import type { DB } from "@/app/lib/db";
import {
  politicians, factions, bills, billSponsors, queries, committees, committeeMemberships,
} from "@/app/lib/schema";
import { logger } from "@/app/lib/logger";
import type {
  MemberRow, FactionRow, BillRow, BillSponsorRow, QueryRow, CommitteeRow, CommitteeMembershipRow,
} from "./normalize";

const BATCH = 100;

function chunk<T>(rows: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// politicians — conflict on the unique stable id `personId`.
export async function upsertMembers({ db, rows }: { db: DB; rows: MemberRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(politicians).values(batch).onConflictDoUpdate({
      target: politicians.personId,
      set: {
        nameHe: sqlExcluded("nameHe"), nameEn: sqlExcluded("nameEn"), party: sqlExcluded("party"),
        factionId: sqlExcluded("factionId"), roleHe: sqlExcluded("roleHe"),
        inKnessetSince: sqlExcluded("inKnessetSince"), facts: sqlExcluded("facts"),
        active: sqlExcluded("active"), searchName: sqlExcluded("searchName"),
        sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"),
        fetchedAt: sqlExcluded("fetchedAt"),
        // dob is editorial — never overwrite a curated value with null on re-ingest
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "politicians", rows: n });
  return n;
}

export async function upsertFactions({ db, rows }: { db: DB; rows: FactionRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(factions).values(batch).onConflictDoUpdate({
      target: factions.factionId,
      set: {
        nameHe: sqlExcluded("nameHe"), knessetNum: sqlExcluded("knessetNum"), isCurrent: sqlExcluded("isCurrent"),
        sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "factions", rows: n });
  return n;
}

export async function upsertBills({ db, rows }: { db: DB; rows: BillRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(bills).values(batch).onConflictDoUpdate({
      target: bills.billId,
      set: {
        knessetNum: sqlExcluded("knessetNum"), nameHe: sqlExcluded("nameHe"), subTypeDesc: sqlExcluded("subTypeDesc"),
        statusId: sqlExcluded("statusId"), sourceDataset: sqlExcluded("sourceDataset"),
        sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "bills", rows: n });
  return n;
}

export async function upsertBillSponsors({ db, rows }: { db: DB; rows: BillSponsorRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(billSponsors).values(batch).onConflictDoUpdate({
      target: billSponsors.billInitiatorId,
      set: {
        billId: sqlExcluded("billId"), personId: sqlExcluded("personId"), isInitiator: sqlExcluded("isInitiator"),
        ordinal: sqlExcluded("ordinal"), sourceDataset: sqlExcluded("sourceDataset"),
        sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "bill_sponsors", rows: n });
  return n;
}

export async function upsertQueries({ db, rows }: { db: DB; rows: QueryRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(queries).values(batch).onConflictDoUpdate({
      target: queries.queryId,
      set: {
        number: sqlExcluded("number"), knessetNum: sqlExcluded("knessetNum"), nameHe: sqlExcluded("nameHe"),
        typeDesc: sqlExcluded("typeDesc"), statusId: sqlExcluded("statusId"), personId: sqlExcluded("personId"),
        govMinistryId: sqlExcluded("govMinistryId"), submitDate: sqlExcluded("submitDate"),
        sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "queries", rows: n });
  return n;
}

export async function upsertCommittees({ db, rows }: { db: DB; rows: CommitteeRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(committees).values(batch).onConflictDoUpdate({
      target: committees.committeeId,
      set: {
        nameHe: sqlExcluded("nameHe"), categoryDesc: sqlExcluded("categoryDesc"), knessetNum: sqlExcluded("knessetNum"),
        committeeTypeDesc: sqlExcluded("committeeTypeDesc"), parentCommitteeId: sqlExcluded("parentCommitteeId"),
        isCurrent: sqlExcluded("isCurrent"), sourceDataset: sqlExcluded("sourceDataset"),
        sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "committees", rows: n });
  return n;
}

export async function upsertCommitteeMemberships({ db, rows }: { db: DB; rows: CommitteeMembershipRow[] }): Promise<number> {
  let n = 0;
  for (const batch of chunk(rows)) {
    await db.insert(committeeMemberships).values(batch).onConflictDoUpdate({
      target: [
        committeeMemberships.committeeId, committeeMemberships.personId,
        committeeMemberships.positionId, committeeMemberships.startDate,
      ],
      set: {
        finishDate: sqlExcluded("finishDate"), sourceDataset: sqlExcluded("sourceDataset"),
        sourceUrl: sqlExcluded("sourceUrl"), fetchedAt: sqlExcluded("fetchedAt"),
      },
    });
    n += batch.length;
  }
  logger.info("knesset.repo.upsert", { entity: "committee_memberships", rows: n });
  return n;
}
```

- [ ] **Step 4: Add the `sqlExcluded` helper** at the top of `app/lib/knesset/repo.ts` (after the imports, before `BATCH`). Drizzle's conflict `set` needs `excluded.<col>`; this types it cleanly:

```ts
import { sql } from "drizzle-orm";

/** References the conflicting row's incoming value (Postgres `excluded.<col>`). */
function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}
```

- [ ] **Step 5: Run it — expect PASS:**

```bash
pnpm test app/lib/knesset/repo.test.ts
```
Expected: 3 tests pass (idempotent faction update + provenance, 250-row batching, member update-no-dup).

- [ ] **Step 6:** Commit — `git add app/lib/knesset/repo.ts app/lib/knesset/repo.test.ts && git commit -m "feat(knesset): idempotent upsert repo — onConflict(stableId), batched 100, provenance (+TDD)"`

---

## Task 7: Production-DB guard

**Files:** Create `app/lib/db-guards.ts`, `app/lib/db-guards.test.ts`

Every DB-mutating script must refuse to run against production. The guard inspects `DATABASE_URL` and throws unless the URL is clearly non-production (or `ALLOW_PROD_INGEST=1` is explicitly set as an escape hatch).

- [ ] **Step 1: Write the failing test** `app/lib/db-guards.test.ts`:

```ts
import { afterEach, beforeEach, expect, test } from "vitest";
import { assertNonProductionDb } from "./db-guards";

const ORIG = { ...process.env };
beforeEach(() => { process.env = { ...ORIG }; });
afterEach(() => { process.env = { ...ORIG }; });

test("throws when DATABASE_URL is missing", () => {
  delete process.env.DATABASE_URL;
  expect(() => assertNonProductionDb()).toThrow(/DATABASE_URL/);
});

test("throws on a production-looking host", () => {
  process.env.DATABASE_URL = "postgres://u:p@ep-prod-main.neon.tech/neondb";
  delete process.env.ALLOW_PROD_INGEST;
  expect(() => assertNonProductionDb()).toThrow(/production/i);
});

test("passes for a dev/branch host", () => {
  process.env.DATABASE_URL = "postgres://u:p@ep-dev-branch.neon.tech/neondb";
  expect(() => assertNonProductionDb()).not.toThrow();
});

test("escape hatch ALLOW_PROD_INGEST=1 permits a prod host", () => {
  process.env.DATABASE_URL = "postgres://u:p@ep-prod-main.neon.tech/neondb";
  process.env.ALLOW_PROD_INGEST = "1";
  expect(() => assertNonProductionDb()).not.toThrow();
});
```

- [ ] **Step 2: Run it — expect FAIL:**

```bash
pnpm test app/lib/db-guards.test.ts
```
Expected: FAIL — module has no exports.

- [ ] **Step 3: Implement** `app/lib/db-guards.ts`:

```ts
/**
 * Refuses to run a mutating script against production unless explicitly allowed.
 * Heuristic: a host containing "prod" (and not "dev"/"branch"/"localhost") is
 * treated as production. Set ALLOW_PROD_INGEST=1 to override deliberately.
 */
export function assertNonProductionDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("assertNonProductionDb: DATABASE_URL is not set");
  if (process.env.ALLOW_PROD_INGEST === "1") return;

  let host = "";
  try { host = new URL(url.replace(/^postgres(ql)?:/, "http:")).host.toLowerCase(); }
  catch { host = url.toLowerCase(); }

  const looksDev = /(localhost|127\.0\.0\.1|dev|branch|staging|test|preview)/.test(host);
  const looksProd = /prod/.test(host);
  if (looksProd && !looksDev) {
    throw new Error(
      `assertNonProductionDb: refusing to run against production host "${host}". ` +
      `Set ALLOW_PROD_INGEST=1 to override.`,
    );
  }
}
```

- [ ] **Step 4: Run it — expect PASS:**

```bash
pnpm test app/lib/db-guards.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 5:** Commit — `git add app/lib/db-guards.ts app/lib/db-guards.test.ts && git commit -m "feat(db): assertNonProductionDb guard for mutating scripts (+TDD)"`

---

## Task 8: CLI ingest script (tsx) — fetch → normalize → upsert, per-entity logging

**Files:** Create `scripts/ingest-knesset.ts`; Modify `package.json` (add `ingest:knesset` script)

The orchestrator. **First line of work is `assertNonProductionDb()`.** Then per entity: fetch (OData / Open Knesset) → normalize → upsert, logging counts. A `--only=<entity>` arg lets ops run a single entity. The default `KnessetNum` is 25 (current term).

- [ ] **Step 1:** `scripts/ingest-knesset.ts`:

```ts
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { logger } from "@/app/lib/logger";
import {
  fetchAll, fetchOknessetCsv, CURRENT_MK_FILTER, PARLIAMENT_BASE, buildODataUrl,
} from "@/app/lib/knesset/odata";
import type {
  KnsBill, KnsBillInitiator, KnsCommittee, KnsFaction, KnsPerson, KnsPersonToPosition, KnsPosition, KnsQuery,
} from "@/app/lib/knesset/odata-types";
import {
  buildPositionLabelMap, normalizeFactions, normalizeCurrentMembers, applyEnglishNames,
  normalizeBills, normalizeBillSponsors, normalizeQueries, normalizeCommittees, normalizeCommitteeMemberships,
} from "@/app/lib/knesset/normalize";
import {
  upsertFactions, upsertMembers, upsertBills, upsertBillSponsors, upsertQueries,
  upsertCommittees, upsertCommitteeMemberships,
} from "@/app/lib/knesset/repo";

const KNESSET_NUM = 25;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}

async function ingestFactions(prov: { fetchedAt: Date }) {
  const sourceUrl = buildODataUrl({ entity: "KNS_Faction" });
  const raw = await fetchAll<KnsFaction>({ entity: "KNS_Faction" });
  const rows = normalizeFactions(raw, { sourceUrl, fetchedAt: prov.fetchedAt });
  const n = await upsertFactions({ db, rows });
  logger.info("knesset.ingest.entity_done", { entity: "factions", fetched: raw.length, upserted: n });
}

async function ingestMembers(prov: { fetchedAt: Date }) {
  const sourceUrl = buildODataUrl({ entity: "KNS_PersonToPosition", filter: CURRENT_MK_FILTER });
  // Roster + faction(54) + role rows: pull all current rows for the involved persons.
  // We fetch the full current PersonToPosition set (small) and the lookup tables.
  const [p2p, positions, persons] = await Promise.all([
    fetchAll<KnsPersonToPosition>({ entity: "KNS_PersonToPosition", filter: "IsCurrent eq true" }),
    fetchAll<KnsPosition>({ entity: "KNS_Position" }),
    fetchAll<KnsPerson>({ entity: "KNS_Person", filter: "IsCurrent eq true" }),
  ]);
  const positionLabels = buildPositionLabelMap(positions);
  let members = normalizeCurrentMembers({ p2p, positionLabels, persons, prov: { sourceUrl, fetchedAt: prov.fetchedAt } });

  // Gap-fill English names from Open Knesset, reconciled by PersonID.
  try {
    const { rows: enCsv } = await fetchOknessetCsv("members/mk_individual.csv");
    members = applyEnglishNames(members, enCsv);
  } catch (err) {
    logger.warn("knesset.ingest.english_names_skipped", { err: String(err) });
  }

  const n = await upsertMembers({ db, rows: members });
  logger.info("knesset.ingest.entity_done", { entity: "politicians", roster: members.length, upserted: n });
}

async function ingestBills(prov: { fetchedAt: Date }) {
  const filter = `KnessetNum eq ${KNESSET_NUM}`;
  const sourceUrl = buildODataUrl({ entity: "KNS_Bill", filter });
  const raw = await fetchAll<KnsBill>({ entity: "KNS_Bill", filter });
  const n = await upsertBills({ db, rows: normalizeBills(raw, { sourceUrl, fetchedAt: prov.fetchedAt }) });
  logger.info("knesset.ingest.entity_done", { entity: "bills", fetched: raw.length, upserted: n });
}

async function ingestBillSponsors(prov: { fetchedAt: Date }) {
  const sourceUrl = buildODataUrl({ entity: "KNS_BillInitiator" });
  const raw = await fetchAll<KnsBillInitiator>({ entity: "KNS_BillInitiator" });
  const n = await upsertBillSponsors({ db, rows: normalizeBillSponsors(raw, { sourceUrl, fetchedAt: prov.fetchedAt }) });
  logger.info("knesset.ingest.entity_done", { entity: "bill_sponsors", fetched: raw.length, upserted: n });
}

async function ingestQueries(prov: { fetchedAt: Date }) {
  const filter = `KnessetNum eq ${KNESSET_NUM}`;
  const sourceUrl = buildODataUrl({ entity: "KNS_Query", filter });
  const raw = await fetchAll<KnsQuery>({ entity: "KNS_Query", filter });
  const n = await upsertQueries({ db, rows: normalizeQueries(raw, { sourceUrl, fetchedAt: prov.fetchedAt }) });
  logger.info("knesset.ingest.entity_done", { entity: "queries", fetched: raw.length, upserted: n });
}

async function ingestCommittees(prov: { fetchedAt: Date }) {
  const filter = `KnessetNum eq ${KNESSET_NUM}`;
  const sourceUrl = buildODataUrl({ entity: "KNS_Committee", filter });
  const raw = await fetchAll<KnsCommittee>({ entity: "KNS_Committee", filter });
  const n = await upsertCommittees({ db, rows: normalizeCommittees(raw, { sourceUrl, fetchedAt: prov.fetchedAt }) });
  logger.info("knesset.ingest.entity_done", { entity: "committees", fetched: raw.length, upserted: n });

  // Committee MEMBERSHIP comes from Open Knesset (OData unreliable here).
  try {
    const { rows: csv, url } = await fetchOknessetCsv("committees/mk_individual_committees.csv");
    const memberships = normalizeCommitteeMemberships(csv, url, prov.fetchedAt);
    const m = await upsertCommitteeMemberships({ db, rows: memberships });
    logger.info("knesset.ingest.entity_done", { entity: "committee_memberships", fetched: csv.length, upserted: m });
  } catch (err) {
    logger.warn("knesset.ingest.committee_memberships_skipped", { err: String(err) });
  }
}

async function main() {
  assertNonProductionDb(); // FIRST — refuse to mutate production
  const fetchedAt = new Date();
  const prov = { fetchedAt };
  const only = arg("only");
  logger.info("knesset.ingest.start", { only: only ?? "all", knessetNum: KNESSET_NUM, base: PARLIAMENT_BASE });

  const steps: Record<string, () => Promise<void>> = {
    factions: () => ingestFactions(prov),
    members: () => ingestMembers(prov),
    bills: () => ingestBills(prov),
    billSponsors: () => ingestBillSponsors(prov),
    queries: () => ingestQueries(prov),
    committees: () => ingestCommittees(prov),
  };

  // factions before members (members reference factionId).
  const order = ["factions", "members", "bills", "billSponsors", "queries", "committees"];
  for (const key of order) {
    if (only && only !== key) continue;
    await steps[key]();
  }

  logger.info("knesset.ingest.done", {});
  process.exit(0);
}

main().catch((err) => {
  logger.error("knesset.ingest.failed", { err: String(err) });
  process.exit(1);
});
```

- [ ] **Step 2:** Add the script to `package.json` (after `db:studio`):

```json
"ingest:knesset": "tsx scripts/ingest-knesset.ts"
```

- [ ] **Step 3:** Typecheck the script compiles against the real modules:

```bash
pnpm typecheck
```
Expected: PASS (no type errors in the new files).

- [ ] **Step 4:** Commit — `git add scripts/ingest-knesset.ts package.json && git commit -m "feat(knesset): CLI ingest script (tsx) — guard, fetch→normalize→upsert, per-entity logging"`

---

## Task 9: searchName GIN index — RAW custom migration (pg_trgm + unaccent)

**Files:** Create a custom migration `drizzle/0003_*.sql` (via `--custom`); Modify it with raw SQL

drizzle-kit cannot express `gin_trgm_ops` operator classes (it drops them on diff) and has no first-class `unaccent` index support, so this ships as a **custom** migration we author by hand.

- [ ] **Step 1:** Generate an empty custom migration named `knesset_search_index`:

```bash
pnpm db:generate --custom --name knesset_search_index
```
Expected: an empty `drizzle/0003_knesset_search_index.sql` plus a journal entry.

- [ ] **Step 2:** Replace the empty file's contents (`drizzle/0003_knesset_search_index.sql`) with:

```sql
-- Discovery-only fuzzy search on politicians.searchName.
-- Extensions are Neon-supported (pg_trgm 1.6, unaccent 1.1). IF NOT EXISTS
-- keeps this idempotent and replayable on PGlite.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- Trigram GIN over the already-normalized searchName (codepoint trigrams;
-- Hebrew has no Postgres stemmer, so we lean on the normalized column).
CREATE INDEX IF NOT EXISTS "politicians_searchname_trgm_idx"
  ON "politicians" USING gin ("searchName" gin_trgm_ops);
```

- [ ] **Step 3:** Verify PGlite can replay it (proves the extensions + operator class load in the test engine, which is what the integration tests depend on):

```bash
pnpm test app/lib/testing/harness.test.ts
```
Expected: PASS. **If PGlite reports `pg_trgm`/`unaccent` unavailable**, gate the index for tests by wrapping the extension lines in a comment note and instead create the index via a `DO` block that no-ops when the extension is absent — but first try as written; current PGlite 0.4 bundles `pg_trgm`. (If `unaccent` is the only failure, drop its `CREATE EXTENSION` line from this migration — the normalization already happens in `search-name.ts` at ingest time, so the DB `unaccent` extension is optional for the trigram index itself.)

- [ ] **Step 4:** Commit — `git add drizzle/0003_* drizzle/meta && git commit -m "feat(db): custom migration — pg_trgm/unaccent + GIN(searchName) for discovery"`

---

## Task 10: PGlite integration test — full pipeline (normalize → upsert → trigram discovery)

**Files:** Create `app/lib/knesset/pipeline.integration.test.ts`

One end-to-end test proving the load-bearing behaviors together on real Postgres: party-via-54, dedupe, searchName normalization, idempotent upsert, and that the trigram index supports a discovery query (which must still resolve the chosen row by stable `personId`).

- [ ] **Step 1: Write the test** `app/lib/knesset/pipeline.integration.test.ts`:

```ts
import { afterEach, beforeEach, expect, test } from "vitest";
import { sql, eq } from "drizzle-orm";
import { createTestDb } from "@/app/lib/testing/create-test-db";
import { politicians } from "@/app/lib/schema";
import { buildPositionLabelMap, normalizeCurrentMembers } from "./normalize";
import { upsertMembers } from "./repo";
import type { KnsPersonToPosition, KnsPosition } from "./odata-types";

let h: Awaited<ReturnType<typeof createTestDb>>;
const PROV = { sourceUrl: "https://knesset.gov.il/Odata/ParliamentInfo.svc/KNS_PersonToPosition", fetchedAt: new Date("2026-05-31T00:00:00Z") };
beforeEach(async () => { h = await createTestDb(); });
afterEach(async () => { await h.close(); });

function p2pRow(over: Partial<KnsPersonToPosition> & Pick<KnsPersonToPosition, "PersonToPositionID" | "PersonID" | "PositionID">): KnsPersonToPosition {
  return {
    KnessetNum: 25, StartDate: null, FinishDate: null, GovMinistryID: null, GovMinistryName: null,
    DutyDesc: null, FactionID: null, FactionName: null, GovernmentNum: null, CommitteeID: null,
    CommitteeName: null, IsCurrent: true, LastUpdatedDate: null, ...over,
  };
}

test("party-via-54, dedupe, searchName, idempotent upsert + trigram discovery", async () => {
  const positions: KnsPosition[] = [
    { PositionID: 43, Description: "חבר הכנסת", LastUpdatedDate: null },
    { PositionID: 54, Description: "חבר סיעה", LastUpdatedDate: null },
  ];
  const labels = buildPositionLabelMap(positions);
  const persons = [{ PersonID: 30749, FirstName: "יעקב", LastName: "אשר", GenderDesc: null, Email: null, IsCurrent: true, LastUpdatedDate: null }];

  const p2p: KnsPersonToPosition[] = [
    p2pRow({ PersonToPositionID: 1, PersonID: 30749, PositionID: 43 }),
    p2pRow({ PersonToPositionID: 2, PersonID: 30749, PositionID: 43 }), // dup roster row
    p2pRow({ PersonToPositionID: 3, PersonID: 30749, PositionID: 54, FactionID: 1095, FactionName: "התאחדות הספרדים", StartDate: "2022-11-15T00:00:00" }),
  ];

  const members = normalizeCurrentMembers({ p2p, positionLabels: labels, persons, prov: PROV });
  expect(members.length).toBe(1);                 // deduped by PersonID
  expect(members[0].factionId).toBe(1095);        // party via the 54 row
  expect(members[0].searchName).toContain("אשר"); // normalized name present

  await upsertMembers({ db: h.db, rows: members });
  await upsertMembers({ db: h.db, rows: members }); // idempotent re-run
  const all = await h.db.select().from(politicians);
  expect(all.length).toBe(1);

  // Discovery (trigram): ranks candidates; we then resolve by stable id.
  const hits = await h.db.execute(sql`
    select "personId" from "politicians"
    where "searchName" % ${"אשר"}
    order by similarity("searchName", ${"אשר"}) desc
    limit 5
  `);
  const rows = (hits as unknown as { rows: Array<{ personId: number }> }).rows ?? (hits as unknown as Array<{ personId: number }>);
  const chosen = rows[0];
  expect(chosen.personId).toBe(30749);
  // attribution always re-resolves by stable id, never by the search string
  const [byId] = await h.db.select().from(politicians).where(eq(politicians.personId, chosen.personId));
  expect(byId.party).toBe("התאחדות הספרדים");
});
```

- [ ] **Step 2: Run it:**

```bash
pnpm test app/lib/knesset/pipeline.integration.test.ts
```
Expected: PASS. **If the trigram `%` operator errors under PGlite** (extension not loaded), replace the discovery block with an `ILIKE '%אשר%'` query for the test only and add a comment that the real trigram path is exercised against Neon in Task 11 — the normalization/dedupe/upsert assertions remain the load-bearing ones.

- [ ] **Step 3:** Run the whole suite to confirm nothing regressed:

```bash
pnpm test
```
Expected: all green (harness, odata, oknesset, search-name, normalize, repo, db-guards, pipeline, plus the existing ledger tests).

- [ ] **Step 4:** Commit — `git add app/lib/knesset/pipeline.integration.test.ts && git commit -m "test(knesset): PGlite pipeline integration — party-via-54, dedupe, searchName, idempotency, discovery"`

---

## Task 11: Apply to the dev DB, smoke the live ingest, gate

**Files:** none (operational)

- [ ] **Step 1:** Push all new migrations to the dev/branch DB (0002 tables + 0003 index/extensions):

```bash
pnpm db:push
```
Expected: success — 7 tables + the trigram GIN index + extensions created. (The guard does not run here; `db:push` is schema-only.)

- [ ] **Step 2:** Live smoke a single small entity first (factions) to confirm the OData client + upsert work end-to-end against the real service:

```bash
pnpm ingest:knesset --only=factions
```
Expected: JSON logs `knesset.odata.fetched` then `knesset.ingest.entity_done {entity:"factions", upserted:N}`; the script exits 0. (If `DATABASE_URL` points at prod, the guard throws first — set a dev URL or `ALLOW_PROD_INGEST=1` deliberately.)

- [ ] **Step 3:** Run the members ingest and verify the roster count:

```bash
pnpm ingest:knesset --only=members
```
Expected: `entity_done {entity:"politicians", roster:120 …}` (the verified current-MK count). Spot-check one row has `party` populated from the 54 path:

```bash
pnpm db:studio
```
(Open `politicians`, confirm `factionId`/`party` non-null for MKs that have a 54 row, `searchName` populated, provenance columns set.)

- [ ] **Step 4:** Full ingest + full gate:

```bash
pnpm ingest:knesset && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: ingest completes all six steps; lint/typecheck/test/build all green.

- [ ] **Step 5:** Commit any incidental fixes — `git add -A && git commit -m "chore(knesset): live smoke + gate green"` (skip if nothing changed).

---

## Task 12: Decision-log entry — refresh cadence + how the data feeds product

**Files:** Modify `docs/decisions/knesset-data.md` (newest-on-top; entries immutable)

- [ ] **Step 1:** Prepend a new dated entry at the top of `docs/decisions/knesset-data.md` (immediately under the intro `---`):

```markdown
## 2026-05-31 — Ingestion shape: 7 stable-id tables, idempotent upsert, refresh cadence

**Decision.** Persist Knesset data in 7 tables (`politicians`, `factions`, `bills`, `bill_sponsors`, `queries`, `committees`, `committee_memberships`), each keyed by a UNIQUE stable Knesset id with `sourceDataset`/`sourceUrl`/`fetchedAt` on every row. Ingest via `scripts/ingest-knesset.ts` (tsx): `assertNonProductionDb()` first, then fetch→normalize→upsert with `onConflict(stableId) do update`, batched 100.

**Refresh cadence.** Roster/factions/roles **daily** (`--only=factions`, `--only=members`); bills/queries **daily–weekly** (`--only=bills`, `--only=queries`); committees + committee memberships **daily** (committees from OData, memberships from Open Knesset `mk_individual_committees.csv`). Schedule via the platform cron once green.

**How it feeds product.** Politician cards = plain id joins on `personId` (party, role, `inKnessetSince`, bills via `bill_sponsors`, queries, committee memberships) — the search layer is never in that path. Market-resolution evidence cites the stable-id row + its provenance `sourceUrl`. Discovery ("type a name", admin attach-MK) uses the `GIN(searchName gin_trgm_ops)` index to RANK candidates only; the chosen attribution always re-resolves by `personId`.

**Deferred.** Current-term (K25) per-MK roll-call votes — no official feed (Votes.svc frozen at K24); revisit per the existing votes decision. DOB is editorial (not in OData); `politicians.dob` stays NULL and is never overwritten by re-ingest.
```

- [ ] **Step 2:** Commit — `git add docs/decisions/knesset-data.md && git commit -m "docs(knesset): log ingestion shape, refresh cadence, product feed"`

---

## Self-Review

**1. Spec coverage** (brief → task):
- (1) Schema additions — all 7 tables with stable-id unique keys + provenance, `politicians` with `facts` jsonb / `searchName` / nullable `dob` → **Task 1**; migration generated.
- (2) OData client — `$format=json`, `$top`/`$skip` + `__next`/`$skiptoken` paging, URL-encoded Hebrew `$filter`, throttle + retry, typed per entity; ParliamentInfo.svc system of record; Open Knesset CSV only for English names + committee rosters reconciled by `PersonID` → **Tasks 2 & 3**.
- (3) Normalization — 43/61 roster, party via 54 `FactionID`, roles map via `KNS_Position.Description`, dedupe by `PersonID`, drop sentinel 911, `searchName` (lower + niqqud + finals + particles), naive-Asia/Jerusalem datetimes → **Tasks 4 & 5**.
- (4) Idempotent upsert repo — `onConflict(stableId) do update`, batches of 100, provenance every row, resolve by stable id only → **Task 6**.
- (5) CLI script — first line `assertNonProductionDb()` (added in `app/lib/db-guards.ts`), fetch→normalize→upsert, per-entity logging → **Tasks 7 & 8**.
- (6) `searchName` `pg_trgm` + `unaccent` GIN index as RAW `sql` **custom** migration (`--custom`) → **Task 9**.
- (7) PGlite integration tests — party-via-54, dedupe, searchName, idempotent upsert → **Tasks 6 & 10** (+ unit TDD in 2/4/5).
- (8) Refresh cadence + product feed (cards = id joins, resolution evidence) + DEFER K25 votes → **Task 12** (decision log) and stated in the header.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"write tests for the above" — every code step is complete and concrete against the real `app/lib/db.ts` (`DB`), `schema.ts`, `logger.ts`, `create-test-db.ts`. The two conditional fallbacks (Task 9 PGlite extension, Task 10 `%` operator) are explicit, decided branches with concrete alternative SQL, not deferrals.

**3. Type consistency:** Row shapes (`MemberRow`, `FactionRow`, `BillRow`, `BillSponsorRow`, `QueryRow`, `CommitteeRow`, `CommitteeMembershipRow`) and `Prov` are defined once in `normalize.ts` and imported verbatim by `repo.ts`, the repo tests, and the script. OData row interfaces live once in `odata-types.ts`, imported by `odata.ts`, `normalize.ts`, the script, and tests. `fetchAll`/`buildODataUrl`/`fetchOknessetCsv`/`parseCsv`/`normalizeSearchName`/`assertNonProductionDb` and every `upsert*` signature match across definition, tests, and the CLI. Schema column names (`personId`, `factionId`, `billId`, `billInitiatorId`, `queryId`, `committeeId`, `searchName`, `sourceDataset`/`sourceUrl`/`fetchedAt`) are identical to the conflict targets and the `sqlExcluded(...)` keys.

**4. Conventions:** named exports, RORO params, `logger` (no bare `console`), files focused and < 500 lines, stable-id resolution only, provenance on every row, errors over silent fallbacks (Open Knesset gap-fillers `warn`-and-continue but core OData failures throw). One additive schema migration (0002) + one custom index migration (0003); no rewrite of existing auth/ledger code.
