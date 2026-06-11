---
name: knesset-votes
description: The Knesset votes & MK-matching feature — K25 plenum roll-calls ingested from the Knesset website API, per-MK attribution via a human-verified name mapping, user stances (עמדות), and the "מי מצביע כמוכם" agreement engine. Use when touching anything under app/lib/votes, app/lib/stances, app/lib/match, the /votes, /vote/[id], /my-match pages, the votes admin sections, the ingest-votes cron/script, or when asking how vote data is fetched, attributed, scored, paginated, or how the website API endpoints/payloads work.
---

# Knesset Votes & MK Matching

Real K25 plenum roll-calls (who voted בעד/נגד/נמנע) + free user stances + an on-read agreement score between the user and every MK/faction. Spec: `docs/superpowers/specs/2026-06-10-knesset-votes-mk-matching.md` · decisions: `docs/decisions/knesset-votes.md`.

## File Map

| Layer | Path | Purpose |
|---|---|---|
| Schema | `app/lib/schema-votes.ts` | 9 tables + 7 enums (re-exported from `schema.ts`; FK thunks make the cycle safe) |
| API client | `app/lib/votes/website-api.ts` + `website-types.ts` | Knesset website API fetchers (retry/throttle), raw shapes |
| Captures | `app/lib/votes/test-payloads.ts` | VERBATIM live responses (one per vote type) — test builders derive from these |
| Normalize | `app/lib/votes/normalize.ts` | Closed maps (throw on unknown), `pickDecisiveVoteId` |
| Name key | `app/lib/votes/name-key.ts` | Token-SORTED `normalizeSearchName` — BOTH sides of every mapping lookup |
| Write repo | `app/lib/votes/repo.ts` | Upserts, transactional attribution, queue resolve/dismiss, admin writes |
| Read repo | `app/lib/votes/read-repo.ts` | Feed (keyset cursor), detail bundle, MK record, freshness, admin lists |
| Ingest service | `app/lib/votes/service.ts` | Monthly-window sweep → detail fetch → apply → decisive recompute → heartbeat |
| Stances | `app/lib/stances/{repo,service}.ts` | Atomic toggle, k≥10 aggregate, scoreable-count unlock gate |
| Matching | `app/lib/match/service.ts` | Per-MK + faction-majority agreement, thresholds, deterministic ties |
| Actions | `app/actions/{stances,admin-votes}.ts` | Rate-limited stance action; admin featured/queue/agenda |
| Pages | `app/votes/`, `app/vote/[id]/`, `app/my-match/` | Feed, detail (+StanceWidget), match |
| Components | `components/{vote-row,vote-totals-bar,stance-widget}.tsx`, `components/admin/votes-admin.tsx` | Shared UI |
| Entry points | `scripts/ingest-votes.ts` (backfill/manual), `app/api/cron/ingest-votes/route.ts` (2h cron), `scripts/bootstrap-mk-mapping.ts` (one-time mapping) | |
| Analytics | `app/lib/track.ts` | Logger shim; `stance_cast` carries voteId ONLY |

## The website API (the only live K25 vote source)

Base `https://knesset.gov.il/WebSiteApi/knessetapi/` — the site's own backend; the apex answers plain server-side HTTP (only `main.knesset.gov.il` pages sit behind Radware). Official OData `Votes.svc` is frozen at K24.

| Call | Shape |
|---|---|
| `POST Votes/GetVotesHeaders` body `{"SearchType":2,"FromDate":"YYYY-MM-DD","ToDate":"YYYY-MM-DD"}` | `{Table:[{VoteId,VoteDate,VoteType,ItemTitle,KnessetId,…}]}` — full window in one response, never truncates (banner `נמצאו N תוצאות` == rows, verified over 44 windows); sweep monthly windows |
| `GET Votes/GetVoteDetails/{voteId}` | `VoteHeader[0]` (`FK_ItemID` == `KNS_Bill.BillID` for bill votes, `Decision`, `IsForAccepted`) + `VoteCounters` + `VoteDetails[{MkName,FactionName,VoteResultId,Title}]` |
| `GET MKs/GetMksDropDown?languagekey=he` | every MK ever `{ID,Name,IsCurrent}` — website id space ≠ OData PersonID |

