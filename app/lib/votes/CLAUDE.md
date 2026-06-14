# app/lib/votes — Knesset plenum votes pipeline

K25 per-MK roll-call ingestion from the Knesset **website API** (the only live source; OData `Votes.svc` is frozen at K24). **Full feature context (API payloads, stances, matching, operations): the `knesset-votes` skill.** Spec: `docs/superpowers/specs/2026-06-10-knesset-votes-mk-matching.md` · decisions: `docs/decisions/knesset-votes.md`.

## Files

| File | Purpose |
|---|---|
| `website-api.ts` | HTTP client (`GetVotesHeaders` POST, `GetVoteDetails/{id}` GET, `GetMksDropDown`); retry via the shared `app/lib/http/fetch-retry.ts` (`fetchWithRetry`), throttle between calls; `voteSourceUrl()` builds the per-vote provenance URL |
| `website-types.ts` | Raw API row shapes (PascalCase, captured live 2026-06-10; `LU_ItemType` added 2026-06-12) |
| `test-payloads.ts` | VERBATIM captured responses (one per vote type) — test builders derive from these; refresh via the curl commands in the plan §5, never hand-edit |
| `test-payloads-items.ts` + `fixtures/*.docx` | VERBATIM OData captures (KNS_Bill/DocumentBill/Agenda/DocumentAgenda) + two real DOCX for the enrichment tests — refresh via the curl commands in the file header |
| `docx.ts` | Pure DOCX → plain text (`fflate`) + verbatim דברי הסבר extraction (`extractExplanatoryNotes`; null = explicit not-found, trailer-cut at the official dash-rule/בכבוד-רב markers) |
| `files-api.ts` | Binary download from fs.knesset.gov.il via shared `fetchWithRetry` — the mockable file boundary; NEVER fetch main.knesset.gov.il (Radware) |
| `enrich.ts` | Vote-item enrichment (`enrichVoteItems`, ingest step 2.5 + backfill): official description (SummaryLaw → דברי הסבר DOCX → motion text) + legislation-page/PDF links + agenda initiator into `vote_items`; doc-stage rank 9>4>2>1; failure-isolated per item |
| `name-key.ts` | `nameKey()` — token-SORTED `normalizeSearchName` (website is "Last First", OData "First Last"). Both sides of every mapping lookup MUST use it |
| `normalize.ts` | Closed maps (`WEBSITE_RESULT_BY_ID` 6/7/8/9, `HEADER_VOTE_TYPE` 4 types) — unknown values THROW; `pickDecisiveVoteId` (highest accepted reading → latest scoreable → latest of ANY type, so hand/secret-only items keep a feed representative; decisive ≠ scoreable) |
| `repo.ts` | Write-side: upserts (plumbing from `app/lib/db-utils.ts`) + transactional `applyVoteDetails` (patch + raw evidence + attribution + queue), set-based `recomputeDecisive`, `resolveUnmappedName` (backfills from retained `mk_votes_raw`, no re-fetch — admin uses person-scoped `loadStintsContext`, not the full context), `listAllPendingDetailVoteIds` (self-heal), admin writes |
| `read-repo.ts` | Read-side: feed (composite keyset cursor `${iso}_${voteId}` — date-only drops same-timestamp rows), detail bundle + `groupByFaction` (pure, unit-tested), MK record, heartbeat-based freshness (6h Mon–Wed SLO), admin lists |
| `service.ts` | `ingestVotes` (monthly windows, truncation watchdog, dedupe, heartbeat stamp, + self-heal: retries votes stuck `pending_details` OUTSIDE the sweep window), `ingestRecentVotes` (cron, last 7 days) |

Sibling domains: `app/lib/stances/` (atomic stance toggle, k≥10 aggregate), `app/lib/match/` (agreement engine). Schema in `app/lib/schema-votes.ts` (re-exported from `schema.ts`); entry points: `scripts/ingest-votes.ts` (backfill/manual), `scripts/enrich-vote-items.ts` (vote_items classify + drain backfill), `app/api/cron/ingest-votes/route.ts` (2h cron), `scripts/bootstrap-mk-mapping.ts` (one-time mapping seed).

## Invariants (break these and attribution lies)

- **Attribution = exact `nameKey` match against human-verified `mk_name_mappings`** — `ingestVotes` throws `UnverifiedMappingsError` if ANY mapping lacks `verifiedAt`. Unmapped names queue (`unmapped_mk_names`); dismissals are sticky; evidence is retained verbatim in `mk_votes_raw` so resolution never re-fetches.
- **`mk_votes.factionId` is faction-AT-VOTE-TIME** from `faction_stints` intervals — never join through `politicians.factionId` (mid-term switchers).
- **Scoreable types = `electronic` + `roll_call` (שמית)** — hand votes have counters only, secret votes have neither. Matching/stances use `isDecisive` votes only.
- **Upsert carve-outs**: `featured` (admin), `isDecisive`/`detailsStatus` (pipeline) are excluded from the header upsert SET — re-ingest never clobbers them (the `dob` precedent).
- **vote_items descriptions are OFFICIAL TEXT ONLY** (SummaryLaw / verbatim דברי הסבר / motion text — `descriptionSource` names which); no text → links-only row, never a generated summary. Terminal-state-by-existence: row absent = retry next run; row present = never re-fetched. `knesset_votes.itemTypeId` (raw `LU_ItemType`) is an OPEN domain — int + `ITEM_TYPE_BILL`/`ITEM_TYPE_AGENDA` constants, never a closed enum; `billId = itemTypeId===2 ? itemId : null` (the header signal, not bills-table membership). See `docs/decisions/vote-descriptions.md`.

## Gotchas

- The website `VoteResultId` space (7=בעד) ≠ OData's (1=בעד); counter title "נוכח ולא הצביע" → `totalDidntVote`.
- `VoteDate` is naive Jerusalem wall-clock → `jerusalemWallToUtc` (`lib/time.ts`) before storing.
- Detail-level `VoteType` strings differ from header strings ("הצבעה אלקטרונית" vs "אלקטרונית") — only header strings are mapped.
- `politicians.mkSiteId` is intentionally NULL: the dropdown-ID space ≠ Open Knesset `mk_individual_id` for modern MKs (cross-space join risk — see decisions log).
- Roster must ingest before votes (`pnpm ingest:knesset` → departed MKs + stints), else new-MK names queue.
