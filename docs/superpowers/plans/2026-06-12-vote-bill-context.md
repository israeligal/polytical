# Vote Bill-Context (official description + law links) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich Knesset vote pages with an official description of what each vote is about (SummaryLaw / דברי הסבר extracted verbatim from official DOCX) plus links to the bill page + official text PDF.

**Architecture:** A new `vote_items` table (one row per Knesset item, terminal-state-by-existence) is filled by an enrichment post-pass inside the votes ingest, fetching `KNS_Bill`/`KNS_DocumentBill`/`KNS_Agenda`/`KNS_DocumentAgenda` from OData + the DOCX from fs.knesset.gov.il. Read paths LEFT JOIN it (1:1 on unique itemId). UI: collapsible RSC `<details>` section on `/vote/[id]` + one-line teaser on feed cards.

**Tech Stack:** Next 16 RSC, Drizzle + Neon/PGlite, fflate (DOCX unzip), Vitest, Tailwind v4 RTL logical props.

---

## ⚠️ CRITICAL CONTEXT FOR EVERY SUBAGENT

- **Your cwd is the REPO ROOT, not the feature worktree.** ALL work happens in the worktree:
  `WT = /Users/gal/personal-projects/polytical/.claude/worktrees/vote-bill-context`
  Use absolute paths under `$WT` for every Read/Edit/Write. Run every command as `cd "$WT" && …` (each Bash call separately — cwd resets). NEVER edit files outside `$WT`.
