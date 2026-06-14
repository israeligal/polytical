# Decision Log — Groups / קואליציה

> Newest on top. Entries are immutable: supersede, don't edit. Spec: `docs/superpowers/specs/2026-06-14-groups-coalitions-design.md` · Plan: `docs/superpowers/plans/2026-06-14-groups-coalition-plan.md`. Branch `feat/groups-coalition`.

---

## 2026-06-14 — Migration 0029 carries ONLY the groups delta (committed snapshot was stale)

**Decision.** `drizzle-kit generate` re-emitted the entire bills feature (bill_documents/bill_statuses + 9 bills columns) because the committed `drizzle/meta` was missing the `0024` and `0028` snapshots, so it diffed against `0027`. The generated `0029_groups_coalition.sql` was hand-trimmed to contain ONLY the group tables/enums/columns (which `0028` does not create), so replaying `0028→0029` doesn't double-create bill tables. The regenerated `0029_snapshot.json` IS the correct full schema, so future `generate` is clean again. **Applying 0029 to the shared prod DB is deferred to a supervised deploy** (HARD GATE) — additive (new tables + nullable cols + enum values), so safe, but prod already has the bills tables via `db:push`, so a non-trimmed migration would have failed there.

**Rejected.** Committing the auto-generated migration as-is (would fail PGLite replay on the duplicate `CREATE TABLE bill_documents`).

## 2026-06-14 — Sandbox: a SEPARATE resolve path, group reads filtered everywhere

**Decision.** Group motions are markets carrying `markets.groupId`. They are resolved by a dedicated `resolveGroupMotion` (NOT `resolveMarket`) that bumps only `group_members.groupWins/groupResolved` and emits `group_motion_resolved` — it never calls `bumpUserStats`, card progress, or seasons. Symmetrically, **every global market read filters `isNull(markets.groupId)`** — the 10 sites: `listOpenMarkets`, `listUnpredictedOpenMarkets`, `getMarketOfTheDay`, `listManageableMarkets` (admin queue), `searchMarkets`, `getMarketsForPolitician`, `listMarketsClosingSoon`, `getUserPredictions`, `bets.listUnseenResolvedPredictions`, `seasons.getSeasonCorrect`. The global `getLeaderboard` needs no filter — it ranks `users.totalWins`, which the sandbox already keeps group-free. A PGLite test asserts both directions (group resolve leaves all global stats at 0; group markets never appear in global reads).

**Why.** Group motions are auto-published and self-resolved (no source review) — letting them touch the global accuracy record/cards/seasons would corrupt the only real score in the app. The integrity backbone is protected by these two invariants, so group resolution is explicitly NOT held to the global cited-source bar.

**Rejected.** Branching `resolveMarket` on `groupId` (one function doing two unrelated settlements); filtering the leaderboard (unnecessary given the sandbox).

## 2026-06-14 — Membership model: auto-publish motions, owner-resolve, reveal-gated picks

**Decision.** Any active member posts a הצעה — it goes live immediately (no approval; per-(user,group) daily cap). Only the owner/admin resolves. A member sees others' picks (`getGroupMotionPicks`) and the crowd split only **after locking their own pick** (or once settled) — prevents copy-the-leader. `makePrediction` rejects non-members on a group market. Invite is a single rotatable `groups.inviteCode` (no per-invite table); joining auto-reactivates a `left` row (frozen counters restored), and a departing **owner** auto-promotes the longest-tenured admin→member, or deletes (archives) the group if sole member.

**Rejected.** Admin/owner approval queue for motions (kills the social immediacy the user wanted); wiping a leaver's counters (loses record on rejoin); a separate `group_invites` table (YAGNI for v1).

## 2026-06-14 — Naming: UI קואליציה, DB `groups`; default-group landing via the proxy

**Decision.** The Hebrew UI label is **קואליציה**, but DB names are neutral (`groups`/`group_members`) to avoid colliding with the political `factions` table AND the existing `coalition` *market category* (`lib/categories`). A member's `user.defaultGroupId` (auto-set to their FIRST group, changeable) drives a **proxy-level** landing redirect: bare `/` → `/g/by-id/<id>` (resolves the slug), loop-guarded (fires only on exactly `/`, `?view=general` escapes), with `refreshSession()` after any write so the cookie isn't stale (the cookieCache-loop class of bug). Slugs are short opaque `node:crypto` base64url codes (Hebrew can't go in a URL; no `nanoid` dependency). מליאה = the existing flat comments system, rebranded, with new `@handle` mention parsing that notifies fellow members + the motion author (group markets only).

**Rejected.** Reusing קואליציה as a DB name; resolving the landing in an RSC (cookieCache redirect loop); a persisted "active group" beyond `defaultGroupId`; RHF for the forms (not a dependency — forms use `useState`/`useTransition` like `suggest-market-form`).
