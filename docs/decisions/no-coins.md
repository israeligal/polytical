# Key Decisions: Remove the Coin Economy

### Replace coins with a right/wrong prediction record (2026-06-10, feat/no-coins)
Removed the entire play-money economy (ledger, balance, parimutuel pools, payouts, faucet, streaks, season coin rewards). A "bet" became a **stake-less prediction**: one pick per market, changeable until close. On resolve we tally `users.totalResolved` (every predictor) and `users.totalWins` (correct picks); `wrong = totalResolved − totalWins`. Rationale: the product is about forecasting skill, not a token economy — "no coins, just how many right and how many wrong." Considered keeping coins as cosmetic score vs. removing entirely → removed entirely (simpler, matches the ask).

### Keep the `bets` table name; enforce one-prediction-per-market with a unique index (2026-06-10, feat/no-coins)
Dropped `amount`/`payout`/`status` from `bets` and added `unique(userId, marketId)` rather than renaming the table to `predictions`. Rationale: a table rename cascades through ~10 query sites + the migration + the snapshot for purely cosmetic gain; the DB name is documented as legacy. `makePrediction` UPSERTs on the unique index. Behavioral change from the old model: a user can no longer hold multiple (hedged) positions on one market.

### Derive predictor counts live instead of caching a pool (2026-06-10, feat/no-coins)
Dropped `outcomes.poolTotal`. The crowd-split bar now renders the live COUNT of predictions per outcome (`getOutcomeCounts`), passed into the view adapter. Rationale: errors-over-fallbacks — a cache with no writer would silently drift; counting is cheap at this scale.

### Cards unlock by accuracy, not purchase (2026-06-10, feat/no-coins)
Removed `collectCard` (the 250-coin buy). A card is granted automatically inside `resolveMarket` when the user's correct-prediction count for that politician (`card_progress`) reaches a rarity threshold (`RARITY_UNLOCK_THRESHOLD`: legendary 10 / epic 7 / rare 5 / common 2, keyed off `rarityForRole`). Rationale: the user's spec — "if you are right … you get his card; higher rank needs more." Mapped the example (Bibi 10 / silver 7 / bronze 5 / cabinet 3 / knesset 2) onto the 4 existing rarity tiers.

### Seasons repurposed as an accuracy track (2026-06-10, feat/no-coins)
Seasons kept, but tiers now require N **correct predictions** resolved in the season window (`goalCorrect`), derived live — no claim, no coin reward. Dropped `season_reward_claims` and `season_reward_tiers.rewardAmount`; reused the `season_reward_tiers` table (aliased `seasonTiers`, column `goalAmount` aliased `goalCorrect`) to avoid a physical rename. Rationale: user chose "repurpose as accuracy track"; deriving reached-state removes the claim writer (and its coin dependency) entirely.

### Leaderboard ranks by # correct + accuracy (2026-06-10, feat/no-coins)
Replaced the net-worth ranking with two orders: `by: "wins"` (totalWins desc, accuracy tiebreak) and `by: "accuracy"` (ratio desc, wins tiebreak). Dropped the `netWorthExpr` (it read `bets.amount`/`status`, now gone). Rationale: user chose "both # correct + accuracy %".

### Keep `bet_won` in the notification enum; only drop `season_reward` (2026-06-10, feat/no-coins)
Postgres can't drop an enum value in place. `bet_won` was repurposed (copy → "ניחשת נכון! 🎯") rather than removed, so only `season_reward` had to go. The `0017` migration **pre-cleans** dead `season_reward` rows from `notifications` + `user.mutedPushTypes` BEFORE the rename-recreate, or the cast-back bricks the live DB. Also removed the `ADD VALUE 'season_reward'` line from `scripts/apply-push-schema.ts` so a re-run can't re-add it.

### 0017 hand-tuned but snapshot generated via drizzle-kit (2026-06-10, feat/no-coins)
`drizzle-kit generate` produced the table/column drops + `card_progress` create + a correct `0017_snapshot.json`; we then prepended the enum-safety preclean (drizzle's auto-SQL omits it). Kept all DB names stable (aliasing to clean JS names) so generate ran without interactive rename prompts and the snapshot stays accurate for the next `db:generate`.