- Branch `feat/vote-bill-context` is already checked out in the worktree with deps installed.
- **Commit only your own task's files** (`git -C "$WT" add <explicit paths>` — never `-A`, never `commit -a`; another agent may be working in parallel). If a commit hits `index.lock`, wait 2s and retry.
- Already DONE (don't redo): worktree, `fflate` dep, fixtures (`app/lib/votes/test-payloads-items.ts`, `app/lib/votes/fixtures/*.docx`), schema (`vote_items` table + `knesset_votes.itemTypeId`, migration `0025`), normalize/write path (`LU_ItemType` → `itemTypeId`, `billId = itemTypeId===2 ? itemId : null`, `validBillIds` removed).
- House rules: RORO param objects, named exports, provenance triplet on ingested rows, logical Tailwind props (`ms/me/ps/pe`), tokens only (no hex), Hebrew copy, `logger` not bare console, files < 500 lines, never `--no-verify`.
- Tests: PGlite via `createTestDb()` (`app/lib/testing/create-test-db.ts`) replays `./drizzle` — schema is already there. Mock ONLY external fetch boundaries.
- Run single test files: `cd "$WT" && npx vitest run <path>`. Typecheck: `cd "$WT" && npx tsc --noEmit`.

---

### Task 1: DOCX text extraction module (pure)

**Files:**
- Create: `$WT/app/lib/votes/docx.ts`
- Test: `$WT/app/lib/votes/docx.test.ts`
- Read first: `$WT/app/lib/votes/fixtures/` (two real DOCX), `$WT/node_modules/fflate/lib/index.d.ts` (verify `unzipSync`/`strFromU8` signatures)

- [ ] **Step 1: Write the failing test**

```ts
// $WT/app/lib/votes/docx.test.ts
// Extraction is exercised against the REAL captured DOCX fixtures (see
// test-payloads-items.ts header for refresh commands) — no synthetic zips.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { extractDocxText, extractExplanatoryNotes } from "./docx";

const FIXTURES = join(__dirname, "fixtures");
const billDocx = new Uint8Array(readFileSync(join(FIXTURES, "25_lst_7584510.docx")));
const agendaDocx = new Uint8Array(readFileSync(join(FIXTURES, "25_as_13440018.docx")));

describe("extractDocxText", () => {
  test("yields the plain Hebrew body of a real bill DOCX", () => {
    const text = extractDocxText({ docx: billDocx });
    expect(text).toContain("דברי הסבר");
    expect(text).toContain("הצעת חוק זכויות נפגעי עבירה");
    expect(text).not.toMatch(/<w:|<\/w:/); // no WordprocessingML left
    expect(text).not.toContain("﻿");  // BOM stripped
  });

  test("throws on a zip without word/document.xml", () => {
    // tiny valid zip with a single unrelated file, built with fflate itself
    expect(() => extractDocxText({ docx: new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]) }))
      .toThrow(/word\/document\.xml/);
  });
});

describe("extractExplanatoryNotes", () => {
  test("returns the verbatim דברי הסבר of the bill, without the submission boilerplate", () => {
    const notes = extractExplanatoryNotes({ text: extractDocxText({ docx: billDocx }) });
    expect(notes).not.toBeNull();
    expect(notes!).toMatch(/^סעיף 22א לחוק זכויות נפגעי עבירה/);
    expect(notes!).toContain("ערכות דגימה");
    expect(notes!).not.toContain("הוגשה ליו\"ר הכנסת"); // boilerplate after the dash rule cut
    expect(notes!).not.toMatch(/-{5,}/);
  });

  test("returns the agenda motion's דברי הסבר, without the signature block", () => {
    const notes = extractExplanatoryNotes({ text: extractDocxText({ docx: agendaDocx }) });
    expect(notes).not.toBeNull();
    expect(notes!).toMatch(/^מדינת ישראל מצויה/);
    expect(notes!).not.toContain("בכבוד רב"); // trailing signature cut
  });

  test("explicit not-found: null when no דברי הסבר heading exists", () => {
    expect(extractExplanatoryNotes({ text: "סתם טקסט בלי כותרת רלוונטית" })).toBeNull();
  });

  test("null when the heading exists but the section is empty", () => {
    expect(extractExplanatoryNotes({ text: "כותרת\nדברי הסבר:\n---------\nחתימה" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `cd "$WT" && npx vitest run app/lib/votes/docx.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// $WT/app/lib/votes/docx.ts
// Pure DOCX text extraction for the vote-items enrichment. A .docx is a zip;
// the body is word/document.xml (WordprocessingML). We reduce it to plain
// text VERBATIM — official text only, no interpretation: an absent דברי הסבר
// section returns null (explicit not-found), never a guess (house rule).

import { strFromU8, unzipSync } from "fflate";

/** Plain text of a DOCX body: paragraphs → newlines, tags stripped, entities decoded. */
export function extractDocxText({ docx }: { docx: Uint8Array }): string {
  const files = unzipSync(docx);
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("not a DOCX: missing word/document.xml");
  return (
    strFromU8(xml)
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      // entity decode — &amp; LAST so "&amp;lt;" can't double-decode
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/﻿/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim()
  );
}

const EXPLANATORY_HEADING = /דברי הסבר:?/;
// Official-template trailers, observed on the real fixtures: bills end with a
// dash rule + submission block; agenda motions end with a signature block.
const TRAILERS = [/\n-{3,}/, /\nבכבוד רב,/];

/**
 * The verbatim דברי הסבר section of an official bill/agenda document, or null
 * when the heading is absent (explicit not-found — caller stores a links-only row).
 */
export function extractExplanatoryNotes({ text }: { text: string }): string | null {
  const m = EXPLANATORY_HEADING.exec(text);
  if (!m) return null;
  let body = text.slice(m.index + m[0].length);
  for (const trailer of TRAILERS) {
    const t = trailer.exec(body);
    if (t) body = body.slice(0, t.index);
  }
  body = body.trim();
  return body.length ? body : null;
}
```

NB step-1's "empty section" test: heading followed by `\n---------\nחתימה` → after the dash-rule cut the body is empty → null. If the minimal-zip test's hand-rolled empty-zip bytes don't satisfy fflate, build the test zip with `zipSync({ "other.txt": new Uint8Array([1]) })` from fflate instead — keep the assertion the same.

- [ ] **Step 4: Run tests** — `cd "$WT" && npx vitest run app/lib/votes/docx.test.ts` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd "$WT" && git add app/lib/votes/docx.ts app/lib/votes/docx.test.ts && git commit -m "feat(votes): pure DOCX text + explanatory-notes extraction

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Read path — detail bundle + feed teaser join

**Files:**
- Modify: `$WT/app/lib/votes/read-repo.ts` (getVoteDetail ~:137-172, getVotesFeed ~:56-102, getFeaturedVotes ~:105-117, FeedVote/VoteDetail interfaces ~:15-27, schema import ~:7-9)
- Read first: the whole of `read-repo.ts`, plus `app/lib/votes/read-repo.test.ts` if it exists (it may not).

- [ ] **Step 1: Extend the types + imports** (additive — existing call sites must keep compiling)

In the schema import add `voteItems`:
```ts
import {
  agendaItems, factions, ingestHeartbeats, knessetVotes, mkVotes, mkVotesRaw, politicians, unmappedMkNames, voteItems,
} from "@/app/lib/schema";
```

Add below `KnessetVoteRow`:
```ts
export type VoteItemRow = typeof voteItems.$inferSelect;
```

Extend `FeedVote`:
```ts
export interface FeedVote extends KnessetVoteRow {
  /** Other votes on the same item (readings/reservations) — 0 for standalones. */
  siblingCount: number;
  /** First 280 chars of the item's official description — null until enriched. */
  descriptionTeaser: string | null;
}
```

Extend `VoteDetail` (keep existing members) and add:
```ts
export interface VoteItemDetail {
  item: VoteItemRow;
  /** The agenda motion's proposing MK, when we know them. */
  initiator: typeof politicians.$inferSelect | null;
}

export interface VoteDetail {
  vote: KnessetVoteRow;
  breakdown: MkVoteWithPolitician[];
  withheldCount: number;
  siblings: KnessetVoteRow[];
  /** Enriched item context (official description + law links) — null until enriched. */
  item: VoteItemDetail | null;
}
```

- [ ] **Step 2: getVotesFeed — nested select with the 1:1 LEFT JOIN, teaser truncated in SQL**

Replace the `rows`/`page`/`nextBefore`/mapping section. The cursor MUST keep being built from the *vote* columns; the join is 1:1 (unique `voteItems.itemId`) so it cannot multiply rows, and ORDER BY + WHERE stay entirely on `knessetVotes`:

```ts
  const rows = await db
    .select({
      vote: knessetVotes,
      teaser: sql<string | null>`left(${voteItems.descriptionHe}, 280)`,
    })
    .from(knessetVotes)
    .leftJoin(voteItems, eq(voteItems.itemId, knessetVotes.itemId))
    .where(where)
    .orderBy(desc(knessetVotes.voteDate), desc(knessetVotes.voteId))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextBefore = rows.length > limit ? `${last.vote.voteDate.toISOString()}_${last.vote.voteId}` : null;

  const itemIds = [...new Set(page.map((r) => r.vote.itemId).filter((i): i is number => i != null))];
  // (siblingCounts block unchanged)
  return {
    votes: page.map(({ vote: v, teaser }) => ({
      ...v,
      descriptionTeaser: teaser,
      siblingCount: v.itemId != null ? Math.max(0, (siblingCounts.get(v.itemId) ?? 1) - 1) : 0,
    })),
    nextBefore,
  };
```

- [ ] **Step 3: getFeaturedVotes — same join, additive return type**

```ts
export async function getFeaturedVotes({
  db = defaultDb,
  sinceDays = 31,
  limit = 6,
}: { db?: DB; sinceDays?: number; limit?: number } = {}): Promise<(KnessetVoteRow & { descriptionTeaser: string | null })[]> {
  const since = new Date(Date.now() - sinceDays * 864e5);
  const rows = await db
    .select({ vote: knessetVotes, teaser: sql<string | null>`left(${voteItems.descriptionHe}, 280)` })
    .from(knessetVotes)
    .leftJoin(voteItems, eq(voteItems.itemId, knessetVotes.itemId))
    .where(and(eq(knessetVotes.featured, true), gte(knessetVotes.voteDate, since)))
    .orderBy(desc(knessetVotes.voteDate))
    .limit(limit);
  return rows.map(({ vote, teaser }) => ({ ...vote, descriptionTeaser: teaser }));
}
```

- [ ] **Step 4: getVoteDetail — 4th parallel read**

Add a 4th member to the existing `Promise.all` destructure (`const [breakdownRows, [rawCount], siblings, item] = await Promise.all([…])`):

```ts
    vote.itemId == null
      ? Promise.resolve(null)
      : db
          .select({ item: voteItems, initiator: politicians })
          .from(voteItems)
          .leftJoin(politicians, eq(politicians.personId, voteItems.initiatorPersonId))
          .where(eq(voteItems.itemId, vote.itemId))
          .limit(1)
          .then((rows): VoteItemDetail | null => rows[0] ?? null),
```

and add `item` to the returned object.

- [ ] **Step 5: Typecheck + existing tests**

`cd "$WT" && npx tsc --noEmit` → expect PASS. If a caller of `getVotesFeed`/`getFeaturedVotes`/`getVoteDetail` breaks, the change wasn't additive — fix the select-shape mapping, not the callers. Then `cd "$WT" && npx vitest run app/lib/votes` → all existing votes tests PASS.

- [ ] **Step 6: Commit**

```bash
cd "$WT" && git add app/lib/votes/read-repo.ts && git commit -m "feat(votes): read path joins vote_items — detail item bundle + feed teasers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Enrichment service + repo functions + integration tests

**Depends on Task 1 (`./docx`).**

**Files:**
- Modify: `$WT/app/lib/knesset/odata.ts` (KnsEntity union, :14-22)
- Create: `$WT/app/lib/votes/files-api.ts`
- Create: `$WT/app/lib/votes/enrich.ts`
- Modify: `$WT/app/lib/votes/repo.ts` (add `listEnrichmentCandidates`, `upsertVoteItem`, `VoteItemInsert`)
- Test: `$WT/app/lib/votes/enrich.integration.test.ts`
- Read first: `app/lib/votes/repo.ts`, `app/lib/knesset/{odata,normalize,repo}.ts`, `app/lib/votes/test-payloads-items.ts`, `app/lib/votes/pipeline.integration.test.ts` (mock pattern), `app/lib/votes/docx.ts`.

- [ ] **Step 1: Extend the OData entity union** (`app/lib/knesset/odata.ts`)

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
  | "KNS_Agenda"
  | "KNS_DocumentAgenda";
```

- [ ] **Step 2: files-api.ts — the fs.knesset.gov.il fetch boundary (mockable)**

```ts
// $WT/app/lib/votes/files-api.ts
// Binary download from fs.knesset.gov.il (official document store — publicly
// fetchable server-side; NEVER fetch main.knesset.gov.il pages, they sit
// behind the Radware bot challenge). Separate module so tests mock the
// boundary, not the enrichment logic.

import { logger } from "@/app/lib/logger";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchBinaryFile({
  url,
  retries = 2,
  retryDelayMs = 500,
}: {
  url: string;
  retries?: number;
  retryDelayMs?: number;
}): Promise<Uint8Array> {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= retries) {
        logger.error("votes.files.fetch_failed", { url, attempt, err: String(err) });
        throw err;
      }
      const backoff = retryDelayMs * Math.pow(2, attempt);
      logger.warn("votes.files.retry", { url, attempt, backoff, err: String(err) });
      await sleep(backoff);
      attempt += 1;
    }
  }
}
```

- [ ] **Step 3: repo additions** (append to `app/lib/votes/repo.ts`; import `voteItems` from `@/app/lib/schema` alongside the existing table imports, `ITEM_TYPE_AGENDA` next to the existing `ITEM_TYPE_BILL` import, and `isNull` from drizzle-orm)

```ts
export type VoteItemInsert = typeof voteItems.$inferInsert;

