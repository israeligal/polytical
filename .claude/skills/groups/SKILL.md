---
name: groups
description: The Groups / קואליציה feature — private, invite-only prediction clubs with their own auto-published הצעות לסדר, a SANDBOXED scoreboard, and per-motion מליאה discussion. Use when touching anything under app/lib/groups, the /g/* routes, the group switcher, group notifications, group-scoped market reads (markets.groupId), the default-group landing in proxy.ts, or when asking how groups are created/joined, how the sandbox + feed isolation work, how group motions are posted/resolved, or how the reveal gate / @-mentions behave. Phase 2 (opt-in stance sharing) is separate — see docs/decisions/groups-stances.md if present.
---

# Groups / קואליציה

User-created **groups** (UI label קואליציה; DB name `groups` to avoid colliding with the political `factions` table and the `coalition` market *category*). Invite-only prediction clubs: each is a self-contained arena with its own auto-published motions, its own scoreboard, and its own discussion — fully **sandboxed** from the global app. Spec: `docs/superpowers/specs/2026-06-14-groups-coalitions-design.md` · Plan: `docs/superpowers/plans/2026-06-14-groups-coalition-plan.md` · Decisions: `docs/decisions/groups.md`. Shipped in PR #83 (migration 0030).

## File Map

| Layer | Path | Purpose |
|---|---|---|
| Schema | `app/lib/schema-groups.ts` | `groups`, `group_members` (+ `groupMemberRole`/`groupMemberStatus` enums); re-exported from `schema.ts`. Cross-file FK uses `(): AnyPgColumn => …` thunks (cycle-safe, same as schema-votes). |
| Schema (host edits) | `app/lib/schema.ts` | `markets.groupId` (nullable FK — the audience-scope spine), `user.defaultGroupId`, `notifications.refGroupId`, 4 `notificationType` values (`group_motion_posted`/`_resolved`/`_mention`/`group_member_joined`). |
| Repo | `app/lib/groups/repo.ts` | All group DB access: create/membership/scoreboard/`getGroupMotionPicks` (reveal-gated)/`bumpGroupStats` (active-only)/slug+code gen (`node:crypto`). |
| Service | `app/lib/groups/service.ts` | createGroup (auto-home first group), joinGroup (idempotent, restores `left`), leaveGroup (owner auto-handoff → else archive), removeMember, getGroupForMember (membership gate). |
| Motions | `app/lib/groups/motions.ts` | `createGroupMotion` (any member, auto-publish) + **separate `resolveGroupMotion`** (owner/admin, sandboxed — bumps only group_members). |
| מליאה | `app/lib/groups/discussion.ts` | `postGroupAwareComment` — wraps comment insert + `@handle` mention emit in one tx (group markets only). |
| Schemas | `app/lib/groups/schemas.ts` | Zod input schemas (define-and-import). |
| Actions | `app/actions/groups.ts` | create/join/leave/setHomeGroup + createGroupMotion/resolveGroupMotion actions (session + rate-limit + Hebrew errors). `app/actions/comments.ts` routes through postGroupAwareComment. |
| Routes | `app/g/page.tsx` (my groups), `app/g/new`, `app/g/[slug]` (home), `app/g/[slug]/new` (motion form), `app/g/join/[code]` (invite preview), `app/g/by-id/[id]/route.ts` (id→slug resolver) | RSC-first; motion detail reuses `/market/[id]` (membership-gated). |
| Components | `components/groups/{group-switcher,group-create-form,group-motion-form,group-action-bar,join-group-button}.tsx` | Client; forms mirror suggest-market-form (useState/useTransition, no RHF). |
| Skeletons | `components/skeletons/groups-skeleton.tsx` (+ stories) | GroupsList / GroupHome / GroupForm. |
| Migration | `drizzle/0030_groups_coalition.sql` + `scripts/apply-groups-migration.ts` | Additive; applied to prod via the guarded runner (prod is the single DB). |

## Invariants (do not break)

1. **Sandbox.** Group motions resolve via `resolveGroupMotion` ONLY — it bumps `group_members.groupWins/groupResolved` and emits `group_motion_resolved`, and touches NOTHING global. The global `resolveMarket`/`voidMarket`/`deleteMarket` reject a market with `groupId` (would bump global stats/cards/seasons).
2. **Feed isolation.** EVERY global market read filters `isNull(markets.groupId)` — `listOpenMarkets`, `listUnpredictedOpenMarkets`, `getMarketOfTheDay`, `listManageableMarkets`, `searchMarkets`, `getMarketsForPolitician`, `listMarketsClosingSoon`, `getUserPredictions`, `bets.listUnseenResolvedPredictions`, `seasons.getSeasonCorrect`. (The global leaderboard needs no filter — it ranks `user.totalWins`, kept group-free by invariant 1.)
3. **Membership gate.** All group reads/writes require an `active` membership; a group `/market/[id]` 404s non-members; resolution requires owner|admin.
4. **Reveal gate.** Others' picks + the crowd split + the deck shares are hidden until the viewer has predicted (or the motion settled). `getGroupMotionPicks` enforces it server-side; the market page also feeds the deck a zero-count market until revealed.
5. **Active-only stats/picks.** A departed member's counters freeze (bumpGroupStats filters `status='active'`) and their pick is hidden (`getGroupMotionPicks` joins active membership).

## Gotchas

- **Bind Dates via drizzle operators (`gte`/`gt`), never a raw `sql\`… ${date}\``** — postgres-js under next-dev/Turbopack fails the `instanceof Date` realm check (PGLite + production build tolerate it, so tests pass but dev/QA breaks).
- **`markets.groupId` is the only thing that makes a market a "motion"** — there's no separate table; group motions are markets.
- **Default-group landing** lives in `proxy.ts` (bare `/` → `/g/by-id/<defaultGroupId>`, loop-guarded, `?view=general` escapes); writing `defaultGroupId` requires `refreshSession()` + `revalidatePath("/","layout")`.
- **Tests** are PGLite (`app/lib/groups/*.test.ts`); run from inside the worktree. The sandbox + feed-isolation + reveal + active-only behaviors all have regression tests.
