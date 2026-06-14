# Bill pages & lifetime backfill — design spec

**Date:** 2026-06-13
**Status:** Approved (brainstorm) — ready for implementation plan
**Branch base:** `main` (current work on `feat/politician-activity-counts`)
**Related:** `knesset-odata` skill · `knesset-votes` skill · `docs/decisions/knesset-data.md` · `docs/superpowers/specs/2026-06-10-knesset-votes-mk-matching.md`

---

## Problem Statement

On a politician page, the "פעילות פרלמנטרית" block shows a big lifetime bill count (e.g. ישראל כץ — 244 הצעות חוק) but **no "הצעות חוק אחרונות" list**, while an MK with far fewer bills (גדי איזנקוט — 5) *does* show one. The reason: the headline count is a stored lifetime figure, but the recent-bills list is built only from **K25 bill rows we store locally** — and Katz has 0 bills in K25 (all 244 are from earlier Knessets, kept as counts only). On top of that, the bills that *do* render are **plain text — not clickable**, so a user can't reach the actual proposal. The page promises parliamentary activity but dead-ends on it.

## Goals

1. **Every current MK with bills shows a recent-bills list**, including ex-ministers / Speakers whose work predates K25 (close the כץ gap) — measured by: 0 sitting MKs with `billsLifetime > 0` and an empty recent list.
2. **Each listed bill is reachable** — it links to an internal bill page that shows official data and the actual bill text, with a path out to the Knesset source.
3. **Bill data is stored once, completely** — re-rendering or adding bill features never requires re-hitting the OData service for the same bills (store all useful KNS_Bill fields + documents + status).
4. **The current Knesset is visually distinguished** from earlier ones on the politician page ("כנסת 25" vs "כנסות קודמות").
5. **Don't rebuild what exists** — a bill that already reached a plenum vote reuses the existing vote + עמדה (stance) widget rather than a new voting surface.

## Non-Goals

1. **Pro/against voting on *pending/future* bills** — that is the planned **"P1 pre-voting"** feature (schema already reserves `agenda_items.billId` / `linkedVoteId`). Out of scope here; gets its own spec. *Why:* it needs resolution semantics and overlaps the markets/stances systems — genuinely separate.
2. **A prose summary on every bill** — `SummaryLaw` exists for only ~6.5% of bills (488/7434 in K25). We surface it when present but do not synthesize or scrape descriptions. *Why:* the data isn't there and inferring it violates the sourcing rule.
3. **Ingesting all bills for all MKs ever** — backfill is bounded to **bills sponsored by the ~120 current MKs** (via per-MK `KNS_BillInitiator`), not the full ~hundreds-of-thousands-of-rows bill corpus. *Why:* unbounded cost for no card-page value.
4. **Bill status workflow / history timeline** — we store the current status (human-readable) but do not model reading-by-reading history. *Why:* not needed to reach the proposal; revisit if a bill page warrants it.
5. **Editing or moderating bill data** — read-only from OData. *Why:* it's official system-of-record data.

## Users & Stories

- **As a visitor on a politician page,** I want to see that MK's recent bills *even if their career predates K25*, so the activity block isn't empty for veterans.
- **As a visitor,** I want to click a bill and land on a page with its official details and the actual bill text, so I can understand what it is without leaving for a broken/WAF'd search page.
- **As a visitor on a bill page,** I want to see who initiated it (and jump to their politician pages), what type it is (פרטית/ממשלתית/ועדה), its current status, and — if it was voted on — the result, so I get the full official picture.
- **As a visitor,** I want the current Knesset's bills separated from older ones, so recency is obvious.
- **As a returning user on a bill that was already voted,** I want to set my עמדה (בעד/נגד) using the same widget I already know from the vote page.

## Approach (architecture)

Layered as per project rules: ingest script → repo → page. No new external dependency; reuse `app/lib/knesset/odata.ts` (`PARLIAMENT_BASE`, `buildODataUrl`, `fetchAll`, encoding discipline).

### Data model changes (`app/lib/schema.ts`)

**Widen `bills`** to retain everything useful from `KNS_Bill` (store once, never re-ingest). Add to the existing table:

| Column | Source (`KNS_Bill.*`) | Notes |
|---|---|---|
| `subTypeId` | `SubTypeID` | already have `subTypeDesc` |
| `privateNumber` | `PrivateNumber` | nullable |
| `committeeId` | `CommitteeID` | nullable |
| `number` | `Number` | nullable |
| `publicationDate` | `PublicationDate` | nullable (often null for in-progress) |
| `summaryLaw` | `SummaryLaw` | nullable; rendered only when present |
| `isContinuationBill` | `IsContinuationBill` | nullable boolean |
| `publicationSeriesDesc` | `PublicationSeriesDesc` | nullable |
| `lastUpdatedDate` | `LastUpdatedDate` | drives freshness/ordering |