/**
 * Items (bills/agenda motions) seen on votes but not yet enriched — newest
 * vote first. Row-ABSENCE in vote_items IS the pending state (terminal-state-
 * by-existence): fetch failures leave no row and retry next run; a written
 * row (even links-only) is terminal and never re-fetched.
 */
export async function listEnrichmentCandidates({
  db, limit,
}: { db: DB; limit: number }): Promise<{ itemId: number; itemTypeId: number }[]> {
  const rows = await db
    .select({ itemId: knessetVotes.itemId, itemTypeId: knessetVotes.itemTypeId })
    .from(knessetVotes)
    .leftJoin(schema.voteItems, eq(schema.voteItems.itemId, knessetVotes.itemId))
    .where(and(
      inArray(knessetVotes.itemTypeId, [ITEM_TYPE_BILL, ITEM_TYPE_AGENDA]),
      isNull(schema.voteItems.itemId),
    ))
    .groupBy(knessetVotes.itemId, knessetVotes.itemTypeId)
    .orderBy(sql`max(${knessetVotes.voteDate}) desc`)
    .limit(limit);
  return rows
    .filter((r): r is { itemId: number; itemTypeId: number } => r.itemId != null && r.itemTypeId != null);
}

/**
 * Terminal write of one enriched item. The bills row (when given) lands FIRST
 * via the existing upsertBills helper — idempotent and harmless alone, and it
 * keeps billId FK-by-value resolvable for bills newer than the manual knesset
 * ingest. Then the vote_items row (upsert: re-running a backfill refreshes).
 */
