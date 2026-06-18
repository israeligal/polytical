# Plan — Duel Rematch + Feed Suggestion Card (shared "duelable markets" query)

**Date:** 2026-06-18 · **Branch:** continue `feat/prediction-duels` (NOT a worktree — Turbopack stale-compile gotcha + the dev server lives in this checkout; direct continuation of the open PR #107). · **Size:** small–medium · **No prod migration** (read-only).

## Goal
Two surfaces, **one shared query**:
1. **Feed suggestion card** — place the already-built `DuelSuggestionCard` on the home feed so *starting* a duel is discoverable (today the only entry is a button on a market page). Top-of-funnel.
2. **Rematch** — the settled result's "אתגרו שוב" CTA today re-shares a dead (resolved) link; make it offer **fresh close-this-week markets** to challenge on.

Both need the same list: open + global markets closing soon. Build it once.

## Files read (verified, not from memory)
- `app/lib/markets/feed.ts:27` — `export type MarketCardData = { market: Market; featured: Politician[] }` — **THE card view type to reuse**. `:36 getMarketCards` and `:79 getUnpredictedOpenMarketCards` both return `MarketCardData[]` via `bundleToMarket` + batched politician/count resolution — the exact shape to model `getSuggestedDuelMarkets` on.
- `app/lib/markets/repo.ts:266` — `listMarketsClosingSoon({db, now, horizon})`: `status='open'` + `isNull(groupId)` + `isNull(closingSoonNotifiedAt)` + `closeAt` in `(now, horizon]`, `orderBy(asc(closeAt))`. **Model for the new read, minus the cron-only `closingSoonNotifiedAt` filter, plus `limit`/`excludeMarketId`.** `:339 listOpenMarkets`, `:365 listUnpredictedOpenMarkets` are sibling reads for shape reference.
- `app/page.tsx:47` (`getMarketCards({groupScope})`), `:172-185` (the `<MarketCard>` grid after `<CategoryRail>`) — the home-feed fetch + render; insertion point for the suggestion card. `app/markets/page.tsx` mirrors it.
- `components/duel/challenge-cta.tsx` — `DuelSuggestionCard({market, onChallenge})` (presentational, built v0) + `ChallengeButton({onChallenge,size,disabled})`.
- `components/duel/challenge-market-button.tsx` — `ChallengeMarketButton({marketId, size})`: the WIRED behavior (`createChallengeAction` → copy link). The logic to share with the suggestion card.
- `app/actions/duels.ts` — `createChallengeAction({marketId}): Promise<ActionResult & {href?}>` (built).
- `components/duel/types.ts` — `DuelResolution` (extend with `suggestedMarkets`), `DuelArenaProps`.
- `components/duel/duel-result.tsx` — the result state (add the rematch picker), the "אתגרו שוב" CTA.
- `app/duel/[token]/page.tsx` — computes `resolution`; will also fetch suggestions.

## Reused data structures (no new types)
- **`MarketCardData`** (`feed.ts:27`) — the return type of `getSuggestedDuelMarkets`. Do NOT invent a duel-market DTO.
- **`Market` / `Politician`** (`lib/types.ts`) — via `bundleToMarket`.
- **`MarketRow`** (`markets/repo.ts`) — the new repo read's row type.
- **`DuelResolution`** (`components/duel/types.ts`) — **extend** with `suggestedMarkets?: MarketCardData[]`.
- **`createChallengeAction`**, **`DuelSuggestionCard`**, **`ChallengeMarketButton`**, **`ActionResult`** — reuse as-is / refactor-to-share.

## Verified third-party signatures
- Drizzle query builder (`and/eq/gt/lte/isNull/asc/desc/limit`) — exactly as `listMarketsClosingSoon` (repo.ts:266-288) uses them.
- No external SDK, no new dependency, no migration.

## Convention Compliance (CLAUDE.md)
- **Layered**: new repo read (`listDuelableMarkets`) in `markets/repo.ts`; feed read (`getSuggestedDuelMarkets`) in `markets/feed.ts`; RSC pages fetch; client components render. No DB in components.
- **Global scope only** (`isNull(markets.groupId)`) — duels never surface group motions (sandbox intact). Suggestion card shows on the **national** feed scope only (not inside a coalition view).
- **@handle-only**, **OKLCH tokens + logical RTL props + Hebrew copy**, **named exports / RORO / no inline types / <500 lines**.
- **Reads via RSC; mutations via Server Actions** (`createChallengeAction`); `router`/`redirect` rules unchanged.
- **No analytics** (per the PRD's privacy-light stance) — nothing instrumented.

## Fixtures
None — all internal Drizzle rows, covered by PGlite integration tests. Storybook mocks via `story-mocks` (extend with a close-this-week `createBinaryMarket({closeAt: inDays(3)})`).

## Build steps
1. **Repo read** `listDuelableMarkets({db, limit=5, excludeMarketId?, withinDays=7, now=new Date()})` in `markets/repo.ts` — model on `listMarketsClosingSoon`: `status='open'` + `isNull(groupId)` + `gt(closeAt, now)` + `lte(closeAt, now+withinDays)` + (excludeMarketId ? `ne(id, …)`) , `orderBy(desc(hot), asc(closeAt))`, `limit`. Returns `MarketRow[]`. **No `closingSoonNotifiedAt` filter, no user filter.**
2. **Feed read** `getSuggestedDuelMarkets({db, limit=5, excludeMarketId?}): Promise<MarketCardData[]>` in `markets/feed.ts` — copy `getUnpredictedOpenMarketCards`'s body but source rows from `listDuelableMarkets` (no `userId`). Reuses `getMarketBundles` + `getPoliticiansByPersonIds` + `getOutcomeCountsForMarkets` + `bundleToMarket`.
3. **Share the wired challenge behavior** — extract the `createChallengeAction` → copy-link logic (currently in `ChallengeMarketButton`) into a hook/wrapper both `ChallengeMarketButton` and a wired suggestion card use, OR render `ChallengeMarketButton` inside `DuelSuggestionCard` instead of the presentational `ChallengeButton` (decide at impl; prefer the smaller diff). Net: the suggestion card's button mints + shares for real.
4. **Place the suggestion card on the feed** — `app/page.tsx`: when logged-in AND national scope (`!groupScope`), fetch `getSuggestedDuelMarkets({limit:1})` and render the wired `DuelSuggestionCard` above the `<MarketCard>` grid (after `<CategoryRail>`). Renders nothing if the list is empty (no empty shell). *(Optionally `app/markets/page.tsx` too — same pattern.)*
5. **Rematch picker** — extend `DuelResolution` with `suggestedMarkets?: MarketCardData[]`. In `duel-result.tsx`, when `verdict != null` and `suggestedMarkets?.length`, the "אתגרו שוב" CTA toggles an inline picker of 2–3 wired suggestion rows (challenge → mint + share). Empty → CTA falls back to a `/markets` link.
6. **Page wiring** — `/duel/[token]/page.tsx`: when `resolution` is set, also `getSuggestedDuelMarkets({excludeMarketId: challenge.marketId, limit:3})` → `resolution.suggestedMarkets`.
7. **Tests** (PGlite, co-located `*.integration.test.ts`, `createTestDb`, test behavior — per the `testing` skill): `listDuelableMarkets` (open-only, global-only, the closeAt window both bounds, `excludeMarketId`, ordering hot→soonest, limit); `getSuggestedDuelMarkets` returns `MarketCardData` with counts+featured. Storybook: the wired suggestion card + the rematch picker (win state with candidates, empty state).
8. **Verify**: stop dev → `pnpm lint && typecheck && vitest run app/lib/markets app/lib/duels && pnpm build`.
9. **Refresh/delete fixtures** if shapes differed (none expected).
10. **/wrap-up** → **/log-decisions** (append `docs/decisions/duels.md`) + **/evergreen-documentation**.
11. **/code-review**; fix findings.
12. **/browser-qa**: home feed shows the suggestion card → challenge mints a link; settled duel → rematch picker → new duel. (Logged-in; reuse a dogfood throwaway as needed.)
13. After PR #107 lands on remote `main`: `git pull --ff-only origin main` (shared prod DB / migration-number hygiene).

## Out of scope (parking lot)
- Re-targeting the literal same opponent (needs a non-token duel model).
- A recommendation engine beyond closing-soon + hot.
- Coalition-scoped duel suggestions.

## Verification Status
**Verified from source:** `MarketCardData` shape + `getUnpredictedOpenMarketCards`/`getMarketCards` bodies (feed.ts), `listMarketsClosingSoon` query (repo.ts:266), the home-feed render spot (page.tsx:172), the built duel components + `createChallengeAction` — all cited.
**NOT verified — needs live testing:**
- `getSuggestedDuelMarkets` returns sensible candidates on the **prod** dataset (are there ≥1 open global markets closing within 7d right now?) — verify in browser-QA; if the window is empty, widen `withinDays` or show nothing gracefully. *(Soft — not a blocker.)*
- Passing `MarketCardData[]` (full Market objects) into the client arena via `resolution` is serializable — confirm no RSC-serialization warning at build (expected fine; plain objects).
