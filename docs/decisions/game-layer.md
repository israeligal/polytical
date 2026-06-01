# Decision Log — Game Layer (real leaderboard + accuracy + profile)

> Newest on top. Entries are immutable historical records: supersede, don't edit.
> See the full plan: `docs/superpowers/plans/2026-06-01-game-layer.md`.

---

## 2026-06-01 — The competition goes real: forecaster accuracy, net-worth leaderboard, profile

Phase 3 turns the mock leaderboard and placeholder profile into the real game loop.
When a market resolves, every participant's **forecaster accuracy** updates; the
homepage **leaderboard** ranks real users by net worth (with accuracy shown); and a
gated **profile/portfolio** page (`/profile`) shows balance, net worth, rank, accuracy,
open positions, and bet history. All derived from the existing ledger + bets tables —
no new coin writer.

### Two additive user columns hold the accuracy tally (migration 0006)

`app/lib/schema.ts` adds two `integer NOT NULL DEFAULT 0` columns to the `user` table:

```ts
totalResolved: integer("totalResolved").notNull().default(0), // markets the user had a bet in that resolved
totalWins:     integer("totalWins").notNull().default(0),     // of those, the user's top stake was on the winner
```

Migration `0006_chubby_skullbuster.sql` is two `ALTER TABLE "user" ADD COLUMN`
statements — purely additive, so it applies to the live Neon DB with zero downtime and
no backfill (existing rows default to `0`/`0`, i.e. "no resolved markets yet → 0%
accuracy"). Applied to production via `pnpm db:push` (`[✓] Changes applied`; columns
confirmed present: `integer`, default `0`, NOT NULL).

### Accuracy rule: **top-stake-on-winner**; ties → loss; void excluded

"Won a market" is **not** "had any winning bet" — it's "the user's conviction was
right." For each user in a resolving market we sum their stake **per outcome** and find
their single largest-staked outcome (strict argmax). They count as a **win** iff that
top outcome is the winning outcome.

- **Strict max → ties are a loss.** If a user split equally across two outcomes (or their
  top stake equals another outcome's), there is no unique conviction, so it is **not**
  a win. The `amt > top` comparison (not `>=`) keeps the first-seen outcome on a tie,
  but since the deciding outcome must *strictly* exceed all others to be the unique
  argmax, any tie at the top fails `top === winningOutcomeId` unless the winner happened
  to be first — and we intentionally treat an ambiguous top as a non-win. A user who
  staked **more** on the losing side than the winning side gets `totalWins += 0` even if
  they also placed a small winning bet.
- **`totalResolved` counts the market once per user**, regardless of how many bets they
  placed in it (we group by `userId`, then evaluate one win/loss).
- **Void is excluded entirely.** `voidMarket` refunds every bet and leaves both stat
  columns untouched — a voided market never happened for accuracy purposes.
- **`winningPool = 0` refund path is also excluded.** When the admin resolves to an
  outcome nobody bet, the settlement refunds everyone (no winners) and **skips** the
  stat bump — there is no meaningful "winner" to have been right about, and counting it
  would penalize everyone's accuracy for an admin's empty-outcome resolve.

The bump rides **inside the existing `resolveMarket` transaction**, after the settle
loop and before `markResolved`, via `repo.bumpUserStats({ tx, userId, won })`
(`UPDATE "user" SET totalResolved = totalResolved + 1, totalWins = totalWins +
(won?1:0)`). No new coin writer — coin movement stays in `applyEntry`; this only touches
the two integer tally columns, atomically with settlement.

### Net worth = balance + open stakes at cost (no mark-to-market)

```
netWorth = balance + Σ(amount of the user's still-`open` bets)
```

Coins on hand **plus** coins currently at risk, valued **at cost** (the stake), not at
live odds. This is deliberately *not* mark-to-market: a parimutuel position has no
realizable mid-market price (no cash-out), so valuing open bets at their stake is the
honest, non-speculative number. On resolve, the stake leaves the open pool and the
payout (or zero) lands in `balance`, so net worth converges to reality automatically.
Computed read-only in `app/lib/leaderboard/repo.ts::netWorthExpr` (a correlated
`SUM` subquery over `open` bets, `COALESCE`→0). Rank is the count of users with a
strictly-higher net worth, + 1.

### Accuracy display: `round(wins / resolved × 100)`, 0 before any resolve

`accuracy = round(totalWins × 100 / totalResolved)` as an integer percent, or **0** when
`totalResolved = 0` (a brand-new user shows 0%, not a division error / "NaN"). The
`accuracy: "accuracy"` leaderboard ordering therefore sorts never-resolved users last.
`getUserStats` returns the raw `totalWins`/`totalResolved` too so the profile can show
"4 / 7 (57%)".

### What the leaderboard + profile show now

- **Homepage leaderboard** (`app/page.tsx`): real users from
  `getLeaderboard({ by: "networth", limit: 8 })`, mapped to `LeaderboardRow`
  (`handle = name`, `netWorth`, `accuracy`, `rank`). When the viewer is logged in and not
  already in the top 8, their own row is appended (flagged `you`) via `getUserStats`. An
  empty-state renders before any resolved activity. The mock `lib/leaderboard.ts` is no
  longer read on the homepage.
- **Profile** (`app/profile/page.tsx`, Server Component): gated — `getSession` →
  logged-out users redirect to `/login?callbackUrl=%2Fprofile` (`proxy.ts` already gates
  `/profile`). Shows balance (CoinPill), net worth, rank, accuracy (with the
  `totalWins / totalResolved` breakdown), **open positions** (open bets → market question
  + outcome + stake + live odds) and **history** (resolved bets → won/lost + payout).
  Hebrew RTL, reusing the caricature/market styling tokens. A "פרופיל" nav link appears in
  `components/site-header.tsx` when logged in.

### Deferred (out of scope for Phase 3)

- **Comments / community.** The "דעות חמות" market-page section remains a placeholder;
  comments and community-suggested markets are a later phase.
- **Streaks.** No win/loss streak tracking — only the cumulative `totalWins` /
  `totalResolved` tally. A streak would need per-resolution history we don't store yet.
- **Notifications.** No "your market resolved / you won" notifications — resolution is
  silent; the user discovers outcomes on their profile/feed. No notification table,
  delivery, or read-state.
- **Friends / follow, mark-to-market net worth, real handles.** Net worth stays at-cost
  (above); the leaderboard uses `users.name` as the handle (no separate `@handle`); no
  social graph.

**Verified:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — all green.
Migration 0006 applied to the live Neon DB (`pnpm db:push` → `[✓] Changes applied`,
columns confirmed). Live browser QA of resolve → leaderboard/profile runs in the closing
`qa-session`.
</content>
</invoke>
