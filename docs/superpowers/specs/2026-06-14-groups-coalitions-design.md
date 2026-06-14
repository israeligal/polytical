# Groups / קואליציה — private prediction clubs

> Design doc — converged from brainstorming on 2026-06-14. Status: **ready for /create-plan**.
> Net-new social layer (no friends/groups/membership exists today). Builds on the existing
> markets, predictions (`bets`), leaderboard, comments, and notifications stacks.

## One-liner

A **group** (UI label **קואליציה**; DB name `groups`) is a private, invite-only prediction club. Each
group is a **self-contained arena**: its own הצעות לסדר (auto-published by members), its own
**scoreboard** (ranked on those motions only, fully sandboxed from global stats), and its own
**מליאה** discussion. Members can belong to many groups, see each other's picks (after locking their
own), and set a group as their **default landing**. "General view" is the existing global app, one
toggle away.

## Decisions (locked)

| Axis | Decision |
| --- | --- |
| **Naming** | DB `groups` / `group_members` (avoids colliding with political `factions`); Hebrew UI = קואליציה. |
| **Shared "votes"** | **Predictions first** (phase 1). Knesset-vote **stances** sharing is **phase 2** (opt-in, for discussion, needs a privacy carve-out — see §9). |
| **Scoreboard scope** | **Group's own הצעות only** — a separate `group_members` win/loss tally, **all-time cumulative**, never resets. |
| **Sandbox** | Group motions **never** touch global `totalWins`/`totalResolved`, card unlocks, or seasons. Mirror: global feeds/leaderboard/admin queue exclude group markets. |
| **Membership** | **Invite link/code, auto-join, any member can share.** A user can be in **many** groups. |
| **Who posts motions** | **Any member.** Motions **auto-publish** (no approval gate). |
| **Who resolves** | **Group owner/admin** marks the winning outcome (drives the board). |
| **Pick reveal** | A member sees friends' picks **after locking their own** (always after close). |
| **מליאה** | **Threads on each הצעה** — extends/rebrands the existing `comments` system, on both group motions and general markets. |
| **Notifications** | All four: new motion posted · motion resolved (your result) · @-mention in מליאה · new member joined / invited. |
| **Creating groups** | **Anyone, with soft caps** (see §11). |
| **Invite preview** | Non-members opening an invite link see a **lightweight preview** (name, member count, recent motions) + Join. |
| **Active group** | **URL-driven** (`/g/[slug]`) + an **optional persisted `user.defaultGroupId`** for the login landing. |
| **On leave/removal** | **Freeze history, drop from active board** (`group_members.status = 'left'`, counters retained; rejoin restores). |
| **Group cadence** | **All-time** only (no rounds/seasons in v1). |
| **Group URL** | **Short random opaque slug** (`/g/x7k2qa`); the Hebrew name is display-only. |
| **Owner leaves** | **Auto-promote** longest-tenured admin → else longest-tenured member → else archive the group. |
| **מליאה mentions** | **`@handle` autocomplete picker**; notify the mentioned member **and** the motion author. |
| **Auto-home** | Creating/joining your **first** group auto-sets `user.defaultGroupId` (changeable/clearable later). |
| **Switcher / landing** | Switcher in `SiteHeader`; login redirect lives in `proxy.ts` (loop-guarded, `?view=general` escape). |

## Concepts & surfaces

- **Group home** `/g/[slug]` (members only): scoreboard · motions feed · roster · invite (any member).
- **General view** (`/`, `/markets`, `/votes`): unchanged, now filtered to `groupId IS NULL`.
- **Switcher** in `SiteHeader`: `כללי | <group A> | <group B> | + צור/הצטרף` — pure navigation.
- **Motion detail** reuses **`/market/[id]`** (predict UI + מליאה already live there), membership-gated when `market.groupId` is set.

## Why this is partly wiring, partly net-new

