# Implementation Plan — Knesset Votes & "Who Votes Like You"

> Spec: `docs/superpowers/specs/2026-06-10-knesset-votes-mk-matching.md` (draft v2) · Date: 2026-06-10
> Execution: **git worktree off `main`** (user-confirmed). Decision-log entry: skipped per user.
> Phases A (data backbone) → B (read surfaces) → C (participation & matching). Launch gate = end of C.

---

## 0. Worktree setup (first, before any code)

```bash
git -C /Users/gal/personal-projects/polytical worktree add ../polytical-votes -b feat/knesset-votes main
cd ../polytical-votes && pnpm install
cp ../polytical/.env .env   # DATABASE_URL — note: this IS prod (single-prod-db-no-dev)
```
- ⚠️ Workflow/Agent subagents run in the **repo root, not the worktree** — all isolation-sensitive steps (edits, db:generate, tests) run inline.
- Commit + push early and often (house rule).
- `pnpm db:generate` needs a TTY — run inline, never via a background shell.

## 1. Files read (research basis — all verified 2026-06-10)

| Area | Files |
|---|---|
| Schema & conventions | `app/lib/schema.ts` (478 ln — uuid-PK+unique-stable-id, provenance triplet notNull, pgEnum style, in-schema indexes incl. partial + GIN, composite-PK junctions, user-FK cascade) |
| Knesset pipeline | `app/lib/knesset/{odata,odata-types,normalize,repo,search-name}.ts`, `scripts/ingest-knesset.ts`, `app/lib/db.ts`, `app/lib/db-guards.ts` |
| Politicians | `app/lib/politicians/{repo,adapter}.ts`, `lib/types.ts`, `lib/cat.ts`, `lib/rarity.ts` |
| Actions/auth/cron | `app/actions/{comments,admin-markets}.ts`, `app/lib/rate-limit.ts`, `app/api/cron/closing-soon/route.ts`, `vercel.json`, `lib/auth.ts`, `proxy.ts`, `app/lib/errors.ts`, `app/lib/logger.ts`, `app/lib/comments/{service,repo}.ts`, `app/lib/notifications/{service,repo,prefs}.ts` |
| UI/design | `app/politician/[id]/page.tsx` (+`loading.tsx`), `app/market/[id]/page.tsx` (+`loading.tsx`), `app/page.tsx`, `components/{site-header,mobile-menu,status-chip,odds-bar,empty-state,politician-portrait,caricature-card,icons}.tsx`, `app/globals.css`, `docs/design/design-system-spec.md`, `lib/{time,format}.ts`, `eslint.config.mjs` |
| Testing | `vitest.config.ts`, `app/lib/testing/create-test-db.ts`, `app/lib/bets/service.test.ts`, `app/lib/ledger/invariants.test.ts`, `app/lib/knesset/pipeline.integration.test.ts`, `package.json`, `.storybook/{main,preview}.ts`, `components/story-mocks.ts` |
| Drizzle d.ts | `node_modules/drizzle-orm/pg-core/**` (see §4) |

## 2. Convention Compliance

| Convention (CLAUDE.md / digests) | How the plan complies |
|---|---|
| Route → Service → Repository; repos own DB access | New modules `app/lib/votes/`, `app/lib/stances/`, `app/lib/match/` each as `service.ts` + `repo.ts`; pages/actions never touch `db` directly |
| Scope guard first line | Local `reqUser()` per repo (house pattern, `app/lib/notifications/repo.ts:35-38`) on every `user_stances` read/write |
| Errors over fallbacks | New typed errors in flat `app/lib/errors.ts`; unknown website `VoteResultId` **throws**, unmapped MK name **queues** — never guessed |
| RORO + injectable `{ db = defaultDb }` | Every exported fn; the driver-agnostic `PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>` type (= PGlite injection mechanism) |
| No inline Zod | Repo has **zero Zod** anywhere; convention is TS interfaces + error classes — we follow it (no Zod introduced) |
| Stable-id joins, fuzzy = discovery only | Attribution via verified `mk_name_mappings` exact-equality on canonical key; `normalizeSearchName` reused for keying only |
| Provenance on every ingested row | Triplet notNull on all ingest tables; `sourceDataset='admin'` + admin-route URL convention for admin-authored `agenda_items` rows |
| Tokens/OKLCH-mechanism, logical props, Hebrew, Asia/Jerusalem | New `--abstain`/`--abstain-soft` added to `globals.css` first; `.nums`/`<bdi>` per design-spec §5; all dates via `lib/time.ts` (ESLint enforces) |
| `db:push` drops migration-only indexes | All new indexes declared **in-schema** |
| Files < 500 lines | `schema.ts` is 478 — new tables go in `app/lib/schema-votes.ts`, re-exported via `export * from "./schema-votes"` (FK thunks `() => users.id` make the cycle safe); `drizzle.config.ts` schema path updated to include both files (verify at build) |
| `assertNonProductionDb()` first line of mutating scripts | Yes in `scripts/ingest-votes.ts` + `scripts/bootstrap-mk-mapping.ts` — **knowing it passes silently on the prod Neon host** (memory: hostname lacks "prod"); backfill is therefore a deliberate, idempotent, manual prod operation |
| `pnpm lint` + `pnpm typecheck` before stopping; `/code-review` before push | Final steps §10 |
| Login return param | **`callbackUrl`** (house convention, `proxy.ts:35`), not the spec's `returnTo` |

