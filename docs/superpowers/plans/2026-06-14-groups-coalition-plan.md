# Implementation Plan — Groups / קואליציה (phase 1)

> Plan for `docs/superpowers/specs/2026-06-14-groups-coalitions-design.md`.
> Branch `feat/groups-coalition` (worktree, off `origin/main` @ `a432c55`). Schema-first, vertical slices,
> PGLite test checkpoints. All product decisions are locked in the spec — **nothing open**.
> Grounded in the verification dossier (workflow `wf_ecb3844b`); every file:line below was read, not recalled.

## Naming decision (resolved, not open)
`קואליציה` is **already a market *category*** (`lib/categories.ts:3-10`, one of six). The group feature also
wants the label קואליציה. **Decision:** keep **קואליציה** as the group's UI label (per the user); DB names stay
neutral (`groups`/`group_members`); disambiguation is contextual — a *group* is a named entity you belong to
(lives under `/g/…`), the *category* is a topic filter-chip. No code conflation (different tables, different
surfaces). Logged in `docs/decisions/groups.md`.

---

## Reused data structures (DO NOT redefine — cite + reuse)

| Symbol | Path:line | Use |
| --- | --- | --- |
| `ActionResult` | `app/actions/types.ts:3` | every action return |
| `AppDb`, `sqlExcluded`, `BATCH`, `chunk` | `app/lib/db-utils.ts:15-33` | repo db handle + helpers |
| `requireUserId`, error classes | `app/lib/errors.ts:1-57` | scope guard; new group errors go here, same no-arg shape |
| `checkRateLimit`, `__resetRateLimits` | `app/lib/rate-limit.ts:16-40` | `{key,max,windowMs}`; key `"<action>:${userId}"` |
| `getSession`/`refreshSession`/`Session` | `lib/auth.ts:90-105` | `session.user` + additionalFields (`:54-61`) |
| `NotificationEvent` union | `app/lib/notifications/service.ts:18-27` | add 4 variants (forces `composeNotification` cases `:29-76` + `EVENT_PRIORITY` `app/lib/push/payload.ts:38-45`) |
| `NewNotification`/`NotificationType` | `app/lib/notifications/repo.ts:22-32` | **add `refGroupId`** (currently market/bet/suggestion only) |
| `composeNotification`/`emitNotifications` | `service.ts:29-93` | both require a `Tx` |
| `CommentView` | `app/lib/comments/repo.ts:27-37` | comment render |
| `marketStatus` enum, outcomes jsonb `$type` | `app/lib/schema.ts:286`, suggestions `:384-404` | reuse outcome shape for group motions |
| `CATEGORIES`/`Category`/`categoryLabel` | `lib/categories.ts:1-16` | reuse (do NOT add a group "category") |
| suggestion validators + bounds + `validateOutcomes` + `BINARY_OUTCOMES` | `app/lib/suggestions/service.ts:35-90,51-54` | reuse for group-motion input validation |
| `getLeaderboard` ranking + `accuracyExpr` | `app/lib/leaderboard/repo.ts:39-85` | adapt over `group_members` columns |
| `createMarket` | `app/lib/markets/repo.ts:557-581` | add `groupId` param; reuse for motion mint |
| `getSeasonCorrect` | `app/lib/seasons/repo.ts:54-82` | pure read; sandbox must filter `isNull(groupId)` |
| suggest-form pattern (`useState`+`useTransition`, `FIELD`/`LABEL`, `useHydrated`+`nowLocalInput`, local→UTC) | `components/suggest-market-form.tsx:19-21,115` | template for group forms (**no RHF**) |

---

## Verified third-party signatures

Versions: `drizzle-orm@^0.45.2`, `zod@4.4.3`, `next@16.2.6`, `@types/node@^20`. **NOT installed: `react-hook-form`, `@hookform/resolvers`, `nanoid`.**