**Reuse (unchanged or thin extension):**
- **Predictions** ride on `bets` (`schema.ts:338`, `unique(userId, marketId)`) untouched — a group motion is a `market` row, so picks just work.
- **Motion detail / predict / crowd-split** reuse `/market/[id]`, `makePrediction`, `getOutcomeCounts`.
- **מליאה** extends the flat `comments` system (`comments` table `schema.ts:358`, `app/lib/comments/*`, `components/comments/*`) — keyed by `marketId`, so it already attaches to group motions. Rebrand the label; gate visibility via the (gated) market page.
- **Notifications** extend cleanly: add enum values → `NotificationEvent` union → `composeNotification` case → emit in-tx (`app/lib/notifications/*`). Web-push + mute auto-support.

**Net-new (the real work):**
1. The entire membership model (`groups`, `group_members`, invite/join, roles, switcher).
2. A **separate, sandboxed scoreboard** on `group_members` (not a filter of `getLeaderboard`).
3. **Audience scoping on markets** — a nullable `markets.groupId` + a `groupId IS NULL` filter across every global feed/queue, and a membership gate on group market detail.
4. A **member-driven create + owner-resolve** motion flow that bypasses the admin suggestion/approval path.
5. The **pick-reveal gate** and the **friends'-picks** read model.
6. Lightweight **@-mention parsing** (comments are flat — no reply/mention today).

## Data model

New file **`app/lib/schema-groups.ts`**, re-exported from `schema.ts` (mirror the `schema-votes.ts`
split; use `() => users.id` FK thunks to avoid import cycles; declare ALL indexes in-schema —
`db:push` drops migration-only indexes).

```ts
// app/lib/schema-groups.ts
export const groupMemberRole = pgEnum("group_member_role", ["owner", "admin", "member"]);
export const groupMemberStatus = pgEnum("group_member_status", ["active", "left"]);

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),            // short url-safe id for /g/[slug] (NOT Hebrew)
  nameHe: text("nameHe").notNull(),
  descriptionHe: text("descriptionHe"),
  emblem: text("emblem"),                            // emoji or token; cosmetic
  colorToken: text("colorToken"),                    // OKLCH design-token name, never hex
  ownerId: text("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  inviteCode: text("inviteCode").notNull().unique(), // rotatable; powers /g/join/[code]
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("groupId").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: groupMemberRole("role").notNull().default("member"),
    status: groupMemberStatus("status").notNull().default("active"),
    groupWins: integer("groupWins").notNull().default(0),       // sandboxed tally
    groupResolved: integer("groupResolved").notNull().default(0),
    joinedAt: timestamp("joinedAt").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),            // one row per pair; rejoin restores
    index("group_members_board_idx").on(t.groupId, t.groupWins), // scoreboard ranking scan
    index("group_members_user_idx").on(t.userId),               // "my groups" / switcher
  ],
);
```

**Column additions to existing tables (`schema.ts`):**

```ts
// markets: the audience-scope spine. NULL = global; set = group-only.
groupId: uuid("groupId").references(() => groups.id, { onDelete: "cascade" }),  // nullable
// index markets by (groupId, status, createdAt) for the group feed.

// user: optional persisted login landing.
defaultGroupId: uuid("defaultGroupId").references(() => groups.id, { onDelete: "set null" }), // nullable

// notifications: display-only ref (mirrors refMarketId/refBetId/refSuggestionId, no FK).
refGroupId: uuid("refGroupId"),
```

**Notification enum additions (`notificationType`, `schema.ts:411`):**
`group_motion_posted` · `group_motion_resolved` · `group_mention` · `group_member_joined`.

**No separate `group_invites` table in v1** — a single rotatable `groups.inviteCode` covers link+code
(YAGNI; per-invite tokens/expiry and join-requests are phase-2 candidates).

**New error classes (`app/lib/errors.ts`):** `GroupNotFoundError`, `NotGroupMemberError`,
`InsufficientGroupRoleError`, `AlreadyMemberError`, `InvalidInviteCodeError`, `GroupCapError`.
Reuse `AlreadyResolvedError` for motion resolution.

