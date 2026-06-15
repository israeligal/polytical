# Spec — Coalition as a global context (not a side page)

> Status: **DRAFT for review** · Author: Claude (autonomous, owner away) · Date: 2026-06-15
> Worktree/branch: `feat/coalition-global-context` · **No merge** — plan + spec + QA only.
> Supersedes the navigation model in `2026-06-14-groups-coalitions-design.md` (the data model & sandbox invariants stay). Decisions log to add on implement: `docs/decisions/coalition-global-context.md`.

---

## Problem Statement

Today a קואליציה (group) is a **destination**: the header switcher *navigates* to `/g/[slug]`, a dedicated two-column page that shows the coalition's הצעות לסדר on one side and a scoreboard/roster **aside**. To browse a coalition's forecasts a member leaves the normal app surfaces and lands in a parallel mini-app; the rest of the site (`/`, `/markets`, politician pages, search) only ever shows the national (ארצי) feed. This split means a coalition feels bolted-on rather than a lens on the same product, and the "forecasts on the side" layout duplicates the main feed's card UI in a worse form.

We want a coalition to be a **global context selector**: pick a coalition in the header and the *whole site* re-scopes its displayed forecasts to that coalition's motions — same pages, same card components, different backend scope. Picking ארצי returns to the national feed. No dedicated forecast page, no side panel.

## Goals

1. **One feed, scoped.** Selecting a coalition re-scopes the existing forecast surfaces (`/`, `/markets`, politician markets, search, "answer next" deck, closing-soon display) to that coalition's motions — with zero new card UI. ארצי = the national feed exactly as today.
2. **Sticky, app-wide context.** The active coalition persists across navigation and reloads (not per-URL), is reflected in the header switcher on every page, and is readable server-side by every scoped read.
3. **Kill the side page.** Remove the `/g/[slug]` two-column forecast/aside layout. Coalition *management* (create / join / invite / members / leave / stance-sharing) survives as a slim, non-forecast surface.
4. **Sandbox untouched.** Every P0 invariant in the `groups` skill holds: group motions still resolve via `resolveGroupMotion` into `group_members` only; seasons/cards/global-leaderboard never count coalition picks; the reveal gate and membership gate are unchanged.
5. **No regression to the national experience** for the ~all users with no coalition: anonymous and coalition-less users see today's behavior, byte-for-byte.

## Non-Goals

- **Unifying scoring.** Coalition predictions will *not* count toward global `totalWins`/seasons/cards. That breaks the sandbox invariant and has privacy implications — explicitly out of scope. (The scoreboard stays a separate `group_members` tally.)
- **Public/discoverable coalitions.** Still invite-only; selecting a coalition you don't belong to is impossible. No directory.
- **Cross-coalition aggregation / "all my coalitions" merged feed.** One active coalition at a time.
- **Redesigning the motion-creation or resolution flows.** The "+ העלו הצעה" form and `resolveGroupMotion` are reused as-is; only their entry point moves onto the scoped feed.
- **Mobile-specific new navigation.** The existing header switcher placement (next to the logo) is reused; we are not adding a bottom-nav coalition control in v1.

## User Stories

**Member (browsing):**
- As a coalition member, I want to pick my coalition in the header and have the home feed show *our* הצעות לסדר, so I don't have to go to a separate page.
- As a coalition member, I want the coalition to stay selected as I move between the feed, a politician page, and search, so the context is sticky.
- As a coalition member, I want to switch back to ארצי in one click and see the national feed, so I'm never trapped in a coalition.
- As a member viewing a coalition motion, I want the reveal gate to still hide others' picks until I predict, so the game integrity holds.

**Member (participating / managing):**
- As a member, I want to post a new motion *from the scoped feed* while my coalition is active, so creation lives where the forecasts are.
- As a member, I want to find the scoreboard, roster, invite link, and stance-sharing toggle on a dedicated *management* surface (not mixed into the forecast feed), so the feed stays clean.
- As an owner/admin, I want to resolve a coalition motion exactly as today.

**National / coalition-less user:**
- As a user with no coalition, I want the site to look and behave exactly as it does today (national feed, no coalition chrome beyond the "create/join" entry).

