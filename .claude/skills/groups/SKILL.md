---
name: groups
description: The Groups / קואליציה feature — private, invite-only prediction clubs with their own auto-published הצעות לסדר, a SANDBOXED scoreboard, and per-motion מליאה discussion. Use when touching anything under app/lib/groups, the /g/* routes, the group switcher, group notifications, group-scoped market reads (markets.groupId), the default-group landing in proxy.ts, or when asking how groups are created/joined, how the sandbox + feed isolation work, how group motions are posted/resolved, or how the reveal gate / @-mentions behave. Phase 2 (opt-in stance sharing) is separate — see docs/decisions/groups-stances.md if present.
---

# Groups / קואליציה

User-created **groups** (UI label קואליציה; DB name `groups` to avoid colliding with the political `factions` table and the `coalition` market *category*). Invite-only prediction clubs, each with its own auto-published motions, scoreboard, and discussion — **sandboxed** from global stats/cards/seasons. Spec: `docs/superpowers/specs/2026-06-14-groups-coalitions-design.md` · Plan: `docs/superpowers/plans/2026-06-14-groups-coalition-plan.md` · Decisions: `docs/decisions/groups.md`. Shipped in PR #83 (migration 0030).

> **Global-context redesign** (`docs/decisions/coalition-global-context.md`): a coalition is now a sticky, app-wide **scope** (a cookie set by the header switcher), not a `/g/[slug]` destination. Its motions render inline on the global feed when it's the active context; `/g/[slug]` is management-only. Reads scope via `coalitionScope` (see invariant 2). The sandbox invariant (1) is unchanged.

## File Map

| Layer | Path | Purpose |
|---|---|---|
| Schema | `app/lib/schema-groups.ts` | `groups`, `group_members` (+ `groupMemberRole`/`groupMemberStatus` enums); re-exported from `schema.ts`. Cross-file FK uses `(): AnyPgColumn => …` thunks (cycle-safe, same as schema-votes). |
| Schema (host edits) | `app/lib/schema.ts` | `markets.groupId` (nullable FK — the audience-scope spine), `user.defaultGroupId`, `notifications.refGroupId`, 4 `notificationType` values (`group_motion_posted`/`_resolved`/`_mention`/`group_member_joined`). |
| Repo | `app/lib/groups/repo.ts` | All group DB access: create/membership/scoreboard/`getGroupMotionPicks` (reveal-gated)/`bumpGroupStats` (active-only)/slug+code gen (`node:crypto`). |
| Service | `app/lib/groups/service.ts` | createGroup (auto-home first group), joinGroup (idempotent, restores `left`), leaveGroup (owner auto-handoff → else archive), removeMember, getGroupForMember (membership gate). |
| Motions | `app/lib/groups/motions.ts` | `createGroupMotion` (any member, auto-publish) + **separate `resolveGroupMotion`** (owner/admin, sandboxed — bumps only group_members). |
| מליאה | `app/lib/groups/discussion.ts` | `postGroupAwareComment` — wraps comment insert + `@handle` mention emit in one tx (group markets only). |
| Schemas | `app/lib/groups/schemas.ts` | Zod input schemas (define-and-import) incl. `setActiveCoalitionSchema`. |
| Context (scope) | `app/lib/groups/context.ts` + `app/lib/markets/scope.ts` | `getActiveCoalition`/`resolveActiveCoalition` (cookie + membership heal), `COALITION_COOKIE`, `coalitionCookieOptions`; `coalitionScope({groupId})` predicate threaded into the 6 display reads. |
| Actions | `app/actions/groups.ts` (create/join/leave/setHomeGroup + motion actions) + `app/actions/coalition.ts` (`setActiveCoalitionAction` — the switcher's context setter) | session + rate-limit + Hebrew errors. `app/actions/comments.ts` routes through postGroupAwareComment. |
| Context UI | `components/groups/{group-switcher (sets context, no nav),coalition-scope-banner}.tsx` + `components/coalition-scope-note.tsx` | switcher → `setActiveCoalitionAction` + `router.refresh()`; banner atop the scoped feed; note on national progress surfaces. |
| Routes | `app/g/page.tsx` (my groups), `app/g/new`, `app/g/[slug]` (**management-only** since the global-context redesign — scoreboard/roster/invite/stance, NOT a motions feed), `app/g/[slug]/new` (motion form), `app/g/join/[code]` (invite preview), `app/g/by-id/[id]/route.ts` (**sets the active-coalition context + lands on the scoped feed**; used by notifications + the motion back-link) | RSC-first; motion detail reuses `/market/[id]` (membership-gated). Coalition הצעות now render inline on the global feed when the coalition is active. |
| Components | `components/groups/{group-switcher,group-create-form,group-motion-form,group-action-bar,join-group-button}.tsx` | Client; forms mirror suggest-market-form (useState/useTransition, no RHF). |
| Skeletons | `components/skeletons/groups-skeleton.tsx` (+ stories) | GroupsList / GroupHome / GroupForm. |
| Migration | `drizzle/0030_groups_coalition.sql` + `scripts/apply-groups-migration.ts` | Additive; applied to prod via the guarded runner (prod is the single DB). |

## Invariants (do not break)

1. **Sandbox.** Group motions resolve via `resolveGroupMotion` ONLY — it bumps `group_members.groupWins/groupResolved` and emits `group_motion_resolved`, and touches NOTHING global. The global `resolveMarket`/`voidMarket`/`deleteMarket` reject a market with `groupId` (would bump global stats/cards/seasons).
2. **Feed scope (global-context redesign).** Display reads are parameterized by an active-coalition `groupScope` via `coalitionScope({groupId})` (`app/lib/markets/scope.ts`): `null` → `isNull(markets.groupId)` (national, the default), an id → `eq(markets.groupId, id)`. **6 reads flip** with the active coalition: `listOpenMarkets`, `listUnpredictedOpenMarkets`, `getMarketOfTheDay`, `getMarketsForPolitician`, `searchMarkets`, `getUserPredictions`. **4 stay hard-coded `isNull`** (sandbox / global-only): `seasons.getSeasonCorrect`, `listManageableMarkets` (admin), `listMarketsClosingSoon` (cron), `bets.listUnseenResolvedPredictions` (global resolved-deck). The active coalition is a cookie read via `getActiveCoalition` (`app/lib/groups/context.ts`), set by `setActiveCoalitionAction` (`app/actions/coalition.ts`); RSCs thread `groupScope` into the feed reads. Coalition picks STILL never count toward global stats/cards/seasons (invariant 1). The global leaderboard needs no filter (ranks `user.totalWins`).
3. **Membership gate.** All group reads/writes require an `active` membership; a group `/market/[id]` 404s non-members; resolution requires owner|admin.
4. **Reveal gate.** Others' picks + the crowd split + the deck shares are hidden until the viewer has predicted (or the motion settled). `getGroupMotionPicks` enforces it server-side; the market page also feeds the deck a zero-count market until revealed.
5. **Active-only stats/picks.** A departed member's counters freeze (bumpGroupStats filters `status='active'`) and their pick is hidden (`getGroupMotionPicks` joins active membership).

## Gotchas

- **Bind Dates via drizzle operators (`gte`/`gt`), never a raw `sql\`… ${date}\``** — postgres-js under next-dev/Turbopack fails the `instanceof Date` realm check (PGLite + production build tolerate it, so tests pass but dev/QA breaks).
- **`markets.groupId` is the only thing that makes a market a "motion"** — there's no separate table; group motions are markets.
- **Active-coalition context** is a cookie (`polytical_coalition`, `app/lib/groups/context.ts`): the header `GroupSwitcher` sets it via `setActiveCoalitionAction` + `router.refresh()` (no navigation); `getActiveCoalition` reads it, seeding from `defaultGroupId` when absent and **healing** a stale value (left/removed/deleted → national). The old `/` → `/g/by-id` proxy landing redirect and `?view=general` were **retired** (`docs/decisions/coalition-global-context.md`). `defaultGroupId` is now only the seed + the `/g` "home" marker; writing it still uses `refreshSession()` + `revalidatePath("/","layout")`.
- **Tests** are PGLite (`app/lib/groups/*.test.ts`); run from inside the worktree. The sandbox + feed-isolation + reveal + active-only behaviors all have regression tests.
