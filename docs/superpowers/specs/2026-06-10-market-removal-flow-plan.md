# Market Removal Flow + Binary-Only + Roster Refresh — Implementation Plan

**Date:** 2026-06-10 · **Branch:** `feat/market-removal-flow` (worktree off origin/main `844047d`)

## Goal

1. **Admin "delete market" flow** — a market that turns out invalid can be removed *completely* (not just voided), with predictors notified. Reusable for all future bad markets.
2. **Binary-only markets** — yes/no becomes the only market type the admin console can create.
3. **Prod data refresh** — delete the dead elections market (and the multi treasury market), add new binary markets to reach **10 open markets**.

## Current state (read from code, worktree = origin/main)

- Predictions are **stake-less** (no-coins model): `bets` table is one pick per (user, market) — `app/lib/schema.ts:277-288`. **No refunds are needed on removal.** The old branch's refund logic does not exist on main.
- `voidMarket` already exists (`app/lib/markets/service.ts:125-156`): marks `status="voided"`, notifies predictors (`market_voided`), push after commit. Voided markets stay in the DB and render "השוק בוטל" on `app/market/[id]/page.tsx:100-104`.
- **FK cascades already make hard-delete safe**: `outcomes` (schema.ts:261), `market_politicians` (268), `bets` (280), `comments` (299) are all `onDelete: "cascade"`; `market_suggestions.marketId` is `set null` (332); `notifications.ref*` carry **no FK by design** so history survives a market delete (339-341 comment says exactly this).
- Admin surface: `app/admin/page.tsx` → `components/admin/market-admin-row.tsx` (resolve + void buttons) → server actions in `app/actions/admin-markets.ts` (requireAdmin → service). `listManageableMarkets` (`app/lib/markets/repo.ts:342`) lists open+closed only.
- Create form `components/admin/create-market-form.tsx:29,133-148` still offers a binary/multi radio.
- Errors: `app/lib/errors.ts` — `MarketNotFoundError`, `AlreadyResolvedError`, `NotAdminError` reused.
- **Single prod DB** (memory: no dev DB; `assertNonProductionDb()` doesn't catch the Neon host) → all data ops go through the deployed admin UI, never scripts.

## Files to touch

| File | Change |
|---|---|
| `app/lib/markets/repo.ts` | add `deleteMarket({ tx, marketId })` |
| `app/lib/markets/service.ts` | add `deleteMarket({ db, marketId })` orchestration |
| `app/actions/admin-markets.ts` | add `deleteMarketAction`; reject `type !== "binary"` in `createMarketAction` |
| `components/admin/market-admin-row.tsx` | add מחק שוק button (separate confirm) |
| `components/admin/create-market-form.tsx` | remove the binary/multi radio — always binary |
| `app/lib/markets/service.test.ts` | new tests (TDD — written first) |
| `docs/decisions/market-removal-flow.md` | decision log entry |

## Design decisions

1. **Delete is allowed for `open`/`closed`/`voided` markets; blocked for `resolved`** (throws `AlreadyResolvedError`). A resolved market has already bumped `users.totalWins/totalResolved` and card progress — deleting it would orphan those stats. An invalid market should be caught before resolution; if a resolved one must go, that's a separate (stats-rollback) feature.
2. **Predictors get notified on delete** using the existing `market_voided` event ("השוק בוטל · התחזית שלך בוטלה") — accurate copy, and avoids a `notification_type` pgEnum migration. Notifications survive the delete (no FK).
3. **One tx, market-first lock ordering** (same as resolve/void): `getMarketForUpdate` → collect predictor ids (`listPredictions`) → `emitNotifications` → `repo.deleteMarket` → commit → best-effort `dispatchPush` (mirrors `voidMarket`'s post-commit pattern, service.ts:149-155).
4. **Binary-only enforced at two layers**: form no longer offers multi; `createMarketAction` returns `{ok:false}` for non-binary input (server actions are directly invokable). The `marketType` enum + multi rendering stay (legacy markets may exist until deleted).
5. **No schema change at all** in this PR.

## Step-by-step

### Phase 1 — code (TDD)

1. **Tests first** in `app/lib/markets/service.test.ts` (PGlite via `createTestDb`, push mocked at boundary — existing file conventions):
   - delete removes the market row AND cascades outcomes + predictions + comments (insert a comment row in seed for this).
   - delete emits one `market_voided` notification per distinct predictor, rows survive the delete, push dispatched once post-commit.
   - delete on a `resolved` market throws `AlreadyResolvedError`; unknown id throws `MarketNotFoundError`; `voided` market CAN be deleted.
   - a push rejection does not undo the delete.
   - `createMarketAction`-level binary guard tested at service boundary? — no: action-level guard, verified in Phase 3 browser QA (actions aren't unit-tested in this repo; none of the existing actions are).
2. `repo.deleteMarket` — `tx.delete(markets).where(eq(markets.id, marketId))` (`.delete().where()` pattern already used at `app/lib/push/repo.ts:76`).
3. `service.deleteMarket` — per design decision 3.
4. `deleteMarketAction` — requireAdmin → service → map errors to Hebrew messages ("אי אפשר למחוק שוק שהוכרע", "השוק לא נמצא") → revalidate `/admin`, `/market/[id]`, `/` layout. Success: "השוק נמחק לצמיתות".
5. UI: red "מחק לצמיתות" button in `market-admin-row.tsx` with its own `window.confirm` ("למחוק את השוק לצמיתות? כל התחזיות והתגובות יימחקו") — same pattern as the existing void confirm (line 64).
6. Binary-only: strip the radio from `create-market-form.tsx`, hardcode `type: "binary"`; guard in `createMarketAction`.
7. `pnpm lint` + `pnpm typecheck` + run the markets test file + `pnpm preflight` (or `preflight:smart`).

### Phase 2 — ship

8. Commit, push, open PR (base `main`), run `/code-review` before push per CLAUDE.md.
9. Merge → Vercel deploys.

### Phase 3 — prod data ops (via deployed admin UI in browser, admin account)

10. **Delete** via the new button:
    - `האם יוכרזו בחירות עד סוף 2026?` (id `7040cc68-…`) — dead question, dissolution already passed first reading.
    - `מי ינהל את משרד האוצר בתום השנה?` (id `c71dee96-…`) — multi; binary-only now.
11. **Create 6 new binary markets** (5 picked + 1 binary treasury replacement) → 4 surviving + 6 = **10 open**:

| # | Question | Category | Hot | closeAt (Asia/Jerusalem) |
|---|---|---|---|---|
| 1 | האם נתניהו ירכיב את הממשלה הבאה? | elections | ✅ | 15.11.2026 (coalition talks run past election day) |
| 2 | האם חוק יסוד: לימוד תורה יעבור בקריאה שלישית עד פיזור הכנסת? | legislation | | 27.7.2026 (end of summer session) |
| 3 | האם חוק פיצול תפקיד היועמ"שית יעבור סופית לפני הבחירות? | legislation | | 1.9.2026 |
| 4 | האם תוקם ועדת חקירה (פוליטית) ל-7.10 לפני הבחירות? | scandals | | 1.9.2026 |
| 5 | האם בן גביר יהיה שר בממשלה הבאה? | personnel | | 15.11.2026 |
| 6 | האם ישראל כץ יהיה שר האוצר בממשלה הבאה? | personnel | | 15.11.2026 |

    Featured MKs resolved in the admin form's picker (stable personIds, never name-matching): נתניהו (1,5,6 contexts), בן גביר (5), ישראל כץ (6).
    Outcomes for all: כן / לא.
12. Browser-verify: feed shows 10 open markets, deleted ones 404, a predictor account sees the "השוק בוטל" notification.

### Phase 4 — wrap-up

13. Refresh fixtures if shapes differed (n/a expected — no external APIs).
14. `/log-decisions` (delete-vs-void semantics, resolved-market guard, binary-only) + evergreen-doc touch if structure changed.
15. Final `/code-review` already done pre-push; verify CI/Vercel green.

## Convention Compliance (root CLAUDE.md)

- **Layered route→service→repo**: action authorizes/parses; service orchestrates tx; repo owns DB. ✅
- **Errors over fallbacks**: unknown market throws; resolved-delete throws; no silent skip. ✅
- **RORO + named exports + no inline types**: all new fns destructure object params; reuse existing error classes. ✅
- **Hebrew copy / logical Tailwind props**: new button uses existing token classes (`border-negative`, etc.). ✅
- **No bare console.error**: post-commit push failures via `logger.error` (mirrors service.ts:152). ✅
- **Tests on PGlite, real tx semantics, behavior-not-implementation, co-located**. ✅
- **Worktree + commit early; decision log; lint+typecheck before stopping; /code-review before push**. ✅
- **No DB-mutating scripts against prod** — data ops via deployed admin UI only. ✅

## Reused data structures

| Shape | Pointer | Use |
|---|---|---|
| `MarketRow`, `PredictionRow` | `app/lib/markets/repo.ts:26-28` (`$inferSelect`) | service delete flow |
| `NotificationEvent` (`market_voided` variant) | `app/lib/notifications/service.ts:23` | delete notifications |
| `ActionResult` | `app/actions/admin-markets.ts:30` area | new action return |
| Error classes | `app/lib/errors.ts:7,10,11` | reused, none added |
| `Tx` / `DB` types | `app/lib/db.ts`, `app/lib/markets/repo.ts:20-24` | injectable test db |

No new types/schemas/enums introduced. Searched `app/lib/**`, `lib/types.ts` — no existing `deleteMarket` anywhere (`grep -rn "deleteMarket"` → 0 hits).

## Verified third-party signatures

| Touch point | Citation |
|---|---|
| Drizzle `db.delete(table).where(...)` inside tx | existing in-repo usage `app/lib/push/repo.ts:76`, `app/lib/comments/repo.ts:121` |
| Drizzle `update().returning()` / FOR UPDATE lock | `app/lib/markets/repo.ts:40,288-300` |
| `revalidatePath(path, "layout")` | existing usage `app/actions/admin-markets.ts:100,136-138` |
| FK `onDelete: "cascade"` semantics (PGlite + Neon both vanilla PG) | `app/lib/schema.ts:261,268,280,299` |

No external HTTP APIs are touched.

## Fixtures

- DB shapes: `createTestDb` (`app/lib/testing/create-test-db.ts`) is the fixture mechanism — real PGlite schema, used by the existing `service.test.ts`. Covers every shape this feature touches. No third-party payloads involved → nothing to capture.

## Verification Status

**Verified from source:** everything in the two tables above; `marketStatus` enum values (`schema.ts:251` equivalent on main); voided rendering (`app/market/[id]/page.tsx:100`); notifications no-FK comment (`schema.ts:339`).

**NOT verified — needs live testing:**

| Item | How | Gate |
|---|---|---|
| Cascades actually fire on Neon prod (indexes/constraints could have drifted vs schema) | Phase 3 step 12 browser check after the first prod delete | HARD GATE — do the dead-elections market first, verify, then the second delete |
| Admin form MK picker has all featured MKs | visually during Phase 3 | soft |
| 10 open markets render correctly in feed | Phase 3 step 12 | soft |