## 3. Verified third-party signatures

### Knesset website API (live-probed 2026-06-10, curl from local)
| Endpoint | Shape |
|---|---|
| `POST https://knesset.gov.il/WebSiteApi/knessetapi/Votes/GetVotesHeaders` body `{"SearchType":2,"FromDate":"YYYY-MM-DD","ToDate":"YYYY-MM-DD"}` | `{Table:[{VoteId,VoteProtocolNo,VoteDate:"2026-06-09T19:00:00" (Jerusalem wall-clock, no tz),VoteDateStr,VoteTimeStr,VoteType:"אלקטרונית"\|"הרמת יד",ItemTitle,KnessetId,SessionId}]}`; 141 rows for a 40-day window returned in one response; `PageNum` ignored |
| `GET …/Votes/GetVoteDetails/{voteId}` | `{VoteHeader:[{…,FK_ItemID,Decision,IsForAccepted,AcceptedText,VoteTypeId}],VoteCounters:[{Title,countOfResult,rn}],VoteDetails:[{MkName:"אזולאי ינון" (Last First),FactionName,VoteResultId:7(=בעד),Title}],DescreetVoteResults,HandsWithoutCountersAccepted,NextAndPrevVotes}` — hand votes: `VoteDetails=[]` |
| `GET …/MKs/GetMksDropDown?languagekey=he` | `[{ID,Name,IsCurrent}]` — all MKs ever (website id space; Liberman=214) |

### Official OData (live-probed)
- `Votes.svc/vote_result_type` → official domain `{0:בוטל,1:בעד,2:נגד,3:נמנע,4:לא הצביע}`. **Website uses a different id space** (7=בעד observed) — HARD GATE A-5 enumerates it.
- `ParliamentInfo.svc/KNS_PersonToPosition?$filter=KnessetNum eq 25 and PositionID eq 54` → **190 faction-stint rows** with `PersonID,FactionID,FactionName,StartDate,FinishDate` — official faction-at-vote-time intervals + the departed-MK roster.
- `KNS_Bill.BillID == FK_ItemID` verified (2217042 ↔ same title) — votes join `bills` by stable id.
- Open Knesset crosswalk **back online** (decision-log 404 is stale): `production.oknesset.org/pipelines/data/members/mk_individual/mk_individual.csv`, 1,185 rows, columns `mk_individual_id` (=website ID, Liberman 214) + `PersonID` (=427) — fetchable via existing `fetchOknessetCsv` (`app/lib/knesset/odata.ts:164`).

### Drizzle (from `node_modules/drizzle-orm@0.45.2` d.ts)
- `pgEnum(enumName, values)` — `pg-core/columns/enum.d.ts:82`; value union via `(typeof e.enumValues)[number]`.
- `index(name?)`/`uniqueIndex(name?)` → `.on(...cols)` / `.using('gin', sql…)` / `.where(condition: SQL)` — `pg-core/indexes.d.ts:77-78,42,55,67`.
- `primaryKey({columns: [c1, ...]})` — `pg-core/primary-keys.d.ts:4-12`.
- `onConflictDoUpdate({target: IndexColumn|IndexColumn[], set, targetWhere?, setWhere?})` — `pg-core/query-builders/insert.d.ts:171,61-68`; composite target pairs with a table-level `unique()` constraint (house precedent `repo.ts:149` + `schema.ts:237`).
- `references(() => col, {onDelete: 'cascade'})` — `pg-core/columns/common.d.ts:45`, actions union `foreign-keys.d.ts:4`.
- drizzle-kit `0.31.10`; `pnpm db:generate` (TTY) / `pnpm db:push`.

## 4. Reused data structures (do NOT redefine)