- **Drizzle** (`pg-core/*.d.ts`): `pgTable(name, cols, (t)=>[...])` (array form; object form deprecated, `table.d.ts:27-60`); `pgEnum`; `uuid().defaultRandom()` (`columns/uuid.d.ts:14-27`); `.notNull()`, `.default(value|sql)` (`column-builder.d.ts:186-188`), `.references(()=>col,{onDelete})` (`columns/common.d.ts:43`, `ReferenceConfig:11-17`), `.unique()` (`:44-46`); `index/uniqueIndex(name).on(...).where(SQL)` partial (`indexes.d.ts`); `primaryKey({columns:[...]})` (`primary-keys.d.ts:4-12`). Operators: `eq/and/inArray/isNull/desc/count/sql` (`conditions.d.ts:27,63,169-171,206`, `aggregate.d.ts:17`). In-repo patterns to copy: FK thunk `schema-votes.ts:177`; composite PK `schema.ts:464-468`; partial index `schema-votes.ts:73`; unique index `schema.ts:341-352`.
- **Zod 4.4.3**: `import { z } from "zod"`, define-and-import, `z.infer` (see `zod-4` skill). No inline schemas.
- **Next 16.2.6**: `redirect(url)` from `next/navigation` (RSC/Action only, `redirect.d.ts:16-18`); `revalidatePath(path,'layout'|'page')` from `next/cache` (`revalidate.d.ts:28`); `notFound()` from `next/navigation`.
- **Slug/invite code**: nanoid NOT installed → use `node:crypto` `randomBytes(n).toString('base64url')` (`@types/node/crypto.d.ts:1972-1973`) or `randomUUID()` (`:3642`). No existing slug helper — create one in `app/lib/groups/`.
- **Forms**: RHF NOT in tree → use the project's `useState`+`useTransition` pattern; server-side Zod validation in the service.

---

## Test infrastructure (grounded)

- PGLite test DB gets its schema by **replaying committed `./drizzle/*.sql`** via `migrate(db,{migrationsFolder:"./drizzle"})` (`app/lib/testing/create-test-db.ts:14`). **New tables are invisible to tests until migration `0029` SQL is committed.** No hand-DDL file to maintain (unlike the sibling-repo convention in the testing skill).
- Files that change when `schema-groups.ts` is added: `drizzle.config.ts:7` (add to `schema[]`), `app/lib/schema.ts` (`export * from "./schema-groups"` after `:532`), and the generated `drizzle/0029_*.sql` + `meta/0029_snapshot.json` + `meta/_journal.json`. `create-test-db.ts` and `vitest.config.ts` need **no** change.
- Precedent for a 2nd schema file's tables being test-visible via the re-export: `app/lib/votes/pipeline.integration.test.ts:7-9`.
- Template test: `app/lib/bets/service.test.ts` — `beforeEach(createTestDb)`/`afterEach(h.close)`, only external mock `vi.mock("@/app/lib/push/service")` (`:6-8`), inline `seedUsers`/`seedMarket` via `h.db.insert().returning()`, services called as `{db:h.db,...}`, uniqueness assertion `:178-180`.
- **Run vitest from INSIDE the worktree** (`vitest.config.ts` excludes `**/.claude/**`). `*.test.ts`→node, `*.test.tsx`→dom. Timeouts 30000 (migration replay per file).
- **Fixtures: none needed** (no external API). Write inline `seedGroup()`/`seedSandbox()` in the test files.

---

## Convention compliance (vs CLAUDE.md)

- **Layering** Route→Action→Service→Repo→DB: new `app/g/*` routes → `app/actions/groups.ts` → `app/lib/groups/service.ts` → `app/lib/groups/repo.ts`. Repos own all DB.
- **`requireUserId` first** in every user-scoped repo fn; **RORO**; **named exports**; **no inline types/Zod** (define in `app/lib/groups/schemas.ts`, derive with `z.infer`); **no `as any`**, literal unions.
- **<500-line ceiling — FLAGS:** `schema.ts` is **532** (already over) → only add the re-export + `markets.groupId` + `user.defaultGroupId` + 4 enum values + `notifications.refGroupId`; all tables in `schema-groups.ts`. `markets/repo.ts` is **702** → only the in-place `isNull` edits + `createMarket` param; group reads live in `groups/repo.ts`. Prefer new files over extending `suggestions/service.ts` (287) / `suggest-market-form.tsx` (333).
- **RTL/logical Tailwind** (`ms/me`,`ps/pe`,`text-start/end`,`rounded-s/e`,`border-s/e`), **OKLCH tokens only** (new color → CSS var in `globals.css` first), Hebrew copy, **Asia/Jerusalem** times (UTC store, local display; `datetime-local`→`toISOString()` at submit).
- **Errors over fallbacks**; **declare all indexes in-schema** (db:push drops migration-only indexes); **`assertNonProductionDb()`** first line of any one-off script.
- **Loading states**: each new route gets `loading.tsx` importing a named skeleton from `components/skeletons/` (shared container classes via `containers.ts`).

