# PRD — Prediction Duels (דו-קרב)

**Status:** v0 + P1 + P2 **shipped to a branch** (PR #107, `feat/prediction-duels`); pre-merge.
**Date:** 2026-06-18 · **Author:** PM (autonomous draft) · **Type:** Growth / engagement feature
**Engineering design:** `docs/superpowers/specs/2026-06-18-prediction-duels.md` · **Decisions:** `docs/decisions/duels.md`
**Note on assumptions:** the user asked me to decide everything — targets below are **hypotheses to calibrate post-launch**, not measured baselines, and the **analytics to measure them are not yet instrumented** (see Open Questions / Metrics).

---

## TL;DR
Turn "I'm a better forecaster than you" into a **shareable single-bet challenge link**. A friend opens a motion-rich head-to-head **זירה (arena)** on one political question; predicting to accept *is* the signup for a non-user. When the market resolves, both sides get a head-to-head **result** (who won) and a re-share hook. The product's first **built-in growth loop** and a re-engagement surface, built entirely on the existing stake-less prediction engine — no money, no new scoring primitive.

---

## Problem Statement
Polytical's growth depends on word-of-mouth, but the product has **no in-app reason for a user to pull a friend in** — every loop (predictions, accuracy, cards, seasons) is solo or inside-the-walls, and there is no artifact a user *wants* to share that also *requires* the recipient to sign up. Separately, **there is no moment of social payoff** when a market resolves — resolution is a quiet, solo "you were right." Duels solve both: a brag-worthy challenge that converts the recipient into a predicting, signed-up user, and a head-to-head result that pulls lapsed users back.

---

## Goals
1. **Acquisition via the share itself** — the invite is the growth vector: a non-user who taps a duel link signs up *by* making their predictions. *(Measure: new signups attributed to duel links; accept→signup conversion.)*
2. **A measurable viral loop** — challenges created → shared → accepted → re-shared, expressed as a K-factor we can track and tune.
3. **Re-engagement on settlement** — the head-to-head result notice brings players (esp. lapsed ones) back to see who won. *(Measure: notification → session rate.)*
4. **Zero new core risk** — reuse the stake-less `bets` engine + leave the P0 resolve path untouched; no money, no coins, no change to the accuracy invariants.

### Non-Goals
- **Any stake / coin / wager.** Decided in `no-coins.md`; a duel is decided by forecasting accuracy only.
- **A standalone arcade game / 3D / native** (the original "Unreal MCP" framing) — wrong tool; out of scope permanently.
- **Real-time live duel updates** — duels settle when the market resolves (days–weeks), no live ticker / websockets.
- **Group/coalition-scoped duels in v1** — duels are national/global scope to maximize reach; group duels are a P2 that must honor the groups sandbox.
- **Tournaments / brackets / a global duel ladder** — parking lot.

---

## Target users
- **The challenger** — an existing, engaged predictor who has an opinion and a competitive streak. The loop's *initiator*.
- **The invitee (acquisition target)** — a friend of the challenger, often **not yet a user**. Converting them is the whole point.
- **The lapsed player** — someone who joined a duel and drifted; the settlement notice is their re-entry.

---

## User Stories

**Challenger**
- As an opinionated predictor, I want to challenge a friend on a single close question so I can prove I'm the better forecaster.
- As a challenger, I want a one-tap shareable link (and a rich WhatsApp unfurl) so I can drop it in a group chat.
- As a challenger, I want **one link accepted by many friends** so a single share spawns a whole field, not one duel.
- As a challenger, I want to be told **who won** when the market resolves so I can come back and gloat / rematch.

**Invitee (often a non-user)**
- As someone who got a duel link, I want to see the challenge before committing so I'm enticed to play.
- As a new user, I want accepting the challenge to *be* my signup (no separate detour).
- As an invitee, I want to make my own call before seeing the challenger's, so the contest is fair.

**Both**
- As a player, when the market resolves I want a clear head-to-head result (won/lost/tie) with the standings, and a one-tap rematch.

---

## Requirements

### Must-Have (P0) — ✅ SHIPPED (PR #107)
- **P0.1 Create a single-bet challenge** ✅ — from a global, *open* market; mints an unguessable share token. *AC:* a closed/resolved/group market is rejected (no dead links / sandbox leak).
- **P0.2 Public arena landing `/duel/[token]`** ✅ — challenger `@handle` + caricature (never real name), the question, urgency, two color-coded sides; challenger's pick hidden until the viewer plays. Renders correctly in Hebrew RTL.
- **P0.3 Accept = predict (= signup for non-users)** ✅ — a logged-out tap routes through login → onboarding → back to the duel; the pick is a real `bets` upsert. Idempotent re-accept.
- **P0.4 Reveal** ✅ — after the viewer picks, both picks + the live crowd split are shown.
- **P0.5 One-to-many** ✅ — many people accept one link; each becomes a tracked participant (persisted, P1).
- **P0.6 Resolved result** ✅ (P2) — when the market resolves, the arena shows the winning answer crowned, a verdict banner with a win celebration, and a standings leaderboard.
- **P0.7 Result notification** ✅ (P2) — each player gets a head-to-head `duel_settled` notice (in-app + push) linking to the result.

### Nice-to-Have (P1)
- **Feed seeding** — a "🔥 דו-קרב מומלץ · נסגר השבוע" suggestion card surfacing a close bet to challenge on. *(Component built in v0; not yet placed on the global feed.)* *AC:* the feed shows ≥1 close-this-week duel suggestion to a logged-in user.
- **Rematch** — the result CTA pre-fills a new challenge vs the same opponent. *(CTA copy shipped; the rematch flow is not wired.)*
- **Richer share artifacts** — a post-resolution "result card" OG image (win/lose), distinct from the invite card.
- **Dedup the resolution notices** — suppress the generic `market_resolved`/`bet_won` for duel participants so they get only the richer `duel_settled`. *(Accepted redundancy today.)*

### Future Considerations (P2 — parking lot)
- **Group/coalition duels** (sandbox-safe), **tournaments/brackets**, a season-long duel ladder.
- **Duel badges/stats** on the profile (duels won, win-streak vs friends).
- **In-duel reactions / trash-talk.**
- **Local OG font + result-card OG image** (drop the runtime Google Fonts fetch).

---

## Success Signals (no analytics — by design)
**Polytical intentionally runs no product analytics** — PostHog is error-tracking only ([[posthog-errors-only]]), and that privacy-light stance is a product value, not a gap. We will **not** build a funnel-instrumentation pipeline or attribute signups to duel tokens. Success is judged **qualitatively + from data we already hold**, not from a measurement product:
- **Are duels being created + accepted?** Observable directly from the `challenges` / `challenge_participants` tables (a simple admin/DB read, not a tracking pipeline) — rows growing = the loop is alive.
- **Do challenges get multiple participants?** `challenge_participants` count per challenge = the one-to-many spread, read on demand.
- **Anecdotal / organic signal** — do people share duel links, do new users mention them, does the team see them in WhatsApp groups. Word-of-mouth is judged by word-of-mouth.

If we ever DO want numbers, they're a one-off SQL query over the existing tables — not a reason to instrument the client. Ship it, watch the tables, trust the qualitative read.

---

## Open Questions
- **[data — RESOLVED, no action]** ~~How do we instrument the funnel?~~ We don't. Per the product's privacy-light stance, no client analytics / no signup attribution is built — success is read qualitatively + from the existing `challenges` tables (see Success Signals). Closed.
- **[product]** Should duel participants stop receiving the generic `market_resolved`/`bet_won` and get only `duel_settled`? (Currently both fire — minor redundancy.)
- **[product/design]** Head-to-head result semantics confirmed? (Participant beats challenger iff participant-correct & challenger-wrong; tie if both same. Challenger framed vs the field.) Defaulted; easy to change.
- **[legal/privacy]** A duel link is **public** — anyone with the token sees the challenger's `@handle`, the question, and (post-accept) the standings `@handles`. `@handle` is already public, but this is a new public surface; confirm against the same carve-out flagged for groups ([[groups-coalition-feature]]).
- **[design]** Is the BYO-friction acceptable for the invite, or does the loop need the suggestion card (P1) on the feed to drive *creation*? (Creation is the top of the funnel; today there's no prominent entry point on the home feed.)
- **[eng]** OG result-card image needs the bundled-font + bidi work (the invite card already does the bidi reorder).

---

## Timeline / Phasing
- **v0 (stateless arena)** ✅ — the motion-rich `/duel/[token]` + feed hooks, no persistence.
- **P1 (persistence)** ✅ — `challenges` + `challenge_participants`, multi-participant standings (migration 0033).
- **P2 (settlement)** ✅ — `duel_settled` notifications + the resolved result state (migration 0034).
- **Next (P1 niceties):** place the suggestion card on the feed (drives *creation*, the funnel top); wire rematch; **instrument the funnel** (the real blocker for proving the goals).
- **Dependency:** the shared `UserAvatar`/caricature work makes the share + standings cards land better (handle-initial fallback works without it).

---

## Appendix — shipped status
| Capability | Status |
|---|---|
| Single-bet arena, share link, accept=signup, reveal | ✅ v0 |
| Persisted challenges + participants, standings | ✅ P1 (0033, prod) |
| Resolved result state + `duel_settled` notification | ✅ P2 (0034, prod) |
| WhatsApp unfurl OG image (bidi-correct Hebrew) | ✅ |
| Feed suggestion card on the home feed | ⬜ P1 (component exists, unplaced) |
| Rematch flow | ⬜ P1 |
| Funnel analytics / signup attribution | 🚫 **not building (privacy-light by design)** |
| Group duels, tournaments, duel badges | ⬜ P2 parking lot |

**Verification of shipped scope:** 20 PGlite integration tests; typecheck/lint/build green; migrations 0033 + 0034 applied to prod; live browser-QA of create→persist→resolve→notify→result (`.browser-qa/` `duel-challenge` journey, 8/9).