## Architecture (Route → Service → Repository → DB)

New domain dir **`app/lib/groups/`** (`repo.ts`, `service.ts`), `app/actions/groups.ts`, and group
motion logic folded into `app/lib/markets/` (a group market is still a market). `requireUserId` is the
first thing in every repo where-clause; every group read is membership-gated.

- **`groups/repo.ts`** — `createGroup`, `getGroupBySlug`, `getGroupByInviteCode`, `addMember`,
  `setMemberStatus`, `setMemberRole`, `getMembership({groupId, userId})`, `listMyGroups({userId})`
  (active memberships, for the switcher), `getGroupScoreboard({groupId})` (rank active members by
  `groupWins` → accuracy → `joinedAt`), `bumpGroupStats({tx, groupId, userId, correct})`,
  `rotateInviteCode`, `getGroupPreview({inviteCode})`, `countOwnedGroups`/`countJoinedGroups`/`countMembers` (caps).
- **`groups/service.ts`** — orchestration + validation + caps + rate-limits + role checks.
- **`markets/repo.ts`** — every global list/feed/search/admin-queue query gains **`WHERE groupId IS NULL`**;
  add `listGroupMarkets({groupId, ...})` and `getGroupMotionPicks({groupId, marketId, viewerId})` (gated reveal).
- **`markets/service.ts`** — `createGroupMotion` (member-gated, direct market insert, no approval) and
  `resolveGroupMotion` (owner/admin-gated, sandboxed tx — see §6). `makePrediction` gains a membership
  check when `market.groupId` is set.

## Key flows

### 1. Create group
`createGroupAction` (auth) → `createGroup`: check soft caps (§11) → generate a **random url-safe `slug`**
(retry on the rare unique collision) + `inviteCode` → insert `groups` + an `owner` `group_members` row in
one tx → **auto-home** (set `user.defaultGroupId` if null) → redirect `/g/[slug]`.

### 2. Join via invite
`/g/join/[code]` (RSC) renders the **preview** from `getGroupPreview({inviteCode})` (name, member
count, a few recent motions) + a Join button. `joinGroupAction` → `addMember` (idempotent;
`status='active'`; rejoin flips a `left` row back to `active`, restoring frozen counters) → check
"joined" cap → **auto-home** (set `user.defaultGroupId` if null — i.e. their first group) → redirect
`/g/[slug]`. Emits `group_member_joined` to existing members.

### 3. Post a motion (any member, auto-publish)
`createGroupMotionAction` (membership-gated, rate-limited like suggestions ~10/24h/group) →
`createGroupMotion`: validate (reuse suggestion validators: questionHe length, optional `personId`
exists, outcomes/binary, `closeAt` future) → insert a `markets` row `{groupId, status:'open',
createdBy:userId, outcomes, personIds → market_politicians}`. **No `market_suggestions` row, no admin.**
Emits `group_motion_posted` to all active members.

### 4. Predict + reveal
Members predict via existing `makePrediction` (`bets`). On the group motion detail (`/market/[id]`,
membership-gated): the **friends' picks** list and the **group crowd-split** (`getOutcomeCounts` for
that market) are **hidden until the viewer has locked a pick or the motion has closed**
(`getGroupMotionPicks` enforces this server-side).

### 5. Resolve (owner/admin, sandboxed) — the keystone
`resolveGroupMotionAction` (role-gated: owner|admin) → `resolveGroupMotion` in **one tx**:
- guard terminal state (`AlreadyResolvedError`); set `markets.status='resolved'` + winning outcome (+ optional source note);
- for **each** predictor on the motion (`bets WHERE marketId`): `bumpGroupStats` → `groupResolved += 1`, `groupWins += 1` if correct;
- emit `group_motion_resolved` per predictor (body encodes their result).
- **Never** calls `bumpUserStats`, card progress, or season logic. (One authoritative writer · idempotent · terminal.)

