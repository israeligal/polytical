# Key Decisions: Vote Descriptions & Law Links

### ~67% of agenda motions ship links-only — heading-bound extraction is a deliberate tradeoff (2026-06-13, feat/vote-bill-context)
The production backfill yielded motion text for 113/338 agenda items; the rest have no `דברי הסבר` heading in their DOCX (older/variant templates). We extract by heading only — a heuristic "body minus preamble" fallback risks shipping procedural boilerplate as if it were the official description, which violates the verbatim-or-nothing rule. Those rows are links-only TERMINAL (won't auto-heal); if v2 adds a smarter fallback, re-enrich agendas with `delete from vote_items where "itemTypeId" = 4 and "descriptionHe" is null` and re-run the drain.

### Official text only — no AI summaries, no PDF parsing in v1 (2026-06-12, feat/vote-bill-context)
A vote's description comes exclusively from official sources: `KNS_Bill.SummaryLaw` (only 488/7,434 K25 bills, mostly enacted laws), else דברי הסבר extracted VERBATIM from the preliminary-reading DOCX (`KNS_DocumentBill` GroupTypeID 1 — DOC exists for ~every preliminary doc; first/second-reading docs are PDF-only). PDF-only (mostly government) bills get links without a description. Considered: AI-generated summaries (conflicts with the cited-source-only trust rule) and PDF text extraction (extra dependency + fidelity risk — possible v2).

### One vote_items table keyed by itemId, not columns on bills/votes (2026-06-12, feat/vote-bill-context)
The description belongs to the Knesset ITEM (bill/agenda motion), shared by sibling votes (readings/reservations) via `knesset_votes.itemId`, so it lives in one table with a unique `itemId` — one 1:1 LEFT JOIN on feed and detail. Considered: columns on `bills` (no home for agenda motions, bloats a table other features sweep) and columns on `knesset_votes` (duplicates multi-KB text across siblings).

### Terminal-state-by-existence, no status enum (2026-06-12, feat/vote-bill-context)
A `vote_items` row is written only when enrichment completes: row absent = pending (retried each ingest run, newest first, capped), row present = terminal, never re-fetched. A links-only row (`descriptionHe` null) is a legitimate terminal state — explicit absence, and it stops re-probing the ~89% of bills with no official text every run. Provenance triplet stays notNull because every written row really was fetched.

### itemTypeId is a plain int, never a closed enum (2026-06-12, feat/vote-bill-context)
`VoteHeader.LU_ItemType` maps to OData's `KNS_ItemType` space (2=bill, 4=agenda motion, 3=no-confidence) but the domain is OPEN — 9 observed live on a secret vote. The normalize-throws-on-unknown rule would make a closed map fail vote ingest on harmless types, so we store raw and branch on named constants (`ITEM_TYPE_BILL`/`ITEM_TYPE_AGENDA`) only.

### billId from the header's own type signal; validBillIds heuristic removed (2026-06-12, feat/vote-bill-context)
`billId = LU_ItemType===2 ? FK_ItemID : null` replaces the old bills-table membership check, which silently missed bills newer than the manual `pnpm ingest:knesset`. Enrichment also upserts the `KNS_Bill` row it fetches anyway, so `bills` self-heals for fresh bills.

### Enrichment is a failure-isolated post-pass, not in the detail transaction (2026-06-12, feat/vote-bill-context)
Step 2.5 of `ingestVotes`, own try/catch per run AND per item: external OData/file fetches never run inside `applyVoteDetails`' tx, sibling votes share one fetch, and an enrichment outage cannot fail vote ingest or block the heartbeat (vote-row completeness outranks context). Fetch errors leave no row (retry next run); a fetched-but-textless doc writes a links-only terminal row.

### Law link targets: legislation-DB page (href only) + fs.knesset PDF (2026-06-12, feat/vote-bill-context)
`https://main.knesset.gov.il/apps/legislation/main/bills/<BillID>` verified live (the legacy LawBill.aspx URL redirects there) — but main.knesset.gov.il sits behind Radware, so it is NEVER fetched server-side, only rendered as a user href. The doc link is the latest-stage official PDF on fs.knesset.gov.il (publicly fetchable; stage rank: פרסום ברשומות 9 > קריאה שנייה/שלישית 4 > ראשונה 2 > דיון מוקדם 1; חומר רקע 59 never linked as "the text"). `KNS_Document*` FilePaths can carry backslashes — normalized on ingest.

### DOCX extraction via fflate, trailer-cut by official template markers (2026-06-12, feat/vote-bill-context)
fflate (zero-dep, 8kB) unzips the DOCX; `word/document.xml` strip-tags to plain text; דברי הסבר taken verbatim from its heading, cut at the official trailers (dash rule + submission block on bills; "בכבוד רב," signature on agenda motions) — both observed on the real captured fixtures. Considered: mammoth/docx libs (heavyweight for one XML file).

### Hand-written migration 0024 broke drizzle-kit diffing — fixed in 0025 (2026-06-12, feat/vote-bill-context)
`0024_add_politician_gender` was hand-authored with no meta snapshot and a future journal `when` (1781900000000); the generated 0025 re-added `gender` (duplicate-column on replay) and sorted BEFORE 0024 (the migrator applies only `folderMillis > last applied`, so 0025 would be skipped everywhere). Fixed by stripping the gender line from 0025's SQL and bumping its journal `when` past 0024's. Lesson: hand-written migrations need either a snapshot or `IF NOT EXISTS` + a sane `when`.
