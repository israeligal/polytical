# Decision Log — Knesset Data

> Newest on top. Entries are immutable: supersede, don't edit. See the full spec: `docs/superpowers/specs/2026-05-31-knesset-data-pipeline.md`.

---

## 2026-06-10 — SUPERSEDES "votes deferred to P1": live K25 votes ship via the website API

**Decision.** The 2026-05-31 deferral below is superseded. K25 per-MK roll-call votes ARE available — not via OData `Votes.svc` (still frozen at K24, re-verified) but via the Knesset **website API** (`knesset.gov.il/WebSiteApi/knessetapi/Votes/GetVotesHeaders` + `GetVoteDetails/{id}`), live through the previous day's plenum. Ingested into `knesset_votes`/`mk_votes`/`mk_votes_raw` with the same stable-id + provenance invariants; identity resolved through the human-verified `mk_name_mappings` (names only in the source — see `docs/decisions/knesset-votes.md` for the full decision set). Roster extended to all K25-tenured MKs (148 incl. 28 departed) with `faction_stints` intervals for faction-at-vote-time.

---

## 2026-05-31 — Ingestion shape: 7 stable-id tables, idempotent upsert, refresh cadence

**Decision.** Persist Knesset data in 7 tables (`politicians`, `factions`, `bills`, `bill_sponsors`, `queries`, `committees`, `committee_memberships`), each keyed by a UNIQUE stable Knesset id with `sourceDataset`/`sourceUrl`/`fetchedAt` on every row. Ingest via `scripts/ingest-knesset.ts` (tsx): `assertNonProductionDb()` first, then fetch→normalize→upsert with `onConflict(stableId) do update`, batched 100.

**Refresh cadence.** Roster/factions/roles **daily** (`--only=factions`, `--only=members`); bills/queries **daily–weekly** (`--only=bills`, `--only=queries`); committees **daily** (OData), committee memberships **daily** (Open Knesset `mk_individual_committees.csv`). Schedule via the platform cron once green.

**Bounded default vs `--full`.** `pnpm ingest:knesset` runs the card-critical bound only — `factions`, `members` (the ~120 current MKs + party-via-54 + roles), and the K25 `committees` list. The heavy entities (~7.4k bills, their sponsors, ~1.5k K25 queries, and the bulk committee-membership CSV) run only under `pnpm ingest:knesset:full` (`--full`). A `--only=<entity>` arg always runs that one entity, heavy or not.

**How it feeds product.** Politician cards = plain id joins on `personId` (party, role, `inKnessetSince`, bills via `bill_sponsors`, queries, committee memberships) — the search layer is never in that path. Market-resolution evidence cites the stable-id row + its provenance `sourceUrl`. Discovery ("type a name", admin attach-MK) uses the `GIN(searchName gin_trgm_ops)` index to RANK candidates only; the chosen attribution always re-resolves by `personId`.

**Live verification (2026-05-31, against Neon).** Bounded ingest landed `politicians = 120` (all with party+`factionId` from the 54 path, non-empty `searchName`, full provenance), `factions = 544` (sentinel `FactionID 911` dropped), `committees = 89`. `bills`/`bill_sponsors`/`queries`/`committee_memberships` stay at 0 until `--full`. Live trigram discovery confirmed on Neon (`searchName % 'אביגדור'` → personId 427, sim 0.57).

**Service quirk discovered live.** `ParliamentInfo.svc` now answers **OData v4** (rows under `value`, a RELATIVE `odata.nextLink`), not the v3 shape (`d.results`/`d.__next`) the plan assumed. The client reads both dialects and resolves relative nextLinks against the base. The v4 service caps every page at 100 rows and only emits a `nextLink` when the requested `$top` exceeds that cap, so the client requests a large `$top` to page to exhaustion.

**Deferred.** Current-term (K25) per-MK roll-call votes — no official feed (Votes.svc frozen at K24); see the votes decision below. DOB is editorial (not in OData); `politicians.dob` stays NULL and is never overwritten by re-ingest. English MK names (`nameEn`) come from Open Knesset `mk_individual.csv`; the path returned 404 on this run, so `nameEn` stays NULL until the correct Open Knesset path is wired (gap-fill, warn-and-continue — never blocks the core OData ingest).

---

## 2026-05-31 — Storage: Neon relational + pg_trgm, no Elasticsearch / no vector DB (v1)

**Decision.** Store all Knesset data in **Neon Postgres (relational)** as the single source of truth, with **`pg_trgm` + `unaccent`** for fuzzy *discovery only*. No Elasticsearch/OpenSearch and no vector DB in v1.

**Context.** ~120 current MKs + a few thousand bills/votes/queries per term — the whole corpus fits in cache. Verified Neon supports `pg_trgm` 1.6, `unaccent` 1.1, `btree_gin` 1.3, `pgvector` 0.8 (HNSW/IVFFlat); **`pg_search` BM25 is deprecated on Neon (sunset 2026-06-01)** and PGroonga isn't offered.

**Rationale.** An external search cluster or vector store is premature complexity at this scale and would violate "Neon/Drizzle only." Hebrew search runs on a normalized `searchName` (niqqud/final-forms/particles) + `tsvector('simple')`. **Invariant:** search ranks candidates; stable ids commit facts.

**Staged.** Add `pgvector` (HNSW) **only** in the content phase if we ingest long Hebrew text (speeches/protocols) and keyword search misses paraphrases — additive, same DB. External engine only on a ~100× corpus jump.

---

## 2026-05-31 — System of record: official Knesset OData; Open Knesset as derived seed only

**Decision.** The **official Knesset OData v3** (`knesset.gov.il/Odata/ParliamentInfo.svc` + `Votes.svc`) is the **system of record**. **Open Knesset** (`production.oknesset.org`) is used as a derived seed/convenience/gap-filler (English names, current committee rosters), always reconciled to an official `PersonID`. **data.gov.il is not used** for parliamentary data.

**Context.** Live-verified: OData returns 120 current MKs, 7,387 K25 bills, 1,538 K25 queries. Open Knesset is a provably-derived republish (carries `PersonID` + `kns_mksitecode`), refreshed daily, and fills two official-API gaps. data.gov.il just redirects to the same OData or has 0 resources.

**Rationale.** Satisfies the "official sources only" policy while taking Open Knesset's pre-joined convenience where it provably traces to official data. Resolve everything by stable `PersonID` / `FactionID`, never by Hebrew string.

**Caveat / open action.** No machine-readable reuse license is published on the OData service — **obtain written confirmation before public launch**.

---

## 2026-05-31 — Current-term roll-call votes deferred to P1

**Decision.** v1 does **not** ship per-MK current-term (25th Knesset) roll-call votes.

**Context.** Official `Votes.svc` is frozen at the 24th Knesset (latest 2021-07-13; 0 rows for K25), and the Open Knesset mirror has the identical K24 ceiling. No official current-vote feed exists.

**Rationale.** Cards are rich without it (party, role, bills, queries, committees, tenure). Avoids blocking v1 on a website-scrape/editorial track. Historical votes may be shown only if labelled "through the 24th Knesset." Revisit if the Knesset publishes K25 votes, or build an editorial track in P1.