**Edge cases:**
- Active-coalition cookie points at a group I've **left / been removed from / that was deleted** → silently fall back to ארצי and clear the stale context (no 404, no trap). Mirrors the existing `defaultGroupId`-heal pattern.
- Anonymous user with a stray cookie → ignored; national feed.
- A coalition with **zero open motions** → the scoped feed shows the existing `EmptyState` ("עדיין אין הצעות לסדר…") with the create CTA, not a blank page.
- Deep-linking to a specific coalition motion `/market/[id]` for a non-member → still 404 (membership gate unchanged).

## Requirements

### Must-Have (P0)

**P0-1 — Active-coalition context (server-readable, sticky).**
A per-session "active coalition" identified by `groupId | null` (null = ארצי). Stored in an `HttpOnly` cookie set by a server action, defaulting on login to the user's `defaultGroupId`. Readable in RSCs/route handlers without a DB round-trip on the hot path.
- *AC:* Given a member selects coalition X, when they navigate to `/` then `/markets`, the active coalition is still X on both.
- *AC:* Given they select ארצי, when they reload any page, the feed is national.
- *AC:* Given the cookie names a group they're no longer an active member of, when any scoped page loads, it renders national and the cookie is cleared (no error).

**P0-2 — Switcher sets context instead of navigating.**
`GroupSwitcher` calls a `setActiveCoalition` server action (then refreshes the current route) rather than `<Link>`-ing to `/g/[slug]`. Active state derives from the context, not the path. "ארצי" clears the context. The "+ צרו/הצטרפו" entry remains.
- *AC:* Selecting a coalition does not change the URL path (stays on the current page) but the feed below re-scopes.
- *AC:* The switcher label shows the active coalition (or "ארצי") on every page.

**P0-3 — Scope-parameterized reads (single helper).**
Introduce one `coalitionScope(groupId: string | null)` predicate — `groupId ? eq(markets.groupId, groupId) : isNull(markets.groupId)` — and thread an explicit `groupScope` argument through the **display** read paths that should follow the active coalition. Surfaces that flip:
  - `listOpenMarkets`, `listUnpredictedOpenMarkets`, `getMarketOfTheDay` (feed + answer deck)
  - `getMarketsForPolitician` (politician page)
  - `searchMarkets` (search within the active coalition)
  - `getUserPredictions` (my predictions, scoped)
  - closing-soon **display** read (the page, not the cron)
- *AC:* With coalition X active, `/` and `/markets` return only `markets.groupId = X`; with ארצי active they return only `isNull(groupId)` — identical to today.
- *AC:* No read silently merges global + coalition rows.

**P0-4 — Sandbox & global-only surfaces stay global.**
These do **not** follow the active coalition and keep `isNull(markets.groupId)` hardcoded: `seasons/repo.ts` (sandbox), `listManageableMarkets` (admin), the closing-soon **cron** read, and the global leaderboard. Card/season progress is computed national-only regardless of active coalition.
- *AC:* With a coalition active, season/card progress UI reflects national picks only (or is hidden — see Open Questions), never coalition picks.
- *AC:* Admin market management lists never show coalition motions.

**P0-5 — Remove the `/g/[slug]` forecast/aside layout; keep management.**
Replace the two-column group home with a lean coalition **management** surface (scoreboard + roster + invite + stance-sharing + leave). The motions list moves to the scoped main feed. Decide management home: a `/g/[slug]` reduced to management-only, or a drawer from the switcher (see Open Questions). The motion-creation route (`/g/[slug]/new`) is reachable from the scoped feed's create CTA.
- *AC:* There is no longer a page that renders the coalition's motion cards beside a scoreboard.
- *AC:* Scoreboard, roster, invite code, stance-sharing toggle, and leave are all still reachable in ≤1 click from the switcher.

**P0-6 — Landing/proxy update.**
Replace the `/` → `/g/by-id/<defaultGroupId>` redirect with: `/` renders normally and reads the active-coalition context (seeded from `defaultGroupId` on first load post-login). The loop-guard and `?view=general` escape are removed/retired with the redirect they protected.
- *AC:* A member with a default coalition lands on `/` (national URL) but sees their coalition's feed because the context seeds from `defaultGroupId`; no redirect bounce.

