# Decision log — Notifications + win/loss celebrations (Phase 1)

The "feels alive" engagement loop from the Ploytical handoff.

## Notifications emit INSIDE the event's transaction (atomic), not after-commit
`emitNotifications({tx, events})` is tx-aware and is called by `resolveMarket` and `approve/rejectSuggestion` *inside their existing `db.transaction`*. The notification commits or rolls back with the settlement/review it describes — there is no window where a market resolves but the "you won" notice fails (or vice-versa). This applies the ledger's "one atomic unit" rule to a non-coin table. Cost is one batched INSERT inside a transaction that already does N `applyEntry` writes — negligible, no new locks. Proven by a test that emits inside a throwing tx and asserts zero rows persist.

## ref* columns carry NO foreign key
`notifications.refMarketId/refBetId/refSuggestionId` are plain `uuid` with no FK — mirroring `transactions.refMarketId`. A notification is a display-only event log; we don't want a market hard-delete to cascade-wipe history, nor an FK check inside the hot resolve transaction. The feed treats a dangling `refMarketId` as best-effort (falls back to `/profile`).

## `market_resolved` goes to every participant (winners + losers)
Per the design brief: one `bet_won` per winning bet, plus one neutral `market_resolved` per distinct participant. Losers get the resolved notice but no win notice. Refund path (no winners) emits `market_resolved` only.

## Unread count via a partial index
`notifications_user_unread_idx` is `(userId) WHERE read=false`, so the header's per-render unread count is O(unread), not a full user scan. No `users.unreadCount` cache column (that would be a second writer to keep in sync inside the resolve tx, violating "one authoritative writer").

## Celebrations: a `bets.seenAt` flag, keyed on fetch not playback
A resolved bet (`status IN ('won','lost') AND seenAt IS NULL`) triggers a one-time celebration the first time the user views it (profile, or that market). The `CelebrationHost` marks ALL fetched bets seen on mount (via `markBetsSeenAction`) — so a reload/navigation never re-fires; worst case the user misses the tail of an animation, never re-sees it. `markBetsSeen` is scope-guarded (`WHERE userId`) and idempotent (`seenAt IS NULL`), so the profile/market race resolves to whichever loads first; the other no-ops.

**Migration backfill (load-bearing):** `0010` hand-adds `UPDATE bets SET seenAt=now() WHERE status<>'open'` so historical resolved bets don't all fire a celebration storm on first deploy — only bets resolved after the migration are celebratory.

## Deferred
- Void-path notifications (refunds aren't celebratory; not in the enum for v1).
- Real-time push / unread polling (the count is RSC-computed per render).
- Notification preferences/settings.