Keep existing `billId`, `knessetNum`, `nameHe`, `statusId`, provenance triplet. **`knessetNum` stays the per-bill Knesset tag** (the "which Knesset" the user asked for).

**New table `bill_documents`** — the official bill-text links (`KNS_DocumentBill`):

```
bill_documents
  id            uuid pk
  documentBillId bigint   -- KNS_DocumentBill.DocumentBillID (Int64) — natural key
  billId        integer   -- -> bills.billId (FK-by-value)
  groupTypeId   integer   -- GroupTypeID
  groupTypeDesc text      -- GroupTypeDesc (e.g. "הצעת חוק לדיון מוקדם")
  format        text      -- ApplicationDesc ("PDF" | "DOC")
  filePath      text      -- fs.knesset.gov.il URL (verified reachable, NOT WAF'd)
  lastUpdatedDate timestamp
  + sourceDataset / sourceUrl / fetchedAt
  unique(documentBillId, format)   -- one DocumentBillID carries both PDF + DOC rows
  index on billId
```

**New table `bill_statuses`** — small `KNS_Status` lookup so the page shows readable status instead of a numeric code:

```
bill_statuses
  statusId   integer pk    -- KNS_Status.StatusID
  descHe     text          -- KNS_Status.Desc
  + provenance triplet
```

(All indexes declared in-schema — `db:push` drops migration-only indexes. Schema change updates schema + test-DB DDL + seed helpers + fixtures in lockstep.)

### Ingest (extend the per-MK activity step)

The activity-counts ingest already loops the ~120 current MKs making four `$inlinecount` calls each. Add a **bill-rows pass** to the same loop:

1. Per current MK: `KNS_BillInitiator?$filter=PersonID eq <personId>&$expand=KNS_Bill`, paged to exhaustion via `fetchAll` (resolves `odata.nextLink`).
2. Upsert each expanded `KNS_Bill` into `bills` (all columns above) and each initiator into `bill_sponsors` — **lifetime, dropping the K25 `validBillIds` filter** in the bill/sponsor normalize path for this pass.
3. After bills land, fetch `KNS_DocumentBill?$filter=BillID eq <billId>` for the touched bills (batched) → upsert `bill_documents`. (Or per-MK `$expand=KNS_Bill/KNS_DocumentBills` if verified to page correctly — confirm at build time.)
4. Refresh `bill_statuses` from `KNS_Status` once per run (tiny).

Bounded (~120 MKs; heaviest is ~500 bills), idempotent upserts, provenance on every row. Encoding via `buildODataUrl` (spaces `%20`, never `+`).

### Read path (`app/lib/politicians/repo.ts` + new `app/lib/bills/repo.ts`)

- `getPoliticianActivity().recentBills` join now returns lifetime rows for everyone. Return enough to **group by Knesset**: most-recent K25 bills and most-recent earlier bills (ordering `knessetNum desc, billId desc`). Keep the existing lifetime/current count behavior untouched.
- New `getBillById({ billId })` in `app/lib/bills/repo.ts`: the bill row + its initiators (join `bill_sponsors` → `politicians`, ordered initiator-first then `ordinal`) + documents + human status + linked decisive vote (`knessetVotes` where `billId` matches, decisive).

### Pages / UI

**`/bill/[billId]`** (new RSC page; named skeleton in `components/skeletons/`, container/grid class shared via `containers.ts`):
- Header: `nameHe`, type (`subTypeDesc`), human status (`bill_statuses.descHe`), `knessetNum`, `publicationDate` when present.
- **Initiators**: each MK linked to `/politician/[personId]` (primary initiator marked).
- **Official documents**: links to the `fs.knesset.gov.il` PDF/DOC (`target="_blank" rel="noopener"`, external-link affordance, RTL-correct icon flip).
- `summaryLaw` block when present.
- **External source**: link to the Knesset bill page — `https://main.knesset.gov.il/Activity/Legislation/Laws/Pages/LawBill.aspx?t=lawsuggestionssearch&lawitemid={billId}`. **This exact pattern MUST be verified in a real browser (Chrome MCP) before merge** — the page sits behind a Reblaze/`kramericaindustries` WAF that returns a 477-byte JS challenge to curl, so it cannot be auto-checked. If the pattern is wrong, capture the correct one from the live site.
- **If a decisive vote exists** for this bill: show the official result and link to `/vote/[id]` (where the existing `StanceWidget` lives). No new voting UI here.
- Provenance line: "נתונים ממקור רשמי · הכנסת (OData)".

