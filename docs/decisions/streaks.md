# Decision log — Streaks & daily challenge (Phase 6)

## Streak continuity uses a 48h grace window, NOT a calendar day
The daily faucet keeps its existing **24h cooldown** (one claim per `FAUCET_COOLDOWN_MS`). A streak advances when the *next* claim lands within `STREAK_GRACE_MS` (48h) of the previous one; a longer gap (or the first-ever claim) restarts the streak at 1.

- **Why not calendar-day (Jerusalem midnight)?** That's the more intuitive "Duolingo" model, but it would change the cooldown semantics (per-day instead of per-24h) and rewrite the faucet's existing, money-critical boundary tests. The 48h grace gives the same "come back daily or lose it" feel with zero change to the proven cooldown path: claim within ~a day of being eligible and the chain holds; skip a full day and it breaks.
- **Trade-off accepted:** a user claiming every ~47h keeps a streak while effectively claiming every other day. Acceptable for a play-money game; revisit if we add real stakes.

## Bonus curve: +25/day, capped at day 8 (+175)
`faucetAmountForStreak(streak) = DAILY_FAUCET + min(streak-1, STREAK_BONUS_DAYS) * STREAK_BONUS_PER_DAY`.
Day 1 = 200, day 2 = 225, … day 8+ = 375. Bounded and well under `MAX_BALANCE`, so the overflow guard is never the thing that stops it.

## Streak is computed UNDER the faucet's FOR-UPDATE lock
`claimDailyFaucet` reads `streakCount`/`bestStreak`/`lastFaucetAt` from the row it already locked (`lockUser` → `FOR UPDATE`) for the cooldown check, computes the new streak + amount, then writes them via `setFaucetClaim` in the same transaction. `applyEntry` remains the **sole** balance writer. Two concurrent claims therefore can't double-increment the streak or double-pay — the same invariant that protects the cooldown protects the streak. `bestStreak` is `max(prev, streak)` so it never decreases.

## Market of the day = most-active OPEN market
`getMarketOfTheDay` returns the open market with the most bets (ties → newest), via a left join so a fresh app with zero bets still surfaces a market. It is read-only and never touches the ledger. On the homepage it drives the hero spotlight as a fallback: an admin-flagged `hot` market wins; otherwise the market-of-the-day is shown with a "שוק היום · הכי פעיל" badge; otherwise the newest open market.

## Deferred
- Streak freeze / insurance (one-miss forgiveness).
- Push/email reminders to keep a streak alive.
- A per-day calendar UI (GitHub-style grid).
- Daily-challenge quests beyond market-of-the-day (e.g. "bet on 3 categories today").
- Weekly streak leaderboards.