---

## Milestones

### M0 — Worktree prep & baseline  ⛳ gate
- [ ] `pnpm install` in the worktree (it has **no** node_modules yet).
- [ ] Baseline green from inside the worktree: `pnpm lint`, typecheck, `pnpm test` (once, not watch). Record counts. **Do NOT `pnpm build` while a `next dev` runs in this checkout** (shared `.next/` wedges).

### M1 — Schema, enums, errors, migration (foundation)  ⛳ HARD GATE (migration)
- [ ] **NEW `app/lib/schema-groups.ts`** — import `{ users }` from `./schema` via FK thunks. Tables:
  - `groupMemberRole` enum `["owner","admin","member"]`; `groupMemberStatus` enum `["active","left"]`.
  - `groups`: `id uuid pk defaultRandom`, `slug text unique`, `nameHe`, `descriptionHe?`, `emblem?`, `colorToken?`, `ownerId text →users.id cascade`, `inviteCode text unique`, `createdAt`.
  - `group_members`: `groupId →groups.id cascade`, `userId →users.id cascade`, `role`, `status`, `groupWins int default 0`, `groupResolved int default 0`, `joinedAt`; `primaryKey({columns:[groupId,userId]})`; `index(groupId, groupWins)` (board), `index(userId)` (switcher). All indexes in-schema.
- [ ] **EDIT `app/lib/schema.ts`**: (a) `export * from "./schema-groups";` after `:532`; (b) `markets.groupId uuid →groups.id cascade` **nullable** + `index(groupId, status, createdAt)`; (c) `user.defaultGroupId uuid →groups.id onDelete:set null` **nullable**; (d) add `group_motion_posted`,`group_motion_resolved`,`group_mention`,`group_member_joined` to `notificationType` (`:414-421`); (e) `notifications.refGroupId uuid` (display-only, no FK).
- [ ] **EDIT `app/lib/notifications/repo.ts`** `NewNotification` (`:24-32`) — add optional `refGroupId`.
- [ ] **EDIT `lib/auth.ts`** additionalFields (`:54-61`) — add `defaultGroupId` so it surfaces on `session.user`.
- [ ] **EDIT `drizzle.config.ts:7`** — append `"./app/lib/schema-groups.ts"`.
- [ ] **NEW errors** in `app/lib/errors.ts`: `GroupNotFoundError`, `NotGroupMemberError`, `InsufficientGroupRoleError`, `AlreadyMemberError`, `InvalidInviteCodeError`, `GroupCapError` (mirror existing no-arg classes).
- [ ] **Migration `0029`**: generate via `pnpm drizzle-kit generate` in an **interactive terminal** (needs a TTY — run with `!` in the session). All changes are **additive/safe** (nullable cols + new tables + enum values), so no destructive prompt. Commit `drizzle/0029_*.sql` + snapshot + journal. Apply to the **shared prod DB** via a **guarded one-off runner** (`assertNonProductionDb()` first line — note it does NOT catch the Neon host, so double-check the target) OR `db:push` then reconcile. (See Risks.)
- [ ] **Test checkpoint:** an integration test that inserts a `group` + `group_member` and reads them back — proves migration `0029` replays into PGLite and the re-export makes the tables importable from `@/app/lib/schema`.

