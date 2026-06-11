# Decision Log — Knesset Votes & MK Matching

> Newest on top. Entries are immutable: supersede, don't edit. Spec: `docs/superpowers/specs/2026-06-10-knesset-votes-mk-matching.md` · Plan: `docs/superpowers/plans/2026-06-10-knesset-votes-mk-matching-plan.md`.

---

## 2026-06-11 — Feed spine: decisive = one representative per item, ANY type; scoreable = decisive ∧ (electronic|roll_call) (branch worktree-knesset-votes)

**Decision.** `pickDecisiveVoteId` falls back to the latest vote of any type for hand/secret-only items (34 items) so every item has a feed representative; `isDecisive` therefore no longer implies scoreable. Matching and the unlock counter filter `isDecisive AND voteType IN (electronic, roll_call)`. Feed pagination uses a **composite keyset cursor** `(voteDate, voteId)` — a date-only cursor silently dropped same-timestamp votes at page boundaries (137 tie groups across 2.3k primaries, live-verified by the review panel); garbage cursors parse to first-page, never a 500.

**Rejected.** Marking hand votes non-decisive (items vanish from the feed); offset pagination (drifts under live inserts).

## 2026-06-11 — Stance mechanics: atomic toggle, decisive-only, no raw rethrow (branch worktree-knesset-votes)

**Decision.** A stance tap is ONE atomic statement: `DELETE … AND stance = $same` (hit = retraction) else upsert — a read-then-write would let two concurrent casts interleave into a silently dropped stance. Stances attach only to an item's decisive vote (`VoteNotStanceableError` otherwise), so reservation votes never collect opinions. The action **never rethrows raw errors**: drizzle's `DrizzleQueryError` message embeds bound params — i.e. the stance direction — and a rethrow would land it in server logs, violating P0-9; failures log a sanitized `{voteId, errName}` marker only. `match_unlocked` is edge-triggered via `prevScoreableCount` (a level check re-fired on every flip while sitting at exactly 5).

## 2026-06-11 — Freshness from an ingest heartbeat, not max(fetchedAt) (branch worktree-knesset-votes)

**Decision.** User-visible staleness reads `ingest_heartbeats.lastSuccessAt` (migration 0022, stamped at the end of every successful `ingestVotes`), with the spec's SLO: 6h on plenum days (Mon–Wed, Asia/Jerusalem via `jerusalemWeekday`) / 24h otherwise. `max(fetchedAt)` was wrong in both directions: the 7-day sweep re-stamps only in-window rows, so a recess froze it (false "broken" banner on a healthy pipeline), and a flat 24h threshold missed the 6h plenum-day SLO.

## 2026-06-11 — Party majority: abstain counts in the denominator (branch worktree-knesset-votes)

**Decision.** A faction's per-vote majority is >50% of its for/against/**abstain** voters (didnt_vote excluded) — per the spec's ">50% of its voters" wording, a whipped-abstention faction yields NO majority and the vote skips. The farthest-party card is hidden when it ties the best (common on thin unanimous data — "farthest at 100%" reads as a contradiction).

