# Web-Push Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (or subagent-driven-development). Steps use checkbox (`- [ ]`).

**Goal:** When an installed PWA user's market resolves (or their suggestion is approved/rejected), send a **web-push** notification to their device — layered on the EXISTING in-app notifications, never rebuilt.

**Architecture:** The app already (a) writes in-app `notifications` rows via `emitNotifications({ tx, events })` INSIDE the producing transaction, and (b) ships a service worker (`public/sw.js`) with working `push` + `notificationclick` handlers expecting JSON `{title, body, url}`. This plan adds the missing middle: a `push_subscriptions` table, a VAPID-gated `web-push` dispatcher that runs **post-commit** off the same `NotificationEvent[]`, a subscribe/unsubscribe API route, and a client "enable notifications" CTA gated to installed/standalone.

**Tech:** Next.js 16 (App Router, Node runtime for the dispatch path), Neon + Drizzle, Better Auth, `web-push` (VAPID), Hebrew RTL.

**Critical constraint (verified):** `webpush.sendNotification` is an external network call — it **must NOT run inside the settlement transaction** (it can't roll back and would hold the market `FOR UPDATE` lock across network latency). Dispatch **after `db.transaction(...)` commits**, off the returned events. (`schema-triggers` gotcha; `app/lib/markets/service.ts:157`.)

---

## Task 0 — Worktree (default: yes)

- [ ] Run implementation in an isolated git worktree `feat/push-notifications` off `main` (keeps `main` clean; `pnpm setup:worktree` not needed — this repo has no jar/pdftk deps). **Opt out** only if the user prefers a plain branch.

## Files to touch

**Read (done in planning):** `app/lib/notifications/{service,repo}.ts`, `app/lib/markets/service.ts`, `app/lib/suggestions/service.ts`, `app/lib/schema.ts`, `app/lib/{db,db-guards,errors,logger,rate-limit}.ts`, `lib/auth.ts`, `app/api/auth/[...all]/route.ts`, `public/sw.js`, `components/pwa/sw-register.tsx`, `app/layout.tsx`, `.claude/skills/nextjs-pwa/references/push-notifications.md`.

**Create:** `app/lib/push/repo.ts`, `app/lib/push/repo.test.ts`, `app/lib/push/service.ts`, `app/lib/push/service.test.ts`, `app/lib/push/payload.ts` (event→`{title,body,url}` mapper, pure) + `payload.test.ts`, `app/api/push/subscribe/route.ts` (+ integration test), `lib/pwa/push-client.ts`, `hooks/use-push-subscription.ts`, `components/pwa/enable-push.tsx`.

**Modify:** `app/lib/schema.ts` (+ `pushSubscriptions` table; migration `0014`), `app/lib/errors.ts` (+ typed errors), `app/lib/markets/service.ts` + `app/lib/suggestions/service.ts` (post-commit dispatch hook), `public/sw.js` (+ `pushsubscriptionchange` handler, bump `SW_VERSION`), `app/notifications/page.tsx` (mount the enable-push CTA), `.env.example`/`.env` + Vercel prod env (VAPID), `package.json` (deps).

## Reused data structures (do NOT redefine)

| Shape | Pointer | How reused |
|---|---|---|
| `NotificationEvent` union (`bet_won`/`market_resolved`/`suggestion_approved`/`suggestion_rejected`) | `app/lib/notifications/service.ts:20` | The push payload is **derived** from these events — same source as in-app copy; no parallel push-event model. |
| `compose(e) → NewNotification` (Hebrew `titleHe`/`bodyHe`) | `app/lib/notifications/service.ts:26` | The push `{title, body}` maps from the SAME composed copy so in-app + push stay identical. |
| `NewNotification` / `NotificationRow` | `app/lib/notifications/repo.ts:25,22` | Reference for column conventions; `refMarketId` → the push click `url`. |
| `users` table (text `id`) | `app/lib/schema.ts` | `pushSubscriptions.userId text NOT NULL references users.id onDelete cascade`. |
| `DB` / `LedgerTx` (`Tx`) types | `app/lib/db.ts:42`, `app/lib/ledger/repo.ts:12` | The push repo's injectable `db?: DB` / `tx?: Tx` typing — copied verbatim. |
| `checkRateLimit` | `app/lib/rate-limit.ts:16` | `key: \`push-sub:${userId}\`` on subscribe/unsubscribe. |
| `getSession()` / `Session` | `lib/auth.ts:98,95` | Session gate in the API route (`session.user.id`). |
| `ActionResult` `{ ok, message? }` (Hebrew) | every `app/actions/*.ts` | Route returns the same discriminated result shape. |
| `createTestDb()` | `app/lib/testing/create-test-db.ts:8` | PGlite harness for repo/service tests. |

## Verified third-party signatures

**`web-push`** (NOT installed — add `web-push` + `@types/web-push`). Verified verbatim from DefinitelyTyped `index.d.ts` (captured to `/tmp/web-push.d.ts` during planning):
- `generateVAPIDKeys(): { publicKey: string; privateKey: string }` (d.ts:32, 185-188) — run ONCE, store in env, never regenerate.
- `setVapidDetails(subject: string, publicKey: string, privateKey: string): void` (d.ts:199) — `subject` must be `mailto:` or `https:`.
- `sendNotification(subscription: PushSubscription, payload?: string|Buffer, options?: RequestOptions): Promise<SendResult>` (d.ts:19-23).
- `PushSubscription = { endpoint: string; expirationTime?: number|null; keys: { p256dh: string; auth: string } }` (d.ts:206-213) — matches the browser `subscription.toJSON()` shape.
- `WebPushError extends Error { statusCode; headers; body; endpoint }` (d.ts:318-325) — **`statusCode === 404 || 410` ⇒ dead subscription ⇒ delete the row.** Do NOT prune on 429/5xx.
- Gotcha: DefinitelyTyped has a typo `aws128gcm` (d.ts:155); pass the literal `'aes128gcm'` for `contentEncoding` (default is fine — omit).

**Browser Web Push API** (verified from MDN):
- `navigator.serviceWorker.ready` → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → `Promise<PushSubscription>`. **`userVisibleOnly: true` is required** or Chrome/Edge reject.
- `applicationServerKey` must be a **`Uint8Array`** (decoded VAPID public key), NOT the base64 string — convert with the standard `urlBase64ToUint8Array` (pad to %4, `-`→`+`, `_`→`/`, `atob`, copy to `Uint8Array`).
- `subscription.toJSON()` → `{ endpoint, expirationTime, keys: { p256dh, auth } }` — POST this to `/api/push/subscribe`.

**`public/sw.js` (already shipped) payload contract:** the `push` handler reads `data.title` / `data.body` / `data.url` (falls back to `'פוליטיקל'` title + `event.data.text()` body). The server dispatcher MUST `JSON.stringify({ title, body, url })` — sending `{titleHe, bodyHe}` would show the fallback title. (`push-sw-auth` gotcha.)

## Convention Compliance (`CLAUDE.md`)

| Convention | Compliance |
|---|---|
| Route → Service → Repository → DB, one-directional | API route → `pushService` → `pushRepo` → `db`. Route never touches Drizzle; service never touches `web-push`'s transport except via the dispatcher. |
| Scope guard first line of every repo fn | `pushRepo` mirrors `reqUser(userId)` from `notifications/repo.ts`; all queries filter by `userId`. |
| RORO + named exports + modules-not-classes + <500 lines | All new fns single destructured arg → object; no classes. |
| Errors over fallbacks; typed errors in `app/lib/errors.ts` | Add `PushSubscriptionNotFoundError`; no thrown strings. **Optional-feature degrade:** when VAPID env is absent the dispatcher **no-ops** (mirrors `lib/auth.ts:12-15` Google gating) so dev/CI/`next build` never crash. |
| No inline Zod; validation hand-rolled in the service | Validate the subscription shape (endpoint is a non-empty https URL; `keys.p256dh`/`keys.auth` non-empty strings) hand-rolled, matching the suggestions service. |
| Rate-limit every user action | `checkRateLimit({ key: \`push-sub:${userId}\`, max: 20, windowMs: 60_000 })` on the route. |
| No bare `console.*` server-side | `logger.{warn,error}` on send failures + dead-endpoint pruning. |
| Money/ledger invariants untouched | Push is read-only w.r.t. the ledger; in-app `emitNotifications` stays INSIDE the tx; only the push fan-out moves post-commit. |
| Drizzle/Neon: shared `db`, `prepare:false`, `drizzle-kit push` non-interactive | Import `db` from `@/app/lib/db`; migration `0014` via `pnpm db:push`. Schema change updates schema + PGlite test replay in lockstep. |
| RTL/OKLCH on UI | The enable-push CTA uses Hebrew copy, logical Tailwind props, design tokens (no hex). |
| Node runtime for `web-push` | `export const runtime = 'nodejs'` on the subscribe route + any module importing `web-push`. |

---

## Task 1 — Deps + VAPID env

- [ ] `pnpm add web-push && pnpm add -D @types/web-push`.
- [ ] Generate keys ONCE: `node -e "console.log(require('web-push').generateVAPIDKeys())"`.
- [ ] Add to `.env` (+ `.env.example` with placeholders): `NEXT_PUBLIC_VAPID_PUBLIC_KEY=`, `VAPID_PRIVATE_KEY=`, `VAPID_SUBJECT=mailto:gal.israeli@tomorrow.io`. Add the same 3 to **Vercel production** (`vercel env add ... production`).
- [ ] Commit (deps + `.env.example` only; never the real keys).

## Task 2 — `push_subscriptions` table + migration (schema cascade)

- [ ] `app/lib/schema.ts` — append (mirror `notifications` conventions: camelCase quoted columns, text userId FK, no FK on display cols):
```ts
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, (t) => [uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
          index("push_subscriptions_user_idx").on(t.userId)]);
```
- [ ] `pnpm db:generate` → `0014_*.sql`; `pnpm db:push` (non-interactive) to Neon. Confirm the migration replays into PGlite (`createTestDb` runs `migrate()`), so a no-op `pnpm test` proves the new table loads.

## Task 3 — Typed errors

- [ ] `app/lib/errors.ts` — add one-liner: `export class PushSubscriptionNotFoundError extends Error { constructor(){ super("Push subscription not found"); this.name="PushSubscriptionNotFoundError"; } }`.

## Task 4 — Push repo (TDD)

- [ ] `app/lib/push/repo.ts`: `type DB/Tx` copied from `notifications/repo.ts`; `reqUser` scope guard.
  - `upsertSubscription({ db?, userId, endpoint, p256dh, auth })` → `insert ... onConflictDoUpdate(target: endpoint)` (re-subscribe is idempotent; rebinds endpoint to the latest userId+keys).
  - `listByUser({ db?, userId })` → rows.
  - `deleteByEndpoint({ db?, endpoint })` → for pruning dead subs (no userId — the push service owns it).
  - `deleteByUserAndEndpoint({ db?, userId, endpoint })` → for explicit user unsubscribe (scope-guarded).
- [ ] `app/lib/push/repo.test.ts` (PGlite `createTestDb`): upsert twice same endpoint → 1 row (idempotent); listByUser returns only that user's; deleteByEndpoint removes it; user-scoped delete won't touch another user's row.

## Task 5 — Push dispatcher service (TDD; mock the web-push boundary)

- [ ] `app/lib/push/payload.ts` (pure): `eventToPush(e: NotificationEvent): { title; body; url } | null` — reuse `compose(e)` mapping (titleHe→title, bodyHe→body; url = `/market/${refMarketId}` or `/notifications`). + `dedupeEventsPerUser(events)` — resolveMarket emits `bet_won` AND `market_resolved` per winner → keep the highest-priority event per `userId` (bet_won > market_resolved) so winners aren't double-pushed. (`schema-triggers` gotcha.)
- [ ] `app/lib/push/service.ts`:
  - **Lazy VAPID gate:** module-load reads `process.env.{NEXT_PUBLIC_VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,VAPID_SUBJECT}` with presence check; `ensureVapid()` calls `setVapidDetails` once; if any missing, `logger.warn` once and `sendToUser` no-ops (returns `{ sent: 0, skipped: true }`). Mirrors `lib/auth.ts:12-15`.
  - `sendToUser({ db?, userId, payload })`: `listByUser` → for each, `webpush.sendNotification({endpoint,keys:{p256dh,auth}}, JSON.stringify(payload))`; on `WebPushError` 404/410 → `deleteByEndpoint`; other errors → `logger.error` (don't throw). Returns count.
  - `dispatchEvents({ db?, events })`: `dedupeEventsPerUser` → `eventToPush` → `sendToUser` per user. **Best-effort; never throws** (caller wraps in try/catch anyway).
- [ ] `app/lib/push/service.test.ts` (PGlite + `vi.mock("web-push")` — mock ONLY the external send): seed 2 subs for a user → `dispatchEvents([bet_won])` calls send twice with `{title,body,url}` JSON; a mocked `WebPushError{statusCode:410}` → that subscription **row is deleted** (assert via `db.select`, behavior not call-count); winner with both `bet_won`+`market_resolved` → send called ONCE (deduped); VAPID env unset → `sent:0, skipped:true`, send never called.

## Task 6 — Subscribe / unsubscribe API route (TDD)

- [ ] `app/api/push/subscribe/route.ts` — `export const runtime = "nodejs"`. Hand-roll session + validation (no wrapper exists; mirror `app/api/auth` + the action gate):
  - `POST`: `getSession()` → 401 if none; `checkRateLimit` → 429 if over; parse body, validate `endpoint` (non-empty https), `keys.p256dh`/`keys.auth` (non-empty) → 400 `{ ok:false, message }` Hebrew on bad input; `pushService.upsertSubscription(...)`; `{ ok:true }`.
  - `DELETE`: same gate; body `{ endpoint }`; `deleteByUserAndEndpoint`; `{ ok:true }`.
- [ ] Integration test (`createTestDb` + mocked `getSession`): POST a subscription → row exists for the user; POST same endpoint again → still 1 row; DELETE → gone; no session → 401; over-limit → 429.

## Task 7 — Wire post-commit dispatch (the integration)

- [ ] `app/lib/markets/service.ts` `resolveMarket`: the `events` array is already built (L103-134) and emitted in-tx (L157). After the `db.transaction(...)` resolves, add — **outside** the tx, best-effort:
```ts
try { await dispatchEvents({ events }); } catch (e) { logger.error("push.dispatch_failed", { err: String(e) }); }
```
(`resolveMarket` must surface `events` to the post-commit scope — hoist the array, or return it from the tx callback.)
- [ ] `app/lib/suggestions/service.ts` `approveSuggestion` + `rejectSuggestion`: same post-commit `dispatchEvents({ events })` (single-element arrays).
- [ ] Tests: extend the existing `markets`/`suggestions` service tests — after `resolveMarket`, with a seeded subscription + mocked web-push, assert send was invoked for the winner exactly once (deduped) and for each loser's `market_resolved`. **Push failure must NOT fail settlement:** force the mock to throw → `resolveMarket` still resolves, balances still correct (assert via DB).

## Task 8 — Client subscribe hook + enable-push CTA

- [ ] `lib/pwa/push-client.ts` (pure): `urlBase64ToUint8Array(base64)`; `getSubscriptionState()` (supported? permission? existing sub?); `subscribe()` (`navigator.serviceWorker.ready` → `pushManager.subscribe({userVisibleOnly:true, applicationServerKey})` → POST `sub.toJSON()`); `unsubscribe()` (`sub.unsubscribe()` + DELETE).
- [ ] `hooks/use-push-subscription.ts` (`useSyncExternalStore`-style or `useState`+effect): `{ supported, status: 'unsupported'|'denied'|'default'|'subscribed', subscribe, unsubscribe }`. **iOS gate:** `supported` is false unless `display-mode: standalone` (iOS only allows push for installed PWAs) — reuse the `getIosSnapshot` standalone check from `lib/pwa/install.ts`.
- [ ] `components/pwa/enable-push.tsx` ('use client'): renders a Hebrew "קבלו התראות" CTA only when `status === 'default'` (+ supported); hides when subscribed/denied/unsupported. Dark-design tokens, logical props, tied to a **user gesture** (never auto-request — Safari blocks; `push-sw-auth` gotcha).
- [ ] Mount in `app/notifications/page.tsx` (next to the existing notifications list). unit-dom test: mock `navigator.serviceWorker`/`PushManager`/`Notification` → CTA shows on `default`, hidden on `denied`; clicking calls subscribe.

## Task 9 — SW: handle rotated endpoints

- [ ] `public/sw.js`: add `self.addEventListener("pushsubscriptionchange", ...)` → re-`subscribe` with the same `applicationServerKey` and POST the new subscription to `/api/push/subscribe` (endpoints rotate; without this, rows go stale). Bump `SW_VERSION` `v1`→`v2` (the activate handler prunes the old cache key). Keep the no-fetch-listener rule (iOS cookie bug).

## Task 10 — Verify

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] **Manual (prod-mode, the SW only registers in prod):** `pnpm build && pnpm start` → install/standalone → click "קבלו התראות" → grant → confirm a `push_subscriptions` row. Resolve a market the user bet on (admin) → device shows the Hebrew push → click → focuses `/market/<id>`.

## Test plan (grounded in the `testing` skill)

- **Behavior, not implementation:** assert end-state — e.g. a 410 send ⇒ the `push_subscriptions` row is **gone** (`db.select`), not "deleteByEndpoint was called". (The one allowed call-assertion is the external `web-push` SDK boundary — assert the `{title,body,url}` payload + per-user count.)
- **PGlite over mocks** for repo/service/route DB behavior via `createTestDb`; **mock only** `web-push` (the external boundary) and `getSession` (in the route test).
- Co-located `*.test.ts`; UTC dates; real transaction semantics (the "push failure doesn't roll back settlement" test relies on real tx).

## Verification Status

**Verified from source/docs:**
| Item | Citation |
|---|---|
| `web-push` API (generateVAPIDKeys/setVapidDetails/sendNotification/WebPushError/PushSubscription) | DefinitelyTyped `index.d.ts` → `/tmp/web-push.d.ts` (lines cited above) |
| Browser `pushManager.subscribe` opts + `applicationServerKey` Uint8Array + `toJSON()` shape | MDN Push API |
| SW payload contract `{title,body,url}` | `public/sw.js` push handler (read) |
| `emitNotifications` in-tx + the 3 emit sites | `app/lib/{notifications/service.ts:65, markets/service.ts:157, suggestions/service.ts:133,163}` |
| Conventions (layering, RORO, errors, rate-limit, VAPID gating, PGlite tests, migration flow) | `CLAUDE.md` + cited files |

**NOT verified — needs live testing:**
| Item | How to verify | Owner | Gate |
|---|---|---|---|
| Real end-to-end push delivery (VAPID → push service → device) | Prod-mode manual test (Task 10) with real VAPID keys | dev | **HARD GATE** — can't be unit-tested; the mock proves wiring, not delivery |
| **iOS push only works after Add-to-Home-Screen install** | Install on a real iPhone (iOS 16.4+), then subscribe | dev | **HARD GATE** for iOS — `supported` must be false in-browser on iOS |
| Endpoint rotation (`pushsubscriptionchange`) | Hard to force; verify the handler registers + re-POSTs | dev | soft — log + monitor stale-row pruning |
| Prod env: VAPID keys set in Vercel + `runtime=nodejs` honored | `vercel env ls production` + a prod resolve | dev | **HARD GATE** before relying on push in prod |

## Final steps (in order)

- [ ] Delete any throwaway fixtures; confirm no captured web-push payload fixtures drifted.
- [ ] `docs/decisions/push-notifications.md` — record: post-commit dispatch (never in the settlement tx), winner de-dupe, VAPID no-op degrade, 404/410 pruning, iOS-install gate. Deferred: season-tier push (needs a new `notification_type` + `claimTier` emit), void-market push, **closing-soon** (needs a Vercel Cron job scanning `closeAt`).
- [ ] Run `/wrap-up` (advisory gate → `/log-decisions` + `/evergreen-documentation` if it flags docs/skills drift).
- [ ] Run `/code-review` before pushing. Never `--no-verify`.

## Deferred / optional extensions (out of core scope)

- **Season-tier push** — `claimTier` (`app/lib/seasons/service.ts:105`) emits nothing + there's no `season_reward` notification type. Adding it = extend `notification_type` enum + `NotificationEvent` + `compose` + emit in `claimTier`, then push flows for free.
- **Void-market push** — `voidMarket` emits nothing today; decide if refunds should notify.
- **Closing-soon** — needs a scheduled job (Vercel Cron) scanning markets near `closeAt`; net-new infra, separate plan.