export async function upsertVoteItem({
  db, row, bill,
}: { db: DB; row: VoteItemInsert; bill?: BillRow }): Promise<void> {
  if (bill) await upsertBills({ db, rows: [bill] });
  await db.insert(schema.voteItems).values(row).onConflictDoUpdate({
    target: schema.voteItems.itemId,
    set: {
      itemTypeId: sqlExcluded("itemTypeId"),
      descriptionHe: sqlExcluded("descriptionHe"), descriptionSource: sqlExcluded("descriptionSource"),
      legislationUrl: sqlExcluded("legislationUrl"), docUrl: sqlExcluded("docUrl"),
      docTypeDescHe: sqlExcluded("docTypeDescHe"), initiatorPersonId: sqlExcluded("initiatorPersonId"),
      sourceDataset: sqlExcluded("sourceDataset"), sourceUrl: sqlExcluded("sourceUrl"),
      fetchedAt: sqlExcluded("fetchedAt"),
    },
  });
}
```

Imports to add at the top of repo.ts: `import { upsertBills } from "@/app/lib/knesset/repo";`, `import type { BillRow } from "@/app/lib/knesset/normalize";`, extend the drizzle-orm import with `isNull`, extend the normalize import with `ITEM_TYPE_AGENDA`. If repo.ts would cross 500 lines, move these two functions + `VoteItemInsert` to a new `$WT/app/lib/votes/enrich-repo.ts` instead (same imports) and export from there.

- [ ] **Step 4: enrich.ts**

```ts
// $WT/app/lib/votes/enrich.ts
// Vote-item enrichment: official description + law links for the items behind
// plenum votes. OFFICIAL SOURCES ONLY (docs/decisions/vote-descriptions.md):
//   bills  → KNS_Bill.SummaryLaw, else דברי הסבר extracted VERBATIM from the
//            preliminary-reading DOCX; links to the National Legislation DB
//            page + the latest-stage official PDF.
//   agenda → motion text (דברי הסבר) from the KNS_DocumentAgenda DOCX + the
//            official PDF + the proposing MK (InitiatorPersonID = personId).
// Terminal-state-by-existence: fetch failures write NOTHING (retried next
// run); fetched-but-no-text items write a links-only row (explicit absence).

import { buildODataUrl, fetchAll } from "@/app/lib/knesset/odata";
import type { KnsAgenda, KnsBill, KnsDocumentAgenda, KnsDocumentBill } from "@/app/lib/knesset/odata-types";
import { normalizeBills } from "@/app/lib/knesset/normalize";
import { logger } from "@/app/lib/logger";
import { extractDocxText, extractExplanatoryNotes } from "./docx";
import { fetchBinaryFile } from "./files-api";
import { ITEM_TYPE_AGENDA, ITEM_TYPE_BILL } from "./normalize";
import {
  listEnrichmentCandidates, upsertVoteItem, type VoteItemInsert, type VotesDb,
} from "./repo";

/** National Legislation Database bill page (user-facing href ONLY — the host
 *  is Radware-protected against server-side fetches). Verified live 2026-06-12. */
export function buildLegislationUrl({ billId }: { billId: number }): string {
  return `https://main.knesset.gov.il/apps/legislation/main/bills/${billId}`;
}

/** KNS_Document* FilePath values can carry backslashes (verified live). */
export function normalizeDocPath({ filePath }: { filePath: string }): string {
  return filePath.replace(/\\/g, "/");
}

// Bill text stages, most decisive first: gazette publication > 2nd/3rd
// reading > 1st reading > preliminary. 59 (חומר רקע) and unknown ids are
// never linked as "the bill text".
const BILL_DOC_STAGE_RANK: Record<number, number> = { 9: 4, 4: 3, 2: 2, 1: 1 };
const AGENDA_MOTION_GROUP = 16; // נוסח הצעה לסדר היום (verified live)

export function pickLatestBillDoc({ docs }: { docs: KnsDocumentBill[] }): KnsDocumentBill | null {
  const ranked = docs
    .filter((d) => d.ApplicationDesc === "PDF" && BILL_DOC_STAGE_RANK[d.GroupTypeID] != null)
    .sort((a, b) => BILL_DOC_STAGE_RANK[b.GroupTypeID] - BILL_DOC_STAGE_RANK[a.GroupTypeID]);
  return ranked[0] ?? null;
}

export function pickPreliminaryDocx({ docs }: { docs: KnsDocumentBill[] }): KnsDocumentBill | null {
  return docs.find((d) => d.GroupTypeID === 1 && d.ApplicationDesc === "DOC") ?? null;
}

