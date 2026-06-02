# Decision log — dogfood fixes

A 7-persona multi-agent dogfood (real accounts exercising the live app + adversarial probes) confirmed the money/ledger backbone is solid — balance never went negative, every coin movement stayed an atomic ledger row, and all bad inputs were rejected with the right domain error. It also surfaced 5 bugs (none corrupting money/state). This documents the fixes.

## HIGH — season tiers were permanently unreachable → progress is now "Shekoins wagered", not "net winnings"
The original metric (`net Shekoins won in the season window`) could only *rise* on a resolved-market payout — but markets close months out and resolution is admin-only, so within a 30-day season **no normal player could ever move the bar**; betting only *lowered* it (debits with no offsetting payout). Every tier was unclaimable for everyone.

The fix re-defines progress as **Shekoins wagered in the window** (`getSeasonWagered` = `-SUM(bet)` over `[startAt, endAt]`). This rewards engagement, rises with normal play, and is bounded by the coins a player can acquire (~1000 + daily faucet over the season) so the tier curve (100/500/1500/5000) is a reachable battle-pass. Copy updated ("השקוינים שהימרתם העונה"); `season_reward` claim path is otherwise unchanged (still one atomic, lock-first, exactly-once, terminal claim). **This is a deliberate product shift from skill→activity** — flagged for review; reverting to a skill metric would require markets that resolve inside the season window.

## MEDIUM — malformed UUIDs leaked raw Postgres errors → domain errors at the boundary
`claimTier('not-a-uuid')` hit the `uuid` column and raised a raw 22P02 (→ unhandled 500 in the action). Added `isUuid` (`app/lib/ids.ts`) and a guard at the top of `claimTier` → `TierNotFoundError` (a valid-but-unknown UUID was already handled by `lockTier → null`).

Also hardened the SQLSTATE helpers: `pgErrorCode` now **walks the `.cause` chain** because drizzle-orm wraps the driver error in `DrizzleQueryError` — the old `isUniqueViolation` only checked the top-level `e.code` and would have missed a wrapped code. `isUniqueViolation` + new `isForeignKeyViolation` both route through it.

## MEDIUM — definite-article Hebrew searches returned nothing → particle-chain normalization
`search('הבחירות')` returned 0 while `'בחירות'` returned the market, because `stripLeadingParticle` (idempotency guard) left a leading particle untouched when the *next* char was also a particle — so the indexed stem (`בחירות`→`חירות`) never matched the un-stripped query (`הבחירות`). `normalizeSearchName` now **peels a chain of leading particles** to a fixpoint, so query and index converge on the same stem (`הבחירות`/`בחירות`→`חירות`, `הליברמן`/`ליברמן`→`יברמן`). It's applied identically to query + index, so discovery stays consistent; the trade-off is more aggressive stemming (e.g. the surname `הורוביץ`→`רוביצ`), acceptable for discovery (attribution always uses the stable id). Existing rows re-normalized via `backfill:market-search` + the new `backfill:politician-search`. Verified against Neon: `הבחירות`→1 market, `הליברמן`→1 MK.

## LOW — upvoting a missing comment leaked an FK error → CommentNotFoundError
`toggleCommentUpvote` inserted the vote relying on the FK to blow up (raw 23503) for an unknown comment. Now a `isUuid` guard (malformed → `CommentNotFoundError`) + a `try/catch` translating `isForeignKeyViolation` → `CommentNotFoundError`. (The UI already swallowed it; this gives non-UI callers a clean error.)

## LOW — deferred: politician/market not-found pages return HTTP 200, not 404
`notFound()` renders the correct on-brand Hebrew not-found UI, but the status is 200 in both dev AND prod (confirmed via `next start`). This is a Next 16 App-Router limitation for *dynamic, streamed* routes — the 200 shell header commits before `notFound()` resolves. The UX is correct; only crawler/cache semantics are affected. Forcing a 404 would need a middleware status-rewrite or disabling streaming for these routes — heavier than this cosmetic nit warrants. **Deferred** with this note.