### 6. Scoreboard
`getGroupScoreboard({groupId})` ranks **active** members by `groupWins → accuracy → joinedAt`. A
separate table from `getLeaderboard`, so there is **no dual-rank-consistency problem** and the global
leaderboard stays purely global.

### 7. מליאה
Reuse `comments` (keyed by `marketId`) on group motions; rebrand the UI label to **מליאה**. Visibility
is inherited from the (membership-gated) market page. The comment composer gets an **`@handle`
autocomplete picker** sourced from the group roster; on submit, `postComment` resolves mentioned
handles (unique on `user`) and emits **`group_mention`** to each, **plus** notifies the motion's author
(`createdBy`) of new activity. Nested replies stay out of v1 (comments are flat); "reply" is surfaced
via mention.

### 8. Default view & switcher
- `SiteHeader` renders the switcher from `listMyGroups({userId})`; links to `/g/[slug]` and `/` (general).
- **Auto-home:** creating a group, or joining your **first** group, auto-sets `user.defaultGroupId` (only
  when it's currently null — never overrides an existing choice).
- **Login landing:** redirect lives in `proxy.ts` (already the onboarding gate). After onboarding, if
  `user.defaultGroupId` is set and the request is for `/`, redirect to that group — **loop-guarded** (only
  rewrites bare `/`, and a `?view=general` query escapes it). A "הפוך לבית שלי" / "חזרה לכללי" toggle on the
  group page sets/clears `defaultGroupId`. "Switch to general" = navigate to `/?view=general`.

### 9. Leave / remove / owner handoff / delete
- **Leave / remove:** `setMemberStatus(... 'left')` — counters frozen, dropped from the active board (§"On
  leave"); rejoin restores. Owner/admin can remove a member; anyone can remove themselves.
- **Owner leaves:** auto-promote the longest-tenured `admin`, else longest-tenured active `member`, then
  proceed with the leave. If the owner is the **sole** member, the group is **archived** (cascade).
- **Delete:** owner-only; cascades (`groups` FKs are `onDelete: cascade`, so `group_members` and group
  `markets`/`bets`/`comments` go with it). Any member whose `defaultGroupId` pointed here is reset to null
  (`onDelete: set null`) → they fall back to the general landing.

## Invariants

1. **Sandbox:** resolving a group motion writes **only** `group_members` counters + `group_motion_resolved`
   notifications. Global `totalWins`/`totalResolved`/cards/seasons are untouched.
2. **Feed isolation:** every global **market** read (home, `/markets`, search, hot-rail, admin resolve
   queue) filters `groupId IS NULL`; group reads filter `groupId = X`. The global `getLeaderboard` needs
   no filter — it ranks `user.totalWins`, which the sandbox (invariant 1) already keeps group-free.
3. **Membership gate:** all group reads/writes require an `active` membership; motion detail for a
   `groupId`-scoped market 404s/forbids non-members. Resolution requires `owner|admin`.
4. **Reveal gate:** others' picks/splits on an open group motion are invisible until the viewer has
   predicted (or it closed).
5. **Sourcing/trust:** group resolution may record an optional source note but is **not** held to the
   global cited-source bar (it's explicitly sandboxed and unreviewed). The global integrity backbone is
   protected by invariants 1–2.

## Privacy

- **Phase 1 shares predictions only** (`bets`) — no existing privacy restriction.
- **Knesset-vote stances (`user_stances`) remain fully private in v1** — "direction never leaves the DB,"
  ≥10-person k-anonymous aggregates only (Israel PPL Amendment 13, `schema-votes.ts:163`). Untouched.
- Group content is private to members; the only non-member surface is the deliberate invite **preview**.

## Phasing

**Phase 1 (this spec):** groups + membership (invite link/code, multi, auto-join, soft caps) · group
motions (member-posted auto-publish, owner-resolved, sandboxed) · group scoreboard · pick-reveal +
friends' picks · מליאה (rebranded comments + @-mentions) · feed isolation · default group + switcher ·
4 notification types · invite preview.

**Phase 2 (designed, out of v1 scope):**
- **Stance sharing for discussion** — opt-in/consent per member to reveal Knesset-vote *stances* inside a
  group (not scored). Requires a deliberate **`docs/decisions/groups-stances.md` carve-out** from the
  privacy invariant: consent flag, member-only visibility, k-anonymity floor waived only within a
  consenting private group.
- Group-wide מליאה feed (a "plenum wall"); periodic rounds/champions; join-requests + per-invite
  tokens/expiry; public/discoverable groups; richer co-admin tooling; group cards/insights.

## Out of scope (v1)

- No coins/payouts (removed app-wide; `docs/decisions/no-coins.md`).
- No global-stat/card/season contribution from group motions (sandboxed by decision).
- No nested comment threads, no scoreboard resets, no public group directory, no stance sharing.

## Soft caps & rate limits (§11)

- Max groups **owned** per user: ~10 · max groups **joined**: ~50 · max **members** per group: ~200
  (tune in service; throw `GroupCapError`).
- Motion creation: ~10/24h per (user, group) (DB-authoritative, mirror suggestions' daily cap).
- Comments/upvotes: existing limits (8/5min, 40/60s). Join/invite-rotate: in-memory rate-limit.

## Testing (PGlite, real transactions)

- **Sandbox (critical):** `resolveGroupMotion` bumps `group_members` counters **and leaves global
  `totalWins`/`totalResolved`/card_progress/season progress untouched**; idempotent + terminal.
- **Feed isolation:** group markets never appear in global feeds/leaderboard/admin queue; general
  markets never appear in a group feed.
- **Membership & roles:** non-member can't read a group or its motion detail; non-owner/admin can't
  resolve; `makePrediction` rejects non-members on group markets.
- **Join lifecycle:** auto-join is idempotent (`AlreadyMemberError`-free re-join), leave sets `left` +
  freezes counters, rejoin restores them and the active board.
- **Reveal gate:** friends' picks/split hidden until viewer predicts or motion closes.
- **Caps:** owned/joined/member caps and the motion daily cap enforced.
- **Scoreboard:** ranks active members by wins→accuracy→joinedAt; `left` members excluded.

## Resolved implementation decisions (nothing open)

1. **Slug** — short **random url-safe code** (e.g. base62, ~6 chars), uniqueness-checked on insert with retry. Hebrew `nameHe` is display-only; never in the URL.
2. **Login-landing redirect** — lives in **`proxy.ts`** (the existing onboarding gate). Loop-guarded: rewrites only bare `/` → `/g/[slug]` when `defaultGroupId` is set, and `?view=general` escapes. Healed in the proxy, never in an RSC (avoids the cookieCache redirect-loop class of bug).
3. **Switcher placement** — shared in **`SiteHeader`** (single source; `/` and `/markets` already duplicate hero/rail logic).
4. **@-mentions** — **autocomplete picker** sourced from the group roster; notify the **mentioned member(s) AND the motion author** (`group_mention`).
5. **Owner lifecycle** — owner leaving **auto-promotes** the longest-tenured `admin`, else the longest-tenured `member`, else (sole member) the group is **archived** (soft-delete/cascade). Group delete is owner-only and cascades (FKs already `onDelete: cascade`).
6. **Group market in `/market/[id]`** — when `market.groupId` is set, the page is membership-gated and hides global-only chrome (global-leaderboard nudges, card-unlock hints); the group crowd-split + friends'-picks block replaces the global split, behind the reveal gate.
7. **Auto-home** — `createGroup` and the **first** successful `joinGroup` set `user.defaultGroupId` **only when it is currently null** (never override an explicit later choice).

## Success metrics (for /write-spec → PRD framing)

- Activation: % of new groups with ≥3 active members and ≥1 resolved motion in week 1.
- Engagement: predictions/member/week and מליאה comments/motion inside groups vs general baseline.
- Virality: invite-link → join conversion (preview helps here); groups joined per active user.
- Retention: D7/D30 of users with a `defaultGroupId` set vs general-only users.
