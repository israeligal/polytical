# Decision Log — Markets & Parimutuel Betting

> Newest on top. Entries are immutable historical records: supersede, don't edit.
> See the full plan: `docs/superpowers/plans/2026-06-01-markets.md`.

---

## 2026-06-01 — Markets run on the live ledger: parimutuel betting, settlement, admin console

Phase 2 turns the static market demo into the real game loop: admins create markets
over real MKs, users place coin bets, odds move with the crowd, and admins resolve or
void markets to settle bets. All of it sits on the existing append-only coin ledger.

### Parimutuel resolution math (final-odds)

Each outcome carries a cached `poolTotal` = Σ of coins staked on it (bumped atomically
with each bet via `repo.incOutcomePool`, kept in step with the `bets` rows). Live odds
shown in the UI are indicative only — `poolTotal / total`. On resolve, the **winning
pool splits the ENTIRE pot** (no house rake), each winner pro-rata to their stake:

```
total   = Σ poolTotal over all outcomes
payout  = floor(total × yourStake / winningPool)
```

`floor` rounds in the house's favor (dust stays unpaid rather than overpaying), so the
sum of payouts never exceeds the pot. The PRD worked example holds: YES pool 7000 / NO
pool 3000 (total 10000), resolve NO → a 300-coin NO stake receives
`floor(10000 × 300 / 3000) = 1000`. YES bettors get `lost`, payout 0. Bets are settled
in `app/lib/markets/service.ts::resolveMarket`, with each won/refunded payout written
through `applyEntry` (`type: "payout"` / `"refund"`) and each bet row stamped
`won`/`lost`/`refunded` + its final `payout`.

### `winningPool = 0` → full refund (no divide-by-zero)

If the admin resolves to an outcome **nobody bet** (winning pool empty), there are no
winners and the payout formula would divide by zero. The settlement detects
`winner.poolTotal === 0` and instead **refunds every open bet in full** (`applyEntry`
`type: "refund"`, `amount: b.amount`), marking each `refunded`. The market still becomes
`resolved` with its `resolvedOutcomeId` recorded — the chosen outcome simply had no
backers. `voidMarket` is the same refund-all loop, reached explicitly (admin cancels)
rather than as a degenerate resolve, and lands the market in `voided`.

### Lock ordering: market row FIRST, then user (deadlock-free)

Every mutating path takes locks in one fixed order — **market row, then user row(s)** —
so concurrent bets and a resolve can never deadlock:

- `placeBet`: `repo.getMarketForUpdate` (`SELECT … FOR UPDATE` on the market row) →
  validate open/not-closed → insert bet → `applyEntry` (which locks the **user** row and
  enforces balance ≥ 0 / overflow) → bump the pool. All in one tx; an
  `InsufficientFundsError` (or any throw) rolls back the bet row and pool bump with the
  failed debit.
- `resolveMarket` / `voidMarket`: lock the **market** row first, then settle each bet via
  `applyEntry` (each locking that **user** row). Because the resolve holds the market lock
  for the whole settlement, an in-flight `placeBet` blocks on the same market row and
  serializes — it cannot race the settlement (it will fail `MarketClosedError` only if it
  also sees a non-open status; otherwise it waits, then commits before resolve proceeds).

The inverse order (user-then-market) is never used. `applyEntry` remains the **single**
coin writer; markets never touch `balance`/`transactions` directly. Min bet is `MIN_BET`
(10), enforced before the tx opens (`BelowMinBetError`).

### Admin enforcement is at the action layer, not just the route

`/admin` is gated by `proxy.ts` (requires a session) and `app/admin/page.tsx` redirects
non-admins (`!session.user.isAdmin` → `/`). But server actions are independently
invokable, so the **authoritative** check lives in `app/actions/admin-markets.ts`: every
one of `createMarketAction` / `resolveMarketAction` / `voidMarketAction` calls
`requireAdmin()` (re-reads the session, throws `NotAdminError` for non-admins) before
touching data. The admin list (`repo.listManageableMarkets`) shows open + closed (not yet
settled) markets with their live pools; resolved/voided markets drop off it.

### What the betting loop does end-to-end now

Real markets in the feed (`app/page.tsx` → `repo.listOpenMarkets` → `bundleToMarket`) and
detail page → pick an outcome and stake in the functional `BetPanel` → `placeBetAction` →
`placeBet` debits coins (`applyEntry` `bet`, −amount), records the bet, and moves the pool
→ odds shift for everyone → an admin resolves (winners split the pot) or voids (full
refund) from `/admin`, crediting via `applyEntry` `payout`/`refund`. The shared header's
balance pill and the affected market/feed pages are revalidated. **6 real markets** are
seeded over real MKs by `scripts/seed-markets.ts` (`pnpm seed:markets`).

### Deferred (correct for Phase 2)

- **Real leaderboard + accuracy stats.** The homepage leaderboard and the "you" row are
  still mock (`lib/leaderboard.ts`, `lib/mock-data.ts`). A real net-worth ranking and
  per-user accuracy (won/total settled bets) come later — they need an aggregate query
  over `bets`/`transactions`, out of scope here.
- **Comments / community.** The "דעות חמות" section on the market page is a placeholder;
  comments and community-suggested markets are a later phase.
- **Early cash-out.** No mid-market sell — a bet is locked until resolve/void. Final-odds
  parimutuel intentionally has no live cash-out price.
- **Auto-close on `closeAt`.** Markets currently stay `open` until an admin acts;
  `placeBet` already refuses bets past `closeAt` (`MarketClosedError`), but the `closed`
  status is set manually / by a future scheduled job, not automatically at the timestamp.

**Verified:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (57 passed — placeBet,
parimutuel resolve incl. the 7000/3000→1000 example, winningPool=0 refund, void,
already-resolved guard), `pnpm build` — all green. Live browser QA of the
place-bet → resolve loop runs in the closing `qa-session`.
