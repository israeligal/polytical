# Spec — Pre-voting on upcoming bills ("עמדה מראש" / agenda stances)

> Formal spec derived from `2026-06-14-pre-voting-agenda-stances-design.md`. Decisions there are locked; this doc adds requirements, acceptance criteria, metrics, and phasing.
> **Branch:** `feat/agenda-stances` (off `feat/bill-pages`; rebase onto `main` once PR #80 merges).

## Problem Statement

Today a user can express a stance (עמדה: בעד/נגד) only on plenum votes that **already happened**. The most
engaging civic moment — the period *before* the Knesset decides, when the outcome is still open — is invisible
in the product. Users can't weigh in on a bill that's about to be voted, and the app can't later show whether
their early position matched how MKs actually voted. We're leaving the highest-intent engagement signal on the table.

## Goals

1. **Let users state בעד/נגד on bills approaching their decisive vote**, before the vote happens.
2. **Adopt pre-vote stances into the existing match record automatically** on resolution — no parallel scoring system. A pre-vote becomes a normal `user_stances` row keyed to the decisive vote.
3. **Create a recurring reason to return** — a curated "what's coming up in the Knesset" surface users check between votes.
4. **Grow the "מי מצביע כמוכם" dataset with higher-intent signal** — a stance committed *before* the outcome is known is stronger evidence of genuine position than a post-hoc one.

Measurable targets (evaluate 30 days post-launch):
- ≥ 25% of weekly-active users place ≥ 1 pre-vote.
- ≥ 50 live `announced` items available at any time (curation keeps the feed populated).
- ≥ 95% of items that reach a decisive vote successfully adopt their pre-vote stances into `user_stances` (resolution correctness).

## Non-Goals

1. **No score, leaderboard, coins, or card progress from pre-votes** — it's a civic stance, not a prediction (locked mechanic; keeps the app non-gamified, consistent with `no-coins`).
2. **No "all pending bills"** — only the 2nd–3rd-reading window (statusId ∈ {113,130,114}). Bills earlier in the funnel mostly never get a roll-call, so a stance there could never resolve.
3. **No standalone "you vs Knesset" reflection** beyond what the existing post-vote match view already shows (user chose *merge-into-matching*, not *both*).
4. **No resolution notifications in v1** — fast-follow candidate (P1).
5. **No editing official bill data, and no changes to past-vote stances** — separate, existing surfaces.

## User Stories

**Citizen (primary)**
- As an engaged citizen, I want to see which bills are about to be voted on, so I can follow what actually matters now.
- As a user, I want to state בעד/נגד on an upcoming bill, so my position is on record before the outcome is known.
- As a user, I want to change or remove my stance until the vote happens, so it reflects my current view.
- As a user, I want my pre-vote to count toward "which MKs vote like me" once the bill is decided, so my early position has lasting meaning.
- As a user, I want to see the community split on an upcoming bill once enough people weigh in, so I know where opinion stands — without exposing any individual's position.

**Admin**
- As an admin, I want to promote or hide specific agenda items, so the feed stays high-signal regardless of the auto-curation.

**Edge / boundary**
- Empty state: no announced items → the feed explains what "על סדר היום" means and when items appear.
- Locked state: after the vote, the widget switches to read-only and points to the resolved vote's match view.
- Below-k split: fewer than 10 stances → split hidden, only a "be the first / not enough data yet" affordance.

## Requirements

### Must-Have (P0)

**P0.1 — Curation sweep (ingest)**
Auto-populate `agenda_items` from bills in the eligible window.
- Description: on each bills ingest, upsert an `agenda_items` row (status `announced`, `addedBy='ingest'`, `billId` set, `linkedVoteId` null, `titleHe` from the bill) for every bill with `statusId ∈ {113,130,114}` and `knessetNum = CURRENT_KNESSET`. Items whose bill has left the window to a terminal non-vote status (halted/merged/expired) and have **not** resolved → set `status='dropped'`. `addedBy='admin'` rows are never touched by the sweep.
- Acceptance:
  - [ ] Given a K25 bill enters statusId 113/130/114, when the sweep runs, then exactly one `announced` agenda item exists for it (idempotent on re-run).
  - [ ] Given an `announced` item's bill moves to halted/merged without a decisive vote, when the sweep runs, then the item is `dropped`.
  - [ ] Given an `admin` item, when the sweep runs, then it is unchanged.
  - [ ] Re-running the sweep never duplicates items nor resurrects a `dropped`/`voted` item.

**P0.2 — `agenda_stances` table + service**
- Description: new table `agenda_stances` (userId, agendaItemId, stance, createdAt, updatedAt), PK `(userId, agendaItemId)`, index on `agendaItemId`, cascade-delete with user and with the agenda item. Reuses the existing `user_stance` enum. `setAgendaStance({ userId, agendaItemId, stance })` upserts; re-selecting the chosen side deletes (mirrors `setStance`). Guard: writes allowed only when the item is `announced`. Rate-limited like stances/comments.
- Acceptance:
  - [ ] Given an `announced` item, when a user sets בעד then נגד, then the row reflects נגד (upsert, one row).
  - [ ] Given a user re-taps their selected side, then their row is deleted.
  - [ ] Given an item that is `voted`/`dropped`, when a user tries to set a stance, then the service rejects it (4xx, no write).
  - [ ] Stance direction is never returned in any list/aggregate payload (only the caller's own + k-anon counts).

**P0.3 — `על סדר היום` feed + nav**
- Description: RSC page (`/agenda`) listing `announced` items, joined to bill title/status, sorted by imminence (`expectedDate` if present, else status priority then `lastUpdatedDate`). Each row links to `/bill/[billId]` and shows the community split once k ≥ 10. Nav entry added (RTL, logical props). `loading.tsx` with a named skeleton from `components/skeletons/`.
- Acceptance:
  - [ ] Given ≥ 1 announced item, the feed lists them sorted most-imminent-first, each linking to its bill page.
  - [ ] Given 0 announced items, the empty state renders (no error).
  - [ ] The page and its skeleton share container/grid classes (no shape drift).

**P0.4 — Stance widget on `/bill/[id]`**
- Description: on a bill page whose bill has an `announced` agenda item, render the בעד/נגד widget (auth-gated) + the k-anon community split. After resolution, render read-only with a link to the resolved vote's match view.
- Acceptance:
  - [ ] Given an `announced` item, a signed-in user sees and can toggle בעד/נגד; an anonymous user is prompted to sign in.
  - [ ] Given < 10 stances, the split is hidden; given ≥ 10, it shows percentages only.
  - [ ] Given a `voted` item, the widget is read-only and links to the vote.

**P0.5 — Resolution sweep (ingest, keystone)**
- Description: for each `announced` item with a `billId`, find `knesset_votes WHERE billId = item.billId AND isDecisive = true`. When found, in one transaction: set `linkedVoteId`, `status='voted'`; adopt `INSERT INTO user_stances (userId, voteId=linkedVoteId, stance) SELECT … FROM agenda_stances WHERE agendaItemId = item.id ON CONFLICT (userId, voteId) DO NOTHING`. After this the match engine includes the rows with no further change.
- Acceptance:
  - [ ] Given an `announced` item whose bill gets a decisive vote, when the sweep runs, then `linkedVoteId` is set, status is `voted`, and every pre-vote stance appears as a `user_stances` row on that vote.
  - [ ] Re-running the sweep is idempotent (ON CONFLICT; no duplicate user_stances, status stays `voted`).
  - [ ] Adoption is atomic — a failure leaves the item `announced` with no partial `user_stances` writes.
  - [ ] An adopted stance is then visible to the "מי מצביע כמוכם" engine exactly like a post-hoc stance.

**P0.6 — Tests (PGlite, real transactions)**
- [ ] Curation sweep: create/update/drop transitions, idempotency.
- [ ] `setAgendaStance`: upsert, delete-on-retap, `announced`-only guard.
- [ ] Resolution: atomic + idempotent adoption; match-engine visibility; lock after `voted`.
- [ ] k-anonymity: split hidden below k = 10.

### Nice-to-Have (P1)
- Resolution notification ("a bill you weighed in on was decided — see how MKs voted").
- Agenda feed filters/sort (by committee, by your-stance status, by imminence).
- "You pre-voted" provenance badge on the resolved vote's match view.

### Future Considerations (P2)
- Ingest-sourced agenda items with **real scheduled plenum dates** (`expectedDate`) from a Knesset agenda/schedule endpoint, improving sort + "voting on <date>" copy.
- Widen the eligible window (committee votes / first readings) **only if** pre-vote signal proves valuable — `agenda_stances` keyed by item already supports this without schema change.

## Success Metrics
- **Leading:** pre-vote adoption % (WAU placing ≥1), agenda-feed views/visit, stances per resolved item, resolution adoption success rate (≥95%).
- **Lagging:** 4-week retention lift among pre-voters vs non, growth in match-engine stance coverage, total `user_stances` rows attributable to pre-votes.
- **Measurement:** analytics events on stance set/remove, feed view, resolution adoption; query at 1 week / 1 month.

## Open Questions
1. **[engineering/data — BLOCKING]** Is there exactly one `isDecisive` row per `billId`, or can multiple exist (re-votes)? If multiple, resolution picks the latest by `voteDate`. Verify against the votes data before building P0.5.
2. **[engineering — BLOCKING]** Re-curation churn: confirm the sweep can't resurrect a `dropped`/`voted` item if a bill's status bounces; define the terminal-status set precisely.
3. **[data — non-blocking]** Does the OData status payload expose a scheduled plenum date for `expectedDate`? If not, sort by status priority + `lastUpdatedDate` for v1.
4. **[engineering — non-blocking]** Admin curation surface: reuse the existing agenda-items admin (read at `votes/read-repo.ts`) for promote/hide, or add a `hidden`/`pinned` column? 
5. **[design — non-blocking]** Exact lock-timing affordance in the UI when an item flips `announced → voted`.
6. **[engineering — non-blocking]** Rate-limit thresholds for pre-votes — reuse the existing stance limiter.

## Timeline / Phasing
- **Dependency:** PR #80 (`feat/bill-pages`) must merge to `main`; then rebase `feat/agenda-stances` onto `main` and regenerate the migration number if it collides.
- **Phase 1 (P0):** schema + curation + stance service + feed + bill-page widget + resolution sweep + tests. Single shippable unit.
- **Phase 2 (P1):** notifications, feed filters, provenance badge — fast follow.
```
