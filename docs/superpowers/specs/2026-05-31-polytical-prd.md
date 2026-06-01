# Polytical — Product Requirements Document (PRD)

> **A play-money prediction market for Israeli politics, where every question is backed by an AI-generated caricature "card" of the politicians involved.** Bet virtual coins on what will happen and on what politicians will do, watch the crowd's odds move, and build a reputation as a forecaster.

| | |
|---|---|
| **Status** | Draft for review |
| **Date** | 2026-05-31 |
| **Owner** | Gal (gireddit@gmail.com) |
| **Scope of this doc** | v1 (MVP) requirements + the architecture/design decisions that bound it |
| **Stack** | Next.js 16 · React 19 · Tailwind v4 · Neon Postgres · Drizzle · Better Auth · Vercel Blob · Vercel |

---

## 1. Problem Statement

Israelis are intensely engaged with politics, but that engagement is scattered across endless arguing on X/WhatsApp/news comments with **no scoreboard** — no way to put your prediction on the line, see how the crowd actually leans, or find out who was *right* after the dust settles. Real prediction markets (Polymarket) are money-based, US-centric, English, and legally fraught in Israel. There is no fun, free, Hebrew-native place to forecast Israeli political events and politicians' decisions and be rewarded for being correct.

**Cost of not solving it:** the most engaged audience in the country has nowhere to channel that energy into something competitive, repeatable, and shareable — and the "who called it" bragging rights that drive political discourse stay anecdotal instead of measurable.

## 2. Goals

1. **Make forecasting Israeli politics fun and free.** A first-time visitor can place their first bet within 2 minutes, with zero money and minimal friction.
2. **Capture the Polymarket "moving odds" thrill** with play money — live, crowd-driven odds and real winner payouts — via simple, self-funding parimutuel pools.
3. **Build durable competition.** Players come back for the leaderboard, their accuracy/forecaster reputation, and the daily faucet — not just a one-time bet.
4. **Be the trustworthy, factual home for this.** Every politician fact and every market resolution is sourced from official Israeli government websites or curated newsletters, and cited.
5. **Make politicians the stars.** Each politician is a memorable, collectible AI-caricature card that gives context to every market and is inherently shareable.

## 3. Non-Goals (v1)

- **Real money / crypto / prizes.** Play money only. (Keeps us out of gambling regulation; revenue is explicitly out of scope for v1.)
- **Fully user-generated markets.** Users can *suggest*; only admins create and resolve. (Resolution integrity > content volume at launch.)
- **Collectible / fantasy-league card mechanics.** Cards are a rich profile layer in v1; game stats and drafting are a deliberate P2. (Avoids designing and balancing a second game.)
- **Native mobile apps.** Mobile-first web / installable PWA only. (Faster to ship; no app-store gatekeeping.)
- **Bilingual / English UI.** Hebrew, RTL-first. (Match the core audience; i18n doubles content + layout work.)
- **Automated/oracle resolution.** Humans resolve from cited sources in v1. (Israeli politics is too nuanced for an automated oracle.)

## 4. Target Users (Personas)

- **The Pundit (core player).** Political junkie who already argues online daily. Wants to stake a claim, see if the crowd agrees, and talk trash in the comments. Mobile, casual, frequent.
- **The Forecaster (competitive player).** Motivated by being *right*, not just rich. Cares about accuracy/calibration and the leaderboard. Drives quality and stickiness.
- **The Lurker.** Reads cards and odds for signal, rarely posts. Converts to player via low-friction betting and shareable cards.
- **The Editor / Admin (internal).** Curates politicians and markets, sources facts, resolves outcomes with evidence, moderates, and triages community suggestions.

## 5. User Stories

