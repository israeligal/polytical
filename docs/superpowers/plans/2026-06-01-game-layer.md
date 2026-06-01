# Polytical Phase 3 — Game Layer (real leaderboard + accuracy + profile)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the competition real. When a market resolves, each participant's **forecaster accuracy** updates; the homepage **leaderboard** ranks real users by net worth and accuracy; a **profile/portfolio** page shows balance, net worth, rank, accuracy, open positions, and bet history.

**Builds on (do NOT rebuild):** the ledger (`app/lib/ledger/*`), markets (`app/lib/markets/*` incl. `resolveMarket`), `app/lib/schema.ts` (users + bets + markets), `app/lib/politicians/*`, `lib/auth.ts` (`getSession`), `proxy.ts` (`/profile` already gated), `components/leaderboard-row.tsx` (takes `{rank, handle, netWorth, accuracy}`), the mock `lib/leaderboard.ts` (to be replaced on the homepage).

**Definitions:**
- **Net worth** = `balance + Σ(open bet stakes)` (coins settled + at-risk, at cost).
- **Accuracy** = `round(totalWins / totalResolved × 100)`, or 0 when `totalResolved = 0`.
- **Won a market (for accuracy)** = the user's **largest single-outcome stake** in that market was on the winning outcome (strict max; ties → not a win). Void → no stat change.

**Tech/conventions:** Next.js 16 · Drizzle + postgres-js · Neon · PGlite tests · `CLAUDE.md`.

---

## Task 1: User stat columns

**Files:** Modify `app/lib/schema.ts`; migration

- [ ] **Step 1:** add to the `users` table (after `lastFaucetAt`):
```ts
  totalResolved: integer("totalResolved").notNull().default(0), // markets the user had a bet in that resolved
  totalWins: integer("totalWins").notNull().default(0),         // of those, the user's top stake was on the winner
```
- [ ] **Step 2:** `pnpm db:generate` → `0006_*`. `pnpm test` (PGlite replays). Commit.

---

## Task 2: Resolution updates accuracy stats (TDD)

**Files:** Modify `app/lib/markets/service.ts`, `app/lib/markets/repo.ts`, `service.test.ts`

- [ ] **Step 1: failing tests** — extend the markets tests: after `resolveMarket`, the winning bettor's `totalResolved` = 1 and `totalWins` = 1; a losing-only bettor's `totalResolved` = 1, `totalWins` = 0; a user who staked **more** on the losing side than the winning side → `totalWins` = 0 even if they also had a small winning bet; `voidMarket` leaves stats unchanged.

- [ ] **Step 2:** add `repo.bumpUserStats({ tx, userId, won })` — `UPDATE "user" SET totalResolved = totalResolved + 1, totalWins = totalWins + (won?1:0)`. In `resolveMarket`, after the settle loop (and only when **not** the winningPool=0 refund path), group the fetched `bets` by `userId`, compute each user's per-outcome stake sums, decide `won = argmaxOutcome === winningOutcomeId` (strict max), and call `bumpUserStats`. Keep it inside the same transaction.

```ts
// after settling bets, before markResolved (skip when winner.poolTotal === 0):
const byUser = new Map<string, Map<string, number>>();
for (const b of bets) {
  const m = byUser.get(b.userId) ?? new Map();
  m.set(b.outcomeId, (m.get(b.outcomeId) ?? 0) + b.amount);
  byUser.set(b.userId, m);
}
for (const [uid, stakes] of byUser) {
  let topOutcome: string | null = null, top = -1;
  for (const [oid, amt] of stakes) if (amt > top) { top = amt; topOutcome = oid; }
  await repo.bumpUserStats({ tx, userId: uid, won: topOutcome === winningOutcomeId });
}
```

- [ ] **Step 3:** `pnpm test app/lib/markets` → all pass. Commit.

---

## Task 3: Leaderboard + stats repo (TDD)

**Files:** Create `app/lib/leaderboard/repo.ts`, `app/lib/leaderboard/repo.test.ts`

- [ ] **Step 1: failing tests** (PGlite): seed 3 users with different balances + open bets + stat columns; assert `getLeaderboard({ by: "networth" })` orders by `balance + Σ open stakes` desc with correct ranks; `getLeaderboard({ by: "accuracy" })` orders by `totalWins/totalResolved` desc (0-resolved last); `getUserStats({ userId })` returns `{ balance, netWorth, accuracy, totalResolved, totalWins, rank }`.

- [ ] **Step 2:** implement with one query each (use `sql` for the netWorth subquery + accuracy ratio). `netWorth = u.balance + COALESCE((SELECT SUM(amount) FROM bets WHERE "userId"=u.id AND status='open'),0)`. `accuracyExpr = CASE WHEN totalResolved>0 THEN round(totalWins*100.0/totalResolved) ELSE 0 END`. Return `LeaderboardEntry { rank, userId, name, netWorth, accuracy }` (rank from `row_number()` or index). `getUserStats` computes the user's row + their rank (count of users with higher netWorth + 1).

- [ ] **Step 3:** `pnpm test app/lib/leaderboard` → pass. Commit.

---

## Task 4: Wire the homepage leaderboard + profile page

**Files:** Modify `app/page.tsx`, `components/leaderboard-row.tsx`; Create `app/profile/page.tsx`

- [ ] **Step 1:** `app/page.tsx` leaderboard section — replace mock `leaderboard` with `getLeaderboard({ by: "networth", limit: 8 })`; map each to `LeaderboardRow` (`handle = name`, `netWorth`, `accuracy`, `rank`). If logged in and not in the top 8, append the user's own row (`getUserStats`) flagged `you`. Empty-state when no resolved activity yet.
- [ ] **Step 2:** `leaderboard-row.tsx` — guard already in place; ensure it accepts the real shape (rank/handle/netWorth/accuracy). No structural change expected.
- [ ] **Step 3:** `app/profile/page.tsx` (Server Component; `getSession` → redirect logged-out to `/login?callbackUrl=%2Fprofile`): show the user's balance (CoinPill), net worth, rank, accuracy (with `totalWins/totalResolved`), **open positions** (their open bets → market question + outcome + stake + live odds), and **history** (resolved bets → won/lost + payout). Reuse caricature/market styling tokens; Hebrew RTL. Add a "פרופיל" nav link in `site-header.tsx` when logged in.
- [ ] **Step 4:** `pnpm lint && pnpm typecheck && pnpm build`. Commit.

---

## Task 5: Verify

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] `docs/decisions/game-layer.md` — record the accuracy rule (top-stake-on-winner; ties → loss; void excluded), net-worth definition, and that comments/streaks/notifications remain deferred.
- [ ] Commit. (Browser QA — resolve a seeded market with 2 bettors → leaderboard + profile reflect it — runs in the closing qa-session.)

## Self-Review
- **Spec coverage:** PRD accuracy/forecaster hook → Task 2 (stat updates on resolve) + Task 3 (accuracy ranking); leaderboard (net worth + accuracy) → Tasks 3–4; profile/portfolio → Task 4.
- **Reuse:** stat updates ride inside the existing atomic `resolveMarket` tx; net worth/accuracy are read-only queries; no new coin writer.
- **Deferred:** comments, streaks, notifications, friends/follow, mark-to-market net worth, real handles (using `name`).