### M2 — Groups domain: create / join / leave / membership
- [ ] **NEW `app/lib/groups/schemas.ts`** (Zod) — `createGroupInput` (nameHe length, optional descriptionHe/emblem/colorToken), derive types with `z.infer`.
- [ ] **NEW `app/lib/groups/repo.ts`** — `createGroup`, `getGroupBySlug`, `getGroupById`, `getGroupByInviteCode`, `getMembership({groupId,userId})`, `addMember`, `setMemberStatus`, `setMemberRole`, `listMembers`, `listMyGroups({userId})` (active only), `countOwnedGroups`/`countJoinedGroups`/`countMembers`, `rotateInviteCode`, `getGroupPreview({inviteCode})`, `generateUniqueSlug`/`generateInviteCode` (`node:crypto` base64url, retry on unique collision). `requireUserId` first; RORO; tx-aware.
- [ ] **NEW `app/lib/groups/service.ts`** — `createGroup` (soft caps → slug/code gen → tx: insert group + owner member → **auto-home if `defaultGroupId` null**), `joinGroup` (caps → `addMember` idempotent; rejoin flips `left`→`active` restoring frozen counters → **auto-home if first group**), `leaveGroup`/`removeMember` (`setMemberStatus 'left'`; **owner leaving → auto-promote longest-tenured admin → else member → else archive group**), `promoteMember`. Caps: owned ≤10, joined ≤50, members ≤200 → `GroupCapError`.
- [ ] **NEW `app/actions/groups.ts`** — `createGroupAction`, `joinGroupAction`, `leaveGroupAction` (copy `suggestMarketAction` skeleton `app/actions/suggestions.ts:55-111`: session gate → `checkRateLimit` → service → error→Hebrew → `revalidatePath` → `ActionResult`). Actions writing `defaultGroupId` call **`await refreshSession()` then `revalidatePath("/","layout")`** (mirror `app/actions/onboarding.ts:80-109`) to avoid the cookie-cache loop. Owner-only actions re-check role server-side.
- [ ] **Test checkpoint (TDD):** create→owner row + auto-home set; join idempotent, caps enforced, rejoin restores counters, auto-home only when `defaultGroupId` null; owner-leave promotes next-in-line / archives when sole; membership uniqueness (composite PK violation).

### M3 — Group motions + audience scoping (the sandbox spine)  ⛳ CRITICAL
- [ ] **EDIT `app/lib/markets/repo.ts`**: add `groupId?: string|null` to `createMarket` (`:557-600`). Add **`isNull(markets.groupId)`** to **all 10 global market-read sites** (blanket rule: global reads exclude group markets):
  - 6 list/feed: `listOpenMarkets` (`:337`, both ternary branches), `listUnpredictedOpenMarkets` (`:373-382`), `getMarketOfTheDay` (`:405`), `listManageableMarkets` admin queue (`:424`), `searchMarkets` (`:694-699`), `getMarketsForPolitician` (`:660`).
  - 4 sandbox-critical: `listMarketsClosingSoon` (`:278-285`), `getUserPredictions` (`:551`), `app/lib/bets/repo.ts` `listUnseenResolvedPredictions` (`:41-46`), `app/lib/seasons/repo.ts` `getSeasonCorrect` (`:72-80`). All four get `isNull(markets.groupId)`.