**P0-7 — Sticky context carried by links/cards into detail pages.**
Opening a coalition motion from the scoped feed lands on `/market/[id]` which already membership-gates and reveal-gates correctly. The back-affordance returns to the scoped feed.
- *AC:* From X's scoped feed, tapping a motion → its market page (member-gated) → back returns to X's feed, still scoped.

### Nice-to-Have (P1)

- **P1-1** Visual "you're viewing coalition X" affordance on scoped surfaces (a slim banner/chip above the feed) so the scope is unmistakable, with a one-tap "חזרה לארצי".
- **P1-2** A lightweight scoreboard summary (top 3 + your rank) surfaced near the scoped feed header without reintroducing the full aside.
- **P1-3** Unread/own-motion counts on the switcher entries.

### Future Considerations (P2)

- **P2-1** Multiple-coalition quick-switch / recents in the switcher.
- **P2-2** Per-coalition notification preferences.
- **P2-3** Shareable scoped URL (`?coalition=slug`) as an *additive* override on top of the cookie, for deep-links — design the context read so a future URL param can take precedence without refactoring.

## Success Metrics

**Leading (days–weeks):**
- ≥ 60% of coalition members use the header switcher to enter a scoped feed within 2 weeks of ship (event: `coalition_context_set`).
- Coalition motion **view-through** (feed card → market page) rate ≥ the national feed's, confirming the inline feed is at least as usable as the old side page.
- 0 increase in `/market/[id]` 404s for members (membership gate regression guard).

**Lagging (weeks–months):**
- Motions posted per active coalition per week holds or rises vs. the `/g/[slug]` baseline (creation moving onto the feed shouldn't depress posting).
- Member retention in coalitions ≥ baseline.
- Support/feedback: no "I'm stuck in a coalition / can't get back to national" reports.

**Measurement:** PostHog events (`coalition_context_set`, `coalition_context_cleared`, existing motion/predict events tagged with `groupId`), evaluated at 1 week and 1 month.

## Open Questions

- **[design/owner]** Management surface home — keep a slimmed `/g/[slug]` (settings-style page) **or** a switcher-anchored drawer/sheet? *Recommendation: slimmed `/g/[slug]` page — least churn, deep-linkable, reuses membership gate.* (Non-blocking; plan assumes the slimmed page.)
- **[design/owner]** When a coalition is active, do season/card/streak surfaces **hide** or show **national** progress with a "coalition picks don't count" note? *Recommendation: show national with a one-line note; never silently imply coalition picks count.* (Blocking for the season/card components' copy.)
- **[product/owner]** Should the scoped feed's "+ הצעה לסדר" CTA post a **coalition motion** (current `/g/[slug]/new`) or offer a choice? *Recommendation: while a coalition is active, the CTA posts a coalition motion; ארצי keeps the existing national "suggest market" flow.* (Non-blocking.)
- **[eng]** Cookie vs. signed session field for the active coalition. *Recommendation: a dedicated `HttpOnly` cookie healed in the `setActiveCoalition` action + a membership re-check on read, mirroring the `defaultGroupId` cookie-cache heal pattern — avoids a session-write per switch.* (Non-blocking; plan assumes cookie.)
- **[eng]** Is `?view=general` referenced anywhere else (links, docs, tests) before we retire it? (Blocking the proxy change — audit in plan step 1.)

## Timeline Considerations

- **No hard deadline.** Owner is away; this is a plan/spec/QA pass with **no merge**.
- **Dependencies:** prod is the single DB (additive-only changes preferred). No new table is needed — the `markets.groupId` spine and `defaultGroupId`/cookie machinery already exist. If a `users` column or new cookie is added, it's additive and ships behind the same guarded-migration pattern.
- **Suggested phasing:**
  - **Phase A** — context primitive + switcher + scope-parameterized reads (P0-1,2,3,4,6,7) behind the existing surfaces; `/g/[slug]` temporarily still works.
  - **Phase B** — remove the `/g/[slug]` forecast/aside layout, land the management surface (P0-5), retire the proxy redirect & `?view=general`.
  - **Phase C** — P1 polish (scope banner, scoreboard summary).
