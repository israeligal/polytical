# Plan — Coalition as a global context (not a side page)

> Status: **DRAFT for review** · Date: 2026-06-15 · Author: Claude (autonomous, owner away)
> Spec: `docs/superpowers/specs/2026-06-15-coalition-global-context-design.md`
> Worktree: `feat/coalition-global-context` at `.claude/worktrees/coalition-context` (off `main` @ `25d3df6`). **NO MERGE** — this branch holds spec + plan + QA notes only; implementation is described, not executed.
> Load the `groups` skill before touching any file below (CLAUDE.md mandate).

---

## 0. Worktree

Already created: `feat/coalition-global-context`. Per CLAUDE.md, all isolation-sensitive steps run **inline in the worktree**, never via background Agent/Workflow subagents (those run in the repo root). Run `pnpm setup:worktree` first (installs deps for the worktree).

## 1. Files read (verified, not from memory)

| File | What it gives us | Status |
|---|---|---|
| `components/groups/group-switcher.tsx` | Today: `<details>` that `<Link>`s to `/g/[slug]`; active derived from path; "ארצי"→`/?view=general`. | ✅ read |
| `components/site-header.tsx:8,45` | Switcher mount point (next to logo); receives `myGroups`. | ✅ read |
| `app/g/[slug]/page.tsx` | The side page: 2-col grid, motions feed + aside (scoreboard/roster/stance-toggle). To be dismantled. | ✅ read |
| `proxy.ts:68-76` | `/` → `/g/by-id/<defaultGroupId>` redirect + `?view=general` escape + loop guard. | ✅ read |
| `app/lib/markets/repo.ts` | The 9 `isNull(markets.groupId)` filters + read fn signatures (`listOpenMarkets`, `listUnpredictedOpenMarkets`, `getMarketOfTheDay`, `listManageableMarkets`, `getMarketsForPolitician`, `searchMarkets`, `getUserPredictions`, closing-soon). | ✅ read |
| `app/lib/bets/repo.ts:45` | 1 filter (deck reveal). | ✅ read |
| `app/lib/seasons/repo.ts:76` | 1 filter (sandbox — STAYS hardcoded). | ✅ read |
| `app/lib/markets/feed.ts` | Chokepoint: `getMarketCards({category})`, `getUnpredictedOpenMarketCards({userId,…})`, `getMyPickLabels({userId})`. | ✅ read |
| `app/page.tsx:37`, `app/markets/page.tsx:34`, `app/politician/[id]/page.tsx:56`, `app/profile/page.tsx:42`, `app/lib/search/service.ts:50` | RSC callers to thread the active coalition through. | ✅ read |
| `app/layout.tsx:64`, `components/site-header.tsx:31` | Cookie precedent (`THEME_COOKIE` via `(await cookies()).get(...)`). | ✅ read |
| `app/actions/groups.ts` | Existing group actions + the `defaultGroupId` cookie-heal pattern (`refreshSession()` + `revalidatePath`). | ✅ read (skill + grep) |
| `lib/auth.ts:63` | `defaultGroupId` additionalField (`input:false`). | ✅ read |
| `app/lib/groups/motions.test.ts` | Existing feed-isolation regression tests already import the 4 display reads + `getSeasonCorrect`. | ✅ read |

**Files to be modified (touch list):**
- `app/lib/markets/scope.ts` *(new — single `coalitionScope()` predicate + `getActiveCoalition()` reader)*
- `app/lib/markets/repo.ts` (param-thread 7 display reads; leave admin + cron hardcoded)
- `app/lib/bets/repo.ts` (param-thread the deck read)
- `app/lib/markets/feed.ts` (accept + forward `groupScope`)
- `app/lib/search/service.ts` (forward `groupScope`)
- `app/actions/coalition.ts` *(new — `setActiveCoalition` server action)*
- `components/groups/group-switcher.tsx` (action+refresh instead of Link)
- `components/site-header.tsx` (pass active coalition to switcher)
- `app/page.tsx`, `app/markets/page.tsx`, `app/politician/[id]/page.tsx`, `app/profile/page.tsx` (read active coalition, pass scope)
- `proxy.ts` (retire the `/g/by-id` redirect + `?view=general`)
- `app/g/[slug]/page.tsx` → reduce to management-only (Phase B)
- `app/lib/schema.ts` *(no change expected — see Reused structures)*
- Decision log `docs/decisions/coalition-global-context.md` *(new)*
- The `groups` skill `SKILL.md` + root `CLAUDE.md` groups bullet (doc refresh, Phase B)

## 2. Convention Compliance (root + groups CLAUDE.md)

