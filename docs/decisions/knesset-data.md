# Decision Log — Knesset Data

> Newest on top. Entries are immutable: supersede, don't edit. See the full spec: `docs/superpowers/specs/2026-05-31-knesset-data-pipeline.md`.

---

## 2026-06-15 — Ship enacted-law badges + split-bill lineage (from the OData survey menu)

**What.** Acted on the [2026-06-15 survey](#2026-06-15--odata-survey-split-bill-genealogy-a-topic-taxonomy-laws-only-and-the-untapped-entity-menu): ingested 4 previously-untapped entities and surfaced them on bill/agenda pages.
- New tables (migration 0032): `israel_laws` (107 K25), `israel_law_topics` (237 tags scoped to those laws), `israel_law_bills` (110 law↔bill links), `bill_splits` (229 child→parent). New ingest steps in `scripts/ingest-knesset.ts` (heavy/`--full`), each scoped by stored K25 law/bill ids (the `validBillIds` pattern). Verified counts on the live run.
- **The law↔bill join is `KNS_IsraelLawName.LawID = KNS_Bill.BillID`** — confirmed 12/12 K25 laws → real K25 bills before building (HARD GATE). billId→law is **one-to-many** (budget bill 2203821 → many laws), so `getBillById` returns `enactedLaws[]`; each law's topic tags are deduped.
- **Bill page** (`#1`): `EnactedLawPanel` — "נחקק כחוק" + validity chip + official topic badges (the ONLY topic taxonomy in the source; enacted laws only). Validity vocab (verified): `תקף`=in force (positive), `בטל`/`פקע`/`נושן`=not.
- **Split lineage** (`#2`): `bill_splits` → `getBillById.splitParent` + `getAgendaFeed.splitParent`; `BillLineage` ("חלק מ:") on the bill page (linked) and agenda card/hero (plain text — the card is already a Link).

**Why it matters for agenda.** Re-ran `bill_sponsors` (#3, 17,106 rows) but agenda initiator coverage stayed **5/75** — because **73/75 announced items are split children** (government budget bills with no own MK initiator). That's not an ingest gap; it's why split-lineage is the right context for those 73 items. Confirmed: a split child's initiators live on the parent (`KNS_BillSplit.MainBillID`).

**Scope chosen.** Bill-page badges only — NO standalone `/laws` route (the survey's other option). Topic-tagging the votes feed remains out: most votes/bills never become law, so the taxonomy can't cover the feed (`votes-discovery.md`).

## 2026-06-15 — OData survey: split-bill genealogy, a topic taxonomy (laws only), and the untapped-entity menu

**Context.** The agenda hero/cards feature surfaced that only **5 of 75** announced agenda items carry an
MK initiator. Probed the live OData (`ParliamentInfo.svc`, all numbers verified 2026-06-15) to explain it
and to inventory what else the service exposes that we don't ingest.

**Findings (verified):**
- **Split/government bills have 0 MK initiators by design.** Most "על סדר היום" items are budget bills
  split into child bills (`SubTypeDesc = ממשלתית`); `KNS_BillInitiator` returns 0 for them (BillID 2227233
  → 0). A split child's lineage + initiators live on the **parent**: `KNS_BillSplit.SplitBillID → MainBillID`
  (2204244 → 2203821). Only `פרטית` bills carry MK initiators (2233112 → 3). **So the agenda UI showing
  no portraits for most items is correct, not an ingest bug.** Bill genealogy: `KNS_BillSplit` (881 rows),
  `KNS_BillUnion` (1622), `KNS_BillHistoryInitiator` (2273 K25, former initiators).
- **A real topic taxonomy exists — but for enacted laws only.** `KNS_IsraelLawClassificiation` (2902 rows,
  ~38 Hebrew tags: ביטחון/בריאות/חינוך/מיסוי/…) tags `KNS_IsraelLaw` (106 K25 enacted laws). This does
  **not** lift the votes/bills-feed "no topic taxonomy" limitation (`votes-discovery.md`) — most votes/bills
  never become law, and the bill→law join (`KNS_IsraelLawName`/`Binding`, a separate `LawID` space) is
  indirect and was not end-to-end verified. Treat law-topic tagging as a spike.
- **Other untapped, verified:** `KNS_CommitteeSession` (10,453 K25) + `KNS_CmtSessionItem` (80,182) →
  per-bill committee-discussion timelines (no per-MK attendance — sessions carry no PersonID);
  `KNS_DocumentPlenumSession` (75,959) → plenum transcripts ("דברי הכנסת" Hansard).

**Decision.** Documentation-only — no ingest change. Promoted these entities to VERIFIED and added an
**"Untapped data & feature opportunities"** menu to the OData catalog (`api-catalog.md`) so the next
feature can pull from a grounded list. The split-bill gotcha is now in the `knesset-odata` SKILL.

---

## 2026-06-12 — MK attendance: plenum presence unavailable; ship a vote-participation proxy

**Decision.** Politician cards show **vote participation** ("השתתפות בהצבעות") derived from our own
`mk_votes` — votes attended vs missed + plenum vote-days present, tenure-scoped via `faction_stints`
(`app/lib/votes/participation.ts`, `getMkParticipation`). It is a roll-call-presence **proxy**, labelled
as such (disclaimer: "מבוסס על הצבעות שמיות במליאה … לא כולל הצבעות חשאיות והצבעות בהרמת יד"),
**never "ימי נוכחות"** — the sourcing rule forbids dressing a proxy as official attendance.

**Why not real attendance.** Live-verified 2026-06-12 (three independent probes): there is **no usable
current per-MK plenum-attendance source**. OData has no person↔session entity; the Knesset website API
has no presence endpoint (exhaustive 404/empty-204); the official `presence/` page is 500/JS-SPA; Open
Knesset `members/presence` CSV is 0-bytes and its raw log ends 2024-02-18. Full probe table:
`.claude/skills/knesset-odata/references/api-catalog.md` → "Attendance / presence — availability".

**Deferred (not built).** Open Knesset `people/committees/meeting-attendees/kns_committeesession.csv`
(`attended_mk_individual_ids`, live, K25) is the only usable presence source but is **committee-only**,
NLP-parsed from protocols (incomplete), ~160 MB. Revisit if committee-attendance becomes a priority.

---

## 2026-06-11 — Politician roles come from `DutyDesc`; non-MK ministers are admitted

**Decision.** The card "tafkid" (role) and the gallery roster are derived **entirely inside `normalizeK25Members`** (`app/lib/knesset/normalize.ts`), refreshed by the **canonical** `pnpm ingest:knesset --only=members`. Do NOT write a parallel minister/role script — extend the normalizer so every consumer benefits. (Spec: `docs/superpowers/specs/2026-06-11-politician-roles-and-ministers.md`.)

**Rules (all from official OData, verified 2026-06-11):**
- **Role label = `DutyDesc`, not `KNS_Position.Description`.** Pos 39 Description is the generic "שר"; the real portfolio ("שר הביטחון") is in `DutyDesc`. Seniority: PM(45) > minister(39/57, DutyDesc) > deputy(40/59) > Speaker(122) > Deputy Speaker(70) > faction-chair(48) > committee chair > plain MK. Multi-portfolio → first `DutyDesc` not starting "שר נוסף". Bare/blank minister DutyDesc → "שר ללא תיק".
- **Roster = current office-holders.** Include anyone with a current seat (43/61) **or** current ministry (39/45) → `active=true`. The members fetch already returns minister rows (`KnessetNum=25`), so this is a normalize-only change. People who held office this term but hold none now → `active=false`, role suffixed " לשעבר", faction empty.
- **Norwegian-law ministers** (current minister, no current seat — e.g. Sa'ar/שר החוץ, Smotrich/שר האוצר): `active=true`, flagged `facts.isNorwegianMinister=true` → the card shows a "נורבגי" chip + ⓘ. No new column — the flag rides `facts` JSONB.
- **Party = current faction only.** No current Pos-54 faction → `party`/`factionId` null (empty on the card); never back-fill a past stint.

**Why.** Two sessions independently built "admit ministers" against the shared prod DB, one with generic "שר". Consolidating into the canonical normalizer (this entry) prevents recurrence. Role classification for rarity (`lib/rarity.ts` `isMinisterRole`) already regex-matches "שר…", so specific titles keep their tier.

**Caricatures.** A role-text change can stale the baked caricature PNG; `scripts/list-role-changes.ts` emits the regenerate list (new ministers + changed roles). Art is a separate manual `caricature-cards` pass.

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
