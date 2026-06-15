# Coalition as a global context — decisions

> The קואליציה global-context redesign (branch `feat/coalition-global-context`).
> A coalition becomes a sticky, app-wide **scope** instead of a `/g/[slug]`
> destination. Newest on top. Entries immutable.
> Spec: `docs/superpowers/specs/2026-06-15-coalition-global-context-design.md` ·
> Plan: `docs/superpowers/plans/2026-06-15-coalition-global-context-plan.md`.

## 2026-06-15 — Coalition is a global lens, not a side page

**Decision.** Selecting a coalition in the header switcher sets an active-coalition
context that re-scopes the existing forecast surfaces (home feed, `/markets`,
politician markets, search, MOTD, answer-deck, "my pick" chips). It is NOT a
navigation to `/g/[slug]` anymore. ארצי clears the scope.

**Mechanism.** A single `coalitionScope({groupId})` predicate
(`app/lib/markets/scope.ts`): `groupId ? eq(markets.groupId, id) : isNull(...)`.
The display reads take an optional `groupScope` (default `null` = the prior
national behavior, byte-for-byte). The active coalition is an `HttpOnly` cookie
(`polytical_coalition`), read via `getActiveCoalition` / `resolveActiveCoalition`
(`app/lib/groups/context.ts`), set by `setActiveCoalitionAction`
(`app/actions/coalition.ts`).

**Cookie, not a session field.** Switching is cheap and frequent; a cookie avoids
a `refreshSession()` per switch. The read path re-checks membership and **heals**
a stale value (left / removed / deleted → national), so no write-side cleanup is
needed. An explicit `national` sentinel distinguishes "picked ארצי" from "not
chosen yet" (the latter seeds from the member's `defaultGroupId`).

**Which reads flip (6) vs stay national (4).** Flip: `listOpenMarkets`,
`listUnpredictedOpenMarkets`, `getMarketOfTheDay`, `getMarketsForPolitician`,
`searchMarkets`, `getUserPredictions`. Stay hard-coded `isNull` (the sandbox
invariant): `seasons.getSeasonCorrect`, `listManageableMarkets` (admin queue),
`listMarketsClosingSoon` (cron), and `bets.listUnseenResolvedPredictions` (the
global "your prediction resolved" deck — group resolutions notify via
`group_motion_resolved`, not this deck). **Coalition picks never count toward
global stats / cards / seasons — unchanged.**

**`/g/[slug]` → management-only.** Scoreboard + roster (@handle only) +
invite/leave + stance toggle, plus "צפו בתחזיות הקואליציה" (enter the scoped
feed) and "העלו הצעה". The motions feed + its aside were removed.

**`/g/by-id/[id]` kept, repurposed.** It no longer redirects to `/g/[slug]`; it
SETS the active-coalition context (membership-checked) and lands on the scoped
feed. Retained because notifications (`refGroupId`) and the motion's "חזרה
לקואליציה" back-link both depend on it. (Audit found these consumers — the plan's
original "retire by-id" was corrected.)

**Proxy landing retired.** The `/` → `/g/by-id/<defaultGroupId>` redirect and its
`?view=general` escape are gone; `/` stays `/` and the feed seeds its scope from
`defaultGroupId` via `getActiveCoalition`.

**Profile stays national.** The profile is an account view — its stats, season
board, and cards are all national. Its portfolio is left national (not scoped) to
stay consistent. The scoped `getUserPredictions` is exercised via feed
`getMyPickLabels` instead. When a coalition is active, a `CoalitionScopeNote` on
the profile season/collection and the politician card-unlock states that
coalition picks don't count globally.

**Deferred.** P1-2 scoreboard summary on the scoped feed — the management page's
full board is one tap away via the banner's "ניהול" link.
