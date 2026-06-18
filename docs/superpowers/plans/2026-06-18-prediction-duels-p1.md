# Plan — Prediction Duels P1 (persistence: challenges + participants)

**Date:** 2026-06-18 · **Branch:** `feat/prediction-duels` (continue; not a worktree — Turbopack stale-compile gotcha + the running dev server/prod-migration live in this checkout)
**Authorized:** user OK'd applying the additive prod migration now.

## Goal
Move duels from the **stateless token** (v0) to a **persisted** model so we can track *who joined* (multi-participant standings) and later notify on settlement. Additive only — no change to the prediction/resolve invariants, no coins.

## Design
- `challenges` row created when a user mints a link (replaces encoding the payload in the URL). Token = opaque url-safe id (like `groups.slug`, `node:crypto`).
- The challenger's pick is **derived** from their `bets` row for the market (stays current until close) — NOT stored on the challenge.
- A logged-in viewer who picks = a `challenge_participants` row + their normal `bets` upsert (via `makePrediction`).
- Standings = derived read over `bets` (challenger + participants) vs `markets.resolvedOutcomeId`. No new writer; no parallel scoring; respects `no-coins`.
- **Group markets stay out** (`markets.groupId` must be null) — keeps the groups sandbox intact.

## Files to read (DONE)
- `app/lib/schema.ts:379-450` (markets, outcomes, **bets** `unique(userId,marketId)`), user table (`text` id).
- `app/lib/schema-groups.ts` (split-schema + `groups`/`group_members` template: FK thunks `(): AnyPgColumn => users.id` cascade, composite PK, in-schema indexes; re-export via `export * from "./schema-groups"`; `drizzle.config.ts` lists all 3).
- `scripts/apply-groups-migration.ts` (prod runner: additive, idempotent "already exists" skip, statement-breakpoint split, NO `assertNonProductionDb`).
- `app/lib/testing/create-test-db.ts` (`migrate(db,{migrationsFolder:"./drizzle"})` → migration SQL + `_journal.json` MUST be committed for tests to see tables).
- `app/lib/markets/service.ts:36` (`makePrediction({db?,userId,marketId,outcomeId}) → {predictionId}`; tx, open+group+outcome guards).
- `app/actions/bet.ts` (action wrapper: getSession + checkRateLimit + makePrediction + revalidatePath).
- `drizzle/meta/_journal.json` → last tag `0032_eminent_living_mummy` → new = **`0033_prediction_duels`**.

## Reused data structures (no redefinition)
- `ActionResult` `{ok, message?}` — `app/actions/types.ts:3`.
- `bets`, `users`, `markets`, `outcomes` tables — `app/lib/schema.ts`.
- `makePrediction` — `app/lib/markets/service.ts:36` (the duel pick IS a normal prediction).
- `getMarketBundle`/`getOutcomeCounts` (`app/lib/markets/repo.ts`) + `bundleToMarket` (`app/lib/markets/adapter.ts`).
- `requireUserId` (`app/lib/errors.ts:54`), shared `db` (`app/lib/db.ts:38`), `FALLBACK_HANDLE` (`app/lib/onboarding/handle.ts`).
- `DuelArenaProps`/`DuelPlayer` — `components/duel/types.ts`.
- Opaque-token generation — mirror `groups` slug/inviteCode (`node:crypto`).

## Convention Compliance (CLAUDE.md)
- **Layered Route→Service→Repo→DB**: `app/actions/duels.ts` → `app/lib/duels/service.ts` → `app/lib/duels/repo.ts`. Repo owns all DB access; user-scoped writes start with `requireUserId`. Public `getChallengeByToken` is token-scoped (reads only public fields — challenger `@handle`).
- **Schema split**: new `app/lib/schema-duels.ts`, re-exported from `schema.ts`, added to `drizzle.config.ts`. ALL indexes in-schema.
- **Errors over fallbacks**: missing/invalid token → `notFound()`; not-open market → existing `MarketClosedError` via `makePrediction`.
- **Identity**: render `@handle` only (never `users.name`); coalesce null → `FALLBACK_HANDLE`.
- **One authoritative writer + idempotent**: `recordParticipant` upserts on `(challengeId,userId)`; double-join is a no-op.
- **Migration**: additive (CREATE TABLE/INDEX only); guarded one-off runner; PGlite replays it.
- **Tests**: PGlite integration via `createTestDb`, test behavior, real Drizzle.
- **RORO, named exports, no inline types/zod, files <500 lines.**