**Verified domains** (probe 2026-06-10, full corpus): `VoteResultId` `6=נוכח(didn't vote) 7=בעד 8=נגד 9=נמנע`; header `VoteType` אלקטרונית/שמית(roll-call, HAS per-MK rows)/הרמת יד(counters only)/חשאית(never scoreable); counter title `נוכח ולא הצביע` → `totalDidntVote`. `VoteDate` is **naive Jerusalem wall-clock** → `jerusalemWallToUtc` (`lib/time.ts`). Unknown id/type/title **throws** — never guessed.

## How it operates

```
cron (2h) / pnpm ingest:votes[:backfill]
  → GetVotesHeaders per monthly window (truncation watchdog, dedupe by voteId)
  → upsertVoteHeaders (SET excludes featured/isDecisive/detailsStatus — the dob carve-out)
  → per pending vote: GetVoteDetails → ONE transaction:
      header patch + mk_votes_raw evidence + attribution + queue-on-miss
  → recomputeDecisive per touched item → ingest_heartbeats stamp
```

- **Attribution** = exact `nameKey` match against human-verified `mk_name_mappings`; `ingestVotes` throws `UnverifiedMappingsError` if ANY row lacks `verifiedAt`. Unmapped → `unmapped_mk_names` queue; resolution backfills from retained `mk_votes_raw` (no re-fetch); dismissals sticky.
- **Faction-at-vote-time**: `mk_votes.factionId` from `faction_stints` intervals — never join `politicians.factionId` (mid-term switchers).
- **Decisive**: one representative per item (highest accepted reading, else latest scoreable, else latest of ANY type). Scoreable = decisive ∧ (electronic|roll_call) — a hand vote can be decisive (feed spine) but never scored.
- **Feed pagination**: composite keyset cursor `${iso}_${voteId}` — date-only cursors drop same-timestamp votes (137 live tie groups); garbage cursors → first page.
- **Stances**: atomic toggle (DELETE-where-same first, else upsert); decisive votes only; aggregate k≥10 + viewer-has-stance; unlock at 5 scoreable stances (edge-triggered `match_unlocked`).
- **Matching** (on-read, derive-don't-sync): per-MK `matches/shared` over for/against rows, qualify `shared≥5`, low-confidence `<10`, ties by shared→Hebrew name; faction majority needs >50% of for/against/abstain voters; <6 qualified MKs → partial list, never top/bottom panels; farthest party hidden when tied with closest.
- **Freshness**: `ingest_heartbeats` (NOT max(fetchedAt) — freezes in recess); SLO 6h Mon–Wed (Jerusalem) / 24h else.

## Key invariants (break these and attribution lies)

- Provenance triplet on every ingested row; motion pages link the official `sourceUrl`.
- Hebrew strings display-only; joins by `voteId`/`personId`/`factionId`/`billId`.
- **P0-9 privacy**: stance direction never leaves the DB — no direction in `track()`/logs (drizzle errors embed bound params: never rethrow raw from the stance path), aggregates k-gated, `user_stances` cascade-delete with the account.
- Vocabulary: user side is **עמדה** (קבעו עמדה), never הצבעה.

## Gotchas

- `politicians.mkSiteId` is intentionally NULL — the dropdown-ID space ≠ Open Knesset `mk_individual_id` for modern MKs (cross-space join trap, see decisions).
- Roster (`pnpm ingest:knesset`) must run before votes — departed-MK names queue otherwise.
- Detail-level `VoteType` strings differ from header strings; only header strings are mapped.
- `db:push` may offer a destructive TTY truncate prompt — apply generated migration SQL via a guarded runner instead (see root CLAUDE.md).
- Test seeds MUST build mapping keys via `nameKey()` — hand-rolled keys miss the particle strip.
