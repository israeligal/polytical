# Remove the Coin Economy → Prediction (Right/Wrong) Model — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Not committed to the repo (scratch).

**Goal:** Delete Polytical's entire coin/money economy and replace it with a stake-less prediction record: each user picks ONE outcome per market (changeable until close); on resolve they're RIGHT iff they picked the winner, else WRONG. `users.totalResolved` / `users.totalWins` already model the denominator/numerator and survive verbatim.

**Architecture:** Foundation-first (schema + core services, sequential — everything imports it), then tiered fan-out of the leaves (haiku for mechanical reskin/strip, sonnet for judgment leaves + test rewrites), then a central converge (typecheck/lint/test/build) — because a coin removal is deeply interdependent across ~58 files and can't be naively parallelized.

---

## Scope decisions

| Area | Decision | Source |
|---|---|---|
| Predictions | One pick per (user, market), changeable until close; no stake. **NEW invariant: `unique(userId, marketId)`** (today multiple bets/user allowed — a behavioral change, kills hedging). | core |
| Right/wrong record | Reuse `users.totalResolved` (predicted-and-resolved) + `users.totalWins` (correct). `wrong = totalResolved − totalWins`. | user |
| Collection | **Unlock-by-accuracy**: collect a politician's card by N correct predictions on markets featuring them; N scales with the card's rarity. | user |
| Rarity→N threshold | **⚠️ CONFIRM THE TABLE.** `rarity.ts` has 4 tiers (legendary/epic/rare/common). Your example had 5 (Bibi 10 / silver 7 / bronze 5 / cabinet 3 / knesset 2). Proposed default keyed on existing rarity: **legendary 10 · epic 7 · rare 5 · common 2** — but "cabinet 3 vs Bibi 10" suggests you may want a finer role-based map. Need the final numbers. | flag |
| Seasons | **Repurpose as an accuracy track** — tiers unlock by # correct / accuracy in the window (a badge, no coin reward). `getSeasonWagered` → `getSeasonCorrect`. | user |
| Leaderboard | Rank by **# correct (`totalWins`) DESC, accuracy % tiebreak**, show both. | user |
| Streaks | **DEFAULT: remove** (`streakCount`/`bestStreak` are 100% faucet-derived). Re-add as a daily-prediction streak later if wanted. | flag |
| Brand/identity | **DEFAULT: keep the name "Polytical", reskin copy** from "play-money betting" → "free prediction game" (homepage hero, signup CTA, onboarding, layout/manifest metadata). | flag |

## Critical gotchas (load-bearing — from the map + completeness critic)

1. **Postgres can't drop an enum value in place.** `notification_type` must lose `bet_won`/`season_reward`. Decision: **KEEP `bet_won`** (repurpose its copy to "ניחשת נכון!"), only drop `season_reward`. Dropping it needs a rename-recreate AND **first** deleting/relabeling any `notifications` rows + `user.mutedPushTypes` array elements holding `season_reward` — else the migration bricks on the (non-empty, prod) DB. **`scripts/apply-push-schema.ts:28` hardcodes `ADD VALUE 'season_reward'` — remove that line** or it re-adds the value.
2. **`tx_type` + `bet_status` enums** are dropped wholesale (with their tables) — no value-removal problem.
3. **`lockUser` + `LedgerTx` type live in `app/lib/ledger/repo.ts`** but have non-coin callers: `lockUser` (onboarding/service.ts:61,86; cards/service.ts:36) and `LedgerTx` (`import type` in 8+ repos). **Re-home both to a neutral module** (`app/lib/db.ts` exports a `Tx` type; move `lockUser` to `app/lib/users/repo.ts`) BEFORE deleting `ledger/`.
4. **`lib/auth.ts:6,51-59`** calls `grantStartingStack` in the signup `databaseHooks` — a live coin writer in the auth lifecycle. Remove the hook + import.
5. **`Outcome.pool` (lib/types.ts:35) is overloaded** — coin stake pool AND the crowd-% denominator feeding `OddsBar`/`bet-panel`/`market-card` via `totalPool`/`pct`. Replace with a **predictor count** (live `COUNT(predictions) per outcome`); `totalPool`/`pct` operate on counts now. Cascades to `odds-bar.stories.tsx` (play-fn asserts "% match pool split").
6. **The celebration subsystem's trigger IS the payout** (`celebration-overlay` shows `+{payout} שקוינים`, `app/actions/celebrations.ts` consumes a payout event). Re-theme to a right/wrong reveal (keep `bets.seenAt` one-time mechanic), not just restyle.
7. **`PGlite replays the whole `drizzle/` folder`** → do NOT edit history; add one forward `0017_remove_coins`. Schema + migration + test-DB + seeds change in lockstep (CLAUDE.md).
8. **`formatCoins` (lib/format.ts:4)** is imported by 8 UI files — remove in lockstep.

