# Decision Log — Knesset Data

> Newest on top. Entries are immutable: supersede, don't edit. See the full spec: `docs/superpowers/specs/2026-05-31-knesset-data-pipeline.md`.

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