| Convention | How this plan complies |
|---|---|
| **Layered Route→Service→Repo→DB, import only downward** | Cookie read lives in a tiny `app/lib/markets/scope.ts` reader called from RSCs/services; repos receive a plain `groupScope: string \| null` arg — repos never read cookies. The `setActiveCoalition` action sits in `app/actions/`. |
| **Scope guard first line of repo fns** | Unchanged; `requireUserId` stays. New `groupScope` is an additional WHERE predicate, not a replacement for user scoping. |
| **Errors over fallbacks / no backward-compat shims** | Stale-coalition cookie is *healed* (cleared + national), which is a deliberate documented behavior (mirrors `defaultGroupId` heal), not a silent default. No compat shim for `?view=general` — it's removed. |
| **Derive, don't sync** | Active coalition is read server-side from the cookie at render; not mirrored into client state via `useEffect`. Switcher posts an action then `router.refresh()`. P2 leaves room for a `?coalition=` URL override (URL-derived). |
| **RSC-first; mutations in actions; `redirect()` only in RSC/action** | Cookie `.set()` only in the `setActiveCoalition` Server Action (RSC cookies are read-only in Next 16). Switcher uses `router.refresh()` in an event handler, never `redirect()` in render. |
| **No inline types/Zod** | `setActiveCoalition` input schema defined in `app/lib/groups/schemas.ts` (extend, define-and-import). `groupScope` is `string \| null` (a closed shape), threaded as a named field. |
| **Type safety — no `as any`** | `groupScope: string \| null`; `coalitionScope` returns a Drizzle `SQL` predicate. No casts. |
| **Logical Tailwind / OKLCH / Hebrew RTL** | Any switcher/management UI keeps `ms/me/ps/pe`, tokens only, Hebrew copy, Asia/Jerusalem times. New "viewing coalition X" banner (P1) adds a token if a new color is needed. |
| **Loading states** | The scoped feed reuses the existing `/` and `/markets` skeletons (same components). Dismantling `/g/[slug]` updates `components/skeletons/groups-skeleton.tsx` + stories in lockstep (Phase B). |
| **Neon/Drizzle — shared `db`, indexes in-schema** | No new table. Existing `markets_group_idx` on `(groupId,status,createdAt)` already supports `eq(groupId,X)` scans (verified `schema.ts:335`). If a `coalition` cookie alone suffices, **no migration needed**. |
| **Decision log** | New `docs/decisions/coalition-global-context.md`, newest-on-top, immutable entries. |
| **Before finishing / before pushing** | `pnpm lint` + typecheck + `/code-review`; never `--no-verify`. (This branch: no push-to-merge.) |
| **Groups P0 invariants (sandbox/feed-isolation/membership/reveal/active-only)** | Sandbox + reveal + membership gates are **unchanged**. Feed-isolation becomes *parameterized* (national when scope=null) but seasons/cards/admin/cron stay hardcoded `isNull` — the sandbox invariant is preserved, just made explicit per-surface (see §5 step 3/4). |

## 3. Reused data structures (do NOT redefine)