### Player (Pundit / Forecaster)
- As a visitor, I want to **sign in with Google or email and get a starting stack of coins**, so I can start betting immediately.
- As a player, I want to **browse a feed of open markets** and filter by topic, "hot," and "closing soon," so I can find something worth a bet.
- As a player, I want to **stake coins on an outcome and see how my potential payout moves with the crowd's odds**, so betting feels live and consequential.
- As a player, I want to **see the caricature card and facts of the politicians in a market**, so I have context (and a laugh) before I bet.
- As a player, I want to **see my open positions, history, balance, and rank** in one place, so I can track how I'm doing.
- As a forecaster, I want a **personal accuracy/prediction rating**, so my reputation reflects skill, not just luck or volume.
- As a player, I want to **claim a daily coin bonus**, so a cold streak never locks me out.
- As a player, I want to **comment and argue on each market**, so I can defend my call and read the takes.
- As a player, I want to **suggest a market**, so I can pitch the question everyone's actually arguing about.
- As a competitive player, I want a **global and friends leaderboard**, so I can see where I stand.

### Editor / Admin
- As an editor, I want to **create binary and multi-option markets** with a category, featured politicians, a close time, and a description, so the feed stays fresh and well-scoped.
- As an editor, I want to **resolve a market by selecting the winning outcome and attaching a cited source**, so payouts are fair and trustworthy.
- As an editor, I want to **void an ambiguous market and refund everyone**, so bad questions don't punish players.
- As an editor, I want to **manage politicians and generate their caricature cards**, so every market has the right faces and facts.
- As an editor, I want to **review the community-suggestion queue** (approve → becomes a market, or reject), so good ideas ship and noise doesn't.
- As an editor, I want to **hide reported comments**, so threads stay usable.

## 6. The Core Mechanic — Parimutuel Markets

A **market** is a question with 2+ mutually exclusive **outcomes** (usually `YES`/`NO`; sometimes multi-option, e.g. *"Who will be the next finance minister? [A/B/C/D]"*). Each outcome accumulates a **pool** = total coins staked on it.

- **Live odds (implied probability)** of an outcome = `outcome_pool ÷ total_pool`, displayed as a **%** that moves with every bet — the Polymarket "moving line."
- **Live potential payout** shown at bet time = `current_total_pool ÷ current_outcome_pool × stake` (indicative; final payout uses pools at close).
- **Resolution:** winners split the **entire pot** in proportion to their winning stake.
  `payout = total_pool × (your_winning_stake ÷ winning_pool)`.

**Worked example** — *"Will the Knesset pass the 2026 budget before the deadline?"*
Final pools at close: `YES 7,000 / NO 3,000` (total `10,000`). Closing odds: **YES 70% / NO 30%**. Outcome: **NO**.
You staked `300` on NO → `10,000 × (300 ÷ 3,000)` = **1,000 coins** (net **+700**; a 3.3× return for backing the underdog). YES bettors lose their stake.

This **rewards early conviction on the underdog**: getting onto the eventually-correct side while it's "cheap" yields the biggest slice of the pot — the fun part — with math that is self-funding and trivial to explain ("winners split the pot").

### Rules (v1)
- **Min bet:** 10 coins. **No max** in v1 (a per-market whale cap is a P1 tuning knob).
- **Adding to a position is allowed**; all of a user's stakes on the winning outcome count at resolution.
- **No early cash-out** in v1 — a bet is locked until resolution. ("Sell back to the pool at current odds" is P1.)
- **No house rake** — 100% of the pot goes to winners.
- **Markets close before the outcome is knowable** (admin-set `close_at`); no bets after close.
- **Voided markets** (ambiguous/cancelled) **refund every stake** in full.

### Market lifecycle
`draft → open → closed (betting over, awaiting reality) → resolved (winning outcome set, payouts distributed)` — or `→ voided (all stakes refunded)` from `closed`/`open`.

### Net worth & accuracy (leaderboard inputs)
- **Net worth** = `settled balance + coins currently staked in open markets (at cost)`. Placing a bet does **not** reduce net worth (coins are "in play"); resolution converts staked coins to payout or zero. *(Mark-to-market net worth at live odds is a P1 upgrade.)*
- **Accuracy (v1)** = `resolved markets where your net stake was on the winning outcome ÷ total resolved markets you participated in`, shown as a %. *(A calibrated Brier-style score is P1.)*

## 7. Information Architecture & Screens (mobile-first, RTL)

