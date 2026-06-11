# Multi-outcome markets (single-pick, Polymarket-style)

**Date:** 2026-06-11 · **Status:** approved

## Problem

Polymarket presents "who/what" questions as one grouped market with many candidate
outcomes ("Who will form the next government?" → Netanyahu / Bennett / Eisenkot / Other).
Polytical only lets admins create binary (כן/לא) markets, so the same question becomes a
flat yes/no ("האם נתניהו ירכיב את הממשלה הבאה?") that hides the real alternatives.

The schema already supports multi markets (`markets.type = "multi"`, an `outcomes` table
with arbitrary rows and `cat` color slots 1–8, outcome-agnostic `makePrediction` /
`resolveMarket`, an OddsBar multi mode) — only the admin creation path and the detail-page
UI are missing.

## Decisions (user-approved)

1. **Single-pick multi, not Polymarket's independent Yes/No group.** One market, N
   outcomes, the user picks exactly one (existing `unique(userId, marketId)` upsert).
   One market = one right-or-wrong on the prediction record. No events/group table.
2. **Per-outcome politician link.** New nullable `outcomes.personId` (→
   `politicians.personId`, resolve-by-stable-id, no FK — same pattern as
   `market_politicians`). Outcomes like "אחר" stay unlinked.
3. **UI = rows + bar combo.** Detail page renders Polymarket-style outcome rows
   (portrait, label, crowd %, predictor count, pick button) sorted by popularity;
   feed cards keep the compact stacked OddsBar plus a top-2-outcomes line.

## Design

### Schema

- `outcomes.personId: integer | null`. Migration is additive (nullable column). Multi
  markets are capped at **8 outcomes** (the `cat` color slots) and need **at least 3**
  (2 = binary). Binary outcomes keep `cat = null`, `personId` optional.

### Creation (admin)

- `createMarketAction` accepts `type: "binary" | "multi"` and outcomes as
  `{ labelHe, personId? }[]`. Binary: exactly 2 labels (unchanged behavior). Multi:
  3–8, `cat` assigned by position (1-based), `ordinal` by position.
- `repo.createMarket` stores per-outcome `personId` and **auto-merges outcome personIds
  into `market_politicians`** (union with explicitly-passed featured ids), so politician
  pages and the featured-cards section keep working with zero double entry.
- Admin form gets a binary/multi toggle, dynamic outcome rows (add/remove between 3 and
  8), and a **politician search picker** (name autocomplete via `searchPoliticians`,
  resolving to `personId`) — used per-outcome on multi and replacing the raw
  comma-separated `personIds` text input on binary.

### Resolution / card progress

Current rule: every correct predictor advances card progress for **all** featured
politicians. New rule, decided here:

> If the winning outcome has a `personId`, correct predictors advance card progress
> **only for that politician**. If the winning outcome is unlinked (e.g. "אחר" wins, or
> any binary market), the existing market-level behavior stands (all featured MKs).

The winner's role (for `unlockThreshold`) is fetched by personId; everything stays inside
the existing `resolveMarket` transaction. Stats tally (`totalWins`/`totalResolved`) is
unchanged.

### UI

- **`OutcomeRows`** (new client component) — the interactive picker for OPEN multi
  markets on the detail page, replacing the OddsBar block + sidebar BetPanel for that
  type. Each row: portrait thumb (when linked), label, crowd % (`<1%` for near-zero
  non-zero shares), predictor count, pick button. Sorted by predictor count desc, ties by
  `ordinal`. Picking calls `makePredictionAction` directly; the user's current pick is
  highlighted (initial pick passed from the server page).
- **Sidebar (multi, open):** compact "הניחוש שלך" status card showing the current pick or
  a prompt; sign-in link when logged out. Binary markets keep BetPanel unchanged.
- **Feed card (multi):** stacked OddsBar (existing) but the full legend is replaced by a
  one-line top-2 summary: "נתניהו 41% · בנט 27% · ‎+2" (a `compact` mode of the multi
  OddsBar branch). Detail-page multi rendering doesn't use OddsBar at all.
- **Resolution panel (multi):** winning outcome shown with its portrait when linked.

### Existing Netanyahu binary market

Has 0 predictions — the admin deletes it in the console and creates the multi version
manually. No migration/conversion code.

### Out of scope (future phases)

Probability-history chart (needs snapshots we don't store), watchlist, share/embed
buttons, recurring series, activity feed, Polymarket-style independent Yes/No groups.

## Testing

PGlite integration tests (real migrations, real txs):

- `createMarket` with outcome personIds → `market_politicians` auto-synced (union,
  deduped).
- Multi market: pick + re-pick upsert still holds.
- `resolveMarket` where the winning outcome is linked → only that politician's
  card progress advances; unlinked winner ("אחר") → all featured MKs advance (current
  behavior preserved); binary market unchanged.
- Action validation: multi outcome-count bounds (3–8), binary still exactly 2.
- Adapter: per-outcome `personId` surfaces on the view `Outcome`.
