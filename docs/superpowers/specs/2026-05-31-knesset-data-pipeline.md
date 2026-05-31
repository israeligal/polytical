# Polytical — Knesset Data Pipeline Spec

| | |
|---|---|
| **Status** | Draft for review |
| **Date** | 2026-05-31 |
| **Owner** | Gal |
| **Depends on** | [PRD](2026-05-31-polytical-prd.md) §8 (sourcing policy), §11 (data model) |
| **Decision log** | [`docs/decisions/knesset-data.md`](../../decisions/knesset-data.md) |

> How Polytical ingests "all current Knesset members and everything they did" from **official** sources, organizes it, and stores it. Every claim below was **live-verified** against the endpoints on 2026-05-31 (see the research workflow). This spec is the system-of-record contract for the `politicians` + activity layer of the build.

---

## 1. Sources & system-of-record

| Source | Role | Provenance |
|---|---|---|
| **Knesset OData v3** — `https://knesset.gov.il/Odata/ParliamentInfo.svc/` (38 entity sets) + `…/Votes.svc/` (4 sets) | **System of record.** Authoritative first-party data for members, parties, roles, ministries, bills, queries, committees, (historical) votes. | Official |
| **Open Knesset** — `https://production.oknesset.org/pipelines/data/` (flat, pre-joined CSVs) | **Seed / convenience / gap-filler.** Provably derived from the official OData (carries `PersonID` + `kns_mksitecode` bridge; refreshed daily). Easier bulk ingestion; **fills two official-API gaps: English names + current committee rosters.** | Official-derived (acceptable) |
| **data.gov.il (CKAN)** | **Not used.** Its parliamentary entries either point back to the same OData or have 0 resources. (`votes-knesset` is *election* results, not roll-calls.) | n/a |

**Rule:** the official OData is the **system of record**. Open Knesset may *seed* and *cross-check*, but every row we persist must reconcile to an official `PersonID` (via `kns_mksitecode` where needed). The dead `api.oknesset.org` JSON API is **not** used.

**Licensing — open action:** no machine-readable license is exposed on the OData service; the "open since 2017 / freedom-of-information" framing is from secondary sources. **Before public launch, obtain written confirmation of reuse terms from the Knesset.** Treat the OData service as the authoritative first-party source meanwhile.

## 2. Canonical identity (the load-bearing rule)

- **`PersonID`** (`Edm.Int32`) is the immutable primary key for a politician. **Resolve every politician by `PersonID`, never by Hebrew name** — faction *names* even vary across terms for the same body (short form vs. full legal name), so parties key on **`FactionID`**, not strings.
- **ID bridges:** website id via `kns_mksitecode` (`MKSiteCode`/`KnsID`/`SiteId`); **votes use a different key space** — `kmmbr_id` = `PersonID` **zero-padded to 9 digits** (bridge via `View_Vote_MK_Individual`).
- **Sentinels to filter:** `FactionID 911` ("אין נתונים").
- Per the project rule: fuzzy/`ILIKE`/trigram is **discovery only** — it may rank candidates for a human/UI, but attribution and market resolution always write the chosen stable id. An absent fact renders an explicit "not found", never a guess.

## 3. The "current members" recipe (verified)

Active term = **25th Knesset** (`KnessetNum = 25`).