1. **Markets feed (home)** — scrollable market cards; filters: category (Elections, Coalition, Security, Legislation, Personnel, Scandals…), Hot, Closing soon, New, Resolved. Each card: question, live odds bar, total volume, close countdown, featured politician thumbnail(s).
2. **Market detail** — question + description, outcomes with live odds + potential payout, **bet input** (amount + outcome), pool/volume stats, featured **politician card(s)**, **your position**, source/evidence (once resolved), **comments**.
3. **Cards gallery** — browse all politicians as caricature cards; filter by party/role.
4. **Politician detail** — full caricature card + sourced facts/stats + their open & resolved markets.
5. **Leaderboard** — global + friends; toggle by **net worth** and **accuracy**.
6. **Profile / portfolio** — balance, open positions, bet history, rank, accuracy rating, **daily faucet claim**, your comments/suggestions.
7. **Suggest-a-market** — submission form → admin queue.
8. **Auth / onboarding** — sign in, starting-stack grant, 30-second how-it-works.
9. **Admin (internal, gated)** — create/edit/close/resolve/void markets; manage politicians + generate caricatures; review suggestion queue; moderate comments.

## 8. Politician Cards & Content Pipeline

**The card.** A collectible-styled caricature card per politician: AI-generated illustrated portrait, party-color frame, and a **fun-but-factual stat block** — party, current role, age, years in politics, electoral track record, key positions, a signature quote, and playful stats. Cards link to that politician's markets (many-to-many: a market features 1+ politicians).

**AI caricature pipeline (P0 content dependency).**
- Generate one caricature per politician via an image model in **a single consistent "house" style** (locked style prompt/template) so the gallery feels like one set.
- Admin flow: pick politician → generate → review → publish. Store the asset in **Vercel Blob** (versioned); reference the URL on the politician record.
- **Content policy:** caricatures are clearly labeled satire of public figures, kept tasteful, and never defamatory imagery.

**Facts & sourcing policy (trust backbone).**
- Every fact on a card and every market **resolution** is sourced **only** from (a) **official Israeli government websites** and (b) **curated newsletters that relayed official information**.
- Each card fact and each resolution **cites its source** (URL + note). No rumor/speculation presented as fact. *(Markets may be about speculative futures, but the facts and the resolution evidence must be sourced.)*

## 9. The Game Layer

- **Economy:** start with **1,000 coins**; **daily faucet ~200 coins** (claim once / 24h). All values are tunable constants (see Appendix).
- **Leaderboard:** global + friends, ranked by **net worth** and **accuracy** (the two chosen hooks).
- **Accuracy / forecaster rating:** v1 win-rate (§6); calibrated score P1.
- **Comments / hot takes:** lightweight per-market threads, upvotes, report → admin-hide moderation; basic rate limiting.

## 10. Requirements

### P0 — Must-have (the loop must work end-to-end)

| # | Requirement | Acceptance criteria |
|---|---|---|
| P0-1 | **Auth + starting stack** | Given a new visitor, when they sign in with Google or email, then an account is created with a handle, avatar, and **1,000 coins** recorded as a ledger transaction. |
| P0-2 | **Daily faucet** | Given a signed-in user who hasn't claimed in ≥24h, when they claim, then their balance increases by the faucet amount and `last_faucet_at` updates; a second claim within 24h is rejected with a countdown. |
| P0-3 | **Admin: create market** | Admin can create a market with question, description, category, **2+ outcomes**, featured politician(s), and `close_at`; it appears in the feed as `open`. |
| P0-4 | **Markets feed + filters** | Feed lists `open` markets with live odds, volume, and close countdown; filters by category / Hot / Closing soon / New / Resolved work. |
| P0-5 | **Place a bet (parimutuel)** | Given an `open` market and a user with sufficient balance ≥ min bet, when they stake coins on an outcome, then balance decreases, the outcome pool and odds update, the bet is recorded, and their position shows on the market — **atomically**. Bets on `closed`/`resolved` markets are rejected. |
| P0-6 | **Live odds + potential payout** | Market detail shows each outcome's implied % and the user's indicative potential payout, refreshed after their bet and on periodic refetch. |
| P0-7 | **Admin: resolve → payout** | Given a `closed` market, when an admin selects the winning outcome and attaches a cited source, then **in one atomic transaction**: winners are credited `total_pool × stake/winning_pool`, losers credited 0, every change is a ledger row, market → `resolved`, and each participant's accuracy + net worth update. |
| P0-8 | **Void + refund** | Admin can void a market; every stake is refunded via ledger rows and the market → `voided`. |
| P0-9 | **Politician cards + gallery** | Each politician renders as a caricature card with sourced facts; gallery browses all; market detail shows featured politician card(s); card lists that politician's markets. |
| P0-10 | **AI caricature generation (admin)** | Admin can generate, review, and publish a caricature for a politician in the house style; asset stored in Blob and shown on the card. |
| P0-11 | **Leaderboard** | Global + friends leaderboards rank users by net worth and by accuracy and update after resolutions. |
| P0-12 | **Profile / portfolio** | User sees balance, open positions, bet history, rank, accuracy, and the faucet claim. |
| P0-13 | **Comments** | Signed-in users can post/upvote comments on a market; report → admin-hide works; basic rate limiting applies. |
| P0-14 | **Suggest-a-market** | Users submit a market suggestion; it enters the admin queue; admin can approve (→ create market) or reject. |
| P0-15 | **Hebrew RTL UI + design system** | All v1 screens are Hebrew, RTL, in the Polytical design system, with the caricature-card visual treatment; times shown in Asia/Jerusalem. |