| Shape | Existing definition | Reuse |
|---|---|---|
| Active-coalition value | `markets.groupId` / `user.defaultGroupId` are `uuid` (`app/lib/schema.ts:43,329`) | `groupScope: string \| null` — a bare uuid string, same as existing `groupId` params throughout `app/lib/groups/repo.ts`. No new type. |
| Switcher group shape | `SwitcherGroup { slug, nameHe, emblem }` (`components/groups/group-switcher.tsx:7`) | Reuse as-is; add `id` (already available from `site-header`'s `myGroups`). |
| Membership check | `getMembership({db,groupId,userId})` (`app/lib/groups/repo.ts:89`) | Reuse for the stale-cookie heal (verify active membership on read). |
| Session field | `defaultGroupId` additionalField (`lib/auth.ts:63`) | Seed the cookie from this on first post-login load; do not add a parallel session field. |
| Action result | `ActionResult` (`app/actions/types.ts`) | `setActiveCoalition` returns `ActionResult`. |
| Input schema | `app/lib/groups/schemas.ts` (Zod, define-and-import) | Add `setActiveCoalitionSchema = z.object({ groupId: z.string().uuid().nullable() })`; derive type via `z.infer`. |
| Cookie helper | `THEME_COOKIE` read pattern (`app/layout.tsx:64`) | Mirror for `COALITION_COOKIE`; define the const in one module (`app/lib/markets/scope.ts`). |
| Feed cards | `getMarketCards` / `getUnpredictedOpenMarketCards` (`app/lib/markets/feed.ts`) | Extend signatures with optional `groupScope`; do not fork. |

**Searched and found nothing new needed:** grep for `activeCoalition`, `coalitionScope`, `COALITION_COOKIE`, `groupScope` → 0 hits (these are the only genuinely new identifiers).

## 4. Verified third-party signatures

| Touch point | Signature / behavior | Citation |
|---|---|---|
| `next/headers` `cookies()` (read) | `cookies()` returns `Promise<ReadonlyRequestCookies>` in Next 16; `.get(name)?.value` is the value. RSC cookies are **read-only**. | Used live at `app/layout.tsx:64`, `components/site-header.tsx:31`. |
| `next/headers` `cookies()` (write) | `.set(name, value, opts)` allowed **only** in Server Actions / Route Handlers, not RSC render. Set with `{ httpOnly:true, sameSite:"lax", path:"/", maxAge }`. | Next 16 docs `node_modules/next/dist/docs/` (cookies guide) — confirm exact `maxAge`/`expires` field during impl (NOT-verified gate below). |
| `next/navigation` `useRouter().refresh()` | Re-fetches RSC payload for the current route without full reload — re-renders the scoped feed after the cookie flips. | Existing client usage pattern in `components/` (verify a call site during impl). |
| Drizzle `eq` / `isNull` / `and` | `eq(col, val)` and `isNull(col)` both return `SQL`; composable in `and(...)`. `coalitionScope` returns one of the two. | Already imported in `app/lib/markets/repo.ts` (top of file). |
| Better Auth `refreshSession()` | Used after writing `defaultGroupId` to avoid stale cookie cache. Only needed if we also write the session; cookie-only approach avoids it. | `app/actions/groups.ts` (existing pattern). |

## 5. Implementation steps (TDD — test first where a behavior changes)

> Order respects the spec's phasing. Each repo/service step: **write/extend the PGLite test first** (red), then thread the param (green). Component steps: story/unit test alongside.

**Phase A — context primitive + parameterized reads (surfaces still work via `/g`):**

1. **Audit `?view=general`** — grep app/docs/tests for `view=general` and `by-id`; list every reference so the proxy retirement (step 11) is safe. *(HARD GATE — see Verification Status.)*
2. **`app/lib/markets/scope.ts`** (new): export `COALITION_COOKIE`, `coalitionScope(groupId: string|null): SQL` = `groupId ? eq(markets.groupId, groupId) : isNull(markets.groupId)`, and `getActiveCoalition({ userId }): Promise<string|null>` — reads cookie, if set verifies active membership via `getMembership`, returns `null` (and signals heal) if not a member. Unit + integration test the heal.
3. **Parameterize the 7 display reads** in `app/lib/markets/repo.ts` + the 1 in `app/lib/bets/repo.ts`: add optional `groupScope?: string|null` (default `null` → identical to today's `isNull`), replace the literal `isNull(markets.groupId)` with `coalitionScope(groupScope)`. Reads that flip: `listOpenMarkets`, `listUnpredictedOpenMarkets`, `getMarketOfTheDay`, `getMarketsForPolitician`, `searchMarkets`, `getUserPredictions`, closing-soon **display** read, `bets` deck read.
4. **Leave hardcoded `isNull`** (sandbox / global-only): `seasons/repo.ts:76`, `listManageableMarkets` (admin), `listMarketsClosingSoon` **cron** path. Add a code comment citing the invariant. *(Regression test: with a coalition active, `getSeasonCorrect` still ignores group motions.)*
5. **Thread through `feed.ts` + `search/service.ts`**: `getMarketCards`/`getUnpredictedOpenMarketCards`/`getMyPickLabels` accept `groupScope`; `searchMarkets` caller forwards it.
6. **`app/actions/coalition.ts`** (new): `setActiveCoalition({ groupId })` — validate via `setActiveCoalitionSchema`, verify membership when non-null, `(await cookies()).set(COALITION_COOKIE, …)` or delete when null, `revalidatePath("/","layout")`, return `ActionResult`. Rate-limit per existing action conventions.
7. **`group-switcher.tsx`**: become a client component that calls `setActiveCoalition` (useTransition) then `router.refresh()`; active state from the passed-in `activeId` prop, not the path. Keep "+ צרו/הצטרפו". Story/unit test: selecting → action called with the id; ארצי → action called with `null`; URL path unchanged.
8. **`site-header.tsx`**: read `getActiveCoalition` server-side, pass `activeId` to the switcher.
9. **Thread RSCs**: `app/page.tsx`, `app/markets/page.tsx`, `app/politician/[id]/page.tsx`, `app/profile/page.tsx` read `getActiveCoalition({userId})` and pass `groupScope` into their reads. Empty-state when a coalition has no open motions (reuse existing `EmptyState`).

**Phase B — remove the side page, retire the redirect:**

10. **`app/g/[slug]/page.tsx`** → management-only: drop the motions feed + aside-as-forecasts; keep scoreboard summary + roster + invite (`GroupActionBar`) + `StanceSharingToggle` + leave. Update `components/skeletons/groups-skeleton.tsx` + stories in lockstep. Motion creation CTA on the scoped feed links to `/g/[slug]/new` for the active coalition.
11. **`proxy.ts`**: remove the `/` → `/g/by-id/<defaultGroupId>` redirect, the loop guard, and `?view=general`. The home feed now seeds scope from `defaultGroupId` via `getActiveCoalition` (cookie absent → fall back to `defaultGroupId`). Keep `/g` in `PROTECTED_ROUTES`.
12. **Seed-on-first-load**: when the cookie is absent and the user has a `defaultGroupId`, `getActiveCoalition` returns it (so members still land scoped) — decide whether to also write the cookie then (in an action, not RSC) or recompute each load. *Recommendation: recompute (no write in RSC); only the switcher writes.*

**Phase C — polish (P1):** scope banner ("צופים ב: X · חזרה לארצי"), top-3 scoreboard summary near the feed header.

## 6. Test plan (grounded in the `testing` skill)

- **Integration (PGLite, co-located `app/lib/**/*.test.ts`)** — extend `app/lib/groups/motions.test.ts` (already imports the 4 display reads + `getSeasonCorrect`):
  - `listOpenMarkets({groupScope:X})` returns only X's motions; `({groupScope:null})` returns only national — **byte-for-byte same as today's default**. (Behavior, not call-shape.)
  - `getUserPredictions` / `getMarketsForPolitician` / `searchMarkets` likewise scope correctly; no read merges national+coalition.
  - **Sandbox regression:** with X active, `getSeasonCorrect` and card-progress reads ignore X's resolved motions; `listManageableMarkets` never returns a `groupId` row.
  - **Stale-cookie heal:** `getActiveCoalition` returns `null` when the cookie names a group the user left / was removed from / deleted.
- **Unit (node)** — `coalitionScope(null)` deep-equals the prior `isNull` predicate; `(uuid)` equals `eq`.
- **Component / Storybook** — `group-switcher.stories.tsx`: play function asserts selecting a coalition calls the action with its id and selecting ארצי calls with `null`; path unchanged. Page-level stories (`page.stories.tsx`) keep the broken-link guard.
- **Schema cascade** — only if a column/cookie-table is added (not expected); if added, update production schema + test DDL + seed helpers + fixtures in lockstep (`createTestDb` in `app/lib/testing/create-test-db.ts`).
- **Commands:** `pnpm test:unit`, `vitest --project=integration app/lib/groups/motions.test.ts`, `pnpm test:stories`, then `pnpm preflight`.
- **Assertion discipline:** every test asserts observable end-state (rows returned / scope applied / cookie state), never "was `coalitionScope` called."

## 7. Verification Status

**Verified from source / docs:**

| Item | Citation |
|---|---|
| All 11 `isNull(markets.groupId)` sites + which flip vs stay | `markets/repo.ts` (9), `bets/repo.ts:45`, `seasons/repo.ts:76` |
| Switcher navigates today (to be changed) | `group-switcher.tsx:30-44` |
| Proxy redirect to land on group home | `proxy.ts:73-76` |
| Cookie read/write pattern | `app/layout.tsx:64` (read); Next 16 actions for write |
| Feed chokepoint signatures | `app/lib/markets/feed.ts:30,70` |
| `markets_group_idx` supports `eq(groupId,X)` | `app/lib/schema.ts:335` |
| Existing feed-isolation tests to extend | `app/lib/groups/motions.test.ts:13-16` |

**NOT verified — needs live testing (with how-to + owner):**

| Item | How to verify | Owner |
|---|---|---|
| **HARD GATE** Exact `cookies().set` options in Next 16 (maxAge vs expires; httpOnly default) | Read `node_modules/next/dist/docs/` cookies guide + a quick action round-trip in dev | eng (impl step 6) |
| **HARD GATE** `?view=general` / `by-id` has no other consumers before proxy retirement | grep audit in impl step 1 | eng |
| `router.refresh()` re-renders the scoped feed after cookie flip (vs needing `revalidatePath`) | Manual dev: switch coalition, confirm feed swaps without full reload | eng / browser-QA |
| Season/card UI copy when a coalition is active (hide vs "doesn't count" note) | Owner decision (spec Open Question) | owner/design |
| Management-surface home (slim `/g/[slug]` vs drawer) | Owner decision (spec Open Question) | owner/design |

## 8. Final steps (in order)

1. Refresh/delete any captured fixtures if real shapes differed (none expected — no new external shape).
2. `/wrap-up` — **not present in this repo**; substitute: `/log-decisions` → write `docs/decisions/coalition-global-context.md`, then refresh the `groups` skill `SKILL.md` (routes/switcher/scope section) + the root `CLAUDE.md` groups bullet via `/evergreen-documentation`.
3. `/code-review` before any push. Never `--no-verify`.
4. **No merge** — per the owner's instruction this branch stays a plan/spec/QA artifact until they return.
