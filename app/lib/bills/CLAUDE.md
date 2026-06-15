# app/lib/bills — Bill detail + enacted-law context

Read-side for the bill page (`/bill/[billId]`): one K25 bill with its status, initiators, official documents, the decisive plenum vote, the **enacted law(s)** it became (+ official topic tags), and its **split parent**. Bills are INGESTED by `scripts/ingest-knesset.ts` (via `app/lib/knesset/`), not here. Full OData reference: the `knesset-odata` skill · decisions: `docs/decisions/knesset-data.md`.

## Files

- `repo.ts` — `getBillById` → `BillDetail` (status, initiators, docs, linkedVote, `enactedLaws[]`, `splitParent`). The only read.
- `external.ts` — `knessetBillUrl(billId)` — canonical public bill page (`main.knesset.gov.il/apps/legislation/main/bills/<id>`); WAF'd, never curl it.
- `repo.test.ts` — PGlite integration (real tables, behavior assertions).

Renders in `app/bill/[billId]/page.tsx`; UI: `components/{enacted-law-panel,bill-lineage,badges(TopicBadge)}.tsx`. Schema (`app/lib/schema.ts`): `bills`, `billStatuses`, `billSponsors`, `billDocuments`, `israelLaws`, `israelLawTopics`, `israelLawBills`, `billSplits`.

## Invariants

- **Resolve by stable id.** Joins on `billId`/`israelLawId`/`personId` only — never Hebrew strings.
- **Enacted law ↔ bill = `KNS_IsraelLawName.LawID = KNS_Bill.BillID`** (verified 12/12 K25). Many-to-many: a bill yields several laws (budget bills do), a law amends several bills → `israelLawBills` junction; `enactedLaws` is an ARRAY; topic tags deduped per law.
- **Topic tags are enacted-LAWS-only** (`israelLawTopics` ← `KNS_IsraelLawClassificiation`, the only topic taxonomy the service has). Most bills/votes never become law, so there is no bill/vote-level topic facet.
- **Split lineage**: a bill that is a `bill_splits.splitBillId` shows its parent (`mainBillId`); the child holds **0 own initiators** — the parent carries them. `BillLineage` is linked on this page, plain text inside agenda cards (no nested `<a>`).
- **Absent = absent**: no enacted law → `enactedLaws: []`; not a split child → `splitParent: null`. Never guessed.

## Gotchas

- `israelLaws.validityDesc`: `תקף` = in force (positive chip); `בטל`/`פקע`/`נושן` = no longer (neutral). `null` → no chip.
- `enactedLaws` orders by `publicationDate DESC NULLS LAST` (raw SQL — Drizzle `desc()` is NULLS FIRST in Postgres).
- Split parent may be a non-K25 bill; the read `innerJoin` drops it (→ no lineage) until `lifetimeBills` ingests it — graceful, not a bug.