**Cross-cutting P0 invariants:** every coin movement (grant, faucet, bet, payout, refund) is a **ledger transaction**; balance can never go negative; bet placement and resolution are **transactional**; admin routes are role-gated.

### P1 — Nice-to-have (fast follow)
- Streaks + "market of the day" + milestones.
- **Real-time odds push** (replace polling).
- **Share-to-social** with generated OG image cards (market + politician) — high-value for virality.
- Calibrated **Brier accuracy** + badges/achievements with coin rewards.
- **Early cash-out** (sell position back to the pool at current odds).
- Friends / follow graph; friends leaderboard enrichment.
- Mark-to-market net worth at live odds.
- Notifications (market closing soon / resolved).
- Per-market whale cap.

### P2 — Future (design must not preclude)
- Fully user-generated markets (with moderation + reputation gating).
- **Collectible / fantasy-league** card mechanics (stats, drafting, leagues).
- English / bilingual.
- Native mobile app.
- Seasons, tournaments, themed events.
- Optional AMM (LMSR) market type alongside parimutuel.

## 11. Data Model (sketch)

- **users** — `id, handle, email, avatar_url, balance, is_admin, accuracy, total_resolved, total_wins, last_faucet_at, created_at`
- **politicians** — `id, name_he, party, role_he, image_url, facts (jsonb), active, created_at`
- **markets** — `id, question_he, description_he, category, type (binary|multi), status (draft|open|closed|resolved|voided), open_at, close_at, resolved_at, resolved_outcome_id, resolution_source_url, resolution_note, created_by`
- **outcomes** — `id, market_id, label_he, pool_total (cached)`
- **market_politicians** — `market_id, politician_id` (many-to-many)
- **bets** — `id, user_id, market_id, outcome_id, amount, payout, status (open|won|lost|refunded), created_at`
- **comments** — `id, market_id, user_id, body, upvotes, hidden, parent_id, created_at`
- **market_suggestions** — `id, user_id, text, status (pending|approved|rejected), created_at`
- **transactions** (ledger) — `id, user_id, type (grant|faucet|bet|payout|refund), amount, balance_after, ref_market_id, ref_bet_id, created_at`

*The `transactions` ledger is the source of truth for balances and net-worth history; `users.balance` and `outcomes.pool_total` are caches kept consistent inside the same transaction.*

## 12. Technical Architecture

- **App:** Next.js 16 (App Router) + React 19; Server Components for reads, Server Actions / Route Handlers for mutations (bets, resolve, comments). *(Next.js 16 has breaking changes vs. prior versions — confirm App Router conventions against `node_modules/next/dist/docs/` at implementation time.)*
- **DB:** **Neon Postgres** + **Drizzle ORM**. Bet placement and resolution run in **DB transactions** for atomicity and to prevent negative balances / double-pays.
- **Auth:** **Better Auth** (Drizzle adapter) with Google + email, Neon-backed sessions; `is_admin` flag gates admin routes. Auth tables live in the same Drizzle schema (generated via `@better-auth/cli`).
- **Assets:** AI caricatures stored in **Vercel Blob**, referenced by URL.
- **Odds freshness (v1):** optimistic update on bet + periodic client refetch (SWR poll) on market detail; **true push is P1** (e.g., Postgres `LISTEN/NOTIFY` + a websocket layer, or a managed pub/sub).
- **Hosting:** Vercel. **Timezone:** all display in Asia/Jerusalem; store UTC.
- **Abuse controls:** rate limits on bets/comments/suggestions; server-side validation of every wager against balance and market status.