| Shape | Pointer | Use |
|---|---|---|
| Provenance | `Prov { sourceUrl; fetchedAt }` — `app/lib/knesset/normalize.ts:7` | All votes normalizers |
| Driver-agnostic DB type | `KnessetDb` — `app/lib/knesset/repo.ts:17-21` (re-declare privately per module, house style) | All new services/repos |
| Upsert helpers | `sqlExcluded()` + `BATCH=100` + `chunk()` — `app/lib/knesset/repo.ts:24-34` | Vote upserts (extract or mirror) |
| Hebrew normalization | `normalizeSearchName()` — `app/lib/knesset/search-name.ts:47` | Canonical name keys (both sides, always) |
| OData client | `fetchAll<T>()`, `buildODataUrl()` — `app/lib/knesset/odata.ts:111,32` | Faction stints + roster ingest |
| Open Knesset CSV | `fetchOknessetCsv()`, `parseCsv()` — `app/lib/knesset/odata.ts:164,138` | Mapping bootstrap |
| OData date parsing | `parseODataDate()` — `app/lib/knesset/normalize.ts:15` | Stint dates |
| Action result | `type ActionResult = { ok: boolean; message?: string }` — `app/actions/admin-markets.ts:22` | All new actions |
| Rate limiter | `checkRateLimit({key,max,windowMs})` — `app/lib/rate-limit.ts:16` | `stance:${userId}` 40/60s (mirrors `upvote:`) |
| Session | `getSession()` — `lib/auth.ts:111-115`; `session?.user?.isAdmin` | Actions + RSCs |
| `requireAdmin()` | file-local in `app/actions/admin-markets.ts:24-27` — **duplicate** into `app/actions/admin-votes.ts` (house pattern, not exported) |
| Scope guard | `reqUser()` — `app/lib/notifications/repo.ts:35-38` | `app/lib/stances/repo.ts` |
| Queue model | `marketSuggestions` status/reviewedBy/reviewedAt — `app/lib/schema.ts:347-351` | `unmapped_mk_names` shape |
| Card types | `Politician`, `CatColor` — `lib/types.ts:12-27`; `dbToCard()` — `app/lib/politicians/adapter.ts:44`; `PoliticianRow` — `app/lib/politicians/repo.ts:12` | Match page, MK chips |
| UI atoms | `StatusChip` (`components/status-chip.tsx:6-14`), odds-bar segment pattern (`components/odds-bar.tsx:11-33`), `EmptyState` (`components/empty-state.tsx:5-11`), `PoliticianPortrait size="sm"` (`components/politician-portrait.tsx:33`), `Ballot` icon (`components/icons.tsx:231`) | Feed/detail/match surfaces |
| Time/format | `formatDate/formatDateTime` + `APP_TIMEZONE` — `lib/time.ts:10,29,34`; `pct()` — `lib/format.ts:12` | All date/percent display |
| Politician activity section | `getPoliticianActivity()` — `app/lib/politicians/repo.ts:91-117` | Template for P0-6 voting record |

**Searched, nothing exists** (new definitions justified): no `stance`/vote tables or routes anywhere (verified grep); no analytics util (P0-10 confirmed absent); no pagination precedent (introduced URL-cursor style, §7-B1); no shared seed factories or fixtures dirs (house = local row-builders, §9).

## 5. Fixtures

No `fixtures/`/`__fixtures__/` dirs exist; house convention is per-file local row-builders grounded in real captures (`p2pRow` in `pipeline.integration.test.ts:14`). Plan:
- **A-4 capture step (before production parsing code):** save verbatim live responses — `GetVotesHeaders` (one window incl. hand + electronic votes), `GetVoteDetails/46078` (electronic, 5 voters), `GetVoteDetails/46063` (hand vote, empty details), `MksDropDown` (truncated) — into `app/lib/votes/test-payloads.ts` as typed consts; tests' `voteHeaderRow()`/`voteDetailRow()` builders derive from them.
- Refresh at the end if live shapes diverged during implementation; delete unused captures.

---

## 6. Phase A — Data backbone

### A-1. Schema (`app/lib/schema-votes.ts`, re-exported from `schema.ts`; `politicians.mkSiteId` edit in `schema.ts`)

New enums (house naming `camelName = pgEnum("snake_name", …)`):
`mkVoteResult = pgEnum("mk_vote_result", ["for","against","abstain","didnt_vote"])` · `knessetVoteType("knesset_vote_type", ["electronic","hand"])` · `voteDetailsStatus("vote_details_status", ["pending_details","complete"])` · `userStance("user_stance", ["for","against"])` · `mappingStatus("mapping_status", ["pending","resolved","dismissed"])` · `agendaItemStatus("agenda_item_status", ["announced","voted","dropped"])` · `agendaItemSource("agenda_item_source", ["ingest","admin"])`.

Tables (all follow uuid-PK + unique-stable-id except junctions; provenance triplet notNull on ingest tables; FK-by-value to Knesset ids; real `.references()` to `users`):