## Verified third-party signatures
- `pgTable/uuid/text/timestamp/index/uniqueIndex/primaryKey/AnyPgColumn` — used exactly as `schema-groups.ts:30-100`.
- PGlite migrator reads `./drizzle` ordered by `_journal.json` — `create-test-db.ts:11`.
- `makePrediction` returns `{predictionId}` and throws `MarketClosedError`/`NotGroupMemberError` — `markets/service.ts:36`.
- `sharedSql.unsafe(stmt)` + `.end()` for the prod runner — `scripts/apply-groups-migration.ts`.

## Fixtures
No external API. All shapes are Drizzle rows → covered by PGlite integration tests (no fixtures needed). Arena props already have Storybook mocks.

## Build steps
1. **Schema** — `app/lib/schema-duels.ts`: `challenges` (id uuid PK, token text unique, challengerUserId text→users cascade, marketId uuid→markets cascade, createdAt) + `challengeParticipants` (challengeId uuid→challenges cascade, userId text→users cascade, joinedAt; composite PK (challengeId,userId); index on userId). Re-export from `schema.ts`; add to `drizzle.config.ts`.
2. **Migration `0033_prediction_duels`** — try `pnpm db:generate` (additive → likely non-interactive); if it needs a TTY, hand-author `drizzle/0033_prediction_duels.sql` + add a `_journal.json` entry (+ snapshot best-effort). Verify the test DB picks up the tables.
3. **Prod runner** — `scripts/apply-duels-migration.ts` mirroring `apply-groups-migration.ts` (before/after `information_schema` report on `challenges`/`challenge_participants`).
4. **Repo** `app/lib/duels/repo.ts` — `createChallenge`, `getChallengeByToken` (join challenger's current bet → pick), `recordParticipant` (idempotent), `getDuelStandings` (challenger + participants picks vs resolved outcome), `getParticipantCount`.
5. **Service** `app/lib/duels/service.ts` — `createChallenge` (generate token, validate market is global+exists), `joinDuel` (makePrediction + recordParticipant in/around the existing tx).
6. **Actions** `app/actions/duels.ts` — `createChallengeAction`, `joinDuelAction` → `ActionResult`; rate-limit (reuse `checkRateLimit`).
7. **Wire UI** — `ChallengeMarketButton` → `createChallengeAction` (returns `/duel/[token]`); `/duel/[token]/page.tsx` → `getChallengeByToken` + standings + real participant count; `DuelArenaClient.onPick` → `joinDuelAction`. Remove the stateless `app/lib/duels/token.ts` (or reduce to the opaque-id generator). Update the OG route + `generateMetadata` to read the challenge.
8. **Tests** `app/lib/duels/repo.integration.test.ts` (+ service) — createChallenge persists; getChallengeByToken returns challenger pick; joinDuel upserts bet + idempotent participant; wrong-user can't mutate; standings derive correct/wrong post-resolve; group-market challenge rejected.
9. **Apply migration to PROD** (authorized): `pnpm tsx --env-file=.env scripts/apply-duels-migration.ts`; confirm tables via the runner's report.
10. **Verify** — `pnpm lint && pnpm typecheck && pnpm test (duel) && pnpm build` (NOT while dev runs in this checkout — stop dev first).
11. **/wrap-up** (if present) → **/log-decisions** (`docs/decisions/duels.md`) + **/evergreen-documentation** refresh.
12. **/code-review** the diff.
13. **Full /browser-qa** of the whole duel feature (user's explicit ask) — focused-browser reveal, create→share→accept, standings.
14. **Push** + update PR #107.
15. After landing on remote `main`: `git pull --ff-only origin main` on the primary checkout.

## Deferred (out of P1 scope — note in PR)
- **Settlement notifications** (notify participants when the market resolves) — touches the P0 `resolveMarket` tx; own follow-up.
- Accept-time push notification to the challenger.
- Bundle the OG Hebrew font locally (drop runtime Google fetch).

## Verification Status
**Verified from source:** schema/index patterns, split-schema re-export, prod-runner pattern, PGlite replay, `makePrediction`, `ActionResult`, journal tag → 0033 — all cited above.
**NOT verified — needs live testing:**
- `pnpm db:generate` non-interactive in this sandbox (TTY) — **build step 2 has a hand-author fallback.**
- Prod migration apply — **HARD GATE**: authorized; verify via `information_schema` in the runner; additive + idempotent so a re-run is a no-op and it can't clobber other branches' shared-prod tables.
- Migration number `0033` collision with a parallel branch — regenerate/renumber if origin/main advanced (memory: parallel-worktree-coordination).
