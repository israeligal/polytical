# app/lib/votes — Knesset plenum votes pipeline

K25 per-MK roll-call ingestion from the Knesset **website API** (the only live source; OData `Votes.svc` is frozen at K24). **Full feature context (API payloads, stances, matching, operations): the `knesset-votes` skill.** Spec: `docs/superpowers/specs/2026-06-10-knesset-votes-mk-matching.md` · decisions: `docs/decisions/knesset-votes.md`.

## Files

| File | Purpose |
|---|---|
| `website-api.ts` | HTTP client (`GetVotesHeaders` POST, `GetVoteDetails/{id}` GET, `GetMksDropDown`); retry/throttle mirrors `../knesset/odata.ts`; `voteSourceUrl()` builds the per-vote provenance URL |
| `website-types.ts` | Raw API row shapes (PascalCase, captured live 2026-06-10) |
| `test-payloads.ts` | VERBATIM captured responses (one per vote type) — test builders derive from these; refresh via the curl commands in the plan §5, never hand-edit |
| `name-key.ts` | `nameKey()` — token-SORTED `normalizeSearchName` (website is "Last First", OData "First Last"). Both sides of every mapping lookup MUST use it |
| `normalize.ts` | Closed maps (`WEBSITE_RESULT_BY_ID` 6/7/8/9, `HEADER_VOTE_TYPE` 4 types) — unknown values THROW; `pickDecisiveVoteId` (highest accepted reading → latest scoreable → latest of ANY type, so hand/secret-only items keep a feed representative; decisive ≠ scoreable) |
| `repo.ts` | Write-side: upserts + transactional `applyVoteDetails` (patch + raw evidence + attribution + queue), `resolveUnmappedName` (backfills from retained `mk_votes_raw`, no re-fetch), `factionAtVoteTime`, admin writes (`setVoteFeatured`, agenda) |
| `read-repo.ts` | Read-side: feed (composite keyset cursor `${iso}_${voteId}` — date-only drops same-timestamp rows), detail bundle, MK record, heartbeat-based freshness (6h Mon–Wed SLO), admin lists |
| `service.ts` | `ingestVotes` (monthly windows, truncation watchdog, dedupe, heartbeat stamp), `ingestRecentVotes` (cron, last 7 days) |

Sibling domains: `app/lib/stances/` (atomic stance toggle, k≥10 aggregate), `app/lib/match/` (agreement engine). Schema in `app/lib/schema-votes.ts` (re-exported from `schema.ts`); entry points: `scripts/ingest-votes.ts` (backfill/manual), `app/api/cron/ingest-votes/route.ts` (2h cron), `scripts/bootstrap-mk-mapping.ts` (one-time mapping seed).

## Invariants (break these and attribution lies)

- **Attribution = exact `nameKey` match against human-verified `mk_name_mappings`** — `ingestVotes` throws `UnverifiedMappingsError` if ANY mapping lacks `verifiedAt`. Unmapped names queue (`unmapped_mk_names`); dismissals are sticky; evidence is retained verbatim in `mk_votes_raw` so resolution never re-fetches.
- **`mk_votes.factionId` is faction-AT-VOTE-TIME** from `faction_stints` intervals — never join through `politicians.factionId` (mid-term switchers).
- **Scoreable types = `electronic` + `roll_call` (שמית)** — hand votes have counters only, secret votes have neither. Matching/stances use `isDecisive` votes only.
- **Upsert carve-outs**: `featured` (admin), `isDecisive`/`detailsStatus` (pipeline) are excluded from the header upsert SET — re-ingest never clobbers them (the `dob` precedent).

## Gotchas

- The website `VoteResultId` space (7=בעד) ≠ OData's (1=בעד); counter title "נוכח ולא הצביע" → `totalDidntVote`.
- `VoteDate` is naive Jerusalem wall-clock → `jerusalemWallToUtc` (`lib/time.ts`) before storing.
- Detail-level `VoteType` strings differ from header strings ("הצבעה אלקטרונית" vs "אלקטרונית") — only header strings are mapped.
- `politicians.mkSiteId` is intentionally NULL: the dropdown-ID space ≠ Open Knesset `mk_individual_id` for modern MKs (cross-space join risk — see decisions log).
- Roster must ingest before votes (`pnpm ingest:knesset` → departed MKs + stints), else new-MK names queue.