1. **`knessetVotes` (`knesset_votes`)** — `id` uuid PK; `voteId` int notNull unique; `knessetNum` int notNull; `itemId` int (null until details land); `billId` int (set when itemId ∈ `bills.billId`); `titleHe` text notNull; `voteDate` timestamp notNull (**UTC instant**, converted from Jerusalem wall-clock — see A-2); `voteType` enum notNull; `decisionHe` text; `isAccepted` boolean; `totalFor/totalAgainst/totalAbstain/totalDidntVote` int nullable (null while `pending_details`); `isDecisive` boolean notNull default false; `featured` boolean notNull default false (**admin-owned, carved out of upsert SET** per the `dob` precedent `repo.ts:52`); `detailsStatus` enum notNull default `pending_details`; provenance. Indexes: `voteDate`, `itemId`, `billId`, partial `…on(t.voteDate).where(sql\`${t.featured} = true\`)`.
2. **`mkVotes` (`mk_votes`)** — composite PK (`voteId`,`personId`) (junction style `schema.ts:296`); `result` mkVoteResult notNull; `factionId` int (faction-at-vote-time from stints; null = unresolved, logged); provenance. Index `personId`. Upsert target = composite + table-level `unique()` (house pairing).
3. **`mkVotesRaw` (`mk_votes_raw`)** — full retained evidence, **every** VoteDetails row lands here verbatim: uuid PK; `voteId` int notNull; `mkNameRaw` text notNull; `mkNameKey` text notNull (canonical key, A-3); `factionNameRaw` text; `voteResultIdRaw` int notNull; `resultTitleRaw` text notNull; provenance. `unique(voteId, mkNameKey)`; index `mkNameKey`. Resolution backfills `mk_votes` from here — no API re-fetch.
4. **`mkNameMappings` (`mk_name_mappings`)** — the verified attribution map: uuid PK; `nameKey` text notNull unique; `personId` int notNull; `source` text notNull (`'crosswalk' | 'admin'`); `verifiedAt` timestamp; `createdAt` defaultNow. (Supports aliases: many keys → one person.)
5. **`unmappedMkNames` (`unmapped_mk_names`)** — review queue (modeled on `marketSuggestions`): uuid PK; `nameKey` text notNull unique; `nameRaw` text notNull (first-seen verbatim); `status` mappingStatus notNull default pending; `resolvedPersonId` int; `reviewedBy` text `.references(() => users.id)`; `reviewedAt` timestamp; `firstSeenAt` defaultNow.
6. **`factionStints` (`faction_stints`)** — official faction-at-vote-time intervals: uuid PK; `personToPositionId` int notNull unique (KNS_PersonToPosition stable id); `personId`/`factionId`/`knessetNum` int notNull; `startDate` timestamp notNull; `finishDate` timestamp (null = ongoing); provenance. Index `personId`.
7. **`userStances` (`user_stances`)** — composite PK (`userId`,`voteId`); `userId` text notNull `.references(() => users.id, { onDelete: "cascade" })` (**sensitive data dies with the account**); `voteId` int notNull (FK-by-value); `stance` userStance notNull; `createdAt`/`updatedAt` defaultNow. Index `voteId` (aggregate scans).
8. **`agendaItems` (`agenda_items`)** — uuid PK; `itemId` int unique **nullable** (admin rows have none); `titleHe` notNull; `expectedDate` date; `billId` int; `status` enum default announced; `addedBy` enum notNull; `linkedVoteId` int; provenance notNull with the `sourceDataset='admin'` convention; `createdAt` defaultNow. *(v1 read-only + admin CRUD; no pre-stances.)*
9. **`politicians.mkSiteId`** — int unique nullable, added in `schema.ts` (provenance/cross-check column for the crosswalk).

Then: update `drizzle.config.ts` schema path to cover both files (read it first); run `pnpm db:generate` **inline (TTY)** → migration `0017_*`; `pnpm db:push` to Neon. `createTestDb` replays `./drizzle` → tests see the tables automatically. Verify: `pnpm typecheck` + harness smoke test.

