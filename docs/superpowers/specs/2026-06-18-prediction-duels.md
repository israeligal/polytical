# Prediction Duels (דו-קרב) — Spec / PRD

**Date:** 2026-06-18
**Status:** Draft (scoping) → needs the open questions resolved before an implementation plan
**Suggested branch:** `feat/prediction-duels`
**One-liner:** A head-to-head prediction challenge whose **shareable invite link is the user-acquisition vector** — tap a friend's link, predict to beat them, and signing up *is* accepting the challenge.

> Scope note: this is a **web feature on the existing Next.js / React PWA stack**. The
> "Unreal Engine MCP" framing from the original ask is a non-starter and explicitly out
> of scope — Unreal is a native 3D engine, irrelevant to a Hebrew-RTL web prediction app.

---

## Update 2026-06-18 — Pivot to the **single close bet** (supersedes "3–5 markets")

The duel is now built around **one bet, not a curated set**. Rationale: most real
markets resolve weeks out, so a multi-market duel can't deliver a timely payoff. Instead:

- **One link = one question.** You share a *single* market — ideally a **close one that
  resolves this week** — so "who was right?" lands fast.
- **One-to-many is the default.** You drop the link in a group; *everyone* picks a side on
  that one question; you all see who was right when it closes.
- **The link surface is a designed, motion-rich "arena"** — a head-to-head VS face-off, one
  giant question, two color-coded sides, a reveal moment. (Built — see
  `components/duel/` + the `Duel/*` Storybook stories.)
- **The global feed seeds it:** a per-market *"התערבו על זה עם חבר"* button + a *"דו-קרב
  מומלץ · נסגר השבוע"* suggestion card surfacing a close bet to challenge on.

Everything below still holds — just read "the duel's market(s)" as **one market**, and
"settle when all markets resolve" as **settle when that market resolves** (much sooner).
The accept-by deadline simplifies to that single market's `closeAt`.

---

## Problem Statement

Polytical's growth depends on word-of-mouth, but today there is **no in-product reason
for a user to pull a friend in**. The app is already a game (stake-less predictions,
accuracy scoring, cards, seasons, group scoreboards) — yet all of it is solo or
inside-the-walls. There is no artifact a user *wants* to share and no share that *requires*
the recipient to sign up. A head-to-head duel turns "I'm a better forecaster than you" —
a naturally social, brag-worthy claim — into a link that converts the recipient into a
predicting, signed-up user.

## Goals

1. **Acquisition via the invite itself.** A non-user who taps a duel link is led into a
   funnel where *making predictions to accept the challenge requires creating an account* —
   so the accept action and the signup are the same action.
2. **A shareable artifact at every stage** — an invite card (pre-accept), a reveal/
   comparison card (both players' picks), and a result card (who won) — each unfurling
   richly in WhatsApp (the dominant Israeli share channel) via OpenGraph images.
3. **Zero new prediction primitive.** A duel is a thin join over the **existing
   stake-less prediction engine** (`bets`, `unique(userId, marketId)`, UPSERT) and the
   existing market-resolution path — no parallel scoring system, no coins, no stakes.
4. **A measurable viral loop.** We can compute a K-factor (invites per challenger ×
   accept-conversion per invite) and attribute new signups to duel links.

## Non-Goals (YAGNI / explicitly out of scope)

- **Any money, stake, coin, or wager.** The coin economy was removed (`0017_remove_coins`,
  `docs/decisions/no-coins.md`). A duel is decided by **forecasting accuracy only**.
- **Unreal / 3D / native / a separate "arcade" game.** Out of scope, wrong tool, see note above.
- **Real-time live duel updates / a play-by-play feed.** A duel settles when its markets
  resolve (days–weeks out, like all markets). No websockets, no live ticker.
- **In-app trash-talk / chat between opponents.** Deferred (P2).
- **Tournaments / brackets / a global duel ladder.** Deferred (P2).
- **Group/coalition-scoped duels.** v1 duels are national/global scope to maximize reach;
  challenging a whole קואליציה is P1 (and must honor the groups sandbox invariants).

## How it works (the core loop)

1. **Create.** User A picks **3–5 currently-open markets** (e.g. while predicting) and
   taps *"אתגר חבר"*. A's predictions on those markets are their duel picks (normal `bets`
   rows). A gets a **challenge link** (unguessable token) + an auto-generated invite card.
