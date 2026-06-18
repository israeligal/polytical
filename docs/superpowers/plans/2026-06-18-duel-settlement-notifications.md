# Plan — Duel Settlement Notifications + Resolved-Arena Result State

**Date:** 2026-06-18 · **Branch:** continue `feat/prediction-duels` (same open PR #107; not a worktree — Turbopack stale-compile gotcha + the dev server / prod-migration live in this checkout). *Flag: say if you'd rather this be its own branch/PR.*
**Authorized:** user OK'd the prod migration + "do whatever for best practices"; emphasis on **good motion + frontend-design**.

## Goal
When a duel's market resolves, tell the players **who won the head-to-head** (not just the generic "your prediction resolved" they already get), and — the design centerpiece — give `/duel/[token]` a real **resolved RESULT state**: winner reveal, standings, and a win/lose celebration (Motion).

## Two halves
1. **Notification** (modest): a `duel_settled` notice → links to the duel result. Best-effort, decoupled from the P0 resolve tx.
2. **Resolved arena UI** (the showcase): the arena currently has pre-pick → reveal; add a **settled** state with winner crown, standings leaderboard, viewer verdict, and celebration motion (confetti for a win).

## Files read (DONE — not from memory)
- `app/lib/markets/service.ts:73-152` — `resolveMarket`: accumulates `NotificationEvent[]` in-tx, emits `bet_won` + `market_resolved`, `markResolved`, then **best-effort `dispatchPush` after commit**. (We mirror that post-commit pattern; we do NOT touch this tx.)
- `app/actions/admin-markets.ts:181` — the ONLY caller of `resolveMarket`; has `marketId` + `winningOutcomeId`. We append `notifyDuelSettlements` here.
- `app/lib/notifications/service.ts` — `NotificationEvent` discriminated union + `composeNotification` (event → titleHe/bodyHe/ref*) + `emitNotifications({tx,events})`.
- `app/lib/notifications/repo.ts:24-58` — `NewNotification` (ref* fields), `insertNotifications({tx,rows})`, `listByUser`.
- `app/lib/push/payload.ts` — `eventToPush` (reuses `composeNotification`), `pushUrl(event, refMarketId)` → `/market/{id}` | `/notifications`, `dedupeEventsPerUser` (EVENT_PRIORITY map — must add `duel_settled`).
- `components/notifications/notification-feed.tsx:44-61` — builds `href`: `refMarketId`→`/market/[id]`, else `refGroupId`→`/g/by-id/[id]`, else profile. (Add `refChallengeId`→`/duel/by-id/[id]`.)
- `app/lib/schema.ts:512` (`notificationType` enum) + `:526` (`notifications` table ref columns).
- `app/lib/duels/repo.ts` — `getParticipants`, `getChallengeByToken`; need a new `getChallengesForMarket` + result computation.
- `components/duel/duel-arena.tsx`, `vs-band.tsx`, `duel-outcome-button.tsx`, `duel-atoms.tsx` (SparkBurst), `types.ts` — the arena to extend with a resolved state.
- `lib/types.ts` `Market` — has NO status/resolvedOutcome → pass a `resolution` prop to the arena.
- TODO-read during build: `app/duel/by-id` (confirm `/g/by-id/[id]` shape to mirror), `components/notification-bell.tsx`, push `dispatchPush` in markets/service.

## Reused data structures (no redefinition)
- `NotificationEvent` union — **extend** with one variant `duel_settled` (`app/lib/notifications/service.ts:18`). Do NOT create a parallel event type.
- `NewNotification` (`notifications/repo.ts:24`) — **extend** with `refChallengeId?`.
- `notificationType` pgEnum (`schema.ts:512`) — **add value** `duel_settled`.
- `notifications` table (`schema.ts:526`) — **add column** `refChallengeId uuid` (mirrors `refGroupId`; display-only link, no FK, like the others).
- `emitNotifications` / `dispatchPush` (markets uses both) — reuse as-is for the duel pass.
- `getParticipants`, `getChallengeByToken`, `ChallengeRow` (`duels/repo.ts`).
- `ActionResult` (`app/actions/types.ts:3`), `requireUserId`, shared `db`, `FALLBACK_HANDLE`.
- Arena motion atoms: `SparkBurst` (`duel-atoms.tsx`), the existing `poly-pop`/`poly-burst-up` keyframes (globals.css), `motion-for-react` patterns.
- `DuelArenaProps`/`DuelPlayer` (`components/duel/types.ts`) — **extend** with `resolution?`.

## Verified third-party signatures
- **Drizzle** `pgEnum` add-value + `uuid` column + `.insert().values()` — as used across `schema.ts`/`notifications/repo.ts`.
- **Postgres `ALTER TYPE … ADD VALUE`** cannot run inside a transaction block; the guarded runner applies statements individually (split on `--> statement-breakpoint`, no tx wrapper) — confirmed by `scripts/apply-groups-migration.ts` which already added `group_*` enum values this way. drizzle-kit emits the `ADD VALUE` + `CREATE`/`ALTER TABLE ADD COLUMN` as separate breakpointed statements.
- **Motion** (`motion/react`) — `AnimatePresence`, `motion.*`, `useReducedMotion`, spring transitions (per the motion-for-react skill). No new dep.
- No new external SDK (push reuses `dispatchPush`/web-push already wired).

## Convention Compliance (CLAUDE.md / AGENTS.md)
- **Layered Route→Service→Repo→DB**: `notifyDuelSettlements` in `app/lib/duels/service.ts` (or a `notifications` submodule) → `duels/repo.ts` reads; the admin action calls the service. No DB in components.
- **One authoritative writer + decoupling/altitude**: the P0 `resolveMarket` tx is NOT modified; duel notifications are a separate best-effort post-resolve pass (no special-casing duels into the core resolver).
- **@handle only** (AGENTS.md): all result/standings UI + notification copy render `@handle` (coalesced `FALLBACK_HANDLE`), never `users.name`.
- **Errors over fallbacks**: `/duel/by-id/[id]` → `notFound()` on a missing challenge; the notify pass is best-effort + logged (never throws into the admin resolve).
- **Schema**: enum value + column declared in schema; additive migration; guarded runner; PGlite replays it.
- **Design tokens + OKLCH, logical RTL props, Hebrew copy, Asia/Jerusalem** for all new UI. **Loading/skeleton** unaffected (resolved state is part of the arena).
- **Motion**: transform-friendly entrances; honor `useReducedMotion` (celebration short-circuits to the final state); no opacity-gated critical content (per `motion-entrance-raf-throttle`).
- Files < 500 lines, named exports, RORO, no inline types/zod.

## Result semantics (DESIGN DECISION — defaulting; flag if wrong)
Head-to-head on ONE market. Per player, "correct" = their pick == winning outcome.
- A **participant** beats the **challenger** iff participant-correct AND challenger-wrong; loses iff challenger-correct AND participant-wrong; else **tie** (both right or both wrong).
- The arena's resolved state shows a **standings list**: everyone (challenger + participants), each marked right/wrong, the **winning outcome** highlighted, and the **viewer's verdict** banner ("ניצחת!" / "לא הפעם" / "תיקו").
- Notification `duel_settled` is sent to the **challenger AND every participant**, copy tailored to their own result vs the field. Void/unresolved → no duel notification.
*Default chosen; the alternative (pure "got it right" with no head-to-head framing) is simpler but less punchy. Proceeding with head-to-head.*

## Build steps
1. **Schema**: `notificationType` += `duel_settled`; `notifications` += `refChallengeId uuid`. Generate migration `0034_*` (`db:generate`), verify additive (`ADD VALUE` + `ADD COLUMN` only).
2. **Prod runner** `scripts/apply-duels-notif-migration.ts` (mirror `apply-groups-migration.ts`; before/after report on the enum value + column). Apply to prod.
3. **Notification plumbing**: extend `NotificationEvent` (`duel_settled` variant: userId, challengeId, questionHe, outcome-of-self, result: "won"|"lost"|"tie"), `composeNotification` copy (titleHe/bodyHe + `refChallengeId`), `NewNotification.refChallengeId`, `insertNotifications` carry it, `pushUrl`/`eventToPush` → `/duel/by-id/[challengeId]`, add `duel_settled` to `EVENT_PRIORITY` + `dedupeEventsPerUser`.
4. **Redirect route** `app/duel/by-id/[challengeId]/page.tsx` — look up the challenge, `redirect('/duel/'+token)`, else `notFound()` (mirror `/g/by-id/[id]`).
5. **Feed link**: `notification-feed.tsx` → `refChallengeId` ? `/duel/by-id/[id]`.
6. **Repo**: `duels/repo.ts` += `getChallengesForMarket({db, marketId})` (challenge id/token/challengerUserId) and a `getDuelResult`/standings helper reusing `getParticipants` + the challenger's bet + the winning outcome.
7. **Service**: `notifyDuelSettlements({db, marketId, winningOutcomeId})` — find challenges on the market; for each, compute per-player results; emit `duel_settled` events (insert rows + dedupe + push), best-effort. Wire into `admin-markets.ts` AFTER `resolveMarket` (try/catch + logger; never breaks resolve).
8. **Arena resolved state (DESIGN + MOTION centerpiece)**: extend `DuelArenaProps` with `resolution?: { winningOutcomeId; standings: {handle; outcomeId; correct}[]; youWon?: "won"|"lost"|"tie" }`. New `components/duel/duel-result.tsx`: winning outcome crowned, standings leaderboard (right/wrong, @handle + caricature), viewer verdict banner, and a **win celebration** (confetti/burst via SparkBurst + Motion, `poly-pop`), reduced-motion-safe. The VS band shows final picks + ✓/✗. `/duel/[token]` page passes `resolution` when `bundle.market.status === "resolved"` (reads `resolvedOutcomeId`, computes standings via the repo helper).
9. **Stories**: `duel-result` / arena resolved stories — win, lose, tie, multi + binary — for visual + a11y review (Storybook).
10. **Tests** (PGlite, co-located `*.integration.test.ts`, via `createTestDb`; test behavior):
    - `notifyDuelSettlements`: emits one `duel_settled` per participant + challenger with the correct result (win/lose/tie); no challenges → no-op; void/unresolved → none; idempotency if re-run.
    - result/standings computation: correct/wrong derivation vs winning outcome; tie cases.
    - `composeNotification(duel_settled)` copy + `refChallengeId`; `pushUrl` → `/duel/by-id/[id]`.
    - `/duel/by-id/[id]` redirect (or repo lookup) — unit/integration.
11. **Apply migration to prod** (step 2) once code is in; verify enum value + column via `information_schema`/`pg_enum`.
12. **Verify**: stop dev → `pnpm lint && typecheck && vitest run app/lib/duels app/lib/notifications && pnpm build`.
13. **/wrap-up** → **/log-decisions** (append to `docs/decisions/duels.md`) + **/evergreen-documentation**.
14. **/code-review** the diff; fix findings.
15. **Full /browser-qa**: resolve a (dogfood) market that has a duel → verify the notification fires (bell + feed link → duel result) AND the resolved arena state (winner/standings/celebration) in a FOCUSED browser (so the motion runs).
16. After #107 lands on remote `main`: `git pull --ff-only origin main` on the primary checkout.

## Fixtures
No external API. All shapes are Drizzle rows + internal events → covered by PGlite integration tests (no fixtures). Arena resolved-state has Storybook mocks (extend `story-mocks` with a resolved market + standings).

## Verification Status
**Verified from source:** resolve/notify/push flow, enum + ref-column patterns, the groups by-id redirect + enum-add-value migration precedent, `dedupeEventsPerUser`, the single `resolveMarket` caller — all cited above.
**NOT verified — needs live testing:**
- **`ALTER TYPE ADD VALUE` via the runner on prod** — precedent says fine (statement-by-statement, no tx); verify with the before/after `pg_enum` report. *(HARD GATE before relying on the enum.)*
- **Migration number `0034` collision** with a parallel branch — regenerate if `origin/main` advanced.
- **Resolving a market to fire the QA path** writes real prod stats for the dogfood predictors — use a throwaway dogfood market, or resolve+void carefully. *(Flag: I may create a small dogfood market to QA resolution rather than resolve a real one.)*
- The full **celebration motion** can only be seen in a focused browser (occluded-tab rAF freeze) — verify there.
