# Decisions — Web-push notifications

Newest on top. Entries immutable.

## 2026-06-09 — Per-category push preferences gate web-push only (PR #16)

**Decision.** `user.mutedPushTypes[]` filters `dispatchPush` (post-commit, one
batched query, **fail-OPEN** — a prefs-read error sends rather than silently
drops), but `emitNotifications` always writes the in-app row regardless. Push is
the intrusive channel worth muting; the inbox is cheap + ignorable. The UI exposes
**4 category toggles** (outcomes / closing / season / suggestions) mapping to the
underlying `notification_type` values — cleaner than 7 raw per-type toggles.
Stored as `text[]` (the enum is declared later in `schema.ts`; validated in the service).

## 2026-06-03 — Web push layered on the in-app notification pipeline

**Context.** The app already had (a) an in-app `notifications` log written via
`emitNotifications({ tx, events })` inside the producing transaction, and (b) a
service worker (`public/sw.js`) with working `push`/`notificationclick` handlers
expecting JSON `{ title, body, url }`. Web push was the missing middle.

**Decisions.**

- **Reuse, don't rebuild.** Push payloads are *derived* from the same
  `NotificationEvent` union and `composeNotification` Hebrew copy as the in-app
  row (one source of truth). `composeNotification` was promoted from a private
  `compose` to an export for this. The SW's `{ title, body, url }` keys are a
  hard contract — the payload mapper emits exactly those (never `titleHe/bodyHe`).

- **Dispatch AFTER the transaction commits.** `webpush.sendNotification` is a
  network call that can't roll back and must not hold the market `FOR UPDATE`
  lock across latency. `resolveMarket` / `approve+rejectSuggestion` / `claimTier`
  / `voidMarket` capture their events inside the tx, then `dispatchPush({ events })`
  runs after `db.transaction(...)` resolves, wrapped in try/catch. A push failure
  can never break settlement (asserted in tests via DB state after a rejecting mock).

- **Winner de-dupe.** `resolveMarket` emits both `bet_won` and `market_resolved`
  for a winner; `dedupeEventsPerUser` keeps one event per user (priority
  bet_won > market_resolved) so a winner isn't double-pushed.

- **VAPID presence-gated no-op.** Env read at call time; absent VAPID →
  `dispatchPush` no-ops and `next build`/dev/CI never crash (mirrors the
  Google-provider gating in `lib/auth.ts`).

- **Dead-endpoint pruning.** A `WebPushError` with status 404 **or** 410 deletes
  the subscription row; other statuses (429/5xx) keep it.

- **IDOR-safe subscriptions.** `push_subscriptions.endpoint` is globally UNIQUE
  (no userId in the key); subscribe UPSERTs rebind the row to `session.user.id`,
  and unsubscribe is scope-guarded by userId. The route derives userId only from
  Better Auth's session, never the request body.

- **Client gating.** Push is offered only when supported AND (not iOS-Safari OR
  installed/standalone) — iOS 16.4+ allows push only after Add-to-Home-Screen.
  The `EnablePush` CTA requires a user gesture (Safari blocks auto-requests).

**Deferred triggers (shipped in the same branch, 2nd commit).**

- `season_reward` (claimTier), `market_voided` (voidMarket), and
  `market_closing_soon` notifications + push, sharing the post-commit pipeline.
- **Closing-soon** runs as a Vercel Cron (`/api/cron/closing-soon`, hourly,
  `CRON_SECRET`-gated). Idempotent + concurrency-safe via a conditional stamp on
  `markets.closingSoonNotifiedAt` (claim-before-notify), so a re-run or a parallel
  cron never double-sends.

**HARD GATES — verify before relying on push in prod (cannot be unit-tested).**

1. Apply the `push_subscriptions` table + the new `notification_type` values +
   `markets.closingSoonNotifiedAt` (migrations 0014/0015) to the Neon **dev and
   prod** DBs. (Deliberately NOT pushed during the build — the shared dev DB had
   unrelated uncommitted schema drift; apply from a clean branch.)
2. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and
   `CRON_SECRET` in Vercel (prod). Without them push no-ops and the cron returns 503.
3. Real end-to-end delivery + iOS-after-install behavior must be verified on a
   device (install PWA → enable → trigger a resolve → receive the push).