2. **Share.** A shares the link to WhatsApp/social. The link unfurls with the invite OG
   card ("מנבא יותר טוב ממני? קבל את האתגר") — A's caricature, the topic, N markets,
   *but not A's actual picks*.
3. **Tap (the acquisition moment).** Recipient B opens the **public** `/duel/[token]`
   landing. To accept, B must make their own calls on the same markets → which requires an
   account → **auth (Google or email) → onboarding (pick `@handle`) → back to the duel**,
   threaded by `callbackUrl`. A logged-out tap therefore signs B up.
4. **Reveal.** Once B locks initial picks, **both players' picks are revealed side by
   side** — an instant comparison card, itself shareable (re-viralization). A's picks are
   hidden until this moment so B forms an independent opinion (and copying A can only tie,
   never beat — so the reveal is safe; see Fairness).
5. **Settle.** When all the duel's markets have resolved (voids excluded), standings are
   **derived live** from each player's correct count. Both get a notification + a **result
   card** ("ניצחתי 4:2 על @vera"). One link can be accepted by **many** people → A vs the
   whole group (a mini-leaderboard), which is the strongest viral shape.

## User Stories

**Challenger (existing user)**
- As a user, I want to challenge a friend on a handful of open markets so I can prove I'm
  the better forecaster.
- As a user, I want a ready-to-share invite (link + image) so I can drop it in a WhatsApp
  group in one tap.
- As a user, I want to be notified when someone accepts and when the duel settles, so I
  come back to see the result.
- As a user, I want **one link to be accepted by many people**, so a single share spawns
  several duels (me vs everyone) instead of one.

**Invitee (often a non-user — the acquisition target)**
- As someone who got a duel link, I want to see what the challenge is *before* committing,
  so I'm enticed to play.