## 13. Design Direction (feeds the design-system + frontend phase)

**Aesthetic:** *satirical newspaper × trading card × clean data UI.* Editorial Hebrew display type, **party-color coding**, bold AI-caricature portraits in a card frame with a stat block, crisp odds bars, playful but trustworthy. Mobile-first, RTL, installable PWA. The formal token set, typography scale, and component library are produced next via `/design-system` and `/frontend-design` (with a live visual companion).

## 14. Success Metrics

**Leading (days–weeks):**
- **Activation:** ≥ 60% of new sign-ins place a bet in their first session.
- **Time-to-first-bet:** median < 2 minutes.
- **D1 / D7 retention:** ≥ 35% / ≥ 18%.
- **Daily faucet claim rate** among WAU: ≥ 50%.
- **Engagement:** ≥ 5 bets per active user per week; ≥ 1 comment per active user per week.
- **Content supply:** ≥ 10 markets created and ≥ 8 resolved per week; suggestion queue non-empty.

**Lagging (weeks–months):**
- **D30 retention:** ≥ 10%.
- **Monthly active forecasters** (≥ 5 resolved bets/mo) trending up.
- **Leaderboard competitiveness** (healthy churn in top 100; accuracy spread, not all-luck).
- **Virality** (once sharing ships): share → sign-up conversion.

*Measurement: product analytics events on sign-in, bet, faucet, resolve, comment, suggest, share; weekly review.*

## 15. Open Questions

- **⚖️ Legal/content (legal/product):** content policy for satirical caricatures + sourced facts in the Israeli context — tasteful-satire bar, takedown path, defamation guardrails. *Non-blocking for build; needed before public launch.*
- **🔢 Economy tuning (product/data):** confirm starting stack / faucet amount + cooldown / min bet; whether to add a whale cap at launch. *Tunable constants; pick defaults now, adjust on data.*
- **🏷️ Product naming (product):** keep "Polytical" as the public name; is there a Hebrew wordmark/tagline? *Non-blocking.*
- **🖼️ Caricature style lock (design):** finalize the one house style + prompt template before generating the launch set. *Blocking for cards; resolve in design phase.*
- **🔁 Resolution policy (product):** single-admin word is final in v1 — do we want a second-editor sign-off for high-volume markets? *Non-blocking; v1 = single admin + cited source.*
- **🔔 Odds realtime (eng):** acceptable polling interval for v1 before push lands. *Non-blocking; default ~10s on market detail.*

## 16. Timeline & Phasing (suggested)

1. **Foundation** — schema + Drizzle migrations, Better Auth, coin ledger, starting stack, faucet, RTL/Hebrew shell + design-system tokens.
2. **Markets core** — admin create, feed + filters, market detail, place bet, live odds (poll).
3. **Resolution** — close/resolve/void, atomic payouts, accuracy + net-worth updates, ledger.
4. **Cards + content** — politician model, AI caricature pipeline, gallery + detail, market↔politician links, sourced facts.
5. **Game layer** — leaderboard, profile/portfolio, comments + moderation, suggest-a-market queue.
6. **Polish** — design pass, PWA, analytics events, abuse controls, QA.

*Each phase is independently demoable; the loop is "alive" at the end of phase 3 and fun by the end of phase 5.*

## Appendix — Economy constants (defaults, tunable)

| Constant | Default |
|---|---|
| Starting stack | 1,000 coins |
| Daily faucet | 200 coins / 24h |
| Minimum bet | 10 coins |
| Maximum bet | none (v1) |
| House rake | 0% |
| Net worth | balance + open stakes (at cost) |
| Accuracy (v1) | winning-side resolved markets ÷ participated resolved markets |
