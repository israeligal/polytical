# Decisions — Foundation (Coin Ledger)

> Newest on top. Entries are immutable historical records.

## 2026-05-31 — Coin ledger applied to live Neon DB

The append-only coin ledger now sits on top of the already-live Better Auth + Neon
foundation. Key decisions made during implementation:

- **Lazy, idempotent starting-stack grant.** A new user's 1,000-coin stack is *not*
  granted by a sign-up hook. Instead `getOrInitBalance({ userId })` is called wherever
  the balance renders (the site header). It calls `grantStartingStack`, which inside a
  single DB transaction checks `countByType(type: "grant") > 0` and returns early if a
  grant row already exists — so it is safe to call on every render and on every device.
  This keeps the grant decoupled from the auth provider's lifecycle and self-healing:
  any authenticated user without a stack gets one the next time their balance is read.

- **Ledger keyed to Better Auth `user.id`.** `transactions.userId` is a `text` FK to
  `user.id` (`ON DELETE cascade`), the same identity Better Auth issues. There is no
  separate "player"/"wallet" identity — the auth user *is* the coin holder. The cached
  `user.balance` column and the appended `transactions` row are always written in the
  **same** DB transaction by the single authoritative writer `applyEntry` (lock row →
  validate non-negative → update cache → insert row), so the cache can never drift from
  the ledger and a balance can never go negative (overdrafts throw and roll back).

- **Only `DATABASE_URL` is present (no unpooled URL).** The repo's `.env` exposes a
  single `DATABASE_URL` (Neon pooler), consumed by both `app/lib/db.ts` (postgres-js,
  `prepare:false`) and `drizzle.config.ts`. There is no `DATABASE_URL_UNPOOLED` /
  direct-connection variant. `drizzle-kit push` and `generate` run fine against the
  pooled URL for this additive migration; if a future migration needs a direct
  (unpooled) connection, that env var must be added then. No `.env.local` exists (it
  would shadow `.env`).

**Migration applied:** `drizzle/0001_known_the_anarchist.sql` — additive only: adds
`user.balance` (integer, default 0, not null) + `user.lastFaucetAt` (timestamp), creates
the `tx_type` enum (`grant`,`faucet`,`bet`,`payout`,`refund`) and the `transactions`
table with FK + `(userId, createdAt)` index. Pushed to live Neon via `pnpm db:push`
("Changes applied"); presence of both columns, the table, and the enum verified directly
against the DB.

**Verified:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (4 passed), `pnpm build` — all
green. Ledger correctness is proven on PGlite (real Postgres applying the same `./drizzle`
migrations): idempotent grant, 24h faucet cooldown, and overdraft rollback.

**Deferred to closing browser QA:** live end-to-end smoke (sign up → 1,000 → claim faucet
→ 1,200 → cooldown message) in a real browser via the `qa-session` skill.