### A-2. Time conversion (`lib/time.ts` — the only file ESLint allows `Intl` in)
Add `jerusalemWallToUtc(naive: string): Date` (website returns `"2026-06-09T19:00:00"` Jerusalem wall-clock; convert via `Intl.DateTimeFormat` offset trick mirroring `toDateOnly`'s approach in `normalize.ts:35-50`). Unit test with DST boundary cases (IDT→IST transition dates).

### A-3. Canonical name key (`app/lib/votes/name-key.ts`)
`nameKey(input) = normalizeSearchName(input).split(" ").sort().join(" ")` — **token-order-insensitive** because `VoteDetails.MkName` is "Last First" while the dropdown/OData are "First Last". Both mapping keys and incoming names always pass through this one function. Bootstrap detects **key collisions** (two persons → same key) and excludes them from auto-mapping (they always queue). Unit tests: order insensitivity, niqqud/final-forms, גרש names (ג׳בארין), collision behavior.

### A-4. Website API client (`app/lib/votes/website-api.ts`)
Mirror `odata.ts` discipline: `fetchVoteHeaders({fromDate,toDate})` (POST, JSON body, retry ×2 + backoff, throttle 250ms, browser-ish UA), `fetchVoteDetails({voteId})` (GET), `fetchMksDropdown()`. Typed raw interfaces in `app/lib/votes/website-types.ts` (from the captured payloads, §5). Logs `votes.api.retry` / `votes.api.fetch_failed`.

### A-5. Result-domain enumeration — **HARD GATE**
`scripts/ingest-votes.ts --probe`: sweep all K25 headers (monthly windows from 2022-11), fetch details for a stratified sample (~100 votes incl. no-confidence + reservations + hand votes), emit distinct `(VoteResultId, Title)` pairs + per-item vote-cluster shapes. Outputs: (a) the verified `WEBSITE_RESULT_BY_ID: Record<number, MkVoteResult>` map (unknown id at ingest → **throw**, never guess); (b) validation of the decisive-vote heuristic (latest accepted 2nd/3rd-reading electronic vote of the item, else latest electronic) against real clusters (46072/46073); (c) whether headers windows ever truncate (compare `VoteDateLongStr` "נמצאו N תוצאות" against rows returned).

### A-6. Roster extension + faction stints (`app/lib/knesset/` additions)
- New ingest entity `factionStints`: `fetchAll<KnsPersonToPosition>({filter: "KnessetNum eq 25 and PositionID eq 54"})` (190 rows) → upsert on `personToPositionId`.
- Extend members ingest to **all K25-tenured persons**: distinct PersonIDs from stints ∪ current `CURRENT_MK_FILTER` set; `active` = has an open (FinishDate null) MK position; departed get `active=false`. New normalizer `normalizeK25Members` beside `normalizeCurrentMembers` (`normalize.ts:98` — keep the old one for other call sites).
- **Call-site sweep (behavior change!):** `getAllPoliticians`/`getFeaturedPoliticians` (`app/lib/politicians/repo.ts:27,34`) currently have **no `active` filter** — add `eq(politicians.active, true)` defaults so departed MKs don't enter the gallery/home/collection; `/politician/[id]` keeps serving them (no filter). Audit every caller of both functions.

### A-7. Mapping bootstrap (`scripts/bootstrap-mk-mapping.ts`)
`assertNonProductionDb()` first. Chain (no fuzzy matching anywhere): `MksDropDown (ID, Name)` → CSV `mk_individual.csv (mk_individual_id → PersonID)` → `politicians.personId`. Writes `politicians.mkSiteId` + `mk_name_mappings` rows (`nameKey(dropdownName) → personId`, source `crosswalk`) **also** adding `nameKey(politicians.nameHe)` as alias rows where distinct. Outputs a human-verification report (`/tmp/mk-mapping-report.md`: every mapping + collisions + unmatched) — **human sign-off before any attribution runs** (P0-2 acceptance). Liberman assertion (214↔427) hard-coded as a sanity check.

### A-8. Ingest core (`app/lib/votes/{normalize,repo,service}.ts`)
- `normalize.ts`: header → `knessetVotes` row (wall-clock → UTC via A-2; voteType from the Hebrew string — closed map, unknown → throw); details → counters + `mkVotesRaw` rows + attribution pass.
- `repo.ts`: batched (≤100) upserts — `upsertVoteHeaders` (carve-out: `featured`, `isDecisive` excluded from SET after first insert... `isDecisive` recomputed by service, `featured` never touched); `upsertMkVotesRaw`; `attributeRawRows` (join raw `mkNameKey` → `mk_name_mappings` → insert `mk_votes` with faction-at-vote-time lookup from `faction_stints` interval containing `voteDate`; no covering stint → `factionId` null + `logger.warn`); `queueUnmappedNames` (insert-or-ignore pending rows; **dismissed names don't re-queue** — check status); `resolveUnmappedName({nameKey, personId, reviewedBy})` — single transaction: insert mapping row + backfill `mk_votes` from **retained** `mk_votes_raw` + mark resolved.
- `service.ts`: `ingestVotes({db, fromDate, toDate})` — headers sweep → per new/changed vote details fetch → on detail failure leave `pending_details` + retry next run → recompute `isDecisive` per touched `itemId`; `getVotesFeed({before, limit})`, `getVoteDetail({voteId})`, `getRecentMkVotes({personId})`, `getFreshness()` (max `fetchedAt`).

### A-9. Backfill + cron
- `scripts/ingest-votes.ts` (thin wrapper, `tsx --env-file=.env`): `--probe` (A-5), `--backfill` (monthly windows 2022-11→now, idempotent, resumable), default = last-7-days incremental. package.json: `"ingest:votes"`, `"ingest:votes:backfill"`.
- `app/api/cron/ingest-votes/route.ts`: clone the `closing-soon` guard verbatim (503 no secret / 401 wrong bearer, `runtime = "nodejs"`, `export const maxDuration = 300`); roster+stints refresh **before** vote ingest (Norwegian-churn ordering, P0-2 acceptance). `vercel.json`: add `{"path": "/api/cron/ingest-votes", "schedule": "0 */2 * * *"}` (every 2h; simpler than plenum-day gating — flag Vercel plan cron limits, §11).

### A-10. Phase A tests (house harness: `let h` + `beforeEach createTestDb()` + `afterEach h.close()`, flat `test()`, UTC `Z`-string dates, local builders from §5 payloads)
1. `app/lib/votes/pipeline.integration.test.ts` — ingest idempotency (run twice, count rows); `featured` survives re-ingest; `pending_details` → retry completes; hand vote = zero raw rows + `voteType='hand'`; unknown `VoteResultId` throws.
2. Attribution: mapped name attributes with correct faction-at-vote-time (seed two stints, vote dated inside the older one → older factionId — **the party-switcher test**); unmapped name queues once + withholds; dismissal sticky; `resolveUnmappedName` transactionally backfills all retained raw rows.
3. `name-key.test.ts`, `time.test.ts` (DST), normalize unit tests.
4. **Exit gate:** run backfill against prod (deliberate, idempotent), spot-check ≥10 votes against official pages, zero silent attribution drops (every raw row either in `mk_votes` or covered by a queue entry).

---

## 7. Phase B — Read surfaces (internal milestone, dogfood)

### B-0. Design tokens (`app/globals.css` first, per new-color rule)
Add `--abstain`/`--abstain-soft` to `:root` + `[data-theme="dark"]` + `@theme` mappings (`--color-abstain`…). Values: muted slate distinct from `--muted` track (light ≈ `#51607a`/`#e8edf5`; dark ≈ `#a9b2d6`/`#1a2138`) — confirm against both themes in browser. Extend `StatusChip` TONE with `abstain` tone.

### B-1. `/votes` feed (`app/votes/page.tsx` + `loading.tsx`)
- RSC; `searchParams: Promise<{before?: string}>` (house awaited-Promise idiom). **Pagination = URL cursor** (`?before=<voteDate ISO>`, plain `<Link>` "לעמודים קודמים", page size 30) — no precedent exists, this is the zero-JS house-consistent introduction.
- Item-grouping: service groups window rows by `itemId`, decisive primary + others in `<details>` expandable.
- Sections: featured rail (admin `featured`, last month) → feed → "על סדר היום" read-only (`agenda_items`, `EmptyState` "אין הצעות על סדר היום כרגע").
- Totals bar: 3–4 segment variant of the `odds-bar.tsx` pattern (`bg-positive`/`bg-negative`/`bg-abstain`), `.nums` labels.
- Freshness: "עודכן לאחרונה {formatDateTime}" from `getFreshness()`; stale state (>6h on Mon–Wed) renders a visible warning banner.
- Badge: `StatusChip` positive/negative for התקבל/נדחה.
- `loading.tsx` mirrors `market/[id]/loading.tsx` (role="status", pulse blocks).
- Stance state shown if logged in (Phase C widget slots here; until C, render read-only).

### B-2. `/vote/[id]` detail (`app/vote/[id]/page.tsx` + `loading.tsx`)
- Singular-detail route (house: `/market/[id]`); `voteId = Number(id)`, `notFound()` on miss.
- Header: title, date, decision text, `התקבל`/`נדחה`, counters, official source `<a target="_blank" rel="noopener noreferrer">למקור הרשמי באתר הכנסת</a>` (resolution-source precedent `market/[id]/page.tsx:112-121`).
- Breakdown grouped by **faction-at-vote-time**: faction header (name via `factions` join on `mk_votes.factionId`) → MK chips (`PoliticianPortrait size="sm"` + name, tinted by result tokens), each linking `/politician/[personId]`.
- Reconciliation: chips-vs-counters remainder line — withheld pending rows ("N הצבעות ממתינות לאימות זהות"), didn't-vote count, hand votes = totals-only + "אין פירוט אישי בהצבעה בהרמת ידיים"; `pending_details` = totals-only + "הפירוט בדרך".
- Related bill link when `billId` set.
- Numerals: `.nums` + `<bdi>` everywhere percentages/counts sit in Hebrew runs.

### B-3. Politician voting record (`app/politician/[id]/page.tsx`)
New section between the OData provenance line (line ~136) and "השווקים של" (line ~138): `h2 mb-3 mt-8 font-display text-xl font-bold` "הצבעות אחרונות", two stacks (בעד/נגד, latest ~10 decisive-first via `getRecentMkVotes`), rows = `rounded-lg border border-border bg-card` linking `/vote/[id]`; `EmptyState` when no attributed votes.

### B-4. Entry points
- `components/site-header.tsx:15-22` NAV: add `{ href: "/votes", label: "הצבעות" }` (7 items — verify the `md`–`lg` squeeze in browser; if it wraps, drop `/#leaderboard` from NAV per design call — flag to Gal).
- Home: new `<section id="votes" className="scroll-mt-24 …">` between `#markets` and `#politicians` (re-balance `bg-muted` striping), featured-motion card + "לכל ההצבעות" link.

### B-5. Phase B verification
Stories for new presentational atoms (`vote-totals-bar`, extended `status-chip`) with `createVote()` factory in `components/story-mocks.ts` (house pattern: stories only for shared presentational components, not RSC pages). Then `pnpm lint && pnpm typecheck && pnpm test`, then **browser-qa** (quick mode) on :3210 — feed, detail (electronic + hand + pending), politician record, RTL/numeral rendering, dark mode, mobile menu with 7 items.

---

## 8. Phase C — Participation & matching (launch gate)

### C-1. Stances (`app/lib/stances/{service,repo}.ts`, `app/actions/stances.ts`)
- Repo: `reqUser()` scope guard; `setStance` = `onConflictDoUpdate` on (`userId`,`voteId`) with toggle-delete semantics in service: same stance tapped again → DELETE row (retraction); `getStanceCounts({voteId})`, `getUserStances({userId})`, `getStanceAggregate({voteId, viewerId})` — returns null unless viewer has a stance AND distinct stancers ≥ 10 (**k-gate**), else `{forPct, total}`.
- Action (clone `upvoteCommentAction` shape): `getSession` → Hebrew login message → `checkRateLimit({key: \`stance:${userId}\`, max: 40, windowMs: 60_000})` → service → `revalidatePath("/vote/[id]"-path + "/votes" + "/my-match")` → `{ ok, stance, stanceCount }` (count feeds the progress toast).
- Stance widget (client island, outcome-chip spec — design §4 line 118: toggle pills, selected → filled `bg-positive`/`bg-negative` + `-foreground` text): above the breakdown on `/vote/[id]`, on feed cards; anonymous → `/login?callbackUrl=<encoded>`. Post-stance: aggregate reveal + progress nudge "עוד N עמדות לפתיחת ההתאמה" linking `/my-match`.

### C-2. Matching (`app/lib/match/service.ts`, `app/my-match/page.tsx` + `loading.tsx`)
- One SQL pass: `user_stances ⋈ mk_votes ⋈ knesset_votes` where `isDecisive AND voteType='electronic' AND result IN ('for','against')`; group by `personId`: `shared`, `matches`; qualify `shared ≥ 5`; join `politicians` filter `active`. Compute on-read.
- Presentation: top-3 + bottom-3 `CaricatureCard`/`PoliticianPortrait` (fallback for card-less MKs) each with "{pct}% · {shared} הצבעות משותפות" (`.nums`); `shared < 10` → "מבוסס על מעט הצבעות" treatment; ties → larger `shared`, then alphabetical; <6 qualified MKs → single partial list + CTA (never both panels, MK never in both).
- Party match: per decisive vote per `factionId`, majority (>50% of its for/against voters; ties/splits skip); same thresholds; best + worst faction; independent empty state.
- States: anonymous → login CTA; <5 stances → progress "קבעו עמדה על עוד N הצעות" + featured-motions CTA; retraction below threshold re-locks (derive-don't-sync — no stored score).
- NAV/profile entry: link from profile + post-stance toast.

### C-3. Admin (`app/actions/admin-votes.ts` + `app/admin/` section)
Own `requireAdmin()` copy (house: file-local, throws `NotAdminError`; no rate limits on admin actions). Actions: `toggleVoteFeaturedAction`, `agendaItemUpsert/DeleteAction` (admin rows: `sourceDataset:'admin'`, `sourceUrl:'/admin'`), `resolveUnmappedNameAction({nameKey, personId})` → service A-8 resolver, `dismissUnmappedNameAction`. Admin dashboard: pending-queue badge count, queue table (nameRaw, occurrences count from raw, resolve-by-personId picker reusing the admin attach-MK search pattern), featured toggle on a recent-votes list, agenda CRUD form.

### C-4. Analytics (P0-10, minimal — vendor TBD)
`app/lib/track.ts`: `track(event, meta)` → `logger.info(\`analytics.${event}\`, meta)` (structured, greppable; re-pointable to a vendor later). Five events: `feed_viewed` (RSC), `motion_viewed`, `stance_cast` (**voteId only — never the direction**, P0-9 privacy), `match_unlocked`, `match_viewed`. Document the DB queries answering the spec metrics (stance counts, unlock rate) in the plan's companion notes. Vendor decision remains open.

### C-5. Phase C tests
1. `app/lib/stances/service.test.ts` — set/change/retract round-trip (read rows back); k-gate (9 stancers → null, 10 → aggregate); cascade-delete with user row.
2. `app/lib/match/service.test.ts` — agreement math (abstain/didnt_vote/absence excluded); decisive-only universe (reservation votes ignored); threshold + re-lock on retraction; tie-break determinism; party majority incl. split-faction skip; Liberman 100% scenario (5 seeded decisive votes).
3. `app/actions` covered through service tests (house: actions are thin; no action-level test precedent).
4. Storybook: stance-toggle story with stubbed action via the Vite-alias mock precedent (`.storybook/main.ts:27-32`).
5. **browser-qa (full)**: anonymous/logged flows, stance set→aggregate reveal→match unlock→retract→re-lock, admin queue resolve, RTL, dark, mobile.

---

## 9. Testing conventions (grounded — the `testing` skill describes another repo; verified real infra)

- Vitest projects are `node` (`**/*.test.ts`) and `dom` (`**/*.test.tsx`) — extension routes the file; integration + unit share `node`. `hookTimeout: 30000` because migration replay in `beforeEach` is slow — **keep new migrations lean**.
- `createTestDb()` (`app/lib/testing/create-test-db.ts`) replays `./drizzle` → **generated migration is mandatory** for tests to see the tables.
- No Playwright/e2e/preflight in this repo — browser verification via the browser-qa skill; commands available: `pnpm test`, `pnpm lint`, `pnpm typecheck`.
- Test behavior: assert by re-reading rows/service reads, never call-shapes; mock nothing internal (PGlite injection is via the `{db}` parameter).

## 10. Final steps (in order)

1. Refresh `app/lib/votes/test-payloads.ts` captures if live shapes differed; delete unused.
2. `pnpm lint && pnpm typecheck && pnpm test` — green before stopping (house rule). (No `/wrap-up` skill exists in this repo; decision-log entry skipped per user.)
3. `/code-review` before push; never `--no-verify`.
4. Push branch, open PR (worktree merges back to `main` via PR), attach browser-qa screenshots via `pr-media`.

## 11. Verification Status

### Verified (docs / source / live probe)
| Item | Citation |
|---|---|
| GetVotesHeaders/GetVoteDetails/MksDropDown shapes + K25 liveness (through 2026-06-09) | live curl probes 2026-06-10 (§3) |
| FK_ItemID = KNS_Bill.BillID | live probe (BillID 2217042) |
| Official result domain {0..4} | `Votes.svc/vote_result_type` probe |
| Faction stints (190 K25 rows, intervals) | `KNS_PersonToPosition` probe |
| Open Knesset crosswalk online, `mk_individual_id↔PersonID` (214↔427) | CSV fetch 2026-06-10 |
| All Drizzle APIs used | `node_modules/drizzle-orm` d.ts (§3) |
| All house patterns/pointers | four layer digests, file:line throughout (§1, §4) |

### Resolved during build (live probes, 2026-06-10)
| Item | Result |
|---|---|
| Website `VoteResultId` domain — **RESOLVED** | `6=נוכח (didn't vote) · 7=בעד · 8=נגד · 9=נמנע`; counter title "נוכח ולא הצביע". 29-vote stratified sample across the full term. Unknown id at ingest still throws. |
| Header `VoteType` domain — **RESOLVED, spec assumption was wrong** | 4 types over all 6,979 K25 votes: אלקטרונית 6436 · **שמית 458 (roll-call — full per-MK rows, scoreable!)** · הרמת יד 77 (counters only) · **חשאית 8 (secret — candidate totals in `DescreetVoteResults`, never scoreable)**. Detail-level type strings differ from header strings ("הצבעה אלקטרונית", "הרמת ידיים עם מונים"). Enum extended to 4 values (migration 0021). Scoreable universe = electronic + roll_call. |
| Headers windowing truncation — **never truncates** | Banner "נמצאו N תוצאות" == rows returned in all 44 monthly windows (max 478 rows, 2026-03). |
| Decisive heuristic — **confirmed implementable** | Decision strings carry readings ("לקבל את הצעת החוק בקריאה שלישית" / "לקבל בקריאה שנייה"); the 2026 budget item had 142 votes. Heuristic: highest-reading accepted scoreable vote, else latest scoreable. Validate against that cluster in A-10. |
| drizzle.config array + `export *` visibility — **works** | Migration 0020 saw all 8 tables through the re-export. |
| db:push TTY truncate prompt — **avoided** | Migrations applied via a guarded one-off runner (statement-leading destructive check); db:push verified in-sync after. |
| DST wall-clock conversion — **tested** | `jerusalemWallToUtc` unit tests cover IST/IDT + both 2026 transition boundaries. |

### NOT verified — needs live testing
| Item | Gate | How to verify | Owner |
|---|---|---|---|
| **Knesset API reachability from Vercel egress IPs** (Radware may treat DC IPs differently than local curl) | **HARD GATE** — before relying on cron | deploy a probe route to a preview env before Phase C ships; fallback: GH-Actions/local scheduled ingest | impl |
| Vercel cron plan limits (existing hourly cron suggests Pro; adding a 2h cron) | check Vercel dashboard before `vercel.json` change | Gal |
| 7-item desktop nav fit at `md` | browser-qa in B-5; fallback prepared (drop a hash link) | impl + Gal |