**Rejected.** for/against-only denominator (recorded mostly-abstaining factions as having a position they didn't take).

## 2026-06-11 — Analytics: logger-shim track(), stance events carry voteId only (branch worktree-knesset-votes)

**Decision.** `track()` emits structured `analytics.<event>` log lines (no vendor exists; PRD says TBD) for the five P0-10 events. `stance_cast` carries `voteId` only — never the direction — so political positions exist solely in `user_stances` (cascade-deleted with the account).

## 2026-06-10 — Vote source: Knesset website API (live K25), not OData / scraping (branch worktree-knesset-votes)

**Decision.** Ingest K25 per-MK roll-call votes from the Knesset **website API** (`knesset.gov.il/WebSiteApi/knessetapi/Votes/*`): `POST GetVotesHeaders` (date-windowed sweep) + `GET GetVoteDetails/{voteId}`. Verified live through yesterday's votes; the apex host answers plain server-side HTTP (only `main.knesset.gov.il` pages sit behind Radware).

**Alternatives.** Official OData `Votes.svc` — confirmed still frozen at K24 (max vote 2021-07-13), kept only as a P2 historical archive. HTML scraping — unnecessary given the JSON API. Editorial curation — was the spec's draft-1 recommendation, dropped once the API was live-verified.

**Caveats.** Endpoint is undocumented (licensing question open, pre-launch action shared with the OData one). Monthly windows never truncate (banner `נמצאו N תוצאות` == rows in all 44 windows; watchdog logs on mismatch). Reachability from Vercel egress IPs is the remaining HARD GATE before relying on the cron in prod.

## 2026-06-10 — Verified domains: 4 vote types (שמית is scoreable!), result ids 6/7/8/9 (branch worktree-knesset-votes)

**Decision.** Enumerated over ALL 6,979 K25 votes: header `VoteType` ∈ {אלקטרונית 6436, **שמית 458**, הרמת יד 77, חשאית 8}. שמית (roll-call by name) carries the full per-MK breakdown and is **scoreable** alongside electronic; הרמת יד has counters only; חשאית has candidate totals in `DescreetVoteResults` and is never scoreable. Website `VoteResultId` ∈ {6 נוכח (didn't vote), 7 בעד, 8 נגד, 9 נמנע} — a **different id space** from OData's {1..4}. Closed maps in `app/lib/votes/normalize.ts`; unknown values THROW, never guessed.

**Why it matters.** The spec drafted a 2-value type enum; the probe falsified it before any data landed. No-confidence votes are often שמית — missing them would have gutted the matching signal.

## 2026-06-10 — MK identity: name-key mapping from id-anchored sources; the site-id crosswalk was a trap (branch worktree-knesset-votes)

**Decision.** `VoteDetails` carries Hebrew names only ("Last First"), no ids. Attribution goes through `mk_name_mappings` (`nameKey → personId`), where `nameKey` = token-**sorted** `normalizeSearchName` (website order ≠ OData order). Mappings come only from **id-anchored sources**: `politicians.nameHe` (official, 148 K25-tenured) + Open Knesset `altnames` keyed by its official `PersonID` column. 5 residual variants (e.g. «גנץ בני» → בנימין גנץ) were human-approved (Gal, 2026-06-10); every mapping carries `verifiedAt` and ingest **refuses attribution while any row is unverified**.

**Rejected.** The planned `kns_mksitecode` bridge: the column doesn't exist in the current `mk_individual.csv`, and the website dropdown-ID space ≠ `mk_individual_id` for modern MKs (it converged to PersonID) — a naive join produced 44 cross-id-space rows that were wiped. `politicians.mkSiteId` stays NULL until an authoritative bridge appears; nothing needs it.

**Unmapped names** land in `unmapped_mk_names` (one row per key; raw rows retained in `mk_votes_raw`), resolution backfills `mk_votes` transactionally from retained evidence — no API re-fetch; dismissals are sticky.

## 2026-06-10 — Roster extended to all K25-tenured MKs; faction-at-vote-time from official stints (branch worktree-knesset-votes)

**Decision.** `normalizeK25Members` ingests every person with a 43/61 seat in K25 (148 = 120 active + 28 departed, `active=false`) — the 3.5-year backfill includes departed MKs whose votes must attribute. `faction_stints` (190 PositionID-54 interval rows) gives **faction-at-vote-time**: `mk_votes.factionId` = the stint covering the vote instant, so mid-term party switchers attribute correctly. List surfaces (`getAllPoliticians`/`getFeaturedPoliticians`) now filter `active=true`; `/politician/[id]` still serves departed profiles.

**Rejected.** Joining breakdowns through `politicians.factionId` (current faction — misattributes history); a FactionName→id whitelist (string matching where official intervals exist).

## 2026-06-10 — Scoreable universe: decisive electronic/roll-call votes only (branch worktree-knesset-votes)

**Decision.** One vote per item is `isDecisive`: the highest **accepted reading** vote (קריאה שלישית > שנייה > ראשונה, detected from `Decision` text), else the latest scoreable vote. Matching and user stances use decisive votes only — the 2026 budget item alone had 142 votes, nearly all reservation roll-calls that read as coalition discipline, not positions.

## 2026-06-10 — Wall-clock conversion in lib/time.ts; naive timestamps stay UTC (branch worktree-knesset-votes)

**Decision.** The API returns naive Jerusalem wall-clock strings ("2026-06-09T19:00:00"). `jerusalemWallToUtc` (fixed-point offset iteration, DST-boundary tested) lives in `lib/time.ts` — the one module the ESLint guard allows `Intl` in. `knesset_votes.voteDate` stores the UTC instant like every other timestamp.