- [ ] **NEW group reads in `app/lib/groups/repo.ts`** (keep `markets/repo.ts` lean): `listGroupMarkets({groupId,status?,cat?})`, `getGroupMotionPicks({groupId,marketId,viewerId})` (reveal-gated: returns members' picks only if viewer has a bet on this market OR market closed), `getGroupScoreboard({groupId})` (join `group_members`→`users`, rank by `groupWins → accuracy(groupWins/groupResolved) → joinedAt`, **active only**), `bumpGroupStats({tx,groupId,userId,correct})`.
- [ ] **EDIT `app/lib/markets/service.ts`** `makePrediction` (`:34-55`) — after `getMarketForUpdate` lock, if `market.groupId` and requester not an active member → throw `NotGroupMemberError`.
- [ ] **`createGroupMotion`** (in `groups/service.ts`) — member-gated; validate via reused suggestion validators (`validateOutcomes`, length bounds) + future `closeAt`; call `createMarket({groupId, status:"open", createdBy:userId, outcomes, personIds})`; emit `group_motion_posted`. Rate-limit ~10/24h per (user,group) (DB-authoritative, mirror `countSuggestionsSince`).
- [ ] **`resolveGroupMotion`** (in `groups/service.ts`) — **owner/admin only**; one tx: guard terminal (`AlreadyResolvedError`) → set `markets.status='resolved'` + winning outcome → for each predictor (`bets WHERE marketId`) `bumpGroupStats` → emit `group_motion_resolved`. **Never** calls `bumpUserStats`/cards/`getSeasonCorrect`. (Separate path from `resolveMarket` entirely.)
- [ ] **Test checkpoint (TDD, the keystone):**
  - **Feed isolation:** seed 1 global + 1 group market; assert all 10 global reads exclude the group one; `listGroupMarkets`/`getGroupScoreboard` include only group rows.
  - **Sandbox:** `resolveGroupMotion` bumps `group_members.groupWins/groupResolved` AND leaves `users.totalWins/totalResolved` unchanged, `card_progress` untouched, `getSeasonCorrect` unchanged.
  - **Membership guard:** non-member `makePrediction` on a group market throws.
  - **Reveal gate:** `getGroupMotionPicks` hides others' picks until viewer has a bet / market closed.

### M4 — Group notifications
- [ ] **EDIT `app/lib/notifications/service.ts`** — 4 new `NotificationEvent` variants + `composeNotification` cases (Hebrew titleHe/bodyHe, set `refGroupId`/`refMarketId`). **EDIT `app/lib/push/payload.ts:38-45`** `EVENT_PRIORITY` for the 4 new types (dedupe). Confirm `mutedPushTypes` auto-covers them (`push/service.ts`).
- [ ] **Emit sites:** `joinGroup`→`group_member_joined` (to existing members); `createGroupMotion`→`group_motion_posted` (to active members); `resolveGroupMotion`→`group_motion_resolved` (per predictor). All inside their txs via `emitNotifications`.
- [ ] **Test checkpoint:** each event composes the right title/body + `refGroupId`; muted types suppressed.

### M5 — מליאה (@mentions on comments)
- [ ] **EDIT `app/actions/comments.ts`** `postCommentAction` (`:9-26`) — wrap `insertComment` + `emitNotifications` in a `db.transaction` (comment path has none today), bind the returned `{id}`, parse `@handle` tokens → resolve to userIds (handle unique on `user`) → emit `group_mention` to each mentioned member **and** the motion author (`markets.createdBy`); fire-and-forget `dispatchPush` after commit.
- [ ] **EDIT `components/comments/comment-form.tsx`** — `@handle` autocomplete picker sourced from the group roster (group-market comments). On general markets: raw `@handle` parse, no picker (no roster source). **EDIT `comment-thread.tsx`** — rebrand the section heading to **מליאה** (the market page currently shows "דעות חמות" at `app/market/[id]/page.tsx:217-225`).
- [ ] **Test checkpoint:** posting `@handle` on a group motion emits `group_mention` to that user + the motion author, inside one tx (assert rows, not calls).

### M6 — Routes & UI surfaces
- [ ] **Routes** (`app/g/…`, RSC-first, read `getSession()` directly; reuse `category-rail.tsx` with `basePath`): `app/g/page.tsx` (my groups + create/join entry), `app/g/new/page.tsx` (create form), `app/g/[slug]/page.tsx` (group home: scoreboard + motions feed + roster + invite + "הפוך לבית שלי"/"חזרה לכללי" toggle + create-motion entry), `app/g/join/[code]/page.tsx` (preview + Join). Each with `loading.tsx` + named skeleton.
- [ ] **Motion detail = reuse `/market/[id]`** — **EDIT `app/market/[id]/page.tsx`**: when `market.groupId` set, gate membership (`notFound()` for non-members), hide global-only chrome (leaderboard nudges, card-unlock hints), render group split + friends'-picks (reveal-gated) instead of the global split, and the מליאה thread.
- [ ] **NEW components** (copy `suggest-market-form.tsx` pattern — `useState`+`useTransition`, `FIELD`/`LABEL`, `useHydrated`+`nowLocalInput`, local→UTC): `group-create-form.tsx`, `group-motion-form.tsx`, `group-scoreboard.tsx`, `group-switcher.tsx`, `group-roster.tsx`, `group-invite.tsx`, `friends-picks.tsx`.
- [ ] **EDIT `components/site-header.tsx`** (`:52-88`) + **`components/mobile-menu.tsx`** (`:26-34,102`) — add the group switcher (`כללי | <groups…> | + צור/הצטרף`), fed by `listMyGroups`.
- [ ] **EDIT `proxy.ts`** (`:46-68` onboarding-gate pattern) — default-group login redirect: bare `/` → `/g/[slug]` when `defaultGroupId` set; **loop-guarded** (exclude the destination, re-read with `disableCookieCache:true`, `?view=general` escape). Heal in the proxy, never an RSC.
- [ ] **Test checkpoint:** page-level stories for each new route (broken-link/CTA-href guards, per coverage map); component stories (`group-motion-form`, `group-scoreboard`, `group-switcher`) with play functions + a11y; switcher renders the user's groups.

### M7 — Decisions, docs, verify, review  ⛳ gate
- [ ] **`docs/decisions/groups.md`** (newest-on-top, immutable entries) — the sandbox model, the naming decision, owner-leave policy, the 10-site `isNull` rule.
- [ ] Refresh root/`app/lib` CLAUDE.md if the new `app/lib/groups` domain warrants a pointer.
- [ ] Refresh captured fixtures if any real shape differed (none expected); delete unused.
- [ ] Run **`/wrap-up`** if present (advisory gate → `/log-decisions`, `/evergreen-documentation`).
- [ ] From inside the worktree: `pnpm lint`, typecheck, `pnpm test` + `pnpm test:integration` green.
- [ ] **`/code-review`** before pushing; never `--no-verify`.

---

## Verification status

### Verified from source / docs
| Item | Citation |
| --- | --- |
| 10 global market-read sites needing `isNull(groupId)` | dossier §1 + `markets/repo.ts:337,373,405,424,694,660,278; bets/repo.ts:41; seasons/repo.ts:72`; `getUserPredictions:551` |
| Sandbox: leaderboard/seasons driven only by `resolved` row + user-total bumps in `resolveMarket` | `markets/repo.ts:193-209`, `markets/service.ts:99-128`, `seasons/repo.ts:54-82` |
| Test DB = migrate-replay of `./drizzle/*.sql` | `app/lib/testing/create-test-db.ts:14` |
| Re-export makes 2nd-schema tables test-visible | `votes/pipeline.integration.test.ts:7-9` |
| Drizzle / Next / Zod signatures, no RHF/nanoid | dossier §3 (node_modules d.ts + package.json) |
| Reused types/helpers | dossier §2 (all path:line) |
| Auto-home + redirect cookie-cache pattern | `app/actions/onboarding.ts:80-109`, `proxy.ts:46-68` |

### NOT verified — needs live testing
| Item | How to verify | Owner |
| --- | --- | --- |
| **HARD GATE** Migration `0029` applies cleanly to the **shared prod DB** (additive) without a destructive prompt | run `drizzle-kit generate` in a TTY; inspect SQL; apply via guarded runner against a copy/with care; confirm tables + nullable cols | M1 |
| **HARD GATE** `0029` SQL replays in PGLite so integration tests see the tables | run the M1 checkpoint test inside the worktree | M1 |
| **HARD GATE** proxy default-group redirect does not loop with the real 5-min cookie cache | browser: set `defaultGroupId`, log in, confirm `/`→`/g/[slug]` once, `?view=general` escapes | M6 |
| `refreshSession()` surfaces `defaultGroupId` on `session.user` | after `createGroupAction`, read session in an RSC | M2 |
| Comment insert+emit tx + post-commit push ordering | integration test asserts comment row + notification row in one tx; push mocked | M5 |
| `@handle` autocomplete UX (roster source, RTL) | browser QA on a group motion | M6 |

---

## Risks / gotchas (carried from the dossier)
1. **`isNull(groupId)` completeness is the #1 correctness risk** — a missed site leaks group markets into global feeds/search/politician pages/seasons. The M3 feed-isolation test must cover all 10.
2. **Single shared prod DB, no dev DB** — `assertNonProductionDb()` does NOT catch the Neon host; `db:push` can offer a destructive truncate prompt. Additive changes here are safe, but apply via a guarded runner and commit the SQL so tests + prod agree.
3. **Migration-number collision** with parallel worktrees — regenerate `0029` number/snapshot/journal if another branch claims it on merge.
4. **`schema.ts` > 500 lines** — keep all tables in `schema-groups.ts`; only the listed minimal edits in `schema.ts`.
5. **cookieCache redirect-loop** — the proxy redirect must exclude its destination + re-read with `disableCookieCache:true`; the write action must `refreshSession()`.
6. **Worktree base** is clean off `origin/main`; the `feat/bill-pages` 42/23 drift does not affect this worktree, but final merge to main should be from a current main.
