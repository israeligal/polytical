# Decision log — Seasons + global search (Phase 3)

Retention: a time-boxed reward track and a discovery search, from the Ploytical handoff.

## Season progress is computed LIVE from the ledger — no cron, no tally column
A user's season progress is their **net Shekoins won in the season window**: `SUM(amount)` over `transactions` of betting types (`payout`/`refund` credits +, `bet` debits −) created within `[startAt, endAt]`. Grants/faucet/collect/season_reward are excluded so progress measures forecasting skill, not handouts. There is **no `users.seasonProgress` cache** — that would be a second writer to keep in sync inside every bet/resolve tx (violating "one authoritative writer"). The trade-off (a window-sum per board render) is cheap and always correct, and it means a season can be created/redated without a backfill. Claimability is derived live and bounded by `endAt`; an admin action (or `now ≥ endAt`) ends a season. **No cron exists** — nothing needs to "run" when a season ends; the board just stops showing tiers as claimable.

## Claiming a tier mirrors the grant: one atomic, idempotent, terminal write
`claimTier` follows `grantStartingStack`'s exact shape: one `db.transaction` → `lockUser` FIRST → `lockTier` → assert the season is live (`status≠ended AND now<endAt` → `SeasonEndedError`) → `isClaimed` guard (`AlreadyClaimedError`) → progress (recomputed **under the lock**) `≥ goalAmount` (`TierNotReachedError`) → `applyEntry({type:"season_reward"})` (the sole coin writer) → `insertClaim`. The `(userId, tierId)` **composite PK** is the final idempotency backstop: a lost race makes `insertClaim` return false → we throw → the credit rolls back. A later dip below goal **never revokes** a claim — it's terminal (proven by a test). The `season_reward` value is appended to the `txType` enum (never reordered; the `ALTER TYPE … ADD VALUE` runs as its own migration statement and replays on PGlite).

## One active season — guarded twice
At most one `status='active'` season at a time: enforced by a **partial unique index** (`WHERE status='active'`) AND a `countActiveSeasons` check in `createSeason`. The app-level check gives a clean `AnotherSeasonActiveError`; the DB index is the race backstop. Tiers must have strictly-increasing goals + positive rewards (`InvalidSeasonError`).

## The markets trigram index is declared IN THE SCHEMA, not just a migration
`markets.searchText` (normalized question text) gets a trigram GIN index. Critically, it's declared in the Drizzle schema via `.using("gin", sql\`… gin_trgm_ops\`)` — **not** hand-written only in the migration like `politicians_searchname_trgm_idx` (migration 0003) was. We discovered that index was **absent on Neon**: `db:push` diffs against the schema and drops indexes it doesn't know about, so a migration-only index gets wiped by the next push. Declaring it in-schema makes push create *and* preserve it. (The politicians one is left as-is — its search is in-memory in the gallery today, so the missing index doesn't bite yet.)

## Search is discovery-only, normalized on both sides
`searchText` is written via `normalizeSearchName(questionHe)` on **every** market-create path (admin + suggestion-approval both route through `createMarket`), and `search()` normalizes the query with the **same** function — so the needle and the indexed column live in the same space (niqqud/finals/particles stripped). `ILIKE %q%` is index-assisted by the trigram GIN; this is sanctioned for **discovery** by CLAUDE.md, never for attribution/resolution. Draft + voided markets are excluded (only live/settled are findable). A query under 2 normalized chars returns empty — no fuzzy guessing. A `backfill-market-search` script (assert-non-prod, batched) populates rows that predate the column.

## Search input is uncontrolled
`SearchInput` uses `defaultValue` + a debounced `router.replace` — no `useState`/`useEffect`. This avoids the "sync prop→state via effect" anti-pattern (and its lint error), keeps the URL the shareable source of truth, and means a re-render from the debounced replace never resets the caret. Trade-off: browser back/forward doesn't update the box text (acceptable for v1). The page reads `q` from `searchParams` (awaited) and passes it as a prop — so no `useSearchParams`, no Suspense gap.

## Deferred
- Admin create/end-season UI (the actions + `seed:season` script exist; no console form yet).
- A `politicians.searchName` trigram index on Neon (re-declare in-schema when politician DB-search ships).
- Season history / past-season archive; multiple concurrent seasons.