- As a new user, I want accepting the challenge to *be* my signup (no separate "create
  account, then come back" detour), so the funnel is one continuous flow.
- As an invitee, I want to make my own predictions before I see the challenger's, so the
  contest is fair and my opinion is my own.

**Both**
- As a participant, I want a side-by-side reveal and a final result card I can share, so
  bragging (win) or rematching (loss) is one tap.

## Requirements

### Must-Have (P0)

**P0.1 — Create a challenge**
- A logged-in user selects **3–5 open markets** (all must be open and not closing
  imminently) and creates a challenge; their picks are upserted into `bets`.
- Produces an **unguessable token** (e.g. nanoid, *not* a sequential id — the URL is public).
- *Given* a market in the selected set is already closed/resolved, *then* it cannot be
  added to a new challenge.
- AC: challenge row + `challenge_markets` rows created atomically; challenger's `bets`
  exist for every market in the set; link returned.

**P0.2 — Public challenge landing (`/duel/[token]`)**
- Publicly readable (no auth) — it is a share page.
- Shows: challenger's `@handle` + caricature avatar (**never** `users.name`), the N market
  questions, an *accept-by* deadline, and an **accept CTA**.
- **Does not** reveal the challenger's picks to a viewer who has not yet locked their own.
- Has **dynamic OpenGraph + Twitter image** (`opengraph-image`) so the link unfurls in
  WhatsApp.
- AC: logged-out viewer sees the landing and a working CTA; challenger picks are absent
  from the payload until the viewer is a participant who has submitted.

**P0.3 — Accept = predict (= signup for non-users)**
- Accept CTA routes a logged-out user through `login?callbackUrl=…` → after auth, through
  onboarding (must have a `@handle`) → back to the duel's pick screen. A logged-in user
  goes straight to picks.
- Submitting picks upserts the participant's `bets` for the N markets and creates one
  `challenge_participants` row.
- *Given* the viewer is the challenger, *then* they cannot accept their own challenge.
- *Given* the **accept-by deadline** (= earliest `closeAt` among the markets) has passed,
  *then* the challenge can no longer be accepted (show an "expired" state) — because a fair
  duel requires both players to predict before each market closes.
- Accepting twice is **idempotent** (resume, don't duplicate).
- AC: a brand-new user can go link → Google/email → handle → picks → joined, in one flow;
  participant `bets` + participant row exist.

**P0.4 — Reveal**
- After a participant submits, the page reveals **both players' picks side by side** for
  the shared markets.
- AC: reveal renders only post-submit; both pick sets shown with outcome labels.

**P0.5 — Settle & standings (derived, no new writer)**
- Standings = each player's count of correct picks over the **resolved, non-void** subset
  of the duel's markets; higher count wins; equal = tie. Computed **read-only** from `bets`
  + `markets.winningOutcome` — there is **no** `resolveDuel` writer and duels do **not**
  separately mutate `totalWins`/`totalResolved` (global stats already update inside
  `resolveMarket`; a duel pick is just the user's normal pick on that market, so it can't
  double-count under the `unique(userId, marketId)` constraint).
- A challenge with many participants shows a **mini-leaderboard** (challenger vs each
  acceptor).
- AC: standings recompute correctly as markets resolve; voided markets are excluded;
  result is stable once all markets are terminal.

**P0.6 — Share artifacts**
- **Invite card** (OG image on the landing) and **result card** (OG image once settled),
  both Hebrew-RTL, using design tokens (OKLCH) + caricature avatars.
- Client share via **Web Share API** (`navigator.share`) with a copy-link fallback.
- AC: links unfurl with the correct image in WhatsApp; share/copy works on mobile PWA.

**P0.7 — Notifications**
- Reuse existing push/notification infra: notify the challenger on each accept; notify all
  participants when the challenge settles. (See `docs/decisions/push-notifications.md`.)

### Nice-to-Have (P1)

- **Reveal/comparison share card** as a distinct, polished artifact (separate from invite/result).
- **Rematch** button on a settled duel (one tap to re-challenge the same opponent on new markets).
- **Challenge a קואליציה / group** — a duel scoped to a group, honoring the groups
  **sandbox** invariants (`coalitionScope`, never touches global stats/cards/seasons; load
  the `groups` skill before building this).
- **Curated presets** ("השבוע הלוהט") so a challenger can one-tap a themed market set.

### Future Considerations (P2)

- Duel-specific **badges/stats** on the profile (duels won, win-streak vs friends).
- **Tournaments / brackets**, season-long duel ladders.
- In-duel **commentary / reactions**.

## Fairness & integrity invariants

- **Picks stay editable until each market closes** (the existing engine rule — no parallel
  lock system, per "no parallel state systems"). Settlement uses each player's *final* pick
  at close. The reveal is a snapshot with "picks can change until close."
- **Challenger picks are hidden until the invitee submits** their own. Revealing afterward
  is safe: to *win*, you must be more correct than your opponent — copying their pick only
  produces a tie, never a win. So no copy-to-beat exploit exists.
- **Accept-by deadline** = earliest `closeAt` in the set; no acceptance after it.
- **No self-accept; idempotent join; token is unguessable** (public URL → no enumeration).
- **Scope:** v1 challenges read national/global market data (`isNull` group scope).
  Group-scoped duels are P1 and must not leak the sandbox.

## Success Metrics

**Leading (days–weeks)**
- **Challenges created** / week; **share rate** (created → shared).
- **Invite CTR** — landing views per challenge link.
- **Accept→signup conversion** — % of logged-out landing viewers who complete signup +
  first picks. *This is the acquisition numerator.*
- **New signups attributed to duel links** (UTM/token attribution at account creation).

**The viral metric**
- **K-factor** = (avg invites effectively delivered per challenger) × (accept-conversion
  per invite). Target a directional K and a short viral cycle time; set a concrete target
  once we have a baseline of share behavior.

**Lagging (weeks–months)**
- **Retention of duel-acquired users** vs organically-acquired baseline (D7/D30).
- **Share of new signups** originating from duels.

## Architecture (grounded in the current stack)

### Data model (new tables; declare all indexes in-schema — `db:push` drops migration-only ones)
- `challenges`: `id`, `token` (unique, unguessable), `challengerUserId` (FK user),
  `createdAt`, optional `title`. *(Accept-by deadline is derived from the markets, not stored.)*
- `challenge_markets`: `challengeId`, `marketId` (the 3–5 markets).
- `challenge_participants`: `challengeId`, `userId`, `joinedAt`; `unique(challengeId, userId)`.
- Migration: single prod DB, no dev DB (project memory) — declare in `app/lib/schema.ts`,
  apply via the guarded one-off runner / `drizzle-kit push` per the Neon/Drizzle rules.
- **Picks reuse `bets`** — no new prediction store. Standings are derived from `bets` +
  `markets.winningOutcome`.

### Layers (Route → Service → Repository → DB; repos own DB access)
- `app/lib/duels/repo.ts` — create challenge, add participant, read challenge-with-markets,
  derive standings. User-scoped writes start with `requireUserId`. The **public landing
  read is token-scoped** (no user) and must *withhold challenger picks* until the viewer is
  a submitted participant.
- `app/lib/duels/service.ts` — validates markets are open + within deadline, enforces
  no-self-accept / idempotency, orchestrates pick upserts via the existing prediction
  service (reuse `makePrediction`, don't reimplement).
- `app/actions/duels.ts` — `createChallenge`, `acceptAndPredict` → `ActionResult`.

### Routes / surfaces
- `app/duel/[token]/page.tsx` — public landing (RSC); `opengraph-image.tsx` (+ result
  variant) via `ImageResponse`.
- `app/duels/page.tsx` — gated "my duels" list.
- Entry points: a *"אתגר חבר"* affordance on the market feed / a set of predictions / profile.

### Cross-cutting (must follow project rules)
- **Identity:** `@handle` + caricature avatar everywhere (reuse the `UserAvatar` component
  from the in-flight caricature work); never select/render `users.name`; coalesce null
  handle → `FALLBACK_HANDLE`.
- **RTL / tokens / Hebrew:** logical Tailwind props only, OKLCH tokens, all copy Hebrew,
  Asia/Jerusalem times.
- **Rate-limit** challenge creation + accept (per project rule).
- **Reads via RSC; mutations via Server Actions.** `redirect()` only in RSC/actions.

## Open Questions

1. **Markets per duel — exactly how many?** Recommend **3–5**, challenger-curated.
   *(product)*
2. **Pick-lock model** — recommend **editable-until-close + reveal-after-submit** (above).
   Confirm we're OK that picks aren't frozen at join. *(product)*
3. **1-to-many challenge** — recommend **yes** (one link, many acceptors, mini-leaderboard)
   as the core viral shape. Confirm vs strict 1:1. *(product)*
4. **Do duel picks counting toward global accuracy bother us?** They're real predictions
   and can't double-count (unique constraint), but confirm it's fine that duels feed the
   global leaderboard. *(product/data)*
5. **Hebrew-RTL in `ImageResponse`/satori** — ⚠️ **SPIKED 2026-06-18:** the route renders a
   valid 1200×630 PNG and a runtime-fetched Heebo font rasterizes, *but Satori has no
   bidi*, so Hebrew comes out letter-reversed (mirrored) — unusable. The image route was
   removed; the WhatsApp unfurl falls back to `generateMetadata`'s og:title/description
   (correct Hebrew, since clients do their own bidi). **To do it right:** bundle a local
   Hebrew font (no runtime Google fetch) + run text through a Unicode-bidi reorder
   (`bidi-js`) into visual order before passing to Satori. Deferred to a focused task. *(eng)*
6. **Attribution** — how do we tag a signup as duel-originated (token in `callbackUrl` →
   persisted on the user / an analytics event at account creation)? *(eng/data)*
7. **Onboarding interruption** — accept flow must survive auth → handle-pick → return.
   Verify `callbackUrl` threads cleanly through onboarding without losing the duel token.
   *(eng)*

## Timeline / phasing

- **Phase 1 (P0):** create → public landing + invite OG → accept=signup=predict → reveal →
  derived standings → settle + result OG → notifications. Ships the full viral loop.
- **Phase 2 (P1):** rematch, comparison card polish, group/coalition duels (sandbox-safe),
  curated presets.
- **Phase 3 (P2):** duel badges/stats, tournaments, in-duel reactions.

Dependency: the shared **`UserAvatar`/caricature** work (`feat/user-caricature-avatar`)
makes the share cards land better — duels can ship with the handle-initial fallback if
that isn't merged yet, but the avatars are what make the invite cards compelling.