export function pickAgendaDoc({
  docs, application,
}: { docs: KnsDocumentAgenda[]; application: "DOC" | "PDF" }): KnsDocumentAgenda | null {
  return docs.find((d) => d.GroupTypeID === AGENDA_MOTION_GROUP && d.ApplicationDesc === application) ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface EnrichResult {
  candidates: number;
  enriched: number;
  failed: number;
}

/**
 * Enriches up to `limit` pending items (newest votes first). Per-item failure
 * isolation: a thrown item is logged + counted, the loop continues, and the
 * item retries next run (no vote_items row was written).
 */
export async function enrichVoteItems({
  db, limit = 30, throttleMs = 250,
}: { db: VotesDb; limit?: number; throttleMs?: number }): Promise<EnrichResult> {
  const candidates = await listEnrichmentCandidates({ db, limit });
  let enriched = 0;
  let failed = 0;
  for (const c of candidates) {
    try {
      if (c.itemTypeId === ITEM_TYPE_BILL) await enrichBillItem({ db, itemId: c.itemId });
      else await enrichAgendaItem({ db, itemId: c.itemId });
      enriched += 1;
    } catch (err) {
      failed += 1;
      logger.warn("votes.enrich.item_failed", { itemId: c.itemId, itemTypeId: c.itemTypeId, err: String(err) });
    }
    if (throttleMs > 0) await sleep(throttleMs);
  }
  if (candidates.length) logger.info("votes.enrich.done", { candidates: candidates.length, enriched, failed });
  return { candidates: candidates.length, enriched, failed };
}

/** Official text from a DOCX, or null — a fetched-but-unparseable document is
 *  a links-only TERMINAL row (explicit absence), never an endless retry. */
async function tryExtractNotes({ url, itemId }: { url: string; itemId: number }): Promise<string | null> {
  const file = await fetchBinaryFile({ url });
  try {
    const notes = extractExplanatoryNotes({ text: extractDocxText({ docx: file }) });
    if (!notes) logger.warn("votes.enrich.no_explanatory_notes", { itemId, url });
    return notes;
  } catch (err) {
    logger.warn("votes.enrich.docx_parse_failed", { itemId, url, err: String(err) });
    return null;
  }
}

async function enrichBillItem({ db, itemId }: { db: VotesDb; itemId: number }): Promise<void> {
  const sourceUrl = buildODataUrl({ entity: "KNS_Bill", filter: `BillID eq ${itemId}` });
  const [bills, docs] = await Promise.all([
    fetchAll<KnsBill>({ entity: "KNS_Bill", filter: `BillID eq ${itemId}` }),
    fetchAll<KnsDocumentBill>({ entity: "KNS_DocumentBill", filter: `BillID eq ${itemId}` }),
  ]);
  const bill = bills[0];
  if (!bill) throw new Error(`KNS_Bill ${itemId} not found`); // fetch-level → no row, retry next run

  const fetchedAt = new Date();
  let descriptionHe = bill.SummaryLaw?.trim() || null;
  let descriptionSource: VoteItemInsert["descriptionSource"] = descriptionHe ? "summary_law" : null;
  if (!descriptionHe) {
    const docx = pickPreliminaryDocx({ docs });
    if (docx) {
      const notes = await tryExtractNotes({ url: normalizeDocPath({ filePath: docx.FilePath }), itemId });
      if (notes) {
        descriptionHe = notes;
        descriptionSource = "explanatory_notes";
      }
    }
  }
  const latestDoc = pickLatestBillDoc({ docs });
  await upsertVoteItem({
    db,
    row: {
      itemId,
      itemTypeId: ITEM_TYPE_BILL,
      descriptionHe,
      descriptionSource,
      legislationUrl: buildLegislationUrl({ billId: itemId }),
      docUrl: latestDoc ? normalizeDocPath({ filePath: latestDoc.FilePath }) : null,
      docTypeDescHe: latestDoc?.GroupTypeDesc ?? null,
      initiatorPersonId: null,
      sourceDataset: "odata:KNS_Bill+KNS_DocumentBill",
      sourceUrl,
      fetchedAt,
    },
    bill: normalizeBills([bill], { sourceUrl, fetchedAt })[0],
  });
}

async function enrichAgendaItem({ db, itemId }: { db: VotesDb; itemId: number }): Promise<void> {
  const sourceUrl = buildODataUrl({ entity: "KNS_Agenda", filter: `AgendaID eq ${itemId}` });
  const [agendas, docs] = await Promise.all([
    fetchAll<KnsAgenda>({ entity: "KNS_Agenda", filter: `AgendaID eq ${itemId}` }),
    fetchAll<KnsDocumentAgenda>({ entity: "KNS_DocumentAgenda", filter: `AgendaID eq ${itemId}` }),
  ]);
  const agenda = agendas[0];
  if (!agenda) throw new Error(`KNS_Agenda ${itemId} not found`);

  const fetchedAt = new Date();
  const motionDocx = pickAgendaDoc({ docs, application: "DOC" });
  const descriptionHe = motionDocx
    ? await tryExtractNotes({ url: normalizeDocPath({ filePath: motionDocx.FilePath }), itemId })
    : null;
  const motionPdf = pickAgendaDoc({ docs, application: "PDF" });
  await upsertVoteItem({
    db,
    row: {
      itemId,
      itemTypeId: ITEM_TYPE_AGENDA,
      descriptionHe,
      descriptionSource: descriptionHe ? "motion_text" : null,
      legislationUrl: null, // the legislation DB covers bills only
      docUrl: motionPdf ? normalizeDocPath({ filePath: motionPdf.FilePath }) : null,
      docTypeDescHe: motionPdf?.GroupTypeDesc ?? null,
      initiatorPersonId: agenda.InitiatorPersonID ?? null,
      sourceDataset: "odata:KNS_Agenda+KNS_DocumentAgenda",
      sourceUrl,
      fetchedAt,
    },
  });
}
```

(If Step 3 moved the repo fns to `enrich-repo.ts`, import from there; `VotesDb` stays from `./repo`.)

- [ ] **Step 5: Typecheck** — `cd "$WT" && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Write the integration tests**

```ts
// $WT/app/lib/votes/enrich.integration.test.ts
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
```

- [ ] **Step 7: Run** — `cd "$WT" && npx vitest run app/lib/votes/enrich.integration.test.ts` → PASS (7 tests). Also `npx vitest run app/lib/votes` → everything still green.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add app/lib/knesset/odata.ts app/lib/votes/files-api.ts app/lib/votes/enrich.ts app/lib/votes/repo.ts app/lib/votes/enrich.integration.test.ts app/lib/votes/enrich-repo.ts 2>/dev/null; cd "$WT" && git commit -m "feat(votes): vote-item enrichment — official descriptions + law links from OData/DOCX

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: UI — VoteDescription component, detail page, feed teaser, skeletons

**Depends on Task 2 (read path types).**

**Files:**
- Create: `$WT/components/vote-description.tsx`
- Create: `$WT/components/vote-description.stories.tsx`
- Modify: `$WT/app/vote/[id]/page.tsx` (render between the meta line and StanceWidget)
- Modify: `$WT/components/vote-row.tsx` (one-line teaser under the title)
- Modify: the `/votes` feed page + any VoteRow call sites passing FeedVote (grep `VoteRow` usages)
- Modify: `$WT/components/skeletons/votes-skeletons.tsx` + `$WT/components/skeletons/skeletons.stories.tsx`
- Read first: `app/vote/[id]/page.tsx` IN FULL (match its card/section classes exactly), `components/vote-row.tsx`, `components/recent-votes-rail.tsx` (line-clamp precedent), `components/skeletons/votes-skeletons.tsx`, an existing `*.stories.tsx` for CSF conventions, and `app/lib/votes/read-repo.ts` for `VoteItemDetail`/`FeedVote`.

- [ ] **Step 1: VoteDescription component (RSC — no client JS)**

```tsx
// $WT/components/vote-description.tsx
// Official item context for a vote: collapsible description (native <details>,
// zero client JS) + always-visible official links. Sources are OFFICIAL ONLY
// (SummaryLaw / extracted דברי הסבר / motion text) — the attribution line names
// which. An item with no official text renders the links block alone.

import Link from "next/link";
import type { VoteItemDetail } from "@/app/lib/votes/read-repo";

const SOURCE_LABEL: Record<string, string> = {
  summary_law: "התקציר הרשמי, מאגר החקיקה הלאומי",
  explanatory_notes: "דברי ההסבר מתוך נוסח הצעת החוק הרשמי",
  motion_text: "דברי ההסבר מתוך נוסח ההצעה לסדר היום",
};

export function VoteDescription({ item }: { item: VoteItemDetail }) {
  const { item: row, initiator } = item;
  const hasDescription = row.descriptionHe != null && row.descriptionSource != null;
  const hasLinks = row.legislationUrl != null || row.docUrl != null || initiator != null;
  if (!hasDescription && !hasLinks) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      {hasDescription ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            על מה ההצבעה?
            <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {row.descriptionHe}
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70">{SOURCE_LABEL[row.descriptionSource!]}</p>
        </details>
      ) : null}
      {hasLinks ? (
        <div className={hasDescription ? "mt-3 border-t border-border pt-3" : undefined}>
          <ul className="flex flex-col gap-1 text-sm">
            {row.legislationUrl ? (
              <li>
                <a href={row.legislationUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  לדף הצעת החוק במאגר החקיקה הלאומי
                </a>
              </li>
            ) : null}
            {row.docUrl ? (
              <li>
                <a href={row.docUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {row.docTypeDescHe ? `לנוסח הרשמי (PDF) — ${row.docTypeDescHe}` : "לנוסח הרשמי (PDF)"}
                </a>
              </li>
            ) : null}
            {initiator ? (
              <li className="text-muted-foreground">
                הוגשה על ידי{" "}
                <Link href={`/politician/${initiator.personId}`} className="text-primary hover:underline">
                  {initiator.nameHe}
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
```

**IMPORTANT:** before writing, read `app/vote/[id]/page.tsx` and match the EXACT card wrapper classes its other sections use (the totals card / breakdown card) instead of the `rounded-2xl border border-border bg-card p-4` guess above, and reuse its link styling if a convention exists. Check the politician route segment actually is `/politician/[personId]` (grep `politician/` in `app/`); fix the href if it differs. If the codebase has a chevron icon component (grep `lucide-react` usage, e.g. `ChevronDown`), use it with the existing RTL-flip conventions instead of the `⌄` glyph; rotation via `group-open:rotate-180` works for both.

- [ ] **Step 2: Wire into the detail page**

In `$WT/app/vote/[id]/page.tsx`, the loader already returns `detail.item` (Task 2). Render right after the title/meta block and BEFORE the StanceWidget block (the widget intentionally sits before the outcome; the official description informs that opinion — keep that order):

```tsx
{detail.item ? <VoteDescription item={detail.item} /> : null}
```

Match surrounding spacing (the page's section gap classes). Import `VoteDescription` with the page's existing import style.

- [ ] **Step 3: Feed teaser in VoteRow**

In `$WT/components/vote-row.tsx`: the row already receives a vote object — extend its props with the teaser and render ONE clamped line under the title, only when present (precedent: `line-clamp-2` in `recent-votes-rail.tsx`):

```tsx
{vote.descriptionTeaser ? (
  <p className="line-clamp-1 text-xs text-muted-foreground">{vote.descriptionTeaser}</p>
) : null}
```

If `VoteRow`'s prop type is `FeedVote` (from read-repo) this is type-safe already; if it takes `KnessetVoteRow`, widen the prop to accept `descriptionTeaser?: string | null` and update call sites that pass featured votes (Task 2 made `getFeaturedVotes` return the teaser too). Grep every `<VoteRow` usage and make sure each passes a vote that carries the field (or omits it harmlessly).

- [ ] **Step 4: Skeletons in lockstep**

In `$WT/components/skeletons/votes-skeletons.tsx`: add a description-card placeholder to the vote-detail skeleton between the title/meta placeholder and the stance/totals placeholders (a `h-12` rounded card bar matching the new section's silhouette); nudge the feed-row skeleton to include the teaser line (one extra `h-3` bar). Mirror the exact class/structure conventions already in that file. Update `skeletons.stories.tsx` ONLY if it enumerates skeleton variants explicitly (read it; if stories render the skeleton components directly, no change needed).

- [ ] **Step 5: Stories**

```tsx
// $WT/components/vote-description.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { VoteDescription } from "./vote-description";

const meta = {
  title: "Votes/VoteDescription",
  component: VoteDescription,
} satisfies Meta<typeof VoteDescription>;
export default meta;
type Story = StoryObj<typeof meta>;

const baseItem = {
  id: "00000000-0000-0000-0000-000000000001",
  itemId: 2229413,
  itemTypeId: 2,
  descriptionHe: "מטרת החוק היא להכיר בשפת הסימנים הישראלית, על ידי הסמכת האקדמיה ללשון העברית לשמר, לפתח ולקדם את שפת הסימנים הישראלית. שר התרבות והספורט ממונה על ביצוע החוק.",
  descriptionSource: "summary_law" as const,
  legislationUrl: "https://main.knesset.gov.il/apps/legislation/main/bills/2229413",
  docUrl: "https://fs.knesset.gov.il/25/law/25_lsr_13479239.pdf",
  docTypeDescHe: "חוק - פרסום ברשומות",
  initiatorPersonId: null,
  sourceDataset: "odata:KNS_Bill+KNS_DocumentBill",
  sourceUrl: "https://example.test",
  fetchedAt: new Date("2026-06-12T00:00:00Z"),
};

export const BillWithSummary: Story = {
  args: { item: { item: baseItem, initiator: null } },
};

export const LinksOnly: Story = {
  args: { item: { item: { ...baseItem, descriptionHe: null, descriptionSource: null }, initiator: null } },
};

export const LongExplanatoryNotes: Story = {
  args: {
    item: {
      item: {
        ...baseItem,
        descriptionSource: "explanatory_notes" as const,
        descriptionHe: Array.from({ length: 6 }, () => "סעיף 22א לחוק זכויות נפגעי עבירה עוסק בנטילת דגימות פורנזיות מנפגעי עבירות מין ובשמירתן.").join("\n"),
      },
      initiator: null,
    },
  },
};
```

For the agenda+initiator story, the `initiator` value must satisfy the `politicians.$inferSelect` type — read `app/lib/schema.ts`'s politicians table and build a full row literal (all columns) in the story; if that's unwieldy, type the story input via a `satisfies` cast of the minimal real shape. Follow `storybook-stories` conventions used by neighboring story files (decorators, rtl, parameters).

- [ ] **Step 6: Verify** — `cd "$WT" && npx tsc --noEmit` → PASS; `cd "$WT" && pnpm lint` → PASS (fix what it flags in YOUR files only).

- [ ] **Step 7: Commit**

```bash
cd "$WT" && git add components/vote-description.tsx components/vote-description.stories.tsx components/vote-row.tsx components/skeletons/ app/vote app/votes && git commit -m "feat(votes): vote description UI — collapsible official text + law links + feed teasers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Service wiring + backfill script

**Depends on Task 3.**

**Files:**
- Modify: `$WT/app/lib/votes/service.ts` (step 2.5 + `IngestVotesResult`)
- Modify: `$WT/app/lib/votes/pipeline.integration.test.ts` (mock the new external boundaries)
- Create: `$WT/scripts/enrich-vote-items.ts`
- Modify: `$WT/package.json` (one script line)
- Read first: `app/lib/votes/service.ts` IN FULL, `scripts/ingest-votes.ts` (the prod-deliberate pattern to mirror), `app/lib/votes/enrich.ts`, `app/lib/db-utils.ts` (chunk).

- [ ] **Step 1: Extend IngestVotesResult + wire the post-pass**

In `service.ts`:

```ts
export interface IngestVotesResult {
  headers: number;
  detailsFetched: number;
  detailsFailed: number;
  attributed: number;
  queued: number;
  itemsEnriched: number;
  itemsFailed: number;
}
```

Add the import `import { enrichVoteItems } from "./enrich";` and, between the detail loop (after the `for (const voteId of targetIds)` block) and `// 3) decisive recompute`:

```ts
  // 2.5) enrich the items behind the swept votes (official description + law
  // links → vote_items). Failure-isolated: enrichment must NEVER fail the vote
  // ingest or block the heartbeat — vote-row completeness outranks context.
  let itemsEnriched = 0;
  let itemsFailed = 0;
  try {
    const er = await enrichVoteItems({ db });
    itemsEnriched = er.enriched;
    itemsFailed = er.failed;
  } catch (err) {
    logger.error("votes.enrich.run_failed", { err: String(err) });
  }
```

and extend the result object: `const result = { headers: headerRows.length, detailsFetched, detailsFailed, attributed, queued, itemsEnriched, itemsFailed };`

- [ ] **Step 2: Keep the pipeline tests offline**

`pipeline.integration.test.ts` calls `ingestVotes`, which now reaches `enrichVoteItems` → real OData/file fetches. Mock the SAME external boundaries as `enrich.integration.test.ts` (top of file, alongside the existing website-api mock):

```ts
vi.mock("@/app/lib/knesset/odata", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/app/lib/knesset/odata")>();
  return { ...mod, fetchAll: vi.fn(async () => []) }; // enrich finds nothing → links-less items fail per-item, ingest unaffected
});
vi.mock("./files-api", () => ({ fetchBinaryFile: vi.fn(async () => { throw new Error("offline"); }) }));
```

Then run the file; if an assertion counts on the result object shape (e.g. `toEqual` on the whole result), extend expectations with `itemsEnriched`/`itemsFailed` numbers. Add ONE new assertion to the existing idempotency test: after `ingestVotes`, `result.itemsFailed` is ≥ 0 and the run completed (heartbeat present) — proving enrichment failures don't break ingest.

- [ ] **Step 3: Run** — `cd "$WT" && npx vitest run app/lib/votes/pipeline.integration.test.ts` → PASS.

- [ ] **Step 4: Backfill script**

```ts
// $WT/scripts/enrich-vote-items.ts
// One-off/maintenance backfill for vote_items — classify legacy votes'
// itemTypeId (details are `complete`, so the ingest never refills them), then
// drain the enrichment queue.
//
//   pnpm enrich:vote-items                       # classify + drain
//   pnpm enrich:vote-items -- --classify-only    # phase 1 only
//   pnpm enrich:vote-items -- --skip-classify    # phase 2 only
//   pnpm enrich:vote-items -- --limit=50         # per-pass enrichment batch
//
// PREREQUISITE: a fresh bills table (run `pnpm ingest:knesset` first) — phase 1
// classifies bill votes by bills-table membership.

import { sql } from "drizzle-orm";
import { assertNonProductionDb } from "@/app/lib/db-guards";
import { db } from "@/app/lib/db";
import { chunk } from "@/app/lib/db-utils";
import { logger } from "@/app/lib/logger";
import { fetchAll } from "@/app/lib/knesset/odata";
import type { KnsAgenda } from "@/app/lib/knesset/odata-types";
import { enrichVoteItems } from "@/app/lib/votes/enrich";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function classify(): Promise<void> {
  // bills: membership in the (freshly ingested) bills table
  const billsRes = await db.execute(sql`
    update knesset_votes v set "itemTypeId" = 2
    from bills b
    where v."itemId" = b."billId" and v."itemTypeId" is null
  `);
  logger.info("votes.enrich.classified_bills", { rows: billsRes.rowCount ?? 0 });

  // agenda motions: K25 KNS_Agenda ids (a few thousand — pages fine)
  const agendas = await fetchAll<KnsAgenda>({ entity: "KNS_Agenda", filter: "KnessetNum eq 25" });
  let agendaRows = 0;
  for (const batch of chunk(agendas.map((a) => a.AgendaID), 500)) {
    const res = await db.execute(sql`
      update knesset_votes set "itemTypeId" = 4
      where "itemTypeId" is null and "itemId" in (${sql.join(batch.map((id) => sql`${id}`), sql`, `)})
    `);
    agendaRows += res.rowCount ?? 0;
  }
  logger.info("votes.enrich.classified_agendas", { agendas: agendas.length, rows: agendaRows });

  // legacy billId fill under the new rule
  const billIdRes = await db.execute(sql`
    update knesset_votes set "billId" = "itemId" where "itemTypeId" = 2 and "billId" is null
  `);
  logger.info("votes.enrich.billid_filled", { rows: billIdRes.rowCount ?? 0 });

  // explicit absence: whatever stays NULL (no-confidence, secret-vote items, …) is never enriched
  const [left] = (await db.execute(sql`
    select count(*)::int as n from knesset_votes where "itemTypeId" is null and "itemId" is not null
  `)).rows as { n: number }[];
  logger.info("votes.enrich.unclassified_left", { rows: left?.n ?? 0 });
}

async function main() {
  assertNonProductionDb(); // FIRST — house rule (NB: the single prod DB passes; runs are deliberate + idempotent)

  if (!flag("skip-classify")) await classify();
  if (flag("classify-only")) {
    process.exit(0);
  }

  const limit = Number(arg("limit") ?? 50);
  let idlePasses = 0;
  for (;;) {
    const r = await enrichVoteItems({ db, limit });
    logger.info("votes.enrich.backfill_pass", r);
    if (r.candidates === 0) break;
    // every remaining candidate failing repeatedly (dead doc URLs etc.) would
    // loop forever — three all-fail passes aborts loudly instead
    idlePasses = r.enriched === 0 ? idlePasses + 1 : 0;
    if (idlePasses >= 3) {
      logger.error("votes.enrich.backfill_stuck", { failing: r.failed });
      process.exit(1);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  logger.error("votes.enrich.backfill_failed", { err: String(err) });
  process.exit(1);
});
```

NB: check `db.execute(...)` result shape against an existing usage in the repo (grep `db.execute`); if the postgres-js driver returns rows directly (no `.rowCount`), log `res.length ?? 0`-style instead — match whatever an existing script does, and make the `left?.n` read match too.

- [ ] **Step 5: package.json** — add to scripts, next to `ingest:votes`:

```json
"enrich:vote-items": "tsx --env-file=.env scripts/enrich-vote-items.ts",
```

- [ ] **Step 6: Verify** — `cd "$WT" && npx tsc --noEmit` → PASS; `cd "$WT" && npx vitest run app/lib/votes` → ALL votes suites PASS; `cd "$WT" && pnpm lint` → PASS for your files.

- [ ] **Step 7: Commit**

```bash
cd "$WT" && git add app/lib/votes/service.ts app/lib/votes/pipeline.integration.test.ts scripts/enrich-vote-items.ts package.json && git commit -m "feat(votes): enrichment post-pass in ingest + vote-items backfill script

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## NOT for subagents (main session, after all tasks)

- Apply migration 0025 to prod, run the supervised backfill, browser QA (46082 bill / 46083 agenda / summary-law vote / links-only / no-confidence), `/log-decisions` (`docs/decisions/vote-descriptions.md`), CLAUDE.md + skills refresh, `pnpm preflight`, `/code-review`, push.