1. **Roster (120):** `KNS_PersonToPosition?$filter=IsCurrent eq true and (PositionID eq 43 or PositionID eq 61)` → exactly **120** (`43`=חבר הכנסת, `61`=חברת הכנסת). *(Do not use the person-level `IsCurrent` on Open Knesset's roster — it returns 139 due to Norwegian-Law churn; derive "sitting" from faction rows with empty `finish_date`, and de-dupe by `PersonID`.)*
2. **Party (the non-obvious bit):** faction is **NULL** on the 43/61 rows. Read party from the same person's **`PositionID 54`** (חבר/ת סיעה) current row, which carries `FactionID`/`FactionName` → join `KNS_Faction`.
3. **Roles:** additional current `KNS_PersonToPosition` rows by `PositionID`: `39/57`=minister, `40/59`=deputy minister, `41`=committee chair, `42/66`=committee member, `48`=faction chair, `122/123`=Speaker, `130/131`=opposition leader, `45`=PM, `70/71`=deputy Speaker.
4. **In-Knesset-since:** `MIN(StartDate)` of the person's `PositionID 54` rows.
5. **Names:** `KNS_Person(PersonID)` (Hebrew only). **English name** ← Open Knesset `mk_individual.csv`.

## 4. Data needs → source → field mapping

| Card fact / activity | Source · entity · field | Notes |
|---|---|---|
| Name (he), gender | OData `KNS_Person` (`FirstName`, `LastName`, `GenderDesc`) | Hebrew only |
| Name (en) | Open Knesset `mk_individual.csv` (`mk_individual_name_eng`) | gap-fill |
| Party / faction | OData `KNS_PersonToPosition` (PositionID 54) → `KNS_Faction` | key on `FactionID` |
| Role / ministerial posts | OData `KNS_PersonToPosition` → `KNS_Position` | PositionID map (§3.3) |
| In-Knesset-since | OData `MIN(StartDate)` of PositionID-54 rows | |
| Bills sponsored | OData `KNS_BillInitiator?$filter=PersonID eq {id}` → `KNS_Bill` | verified ~360 for a real MK |
| Parliamentary queries | OData `KNS_Query?$filter=PersonID eq {id}` | verified ~11; 1,538 for K25 |
| Committee memberships (current) | **Open Knesset** `mk_individual_committees.csv` | **OData has 0 current committee rows** |
| Roll-call votes (historical ≤ K24) | OData `Votes.svc/vote_rslts_kmmbr_shadow` (kmmbr_id) → `View_vote_rslts_hdr_Approved` | label "through 24th Knesset" |
| Roll-call votes (current K25+) | **Not available in any official feed** | editorial/website, or defer — see §5 |
| Date of birth / age | **Not in OData** | editorial / website profile |

`vote_result` codes: `1`=for (בעד), `2`=against (נגד), `3`=abstain, `4`=no-vote.

## 5. The three gaps & how v1 handles them

1. **Current-term votes** — official `Votes.svc` is frozen at K24 (latest 2021-07-13); Open Knesset mirrors the identical 1,275,825-row K24 ceiling. **v1 decision (default): defer per-MK current votes.** Cards ship rich without them (party, role, bills, queries, committees, tenure). Show historical votes *only if* labelled "through the 24th Knesset." Current votes become an editorial/website-scrape track (P1) once a reliable source is confirmed. *(Open question — see §9.)*
2. **Current committee rosters** — absent from OData → take from **Open Knesset** `mk_individual_committees.csv` (current, dated), reconciled by `PersonID`.
3. **Date of birth / age** — absent from OData → **editorial sourcing** (official MK profile page / newsletter), per the PRD sourcing policy, with a cited `sourceUrl`.

## 6. Storage & search — the decision

**v1: Neon Postgres (relational) as the single source of truth + `pg_trgm` + `unaccent` for fuzzy *discovery only*.** No Elasticsearch, no vector DB. At ~120 MKs + a few thousand bills/votes the entire corpus fits in cache; an external search cluster or vector store is premature complexity (YAGNI) and would violate "Neon/Drizzle only."

- **Verified Neon extension support:** `pg_trgm` 1.6, `unaccent` 1.1, `btree_gin` 1.3, `citext`, `pgvector` 0.8 (HNSW/IVFFlat). **`pg_search`/ParadeDB BM25 is DEPRECATED on Neon** (sunset 2026-06-01); **PGroonga not offered** — so design around `tsvector('simple')` + `pg_trgm`, not a Postgres BM25 path.
- **Hebrew search reality:** Postgres has no Hebrew dictionary → `tsvector` uses config **`simple`** (tokenization, no stemming). Trigram works at codepoint level; quality depends on a **normalized `searchName`** column: `unaccent(lower(name_he))` with **niqqud stripped** and ideally final-form letters + leading particles (ו/ה/ב/ל/כ/מ/ש) normalized. This is the main discovery-layer implementation risk.
- **Discovery index:** `GIN (searchName gin_trgm_ops)` powers the "type a politician's name" box and the admin "attach MK to market" picker. **Invariant (enforce in `/code-review`):** a trigram/`ILIKE` hit only *presents* candidates; attribution/resolution always takes a stable id.
- **Staged path:** add **`pgvector` (HNSW)** *only* in the content phase, if/when we ingest long Hebrew text (speeches, committee protocols, full bill bodies) and keyword search demonstrably misses paraphrases — same DB, additive migration. A dedicated engine (OpenSearch) only on a ~100× corpus jump.

## 7. Ingestion pipeline design

Per the project architecture rules (Route → Service → **Repository** → DB; repositories own all DB access; provenance on every row; batch ~100):

1. **Fetch** — OData over HTTPS, always `$format=json`; page via `$top`/`$skip` (default 100) following `odata.nextLink`/`$skiptoken`; URL-encode `$` and Hebrew filter literals. **Self-throttle + cache** (no documented rate limits). Open Knesset CSVs fetched as bulk seed where they fill gaps.
2. **Normalize** — map to our domain by stable id; compute `searchName`; treat all datetimes as **naive Asia/Jerusalem** (store UTC per the time rule); de-dupe current MKs by `PersonID`; filter sentinel factions.
3. **Upsert** — idempotent upsert keyed on the Knesset stable id (`onConflict(knessetId) do update`), in **batches of ~100** to stay under Neon's parameter limit. **Provenance columns on every row:** `sourceDataset`, `sourceUrl`, `fetchedAt`.
4. **Incremental sync** — re-poll using OData `LastUpdatedDate`; full reconcile against the official roster on a schedule.
5. **Guards** — every DB-mutating script starts with `assertNonProductionDb()`; `drizzle-kit push` in CI (non-TTY).

**Refresh cadence (proposed):** roster/factions/roles **daily**; bills/queries **daily–weekly**; committees from Open Knesset **daily**; one-off backfill for historical votes. (Tunable.)

## 8. Drizzle schema sketch (illustrative)

```
politicians(id pk, personId int unique not null,   -- official PersonID
  nameHe, nameEn, gender, party, factionId int, roleHe, inKnessetSince date,
  dob date null, facts jsonb, active bool,
  searchName text,                                  -- unaccent(lower(nameHe)), niqqud-stripped
  sourceDataset, sourceUrl, fetchedAt)              -- + GIN(searchName gin_trgm_ops)
factions(id pk, factionId int unique, nameHe, knessetNum, isCurrent, <provenance>)
bills(id pk, billId int unique, knessetNum, titleHe, status, <provenance>)
bill_sponsors(billId int, personId int, isInitiator bool)        -- join, keyed by stable ids
queries(id pk, queryId int unique, personId int, name, submitDate, <provenance>)
committees(id pk, committeeId int unique, nameHe, isCurrent, <provenance>)
committee_memberships(committeeId int, personId int, positionId int, startDate, finishDate)
votes(id pk, voteId int unique, knessetNum, voteDate, subject, <provenance>)   -- ≤K24
vote_positions(voteId int, personId int, result smallint)        -- 1/2/3/4
```
Cards, market resolution, and "this MK's activity" are **plain id joins** — the search layer is never in those paths.

## 9. Open questions

- **🗳️ Current-term votes (product/eng):** accept "no current per-MK votes in v1," or invest in a website-scrape/editorial track to get them? *Default: defer to P1.*
- **⚖️ License (legal):** obtain written confirmation of Knesset OData reuse terms before public launch.
- **🔤 Hebrew normalization depth (eng):** how aggressive on particles/final-forms for `searchName` — tune against real MK-name recall.
- **♻️ Open Knesset dependency (eng):** we rely on it for current committees + English names; if it lapses, committees fall back to editorial. Acceptable for v1.