## Migration `0017_remove_coins` (order matters — drop dependents first)

```sql
-- 1. relabel/clean dead enum data BEFORE touching the enum
DELETE FROM notifications WHERE type = 'season_reward';
UPDATE "user" SET "mutedPushTypes" = array_remove("mutedPushTypes", 'season_reward');
-- 2. ledger
DROP TABLE transactions CASCADE;            -- + its 2 indexes
DROP TYPE tx_type;
-- 3. seasons subtree
DROP TABLE season_reward_claims CASCADE;
DROP TABLE season_reward_tiers CASCADE;
DROP TABLE seasons CASCADE;
DROP TYPE season_status;
-- 4. user coin columns (KEEP totalResolved, totalWins, mutedPushTypes)
ALTER TABLE "user" DROP COLUMN balance, DROP COLUMN "lastFaucetAt",
  DROP COLUMN "streakCount", DROP COLUMN "bestStreak";
-- 5. outcomes pool cache
ALTER TABLE outcomes DROP COLUMN "poolTotal";
-- 6. bets → predictions
ALTER TABLE bets DROP COLUMN amount, DROP COLUMN payout, DROP COLUMN status;
DROP TYPE bet_status;
ALTER TABLE bets ADD CONSTRAINT predictions_user_market_uq UNIQUE ("userId","marketId");
-- (rename bets→predictions deferred — straight column-drop in place is lower-risk; revisit)
-- 7. notification_type: drop 'season_reward' via rename-recreate (KEEP bet_won)
--    ALTER TYPE notification_type RENAME TO notification_type_old; CREATE TYPE ... (7 vals minus season_reward);
--    ALTER TABLE notifications ALTER COLUMN type TYPE notification_type USING type::text::notification_type;
--    DROP TYPE notification_type_old;
-- 8. card-progress for accuracy unlocks (NEW)
CREATE TABLE card_progress ( "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "personId" integer NOT NULL, "correctCount" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("userId","personId") );
```
Generate via `pnpm db:generate` where it produces the right DDL; hand-author the enum rename + the data-cleanup + the unique constraint (drizzle-kit won't emit the pre-clean). Apply to the shared Neon DB surgically (prod-safe, additive-then-destructive — **HARD GATE**, snapshot first).

## Collection-by-accuracy design (the one NEW feature)

- `card_progress(userId, personId, correctCount)` — bumped inside `resolveMarket`'s tx: for each predictor who was RIGHT, for each `personId` in `market_politicians` for that market, `correctCount += 1`; when it crosses `threshold(rarityFor(politician))`, insert `card_collections(userId, personId)` (idempotent via its existing `unique(userId,personId)`).
- `rarityForRole` (rarity.ts:8) already derives the tier; add `RARITY_UNLOCK_THRESHOLD: Record<Rarity, number>` (the table to confirm).
- Collection UI shows progress ("3/5 נכונים לאסוף את גפני") from `card_progress`; the `/collection` gallery + owned/locked rendering (coin-free already) stays. `collectCard` (manual buy) is REMOVED (cards now auto-unlock by accuracy).

## Execution strategy (build order)

- **Phase 1 — Foundation, sequential, me (opus), inline:** the 0017 migration + schema; re-home `lockUser`/`Tx`; delete `app/lib/ledger/`; `makePrediction` (UPSERT, no stake); `resolveMarket` rewrite (right/wrong + card-progress + bumpUserStats + notification); `voidMarket` (no refund); seasons→correct-count; leaderboard→correct/accuracy; `economy.ts` (drop coin constants); `errors.ts` (drop coin errors); `lib/auth.ts` (drop grant hook); `lib/types.ts` (drop balance/pool→count). **Commit.** This is the contract.
- **Phase 2 — Fan-out leaves (one Workflow, model-tiered, ABSOLUTE worktree paths, no test runs, no commits):**
  - 🟢 **haiku:** strip `CoinPill`/`FaucetButton`/`Coin`/`Shekoin` glyph (mind the logo motif), swap `מטבעות`/`שקוינ` copy (homepage, signup, admin explainer, onboarding, layout+manifest metadata, action strings), delete coin-only stories, fix trivial imports.
  - 🟡 **sonnet:** reskin celebration (right/wrong), profile portfolio (predictions list), bet-panel→predict-panel, odds-bar (count-based), market-admin-row, seasons UI (accuracy), leaderboard UI; rewrite the coin tests (ledger invariants/payout/faucet/season → right/wrong + predictions + card-unlock).
- **Phase 3 — Converge, me:** wire seams, `lint+typecheck+test+build`, fix cascade breakage, commit.
- **Phase 4 — Adversarial review (sonnet panel) + browser-QA** predict→resolve→right/wrong→card-unlock on a prod build.
- **Docs (sonnet/me):** supersede CLAUDE.md "ledger & money invariants (P0)" → predictions model; new `docs/decisions/no-coins.md`; design-system gold-token meaning; PRD note.

## Convention Compliance
Layered Route→Service→Repo→DB (predictions service owns the upsert; repo owns DB); RORO; named exports; errors-over-fallbacks (derive predictor counts live, no silent cache); scope guards (reqUser on prediction repo); PGlite real-tx tests; schema+test-DB+seeds in lockstep; logical Tailwind/tokens on reskinned UI; one-prediction-per-user enforced at the DB (unique index), not just app code.

## Reused data structures
`users.totalResolved`/`totalWins` (schema.ts:22-23) — reuse verbatim. `card_collections` (unique userId,personId) — reuse for ownership. `market_politicians` (marketId, personId) — the market→politician link for card progress. `rarityForRole`/`Rarity` (rarity.ts) — reuse for thresholds. `bumpUserStats` (markets/repo.ts) — already coin-free, reuse. `bets.seenAt` — reuse for the one-time reveal. `MarketClosedError`/`InvalidOutcomeError`/`AlreadyResolvedError` (errors.ts) — reuse; DROP `Insufficient/FaucetCooldown/BalanceOverflow/BelowMinBet`.

## Test plan (per the `testing` skill)
PGlite, subtractive. Keep the accuracy tests (markets service.test 346-405) + accuracy-leaderboard. New `predictions.test`: upsert one pick (changeable till close; closed/past-close→MarketClosedError; cross-market outcome→InvalidOutcomeError; the unique(userId,marketId) invariant); `resolveMarket` marks right iff outcomeId===winner, bumps totalResolved (all) + totalWins (correct), terminal (AlreadyResolvedError); `voidMarket` leaves stats untouched, no refund; **card-unlock**: N correct on a politician's markets inserts the ownership row at the threshold, idempotent. Delete ledger-invariants/payout/faucet/season-claim tests. Seeds: drop balances/pools/season; predictions = stake-less picks.

## Verification Status
**Verified from source:** the 58-file map (workflow `wf_d4893aa7`), the enum-removal + lockUser/LedgerTx + grantStartingStack + Outcome.pool + celebration-trigger gotchas (completeness critic, cited file:line).
**NOT verified — HARD GATES:** (1) the `0017` migration on the shared Neon DB — must pre-clean dead `season_reward` rows or it bricks; snapshot first. (2) Full predict→resolve→card-unlock flow on a prod build (browser). (3) The rarity→threshold table (product input).

## Final steps
Refresh seeds; supersede CLAUDE.md/PRD/design-system/decision-logs (immutable → new entries); `/wrap-up`; `/code-review` before pushing. Do NOT commit this plan doc.
