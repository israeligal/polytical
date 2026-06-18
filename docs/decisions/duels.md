# Decision Log — Prediction Duels (דו-קרב)

> Newest on top. Entries are immutable historical records: supersede, don't edit.
> Spec: `docs/superpowers/specs/2026-06-18-prediction-duels.md`. Plan:
> `docs/superpowers/plans/2026-06-18-prediction-duels-p1.md`.

---

## 2026-06-18 — Rematch + feed suggestion card (one shared "duelable markets" read)

Make *creating* a duel discoverable + give the resolved result a real rematch path —
**no new migration, no analytics** (per the PRD's privacy-light stance).

- **One shared read** powers both surfaces: `listDuelableMarkets` (repo — open +
  `isNull(groupId)` + closeAt within 7d, `desc(hot), asc(closeAt)`, limit, exclude;
  a trim of `listMarketsClosingSoon` minus the cron-only `closingSoonNotifiedAt`
  filter) → `getSuggestedDuelMarkets` (feed — reuses the `MarketCardData` view-model).
- **`useChallengeShare` hook** — extracted the mint-and-copy logic; shared by
  `ChallengeMarketButton` + the new wired `DuelSuggestionLive`. (Copies the link
  rather than `navigator.share` — minting awaits a server action, consuming the
  click's user-activation.)
- **Feed placement:** the suggestion card sits above the home grid, **logged-in +
  national scope only** (duels are global; don't surface inside a coalition view,
  and an anon can't mint).
- **Rematch:** the resolved arena shows close-this-week suggestion cards
  (`DuelResolution.suggestedMarkets`, fetched by the `/duel/[token]` page **only
  when logged-in**); the old dead re-share CTA became "שתפו את התוצאה" (the result
  link is still viewable — good for bragging).
- **Code-review fixes:** rematch picker gated to logged-in (no anon dead-end CTA +
  skips the fetch); `disabled`/`pending` threaded into the suggestion card (no
  double-mint); page fetches `limit:2` to match what renders. Caricature avatars in
  standings are deferred (the column lives on the unmerged caricature branch —
  initials fallback is correct here).

**Verified:** 23 PGlite tests (3 new for the reads); typecheck/lint/build green;
SSR-confirmed the rematch picker + suggestion card render end-to-end with a real
close-market candidate (throwaway, since cleaned up). NOTE: visual screenshots
were blocked this session by a claude-in-chrome OAuth/account mismatch — Storybook
(`ResolvedWin` carries the picker) + SSR + tests are the coverage.

---

## 2026-06-18 — Settlement notifications + resolved-arena result state (migration 0034)

When a duel's market resolves, players get a **head-to-head result** notice and `/duel/[token]`
shows a real **result state**.

- **Decoupled from the P0 resolver (altitude).** `resolveMarket`'s transaction is NOT touched.
  A separate best-effort `notifyDuelSettlements({marketId, winningOutcomeId})` runs *after*
  `resolveMarket` returns, called from the admin resolve action (`admin-markets.ts`), wrapped
  in try/catch — a notification failure can never undo a committed settlement (mirrors how
  `dispatchPush` is already post-commit best-effort). Push inside it is also best-effort so a
  VAPID/push hiccup can't lose the in-app rows.
- **Result semantics = head-to-head.** A participant *won* iff participant-correct AND
  challenger-wrong; *lost* iff reverse; *tie* otherwise. The challenger is framed vs the field
  (won iff correct). A challenger who joins their OWN duel is **not** recorded as a participant
  (`joinDuel` skips it; `getParticipants` excludes them defensively) — avoids a duplicate
  standings row + a contradictory second notice.
- **Schema (migration 0034, additive):** `notification_type += duel_settled` +
  `notifications.refChallengeId`. Reuses the existing per-feature `ref*` pattern; the
  notification links via `refChallengeId` → a new `/duel/by-id/[id]` route → `/duel/[token]`
  (mirrors `refGroupId` → `/g/by-id/[id]`). Applied to prod via the guarded runner.
- **A duel player also still gets the generic `bet_won`/`market_resolved`** (they're a
  predictor) — accepted minor redundancy; the `duel_settled` is the richer, linked one.
- **Resolved arena UI** (Motion + design): `DuelArenaProps.resolution` drives a result state —
  winning outcome crowned on its button, a verdict banner (🏆 win celebration via SparkBurst,
  reduced-motion-safe, transform-only so it shows even if rAF is throttled), and a standings
  leaderboard (✓/✗, winners on top) with a rematch CTA. The `/duel/[token]` page computes
  `resolution` from `markets.resolvedOutcomeId` + the derived standings.

**Verified:** 20 PGlite tests (incl. notifyDuelSettlements won/tie/lost + challenger-self-join
regressions); typecheck/lint/build green; migration 0034 applied to prod; live browser-QA of a
throwaway resolved duel — result state (verdict/crown/standings/rematch) + the `duel_settled`
feed item + feed→`/duel/by-id`→result navigation all confirmed (`.browser-qa/` duel-challenge
journey). Code-review fixes: challenger self-join + settlement N+1.

---

## 2026-06-18 — P1 persistence: challenges + participants (migration 0033)

Duels move from a stateless URL token to a **persisted** model so we can track
who joined (multi-participant standings) and later notify on settlement.

- **Two tables (`schema-duels.ts`, re-exported, own domain file like groups/votes):**
  `challenges` (opaque 128-bit `token`, `challengerUserId`, `marketId`) +
  `challenge_participants` (composite PK `(challengeId, userId)`, idempotent join).
  Migration `0033_mute_nighthawk` is **additive only** (CREATE TABLE/INDEX, FK
  constraints), applied to the single prod DB via a guarded one-off runner
  (`scripts/apply-duels-migration.ts`, idempotent "already exists" skip, no
  `assertNonProductionDb` — mirrors `apply-groups-migration.ts`).
- **No new prediction store, no scoring writer.** A duel pick IS a normal `bets`
  upsert via `makePrediction` (so global accuracy stats and the
  `unique(userId, marketId)` invariant are unchanged, and a duel pick can't
  double-count). The challenger's pick + all standings are **DERIVED** from
  `bets` vs `markets.resolvedOutcomeId` — never duplicated on the challenge row
  (picks change until close). No coins (`no-coins.md` still holds).
- **`getChallengeByToken` is a PUBLIC token-scoped read** (the share landing).
  It returns only public fields — the challenger's `@handle` (coalesced to
  `FALLBACK_HANDLE`), never `users.name`. User-scoped writes (`createChallenge`,
  `recordParticipant`) guard with `requireUserId`.
- **`createChallenge` rejects non-open markets** (`MarketClosedError`) and group
  motions (`NotDuelableMarketError`) — no dead share links, and the groups
  sandbox stays intact (a group `markets.groupId` is never shareable as a duel).
- **`joinDuel` = `makePrediction` + idempotent `recordParticipant`**, two writes
  not one tx (makePrediction owns its tx; recordParticipant `onConflictDoNothing`).
  A mid-failure leaves the pick recorded and a re-accept reconciles. Accepted as
  a self-healing transient trade-off rather than nesting transactions.
- **Token: 128-bit `node:crypto` random, NO retry loop** (collision not realistic;
  the `unique()` is the backstop). Differs from the groups slug (short, human-ish,
  retried).

### UI / rendering decisions
- **`onPick` throws on a failed `joinDuelAction` `{ok:false}`** so the arena
  reverts the optimistic reveal + shows the error — a returned (non-thrown)
  failure would otherwise leave a false "המנדט שלך נרשם!".
- **Market-page challenge button copies the link, doesn't `navigator.share`** —
  minting awaits a server action, which consumes the click's user-activation, so
  the native sheet would be blocked. The duel page's reveal CTA shares
  synchronously, so it uses the sheet.
- **Entrances are transform-only (no `opacity:0` gate)** so content stays visible
  if rAF is throttled (backgrounded share-link tab). See `[[motion-entrance-raf-throttle]]`.
- **OG unfurl image: Satori has no bidi** → `bidi-js` reorders each string to
  visual order, wrapped + reordered **per line** (whole-string reorder + Satori
  wrap flips RTL line order). Heebo fetched + subset at request time. See
  `[[satori-og-hebrew-bidi]]`.
- `loading.tsx` imports `DuelArenaSkeleton` from `components/skeletons/`, sharing
  `DUEL_ARENA_SHELL` (containers.ts) with the arena root — per the skeleton rule.

### Deferred (NOT in P1)
- **Settlement notifications** (notify participants when the market resolves) —
  touches the P0 `resolveMarket` transaction; its own follow-up.
- Accept-time push notification to the challenger.
- Bundle the OG Hebrew font locally (drop the runtime Google Fonts fetch).
- A focused-browser pass for the full interactive reveal *animation* (the
  automated QA tab is occluded → rAF frozen; render + revealed-on-mount verified).

**Verified:** `pnpm typecheck`, `pnpm lint`, `pnpm build` green; 14 PGlite
integration tests; migration 0033 applied to prod (`challenges`,
`challenge_participants` confirmed present); live browser-QA of the persisted
create→render→reveal loop (`.browser-qa/` duel-challenge journey, commit 085fdc2).

---

## 2026-06-18 — Single-bet pivot (supersedes the multi-market v0 spec)

The duel is built around **one bet, not a curated set**. Most markets resolve
weeks out, so a multi-market duel can't deliver a timely "who was right?". One
link = one question (ideally a close one), one-to-many (everyone picks a side on
that question). The link surface is a designed, motion-rich head-to-head arena.
v0 shipped stateless (token encodes market + challenger + pick); P1 (above)
persisted it.
