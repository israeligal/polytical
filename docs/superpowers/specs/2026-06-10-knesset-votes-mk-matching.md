# PRD — Knesset Votes & "Who Votes Like You" (MK Matching)

> Status: **Draft v2 (post 4-lens adversarial review)** · Author: Gal + Claude · Date: 2026-06-10
> Builds on: `2026-05-31-polytical-prd.md` (core PRD), `docs/decisions/knesset-data.md` (data pipeline)
> Supersedes the "votes deferred to P1" decision (2026-05-31) — a live K25 vote source has been verified. **Phase A exit includes writing the superseding entry in `docs/decisions/knesset-data.md`** (entries are immutable; supersede, don't edit).

---

## Problem Statement

Israeli citizens have no accessible way to answer two basic civic questions: **"what did the Knesset actually vote on, and how did each MK vote?"** and **"which MK actually votes the way I would?"** The official vote database exists but is buried in a SharePoint-era search UI; no product turns it into a feed, and nothing connects an individual's positions to MKs' real voting records. Polytical already has the audience (politics-engaged Hebrew speakers), the politician entities (~120 MKs with stable ids, most with caricature cards), and the trust backbone (cited sources, stable-id attribution) — but today users can only *bet* on politics, not *position themselves* in it. Without this layer, Polytical stays a game; with it, it becomes the place where your political identity is grounded in real roll-call data.

## Glossary (one vocabulary for every surface)

| Concept | Hebrew | Never |
|---|---|---|
| A Knesset roll-call vote (the event) | **הצבעה** | — |
| The motion/bill being voted (the item) | **הצעה** | — |
| The user's own position | **עמדה** (CTA: **קבעו עמדה**) | Never הצבעה — "הצביעו על הצבעות" is exactly the confusion to avoid, and it blurs the line with the real electoral act |
| The match result | **מי מצביע כמוכם?** | Gender-neutral plural, matching existing copy (הציעו שוק, בואו לנחש) |

## Verified Data Reality (live-checked 2026-06-10)

This spec is grounded in endpoint probes run against production Knesset services on 2026-06-10:

1. **Live K25 votes exist via the Knesset website API** (`https://knesset.gov.il/WebSiteApi/knessetapi/Votes/…`) — accessible server-side with plain HTTP (no bot-challenge on the `knesset.gov.il` apex; only `main.knesset.gov.il` pages are Radware-protected):
   - `POST Votes/GetVotesHeaders` body `{"SearchType":2,"FromDate":"YYYY-MM-DD","ToDate":"YYYY-MM-DD"}` → all vote headers in the window (`VoteId`, `VoteDate`, `ItemTitle`, `VoteType`, `KnessetId`, `SessionId`). Returned **yesterday's votes** (2026-06-09, VoteIds 46071–46078). ~2,702 K25 votes total. Adding `"MkId":<websiteMkId>` filters to one MK's votes. Pagination: the API returns the full window (141 rows for a 40-day range); windowed date sweeps suffice.
   - `GET Votes/GetVoteDetails/{voteId}` → `VoteHeader` (incl. `FK_ItemID`, `Decision`, `IsForAccepted`, `AcceptedText`, chairman), `VoteCounters` (בעד/נגד/נמנע totals), and `VoteDetails` — **the per-MK breakdown**: `MkName`, `FactionName`, `VoteResultId`, `Title` (בעד/נגד/נמנע).
   - `GET MKs/GetMksDropDown?languagekey=he` → all MKs **ever** (not just current), `{ID, Name, IsCurrent}` — the website's MK id space. This covers departed K25 MKs too.
2. **`FK_ItemID` IS the OData `BillID`** for bill votes — verified (`2217042` ↔ `KNS_Bill.BillID 2217042`, same title, K25). Votes join **by stable id** to the `bills` table we already ingest. Motion-type items (no-confidence, agenda motions) carry other ItemIDs resolvable via `KNS_PlmSessionItem`.
3. **The identity gap (the one real catch):** `VoteDetails` carries Hebrew names only ("Last First" order), no MK id. And the website MK id ≠ OData `PersonID` (Liberman: website `214`, OData `427`). → Requires a verified mapping (P0-2). Two id crosswalks already exist to bootstrap from: Open Knesset's `kns_mksitecode` column (PersonID ↔ website site-code; CSV path currently 404 — path rediscovery, not absence) and OData `View_Vote_MK_Individual` for the historical space.
4. **OData `Votes.svc` is still frozen at K24** (max `vote_id` 34525, 2021-07-13) — confirmed in both the view and the raw `vote_rslts_kmmbr_shadow` table. Useful only as an *official historical archive* (P2 backfill).
5. **No month-ahead agenda feed exists.** `KNS_PlenumSession` has zero future-dated rows; the plenum agenda (`KNS_PlmSessionItem`) appears days ahead at best. "Upcoming" must be scoped to *announced agenda + admin curation*, not "next month."
6. **Hand votes (`הרמת יד`) have no per-MK breakdown** — only totals. They appear in the feed but never feed matching.
7. **The full K25 backfill spans ~3.5 years and includes MKs who have since left** (Norwegian-law churn, resignations, deaths). The roster ingest currently keeps only `IsCurrent` MKs — the backfill therefore requires extending the roster to all K25-tenured persons (P0-2), or attribution mass-fails on day one.
8. **`VoteResultId` domain must be probed in Phase A** — the K24 archive shows a "didn't vote" (לא הצביע) result code beyond בעד/נגד/נמנע; the schema reserves room for it (P0-3).

## Goals

1. **Make every plenum vote legible**: a user can see any recent K25 motion, whether it passed, and exactly which MK voted בעד/נגד/נמנע — each motion citing its official source URL. *(Metric: vote surfaces in ≥20% of sessions.)*
2. **Let users take a position**: signed-in users record a free בעד/נגד stance (עמדה) on motions — no coins — target ≥30% of WAU with ≥1 stance within 30 days of launch.
3. **Answer "who represents me"**: after ≥5 scoreable stances, show top-3 most-aligned and bottom-3 least-aligned MKs plus a party match, each with agreement % and its evidence basis — target ≥40% of stance-casters reaching the unlock, ≥80% of those viewing the match.
4. **Make MK pages accountable**: politician profiles show real voting records (recent בעד / recent נגד) — target ≥25% of politician-page views interacting with the record section.
5. **Create a daily content loop**: the votes feed gives Polytical fresh real content every plenum day, independent of admin-authored markets. *(Directional metric, not causal: D7 of stance-casters ≥ 1.5× overall D7 — self-selection-confounded, A/B deferred until traffic supports it.)*

## Non-Goals

- **No coin/ledger involvement.** Stances are civic opinions, not wagers. The `transactions` ledger is untouched. *(Why: betting "will it pass" ≠ "do I support it" — conflating them corrupts the matching signal and the ledger invariants.)*
- **No pre-voting on upcoming motions in v1.** The upcoming section is read-only in v1; pre-stances are P1 with fully-specced mechanics (see P1). *(Why: review found pre-stances need their own keying, a migration rule when the real vote lands, and a consent confirm — real scope; the read-only agenda still delivers awareness. ⚠️ This trims the original "users can pre-vote" choice — flagged for Gal's sign-off.)*
- **No market ↔ motion linking in v1.** Schema, admin tooling, and surfacing all move together to P1. *(Why: v1 contradiction risk — it appeared in both P0 and P1 in draft 1; nothing in the core loop needs it.)*
- **No full 120-MK ranked list in v1.** Top-3/bottom-3 + party match only. *(Why: full list invites junk comparisons on thin data.)*
- **No K24 historical votes in v1.** Current Knesset only; archive backfill is P2, clearly labelled. *(Why: half the current MKs have no K24 record; mixing terms muddies "votes like you today.")*
- **No committee votes.** Plenum roll-call only. *(Why: no per-MK committee feed exists.)*
- **No editorial summaries/explainers per motion in v1.** Official `ItemTitle` + decision text + admin "high-profile" flag only. *(Why: explainer content is an editorial workstream with neutrality risk.)*
- **No public per-user stance visibility, ever, in any version of this feature.** Only k-anonymous aggregates show. *(Why: political opinions are sensitive personal data — see P0-9.)*

## User Stories

**The engaged citizen (core persona):**
- As a politics-curious user, I want to scroll a feed of recent Knesset votes so that I know what actually happened this week without reading protocol PDFs.
- As a user reading a motion, I want to see exactly which MKs voted בעד and which נגד, grouped by faction, so that I can hold them accountable.
- As a user with opinions, I want to set my own עמדה (בעד/נגד) on a motion so that the app learns my positions.
- As a user who has set several stances, I want to see which 3 MKs vote most like me and which 3 least — with a % and how many shared votes it's based on — so that I understand who actually represents me and how solid the number is.
- As a user, I want a party-level match so that I get a coarse "which faction fits me" answer even before I trust individual-MK scores.
- As a user who just set a stance, I want to see how the Polytical community split (when enough people have weighed in) so that I can compare myself to the crowd.
- As a user viewing a politician's card page, I want their recent voting record so that the card reflects deeds, not vibes.
- As a user, I want to see what's on the plenum agenda soon so that I know what's coming (read-only in v1).

**Edge / empty states:**
- As a new user with <5 scoreable stances, I want a progress state ("קבעו עמדה על עוד 3 הצעות") instead of a bogus match.
- As a user viewing a hand-vote motion, I want an explicit "אין פירוט אישי בהצבעה בהרמת ידיים" state — never a guessed breakdown.
- As a user whose stance was a misclick, I want to clear it (tap the selected stance again), and my match recomputes — even re-locking if I drop below the threshold.
- As an anonymous visitor, I want to read everything (feed, breakdowns) and get a login-with-return CTA when I try to set a stance or open the match page.
- As a user viewing an MK who barely attends, I want them excluded from my match (insufficient shared votes) rather than scored on 2 data points.

**The admin:**
- As an admin, I want vote ingestion on a schedule so the feed stays current without manual work — and a visible freshness state when it breaks.
- As an admin, I want a review queue for unmapped MK names so a source name-change never silently mis-attributes a vote — and resolving a name retroactively attributes everything that was withheld.
- As an admin, I want to flag motions as high-profile and curate upcoming agenda items.

## Requirements

### P0 — Must-Have (launch gate = end of Phase C; Phase B is an internal milestone, not a launch)

**P0-1: Vote ingestion (service + cron route + backfill script)**
- Architecture mirrors the house pattern (an ingest *script* cannot be Vercel-cron'd):
  - Core logic in `app/lib/votes/` (fetch → normalize → repo), mirroring `app/lib/knesset/`.
  - `app/api/cron/ingest-votes/route.ts` guarded by `CRON_SECRET` bearer (per `cron/closing-soon`), schedules in `vercel.json`: every 2h on plenum days (Mon–Wed), daily otherwise.
  - `scripts/ingest-votes.ts` = thin manual wrapper for the one-time K25 backfill (~2.7k votes from 2022-11) — first line `assertNonProductionDb()` with the explicit `ALLOW_PROD_INGEST=1` override choreography (the live DB **is** prod, per `single-prod-db-no-dev`).
- Sweep: `GetVotesHeaders` by date window (incremental: last 7 days), then `GetVoteDetails/{voteId}` per new/changed vote. Idempotent upsert on `voteId`; batched ≤100 rows.
- **Upsert carve-outs (the `dob` precedent):** admin-owned columns are excluded from the ingest upsert SET — `knesset_votes.featured`, all admin-editable `agenda_items` fields. Re-ingest never clobbers admin state.
- Provenance on every row: `sourceDataset` (`websiteapi:Votes/GetVoteDetails`), `sourceUrl` (the public vote-page URL for that voteId), `fetchedAt`.
- Acceptance:
  - [ ] Re-running ingest is idempotent (same rows, updated `fetchedAt`); `featured` survives re-ingest.
  - [ ] A vote whose detail-fetch fails lands as `detailsStatus='pending_details'` (header+nullable detail columns) and is retried next run — never half-written attributions.
  - [ ] Hand votes ingest header+totals, zero per-MK rows, `voteType='hand'`.
  - [ ] Cron route rejects without `CRON_SECRET`; backfill script refuses prod without the explicit override.

**P0-2: MK identity mapping (the trust-critical piece)**
- New column `politicians.mkSiteId` (integer, unique, nullable).
- **Roster extension first:** ingest all K25-tenured persons (not just `IsCurrent`) with `active=false` for departed MKs — otherwise the backfill mass-fails attribution on departed MKs.
- **Bootstrap by id-crosswalk, not names:** (1) Open Knesset `kns_mksitecode` (PersonID ↔ site-code) where recoverable; (2) normalized-name match only for the residue; (3) **human verification of the full mapping** (admin checklist) before any attribution. Coverage requirement = every distinct MK name appearing in K25 `VoteDetails`, not "the current 120."
- Per-vote attribution: `VoteDetails.MkName` ("Last First") normalized → resolved **only by exact match** against the verified mapping. No fuzzy attribution, ever.
- **Review queue with retained evidence:** unresolved names land in `unmapped_mk_names` (one row per normalized name; status enum `pending/resolved/dismissed`, `resolvedPersonId`, `reviewedBy`, `reviewedAt` — modeled on `market_suggestions`), and the raw occurrences are retained in a staging table (`mk_votes_raw`: name, voteId, result, factionName) so resolution backfills **from retained data in a single transaction**, without re-fetching the API.
- The same pattern covers `FactionName` → `factionId` (verified K25 whitelist of faction-name variants; queue on miss).
- Acceptance:
  - [ ] Every MK name in the K25 backfill resolves or queues — zero silent drops.
  - [ ] Liberman test: site-code 214 ↔ personId 427; his rows attach to 427.
  - [ ] Resolving a queued name backfills every withheld `mk_votes_raw` row for that name, transactionally.
  - [ ] A dismissed name does not re-queue on re-ingest.
  - [ ] A mid-term replacement MK (Norwegian law) enters via roster ingest → mapping → attribution, in that order; roster ingest runs before vote ingest in the cron.

**P0-3: Schema (Drizzle; all indexes declared in-schema — `db:push` drops migration-only indexes)**
- House PK convention (uuid surrogate `id` PK + stable natural key `.notNull().unique()`) for the two entity tables; composite-PK junction style (per `marketPoliticians`/`commentVotes`) for the two relation tables:
  - `knesset_votes`: uuid `id` PK; `voteId` unique; `knessetNum`, `billId` (nullable, FK-by-value → `bills`), `itemId`, `titleHe`, `voteDate` (UTC), `voteType` (`electronic`/`hand`), `decisionHe` (nullable), `isAccepted` (nullable), `totalFor`/`totalAgainst`/`totalAbstain` (nullable), `totalDidntVote` (nullable; pending the Phase-A `VoteResultId` domain probe), `isDecisive` (boolean — the scoreable vote of its item, see P0-4/P0-7), `featured` (admin), `detailsStatus` (`pending_details`/`complete`), provenance triplet. **Indexes:** `voteDate`, `itemId`, `billId`, partial on `featured`.
  - `mk_votes`: composite PK (`voteId`,`personId`); `result` enum (`for`/`against`/`abstain`, reserved 4th value pending probe); `factionId` (**faction-at-vote-time**, resolved at ingest via the verified whitelist — MKs switch factions mid-term; joining through `politicians.factionId` would misattribute history); provenance triplet. **Index:** `personId`.
  - `user_stances`: composite PK (`userId`,`voteId`); `userId` references `users.id` `onDelete: 'cascade'` (sensitive data dies with the account); `stance` (`for`/`against`); `createdAt`,`updatedAt`. Write = `onConflictDoUpdate` upsert; **retraction = tapping the selected stance deletes the row**. **Index:** `voteId` (community aggregate scans).
  - `agenda_items`: uuid `id` PK; `itemId` nullable unique (admin-added rows have no Knesset id); `titleHe`, `expectedDate` (nullable), `billId` (nullable), `status` (`announced`/`voted`/`dropped`), `addedBy` (`ingest`/`admin`), `linkedVoteId` (nullable), provenance triplet with the documented convention `sourceDataset='admin'` + admin-route `sourceUrl` for admin-authored rows.
  - `unmapped_mk_names` + `mk_votes_raw` (per P0-2).
- Acceptance:
  - [ ] `schema.ts` + a generated migration in `./drizzle` (so `createTestDb` replays it) + seed helpers + fixtures in lockstep; all indexes in-schema.
  - [ ] All reads through repositories, scope-guard first; `user_stances` reads always filtered by `userId`.

**P0-4: Votes feed — `/votes` (הצבעות) + entry points**
- RSC page, Hebrew RTL, K25 votes newest-first: title, date (Asia/Jerusalem), `התקבל`/`נדחה` badge, totals bar, the user's עמדה state. High-profile rail (admin-featured, last ~month) on top.
- Consecutive votes on one `itemId` (readings, reservations) group into one item card; the **decisive vote** (`isDecisive`: latest accepted second/third-reading vote, else latest electronic vote of the item — heuristic confirmed in Phase A against real clusters like 46072/46073) is primary, others expandable.
- "על סדר היום" section: read-only list of `agenda_items` (announced agenda runs days ahead + admin-curated). Empty state: "אין הצעות על סדר היום כרגע".
- **Freshness is user-visible:** "עודכן לאחרונה" from `max(fetchedAt)`; explicit stale-warning state when last successful ingest exceeds the SLO (6h on plenum days) — a broken pipeline must never silently present week-old data as current.
- **Entry points (the metrics depend on these):** הצבעות joins the primary nav (resolve the 7-item mobile-nav layout in design); a featured-motion module on the home feed; post-stance toast shows match progress ("עוד 2 עמדות לפתיחת ההתאמה").
- Acceptance:
  - [ ] Paginates through the full K25 corpus; `loading.tsx` per route (matching `/market/[id]` conventions); unknown id → `notFound()`.
  - [ ] Hand votes render totals + explicit no-breakdown note.
  - [ ] Anonymous users see the full feed; stance CTA routes to login with `returnTo`.
  - [ ] Logical properties only; tokens/OKLCH only; numerals wrapped per design-spec §5 (`.nums`/`<bdi>` for mixed RTL runs like "87%"); totals-bar segments use `--positive`/`--negative` + a designated abstain neutral token (added to `globals.css` first, per the new-color rule).

**P0-5: Motion detail — `/vote/[id]`** (singular-detail route convention, param `[id]`)
- Per-MK breakdown grouped by **faction-at-vote-time** (`mk_votes.factionId`), member chips colored by vote (`--positive`/`--negative`/abstain token), counters, decision text, related-bill link, official `sourceUrl` link.
- עמדה widget (בעד/נגד, changeable, clearable) — placed above the breakdown so users can take a position before absorbing the Knesset outcome.
- **Community aggregate with k-anonymity:** shown only after the user has set a stance on that motion AND ≥10 users have stances on it; always shows the base ("73% מתוך 41 עמדות"); below threshold: "עוד אין מספיק עמדות בקהילה". *(A tiny-N aggregate both deanonymizes early users' politics and looks bogus.)*
- **Withheld-attribution reconciliation:** when per-MK rows for a vote sit in the unmapped queue, the page shows "N הצבעות ממתינות לאימות זהות" — chips + explained remainder must always reconcile against the official counters shown on the same page. `pending_details` votes render totals-only with "הפירוט בדרך".
- Acceptance:
  - [ ] Every MK chip links to `/politician/[id]` (stable-id join).
  - [ ] An MK absent from the vote doesn't appear; the page states how many MKs didn't vote (per the stored counters once the Phase-A probe lands).
  - [ ] Aggregate honors both gates (own-stance + k≥10); chip counts reconcile with header counters.

**P0-6: Politician voting record (on `/politician/[id]`)**
- "הצבעות אחרונות" section: recent בעד / recent נגד (latest ~10 each, decisive votes first), each linking to `/vote/[id]`. Driven by `mk_votes` on `personId`.
- Acceptance:
  - [ ] Explicit empty state for MKs with no attributed votes — never blank.
  - [ ] Counts match `mk_votes` exactly.

**P0-7: Matching — `/my-match` (מי מצביע כמוכם?)**
- **Scoreable universe = decisive electronic votes only** (`isDecisive`). Reservation roll-calls are near-pure coalition-discipline votes; scoring them degrades "who votes like you" into a coalition/opposition detector, and a בעד on a הסתייגות semantically *opposes* the bill.
- Scoring: per MK, `agreement = matches / shared`, `shared` = decisive motions with both a user stance and an MK `for`/`against` (abstain/absence excluded). MK qualifies at `shared ≥ 5`; user unlocks at ≥5 stances on scoreable votes. Candidate MKs filtered to `politicians.active = true`.
- **Honest presentation on thin data:** every MK row shows its basis ("87% · 23 הצבעות משותפות"); ties break deterministically (larger `shared`, then alphabetical); `shared < 10` renders a low-confidence treatment ("מבוסס על מעט הצבעות"). With 5 stances every score quantizes to multiples of 20% and whole coalition blocs tie at 100% — the basis line is what keeps the screenshot honest.
- **Degenerate states:** <6 qualified MKs → single partial list + "קבעו עמדה על עוד הצעות כדי לדייק את ההתאמה" (no top/bottom panels); an MK never appears in both lists; party match renders its own empty state independently.
- Party match: per faction, majority position per vote (>50% of its voters at vote time; split/skipped votes excluded), same thresholds; show best + worst faction.
- Compute on-read (120 MKs × hundreds of stances is trivial); derive, don't sync — a stance change (or retraction dropping the user below threshold) immediately changes (or re-locks) the match.
- Caricature cards used where `imageUrl` exists; the existing styled fallback otherwise (~26 MKs currently card-less).
- Acceptance:
  - [ ] Below-threshold users see the progress state with a CTA into featured motions; anonymous users see a login state.
  - [ ] Given a user who only set בעד on decisive motions Liberman supported (≥5), Liberman appears top-3 at 100% with its basis count.
  - [ ] Party-switcher test: an MK who changed factions is counted under the faction they sat in at each vote.

**P0-8: Admin — featuring, agenda curation, mapping queue**
- Admin surfaces: toggle `featured`; CRUD `agenda_items`; resolve/dismiss `unmapped_mk_names` (assign personId → transactional backfill per P0-2).
- Enforcement = the real house pattern: every admin server action independently re-checks `isAdmin` (`requireAdmin` per `app/actions/admin-markets.ts` — the authoritative boundary); `/admin` stays proxy-gated. (No rate limits on admin mutations — consistent with existing admin actions.)
- Acceptance:
  - [ ] Queue badge with pending count on the admin dashboard.
  - [ ] Resolution backfill + sticky dismissal verified by integration test.

**P0-9: Stance integrity & privacy (sensitive-data requirements)**
- Mechanics: Server Action (`app/actions/stances.ts`) following `app/actions/comments.ts` — `getSession` guard, `checkRateLimit` (user-spam surface), service call, `revalidatePath`, `{ ok, message }`. Mutations from event handlers only; no parallel REST/React-Query layer.
- Validation: vote exists, authenticated user, stance ∈ {for, against}.
- **Privacy (political opinions are "especially sensitive data" under Israel's Privacy Protection Law Amendment 13, in force since Aug 2025 — a higher bar than anything Polytical stores today):**
  - `user_stances` cascade-delete with the account.
  - Analytics events carry **no stance direction** (`stance_cast` payload: voteId only — count casts, never positions). No stance data ever leaves the DB to third-party tools.
  - Individual stances are not admin-visible; admin/analytics surfaces see k-anonymous aggregates only. Raw-table access = DB console only, and that's a named cost of the single-prod-DB reality.
  - Legal review (Open Question 1) explicitly covers user-stance sensitivity, not just source licensing.
- Acceptance:
  - [ ] Stance writes are `onConflictDoUpdate` upserts; tapping the selected stance deletes the row; both rate-limited.
  - [ ] PGlite integration tests: stance set/change/retract, threshold gating + re-lock, agreement math (abstain exclusion, decisive-only universe), aggregate k-gate, ingest idempotency + featured carve-out, queue resolution backfill — real Drizzle transactions, no DB mocks.

**P0-10: Analytics instrumentation (does not currently exist — explicit dependency)**
- The codebase has **no analytics today** (no PostHog, no capture util; PRD says "vendor TBD"). This feature's metrics need: vendor decision + a minimal server-side event util + five events: `feed_viewed`, `motion_viewed`, `stance_cast` (no direction), `match_unlocked`, `match_viewed`.
- Ingest freshness: cron heartbeat + structured `logger` line; the user-visible staleness state (P0-4) is the fallback alarm. (A real alerting stack is out of scope; see Open Questions.)
- Acceptance:
  - [ ] All five events flowing before launch; until the vendor lands, the DB itself answers the core questions (stance counts, unlock rate) via documented queries.

### P1 — Nice-to-Have (fast follow)

- **Pre-voting on upcoming motions** (pulled from v1 by review; mechanics now specced): pre-stances keyed by `agendaItemId` in their own table; when `linkedVoteId` resolves to the decisive vote, the user gets a confirm nudge ("ההצעה הוכרעה — עמדתכם עדיין בעד?"); **only confirmed stances enter matching** (motion text changes through reservations — silent transfer would misrepresent the user). Unconfirmed pre-stances surface as "ממתינות לאישור".
- **Market ↔ motion linking** (schema + admin + surfacing together): `markets.linkedVoteId` (integer, resolve-by-id like `marketSuggestions.personId`); "יש שוק על זה" chip on motion cards; motion context on market pages.
- **Full ranked list** beyond top/bottom 3, once thresholds prove out.
- **Share cards**: OG-image renderer for "ח"כ X מצביע 87% כמוני · 23 הצבעות משותפות" — basis line mandatory on the image (the % alone would screenshot as fact).
- **Push notifications** — sizing note: requires new `notification_type` enum values + prefs UI + a **broadcast** fan-out path (current infra is per-user event-driven only).
- **Auto-featuring heuristics**: second/third readings, no-confidence motions, high participation, close margins.
- **Agenda auto-ingest** from `KNS_PlmSessionItem` for announced sessions (v1 may launch admin-only).
- **Match history** over time.

### P2 — Future Considerations (design for, don't build)

- **K24 official archive backfill** (OData `Votes.svc` + `View_Vote_MK_Individual`), labelled "הכנסת ה-24" — `knessetNum` is on every row now precisely so this is additive.
- **Issue-tagged matching** ("votes like you *on security*") — vote↔bill joins stay clean so topic tags can attach to bills later.
- **Committee votes** if a feed materializes.
- **Election mode**: if the Knesset dissolves, `/my-match` becomes a voter guide — the strongest possible moment for this feature; the match page is designed to be reframed without rework.
- **Speech/protocol context** (pgvector staged per the storage decision).

## Success Metrics

**Leading (first 30 days post-launch):**
- ≥30% of WAU cast ≥1 stance (`stance_cast`).
- ≥40% of stance-casters reach match unlock; ≥80% of those view `/my-match`.
- ≥35% of stance-casters return to a votes surface in week 2 (independent of the unlock funnel).
- Vote surfaces (feed + detail) in ≥20% of sessions.
- Ingest freshness: 95% of plenum votes visible in-app within 6h (heartbeat + the user-visible staleness state as alarm).

**Lagging (90 days):**
- D7 of stance-casters ≥ 1.5× overall D7 (current core-PRD target: ≥18%). **Directional, not causal** — self-selection-confounded; a real A/B waits for traffic.
- Unmapped-name queue: 0 pending entries older than 7 days.
- (P1) Share-card CTR if shipped.

Measurement: the five P0-10 events + documented DB queries until the analytics vendor lands.

## Open Questions

1. **Licensing & legal** *(legal/Gal — blocking for public launch, not for build)*: (a) the `WebSiteApi` is the site's own backend, not documented open data — same written-confirmation action already flagged for OData in the 2026-05-31 decision; (b) user stances under Privacy Protection Law Amendment 13 — confirm the P0-9 controls (cascade delete, no third-party export, aggregate-only) satisfy counsel.
2. **`VoteResultId` domain** *(engineering — Phase A)*: probe the live domain; decide store-vs-drop for "didn't vote" rows; settle `totalDidntVote` vs a 4th enum value; restate the P0-5 "didn't vote" copy accordingly.
3. **Decisive-vote heuristic** *(engineering — Phase A)*: validate "latest accepted 2nd/3rd-reading, else latest electronic" against real reservation clusters (e.g. 46072/46073) before `isDecisive` backfills.
4. **Abstain in agreement math** *(product/data — non-blocking, v1 = exclude)*: half-credit alternative, revisit with data.
5. **Party match: majority-position vs mean-member-agreement** *(product/data — non-blocking, v1 = majority-position)*.
6. **Unlock threshold N=5** *(product — non-blocking)*: tune via the funnel post-launch.
7. **Pre-stance anchoring trade-off** *(product — P1)*: v1 shows the MK breakdown before the user's stance is set (outcome-anchoring accepted as in-scope); the stance-to-peek incentive on aggregates is mitigated by the k≥10 gate. Revisit when pre-voting ships.
8. **Alerting stack** *(engineering — non-blocking)*: ingest-failure alerting beyond heartbeat-log + visible staleness (the repo has no alerting infra; observability-alerts skill is an un-reskinned port).

## Timeline & Phasing

No hard external deadline, **but**: a no-confidence motion was on the June 1 agenda and dissolution chatter is live — if elections materialize, "מי מצביע כמוכם" becomes a flagship voter guide. Build order maximizes optionality:

- **Phase A — Data backbone**: P0-1/2/3 + the two Phase-A probes (result domain, decisive heuristic). Exit: full K25 backfill (~2.7k votes) lands with zero silent attribution drops, spot-checked against official pages; **superseding decision-log entry written**.
- **Phase B — Read surfaces** (internal milestone): P0-4/5/6. Delivers the original ask ("see what each MK voted for") for dogfooding.
- **Phase C — Participation & matching (launch gate)**: P0-7/8/9/10. Exit: full loop live.
- Dependencies: B needs A; C needs A + stance tables only. P1 ordering by metric impact (share cards first if growth is the goal).

## Source-of-Truth Invariants (restated because this feature lives or dies on them)

- Every `mk_votes` attribution traces to a human-verified stable-id mapping; an absent fact renders an explicit "not found" state, never a guess; withheld attributions are visibly reconciled against official counters.
- Every ingested row carries `sourceDataset`/`sourceUrl`/`fetchedAt`; every motion page links its official source.
- User stances never touch the coin ledger, never leave the database, and die with the account.
- Hebrew strings are display-only; every join is `personId`/`voteId`/`billId`/`factionId` — including faction-at-vote-time.
