# Decision Log — Pre-voting / Agenda Stances

> Newest on top. Entries are immutable: supersede, don't edit. Spec: `docs/superpowers/specs/2026-06-14-pre-voting-agenda-stances-spec.md` · Plan: `docs/superpowers/plans/2026-06-14-pre-voting-agenda-stances.md` · Design: `docs/superpowers/specs/2026-06-14-pre-voting-agenda-stances-design.md`.

---

## 2026-06-14 — Pre-voting = a stance that MERGES into matching, not a parallel score (branch feat/agenda-stances)

**Decision.** A pre-vote is an unscored **stance** (בעד/נגד) on an upcoming bill, stored in a new `agenda_stances` table keyed by `(userId, agendaItemId)` — NOT a prediction/market. When the bill reaches its decisive plenum vote, the resolution sweep **adopts** each pre-vote into `user_stances` (keyed by `linkedVoteId`), after which the existing "מי מצביע כמוכם" engine sees it like any post-hoc stance — **zero match-engine changes**. Pre-voting is just logging your עמדה early. Same privacy contract as `user_stances`: k≥10 aggregates only (reuses `AGGREGATE_MIN_STANCERS`, not forked), direction never leaves the DB, cascade-deletes with the account and the item; the action logs a sanitized `{agendaItemId, errName}` marker, never rethrows (DrizzleQueryError embeds the bound direction).

**Rejected.** A separate scored prediction surface (would fork the score economy the app deliberately removed in 0017); a standalone "you vs Knesset" reflection (user chose merge-into-matching, not both).

## 2026-06-14 — Eligibility: auto-curated by status, the 2nd-3rd-reading window only (branch feat/agenda-stances)

**Decision.** Only bills approaching the **decisive** vote are stance-able: `KNS_Status` ids **{113, 130, 114}** (הכנה / הונחה / לדיון לקראת קריאה שנייה-שלישית), current Knesset only — ~183 K25 bills at launch. The curation ingest sweep auto-creates an `announced` agenda item per eligible bill. Rationale: a stance can only ever resolve (merge into matching) if the bill actually reaches a decisive roll-call; bills sitting at "הונחה לדיון מוקדם" (4,778 of them) mostly die without one, and bills already at "התקבלה בקריאה שלישית" are too late.

**Rejected.** All pending bills (thousands; most never get a roll-call → unresolvable stances); first-reading window (resolves slowly / often never — the decisive gate is the 2nd-3rd reading).

## 2026-06-14 — Curation idempotency via a partial-unique index; drop ≠ resolve (branch feat/agenda-stances)

**Decision.** `agenda_items.billId` carries a **partial unique index** (`WHERE billId IS NOT NULL`) so curation upserts one row per bill via `ON CONFLICT (billId)` and the conflict SET refreshes title/provenance ONLY — never `status`, so a re-run can't resurrect a `voted`/`dropped` item. Curation also **drops** announced ingest items whose bill left the window WITHOUT a decisive vote (correlated `NOT EXISTS` against `knesset_votes`); an item whose bill left because it GOT its decisive vote is deliberately left `announced` for the resolution sweep to mark `voted`. Resolution adopts stances inside a transaction with `ON CONFLICT DO NOTHING`, so a pre-existing post-hoc `user_stance` on the vote wins (never overwritten). Resolution runs both as a `--full` ingest step and in the 4h votes cron (timely close-out when a decisive vote lands). Admin-added rows (`addedBy='admin'`) are untouched by the sweep.

**Rejected.** Unconditional `billId` unique (admin free-text rows have none); dropping on "bill left window" alone (would wrongly drop bills that left because they were voted).

## 2026-06-14 — Migration numbering after the squash-merge of #80 (branch feat/agenda-stances)

**Decision.** `main` advanced to `0028_bill_details`, so the new migration is **`0029_agenda_stances`**. `drizzle-kit generate` diffed against a stale baseline (the `0028` snapshot was lost when bill-pages' `0024` was renamed during the conflict-merge), duplicating already-applied statements — the generated `0029.sql` was hand-trimmed to the additive-only `agenda_stances` table + `agenda_items_bill_uq` index. The `0029_snapshot.json` end-state is correct, so future generates self-heal. Prod apply uses a guarded additive-only applier (`assertNonProductionDb` does NOT catch the Neon host).