**Politician page (`app/politician/[id]/page.tsx`)**:
- Recent-bill `<li>`s become `Link`s to `/bill/[billId]` (the internal page), matching the recent-votes row styling already on the page.
- **Group "כנסת 25" vs "כנסות קודמות"** with subheadings; everyone (Katz included) now renders a list.

## Data integrity / sourcing

- Provenance triplet (`sourceDataset`, `sourceUrl`, `fetchedAt`) on every ingested row, per the trust backbone.
- Bills/initiators resolved by **stable numeric id** (`BillID`, `PersonID`), never Hebrew string.
- The external link is derived from a **verified** public-URL pattern + the stable `billId` — not inferred per-bill, not fuzzy. Absent data (no documents, null summary) shows an explicit empty state, never a guess.
- `$inlinecount`/`fetchAll` paging and the `%20` encoding rule are reused from the existing client (don't re-roll).

## Testing

- PGlite integration test: lifetime backfill populates `bills`/`bill_sponsors` for an MK with 0 K25 bills; `recentBills` then returns rows grouped across Knessets (extend `app/lib/politicians/activity.test.ts`).
- `getBillById` returns initiators ordered correctly, documents, human status, and a linked decisive vote when present; empty states when not.
- Normalize unit tests for the widened `KNS_Bill` → row mapping and `KNS_DocumentBill` → `bill_documents` (PDF+DOC pair under one `DocumentBillID`).
- Skeleton story for `/bill/[billId]` reviewed against the real page.

## Requirements

### Must-Have (P0)
- **P0-1 Lifetime backfill** — ingest stores lifetime bills + sponsors for current MKs.
  - *Given* a sitting MK with `billsLifetime > 0` and 0 K25 bills, *when* their page renders, *then* a recent-bills list appears.
- **P0-2 Store-everything** — `bills` widened + `bill_documents` + `bill_statuses` populated with provenance; re-render needs no OData call.
- **P0-3 Internal bill page** — `/bill/[billId]` shows name, type, human status, Knesset, initiators (linked), official document link(s), and external Knesset link.
- **P0-4 Clickable rows** — politician-page recent bills link to `/bill/[billId]`.
- **P0-5 Knesset separation** — recent bills grouped "כנסת 25" vs "כנסות קודמות".
- **P0-6 External URL verified in a real browser** before merge.

### Nice-to-Have (P1)
- **P1-1** Surface the decisive-vote result + `/vote/[id]` link on the bill page when one exists.
- **P1-2** `summaryLaw` rendered when present.

### Future Considerations (P2 — design-aware, not built)
- **P2-1 Pre-voting on pending bills** ("P1 pre-voting" feature) — the `/bill/[billId]` page is the host surface; `agenda_items.billId`/`linkedVoteId` already reserved. Keep the bill page's layout open to a voting section.

## Success Metrics
- **Leading:** 0 sitting MKs with `billsLifetime > 0` and an empty recent list (data check); bill-page views > 0 within a week (PostHog); bill-row click-through rate on politician pages.
- **Lagging:** reduced bounce from politician → bill; bill pages become the entry point measured for the later pre-voting feature.

## Open Questions
- **[engineering]** Documents pass: per-bill `KNS_DocumentBill?$filter=BillID eq …` (batched) vs `$expand=KNS_Bill/KNS_DocumentBills` in the per-MK call — pick whichever pages correctly without N+1. *Non-blocking; resolve at build.*
- **[engineering]** Exact public bill-page URL `t=` param — verify `lawsuggestionssearch` in-browser; capture correct value if different. *Blocking for P0-6 only.*
- **[engineering/data]** Backfill execution: `.env DATABASE_URL` is production with no dev DB; run the bounded backfill as a guarded one-off (`assertNonProductionDb` won't catch the Neon host — coordinate manually). *Blocking for the data step.*
- **[design]** Recent-bills cap per Knesset group on the politician page (e.g. 5 + "all bills" affordance vs fixed 6). *Non-blocking.*

## Timeline / Phasing
1. Schema widen + new tables (+ test DDL/fixtures in lockstep).
2. Ingest extension (bill rows + documents + status) — guarded backfill run.
3. `app/lib/bills/repo.ts` + `getPoliticianActivity` grouping.
4. `/bill/[billId]` page + skeleton; politician-page links + Knesset grouping.
5. Browser-verify external URL; lint + typecheck + tests; `/code-review` before push.

*Then, separately:* brainstorm the **P1 pre-voting** spec.
