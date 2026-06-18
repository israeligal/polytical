# Plan — Duel Rematch (+ the feed suggestion card, shared data layer)

**Date:** 2026-06-18 · **Branch:** `feat/prediction-duels` (continue) · **Size:** small–medium

## The problem with today's "rematch"
The settled result state has an **"אתגרו שוב חברים"** CTA, but it currently re-shares the **same, now-resolved** duel link — which nobody can join (the market closed). So "rematch" is a dead button. A real rematch must start a **new duel on a fresh, open market**.

## Key insight — rematch and the suggestion card are the same thing
You can't re-duel a resolved market, so rematch needs to surface **open, close-this-week markets** to challenge on. That is *exactly* the data the unplaced **feed suggestion card** needs. So: **build the "close-this-week duelable markets" query once**, and use it in two places — the rematch picker (result state) and the feed suggestion card (home/markets). One repo read, two surfaces.

## Design decisions (opinionated; the user said "plan it")
- **Rematch = a fresh challenge, not a re-target of the same opponent.** Duels are token-based / one-to-many — there is no fixed server-side "opponent" to re-challenge; the user re-shares the new link to the same chat. So rematch = "start your next duel," seeded with good candidates.
- **Candidates = open + global (`groupId IS NULL`) markets closing soon** (≤ ~7 days), soonest-first, hot-boosted. "Closing soon" is the whole point — a duel needs a timely payoff.
- **Keep the arena a pure client component** — the RSC page fetches the candidates and passes them as a prop; no data-fetching in the client.
- **Reuse existing pieces:** `createChallengeAction`, `ChallengeMarketButton`, `DuelSuggestionCard` (already built). No new action.

## Build steps
1. **Repo read** `getSuggestedDuelMarkets({ db, limit = 5, excludeMarketId? })` in `app/lib/markets/repo.ts` (or `duels/repo.ts`): markets where `status = 'open'` AND `groupId IS NULL` AND `closeAt` between now and now+7d, ordered by `hot desc, closeAt asc`, limit. Returns the lightweight card shape (`bundleToMarket`-compatible) the suggestion card already consumes. **Reuse** the existing market-card view types — do not invent a new DTO.
2. **Rematch picker UI** — on the resolved result state, the "אתגרו שוב" CTA expands an inline picker: a short list of candidate markets, each a `DuelSuggestionCard` (or a compact row) with its `ChallengeMarketButton` (mints + shares via the existing `createChallengeAction`). Add a `suggestedMarkets?: SuggestedMarket[]` prop to `DuelResolution` / the arena; render the picker only when `verdict != null` (the viewer played) and candidates exist.
3. **Page wiring** — `/duel/[token]/page.tsx`: when `resolution` is set, also fetch `getSuggestedDuelMarkets({ excludeMarketId: challenge.marketId })` and thread it into `resolution.suggestedMarkets`.
4. **Feed suggestion card (the P1 top-of-funnel)** — place `DuelSuggestionCard` on the home/markets feed for logged-in users, fed by the SAME `getSuggestedDuelMarkets` (pick the top candidate, or a small carousel). This is the discoverability win — make *creating* a duel findable. *(Can ship in the same PR or a fast-follow; it's the same query.)*
5. **Empty state** — no close-this-week markets → the rematch CTA falls back to a plain link to `/markets` ("בחרו תחזית לאתגר"); the feed card renders nothing (no empty shell).
6. **Tests** — PGlite for `getSuggestedDuelMarkets` (open-only, global-only, the closeAt window, ordering, `excludeMarketId`); a Storybook story for the rematch picker + the placed suggestion card.
7. **Verify** — lint/typecheck/build; `/code-review`; `/browser-qa` the result→rematch→new-duel flow + the feed card. (No analytics — per the PRD, success is read from the `challenges` tables.)

## Convention compliance
- Layered (repo read → RSC page → client arena); `@handle`-only; OKLCH tokens + logical RTL props + Hebrew copy; reuse `createChallengeAction`/`ChallengeMarketButton`/`DuelSuggestionCard`; files < 500 lines; no new prod migration (read-only query).

## Out of scope (parking lot)
- Re-targeting the literal same opponent (needs a different, non-token duel model).
- A full "your next duels" recommendation engine — start with closing-soon + hot.
- Rematch notifications / nudges.
