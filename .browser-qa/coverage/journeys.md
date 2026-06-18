# Journey coverage map

> **⚠️ STALE ENTRIES (pre-`0017_remove_coins`, 2026-06-10):** `seasons-claim`, `card-collection`, `auth-signup-grant-faucet`, `daily-streak`, `place-bet-resolve`, and `leaderboard-profile` describe the REMOVED coin economy (grants, faucet, stakes, payouts, claims, net-worth). The live model is stake-less predictions + right/wrong tally + accuracy-unlocked cards + accuracy seasons. Re-walk and rewrite these journeys before trusting their steps.

| Journey | Last walked | Walks | Coverage |
|---|---|---|---|
| [duel-challenge](#duel-challenge) | 2026-06-18 `085fdc2` | 2 | 6/7 |
| [groups-coalition](#groups-coalition) | 2026-06-16 `2879102` | 3 | 9/11 |
| [knesset-votes-loop](#knesset-votes-loop) | 2026-06-16 `f631964` | 3 | 9/9 |
| [prod-data-integrity](#prod-data-integrity) | 2026-06-11 `7e4a516` | 1 | 4/5 |
| [notifications-push](#notifications-push) | 2026-06-09 `fabb59a` | 1 | 3/5 |
| [seasons-claim](#seasons-claim) | 2026-06-02 `c36fc23` | 1 | 5/5 |
| [global-search](#global-search) | 2026-06-02 `c36fc23` | 1 | 5/5 |
| [onboarding](#onboarding) | 2026-06-10 `feat/hatzaa-laseder` | 3 | 6/6 |
| [card-collection](#card-collection) | 2026-06-09 `d738eab+wip` | 2 | 5/5 |
| [community-suggestion](#community-suggestion) | 2026-06-10 `feat/hatzaa-laseder` | 2 | 7/8 |
| [auth-signup-grant-faucet](#auth-signup-grant-faucet) | 2026-06-02 `c5b7ad8` | 2 | 7/7 |
| [daily-streak](#daily-streak) | 2026-06-02 `8547d36` | 1 | 4/4 |
| [politician-activity](#politician-activity) | 2026-06-11 `worktree-knesset-votes` | 2 | 4/4 |
| [market-of-the-day](#market-of-the-day) | 2026-06-02 `8547d36` | 1 | 2/3 |
| [browse-politicians](#browse-politicians) | 2026-06-11 `worktree-knesset-votes` | 2 | 4/4 |
| [browse-markets](#browse-markets) | 2026-06-01 `8649d61` | 1 | 3/4 |
| [place-bet-resolve](#place-bet-resolve) | 2026-06-09 `d738eab+wip` | 2 | 4/4 |
| [leaderboard-profile](#leaderboard-profile) | 2026-06-01 `38d344e` | 1 | 4/4 |


## groups-coalition

**What it is:** A user creates a private קואליציה (prediction club), gives it a name with an emoji, and the coalition's icon/name render consistently across the header switcher, the /g list, the group page and the invite/join page. Members raise group-only הצעות, predict, and see a sandboxed scoreboard.

**Last walked:** 2026-06-16 `2879102` (global-context redesign). **Walks:** 3. **Coverage:** 9/11

**Steps (global-context model — `feat/coalition-global-context`):**
- ✅ /g/new render + create → lands on the **management page** /g/[slug]
- ✅ create-coalition motion (/g/[slug]/new): question + yes/no + datetime close → motion live, reveal gate ("בחרו תשובה...") shown
- ✅ **switcher click on / STAYS on / and re-scopes the feed** (NO jump to /g/[slug]) — the headline fix
- ✅ scoped feed: hero = the coalition's motion; CoalitionScopeBanner "צופים בתחזיות... · ניהול · חזרה לארצי"
- ✅ "חזרה לארצי" (banner) → national feed returns in place, banner gone, chip → ארצי
- ✅ scope is sticky across nav (/ → /markets both scoped)
- ✅ /g/[slug] is **management-only**: scoreboard + roster (@handle) + copy-invite + stance toggle — NO motions feed
- ✅ /g/by-id ("צפו בתחזיות הקואליציה") sets context + lands on scoped / (not the management page)
- ✅ profile shows CoalitionScopeNote when scoped; profile portfolio stays NATIONAL
- ❌ /g/join/[code] invite-accept flow (not walked this pass)
- ❌ stance sharing toggle + clone-to-group (not walked this pass)

**Notable history:**
- `2879102` (2026-06-16): GLOBAL-CONTEXT redesign walked end-to-end on the branch (localhost:3210, @commenter_qa, test group "QA בדיקת סקופ"). Switcher is now a context-setter (no nav); /g/[slug] slimmed to management; /g/by-id enters the scoped feed; profile scope-note. All green, 0 console errors. Nit: 0-prediction odds bar shows "לא 100%" (pre-existing, not coalition-specific). Confusing "הקואליציה היא הבית שלי" home button flagged for removal.
- `25d3df6` (2026-06-15): REDESIGN baseline walk (read-only) for `feat/coalition-global-context`. Confirmed today's model on prod: an authenticated member hitting `/` is redirected to `/g/[slug]` (proxy landing); `/g/[slug]` is a 2-col page = motions feed (RTL-right) + scoreboard/roster/stance-sharing aside (RTL-left); `?view=general` escapes to the national feed. Planned redesign makes the switcher a sticky global scope so this feed re-scopes inline and the side page is removed. Spec/plan: `docs/superpowers/{specs,plans}/2026-06-15-coalition-global-context-*`.
- `237a588` (2026-06-15): create-form redesigned to one name field + inline emoji picker; coalition icon derived from the name's leading emoji via shared lib/group-display helpers (groupIcon/groupTextOnly/groupLabel); name/emblem validated by code points. QA walk created+deleted a prod test group (cleanup-qa-group.ts).

**Known gaps:** join/invite flow, motion lifecycle, scoreboard, and stance-sharing/clone not yet walked. Minor UX nit: focus does not return to the name input after picking an emoji from the popover (user must click back in to continue typing).


## knesset-votes-loop

**What it is:** A user browses real Knesset roll-calls (/votes), opens a motion to see who voted what, sets their own עמדה, and unlocks "מי מצביע כמוכם" after 5 stances. Admin curates featured motions + agenda + the identity queue.

**Last walked:** 2026-06-16 `f631964`. **Walks:** 3. **Coverage:** 8/9

**Steps:**
- ✅ /votes feed: real data, totals bars, ?before= pagination, freshness line
- ✅ /vote/[id]: faction-grouped breakdown, chips → politician pages, source link, siblings
- ✅ stance set → flip → retract (optimistic, disabled-while-pending); deck pills: cursor:pointer, hover glow (mint/coral), selected נגד→coral glow + בעד→mint glow [f631964]
- ✅ k-gate: aggregate hidden under 10 stancers
- ✅ match unlock at 5th scoreable stance → /my-match (partial mode, basis lines, low-confidence)
- ✅ politician page הצבעות אחרונות columns
- ✅ home #votes module + mobile 380px
- ✅ admin: featured toggle→rail, agenda add→drop, queue empty-state
- ✅ hand/secret/roll-call detail states in-browser (46063/46051/46052 — 83 chips, faction groups, explicit no-breakdown notes)

**Notable history:**
- `worktree-knesset-votes` (2026-06-11): first walk — 2 bugs found+fixed in-pass (raw-sql Date crash in getFeaturedVotes; worst-party tie contradiction on /my-match).
- `f631964` (2026-06-16, PR #100): deck BinaryPills glow/cursor polish — added cursor-pointer (v4 Preflight dropped btn→pointer), hover:shadow-glow-mint/coral, and shadow-glow-coral on the selected נגד pill (previously no glow). Verified live on prod.

**Known gaps:** panels-mode /my-match (needs 6+ qualified MKs — requires stances on contested votes); withheld-attribution line (queue is empty — data too clean!).

## prod-data-integrity

**What it is:** Every politician a market references resolves to a real row with deployed card art — a user opening any market sees all its politicians with caricatures, never a silent drop or a fallback dome.

**Last walked:** 2026-06-11 `7e4a516`. **Walks:** 1. **Coverage:** 4/5

**Steps:**
- ✅ every market_politicians personId joins a politicians row (SQL sweep; Bennett 23511 was missing → inserted with Knesset-OData provenance)
- ✅ every active MK (119) has imageUrl set
- ✅ every active-MK caricature file serves 200 on prod (curl sweep)
- ✅ inactive-but-market-linked politicians have card art (Eizenkot 30836 + Bennett 23511 generated)
- ❌ post-deploy: trigger market shows all three caricatures live (pending Vercel deploy + DB imageUrl flip)

**Notable history:**
- `7e4a516` (2026-06-11): user report — Eizenkot fallback dome + Bennett absent on מי-ירכיב-את-הממשלה. Root causes: market page resolves by personId WITHOUT an active filter (inactive rows render but had no art); Bennett had no row at all (sync only ingests sitting MKs).

**Known gaps:** no automated guard — a future market linking a politician with no row/art will silently regress; consider a CI check or admin-form validation (the multi-outcome merge added `getPoliticiansByPersonIds` existence validation at creation, which covers the no-row case going forward).

## notifications-push

**What it is:** A user opts into web-push from `/notifications`, and sees their in-app notification feed (wins, resolutions, voids, season rewards, closing-soon). Push fans out from the same events as the in-app log; delivery needs an installed PWA + VAPID.

**Last walked:** 2026-06-09 `fabb59a`. **Walks:** 1. **Coverage:** 3/5

**Steps:**
- ✅ `/notifications` (prod, logged-in): SW registers + active at `/sw.js` (scope `/`); the "🔔 קבלו התראות" CTA renders when `Notification.permission=default`; 0 console errors
- ✅ in-app feed renders existing types — bet_won (mint accent) + market_resolved (neutral) — correct Hebrew copy, accents, timestamps; widened FeedItem type doesn't break render
- ✅ mobile 390px: 0 horizontal overflow on `/notifications` + `/`; SiteHeader collapses to a hamburger menu (fixed in c24ef5b); push content (CTA + cards) full-width + readable
- ❌ click CTA → grant permission → subscribe POST `/api/push/subscribe` → row created → status flips to "subscribed" (blocked: automation can't grant the OS Notification permission)
- ❌ real push delivery on an installed PWA (iOS-after-install + Android) — HARD GATE, needs a device + VAPID handshake

**Notable history:**
- `fabb59a` (2026-06-09): first walk — PR #15 web-push feature. CTA + SW + feed green.
- `c24ef5b` (2026-06-09): fixed the authed SiteHeader mobile overflow (MobileMenu hamburger) — also gave the nav its first mobile surface.

**Known gaps:**
- Subscribe round-trip + delivery un-walkable in automation (OS permission prompt + real push service). Covered by route + service integration tests instead.
- New notification types (season_reward / market_voided / market_closing_soon) not visually exercised — no data for the test account; render path is type-safe + ACCENT map exhaustive.

## seasons-claim

**What it is:** A time-boxed reward track. A user accrues "net Shekoins won" in the season window (live from the ledger), and claims each tier on demand once its goal is reached; the reward credits coins and is terminal.

**Last walked:** 2026-06-02 `c36fc23`. **Walks:** 1. **Coverage:** 5/5

**Steps:**
- ✅ `/seasons` anonymous: banner + countdown + progress 0 + tiers locked + "התחברו" CTA
- ✅ logged-in board: progress reflects in-window net winnings; tier states derived (claimable vs locked) against goals
- ✅ claim a reached tier → coins credited (header balance 1,000→1,050), tier → "נתבע ✓" terminal
- ✅ no double-credit: DB shows exactly one season_reward ledger row + one claim row per tier
- ✅ below-goal / ended / dip-below-goal-after-claim / one-active-season / increasing-goals — PGlite unit-tested

**Notable history:**
- `c36fc23` (2026-06-02): Phase 3 — claim-on-demand, no cron; progress = live ledger window sum; claim is one atomic tx (applyEntry season_reward + composite-PK idempotency).

**Known gaps:** the claim's net-winnings were injected via a direct in-window payout row for the walk (real 2-user parimutuel net-positive not exercised in-browser; the money math is unit-tested). header balance updates on next refresh/nav (brief router.refresh lag, authoritative on reload). Admin create/end-season UI not built (actions exist + seed script).

## global-search

**What it is:** One search box finds both markets and politicians by normalized Hebrew text.

**Last walked:** 2026-06-02 `c36fc23`. **Walks:** 1. **Coverage:** 5/5

**Steps:**
- ✅ header search icon → `/search`
- ✅ politician query ("נתניהו") → matching MK card, non-matches excluded
- ✅ market query ("קואליציה") → matching market card (hot badge + odds + featured portrait)
- ✅ draft/voided markets excluded; <2-char query → prompt state; niqqud-normalized match — unit-tested
- ✅ debounced URL-driven input (router.replace; q is the shareable source of truth)

**Notable history:**
- `c36fc23` (2026-06-02): Phase 3 — markets.searchText (normalizeSearchName, trigram GIN index in-schema so db:push preserves it); ILIKE discovery-only.

**Known gaps:** the live debounced-typing path (vs deep-linking ?q=) not click-walked in-browser (deep-link + unit tests cover the query path); empty-result state ("לא נמצאו תוצאות") not visually walked.

## onboarding

**What it is:** A new account is gated into a first-run wizard that sets a unique @-handle (live availability check) and a focus "arena", then lands in the app. The gate funnels any not-onboarded logged-in user to /onboarding from anywhere and reverse-bounces a finished user away from it.

**Last walked:** 2026-06-10 `feat/hatzaa-laseder`. **Walks:** 2. **Coverage:** 6/6

**Steps:**
- ✅ fresh email signup → proxy gate redirects to `/onboarding` (not `/`)
- ✅ handle step pre-filled with a generated Hebrew handle marked "פנוי ✓" (server availability-checked); 🎲 reroll swaps it (input: prefill-accept + reroll)
- ✅ handle step live validation: invalid "ab" → format error; mixed-script "מנדטx" → "3–20 תווים, עברית או אנגלית בלי לערבב"; "המשך" disabled until valid (input: short + mixed-script; all-Latin typed covered 2026-06-02)
- ✅ arena step: 6 CATEGORIES tiles, single-select (aria-pressed), "המשך" gated on a pick
- ✅ finish ("יאללה, מתחילים") → completeOnboarding + refreshSession → lands on `/` with the Hebrew handle `@הסכם_מסתורי` (gate cleared, no loop)
- ✅ reverse-bounce: onboarded user visiting `/onboarding` → redirected to `/` (walked 2026-06-02)

**Notable history:**
- `feat/hatzaa-laseder` (2026-06-10): Hebrew handles (single-script rule) + server-generated prefill + 🎲 reroll; full happy path walked with a Hebrew handle.
- `46f0770` (2026-06-02): Phase 2 — onboarding gate. additionalFields (handle/arena/onboardedAt) + refreshSession re-issues the 5-min cookie so the gate sees onboardedAt immediately.

**Known gaps:** handle-taken cross-user race + partially-onboarded (handle set, no arena) resume covered by PGlite unit tests, not browser-walked; OAuth (Google) signup path into onboarding not walked (email path only).

## card-collection

**What it is:** A user spends Shekoins to permanently collect a politician's caricature card; the /collection gallery shows owned cards bright and un-owned dimmed+locked with a completion meter.

**Last walked:** 2026-06-02 `46f0770`. **Walks:** 1. **Coverage:** 5/5

**Steps:**
- ✅ politician page shows "אספו את הקלף · 250" for a signed-in non-owner
- ✅ collect → header balance 1,000→750 (◈250 debit via the collect ledger row), button → "הקלף באוסף שלכם" chip
- ✅ `/collection` gallery: progress meter 1/120, owned card bright, others grayscale-locked with "לא נאסף" + lock chips
- ✅ "באוסף" filter tab → narrows to just owned cards; "הכול"/"נעולים" tabs present
- ✅ insufficient-funds (Hebrew msg) + idempotent double-collect (no double-debit, one ownership row) — PGlite unit-tested

**Notable history:**
- `46f0770` (2026-06-02): Phase 2 — collect path is one atomic tx (lockUser → isOwned guard → applyEntry collect debit → race-safe insertOwnership; lost race rolls back the debit). Reuses CaricatureCard via new `owned` prop.

**Known gaps:** the <250-balance browser path not walked (unit-tested); collecting from the gallery itself (vs the politician page) — gallery cards link to the politician page, no inline collect button there.

## community-suggestion

**What it is:** A user proposes a market; an admin approves it (a real market is created + linked) or rejects it with a note; the proposer tracks status on their profile and the approved market surfaces on the related politician's page.

**Last walked:** 2026-06-10 `feat/hatzaa-laseder`. **Walks:** 2. **Coverage:** 7/8

**Steps:**
- ✅ `/suggest` is "הצעה לסדר" (no "מהקהל" eyebrow): question + category + REQUIRED "מתי השאלה תוכרע?" datetime gating the submit + optional "מקור הכרעה"; submit → "מגישים…" → "ההצעה לסדר הוגשה — תודה!", form clears (2026-06-10)
- ✅ `?person=` pre-selects the MK (2026-06-02)
- ✅ profile "ההצעות לסדר שלי" shows the proposal as ממתין (walked 2026-06-02 pre-rename; renamed copy not browser-checked)
- ✅ admin `/admin` "הצעות לסדר" queue lists it with proposer + "מקור הכרעה מוצע"; מועד סגירה PRE-FILLED from proposedCloseAt — 2026-12-31T20:00 exact UTC↔local round-trip (2026-06-10)
- ✅ approve (future closeAt) → ATOMIC market creation + link (walked 2026-06-02)
- ❌ approve with the PRE-FILLED date (admin keeps or adjusts the proposer's date through to a real market) — not walked; no approvals against prod DB
- ✅ approved market renders on the politician page; profile shows אושר + market link (2026-06-02)
- ✅ reject with note → terminal; queue → 0 (re-walked 2026-06-10)

**Notable history:**
- `feat/hatzaa-laseder` (2026-06-10): rename to הצעה לסדר; required proposedCloseAt + optional resolutionSourceNote on the form; admin closeAt pre-fill.
- `a7135e3` (2026-06-02): review fixes — reject past closeAt (ClosePastError); getMarketsForPolitician filtered to `open`.

**Known gaps:** rate-limit (5/10min) not browser-exhausted (unit-tested); admin promotion in this walk used a DB flip + re-login (cookieCache 5min) rather than a real admin-grant UI (none exists).

## auth-signup-grant-faucet

**What it is:** A new visitor signs up (email/password), receives the 1,000-coin starting stack, and claims the daily faucet. An existing user logs back in.

**Last walked:** 2026-06-02 `c5b7ad8`. **Walks:** 2. **Coverage:** 7/7

**Steps:**
- ✅ `/signup` email/password form submits (real keyboard input)
- ✅ signup success NAVIGATES to `/` logged-in (fixed c5b7ad8 — was stranded on form; callbackURL is a no-op for the email fetch flow)
- ✅ login success NAVIGATES to `/` logged-in (same fix; verified by log-out → log-in)
- ✅ session established; `proxy.ts` redirects `/signup`,`/login` → `/` when already logged in
- ✅ starting grant: header shows `1,000` via grant-at-signup hook
- ✅ faucet claim: `1,000 → 1,200`; balance revalidates in the shared (layout) header
- ✅ faucet cooldown: 2nd claim blocked ("כבר קיבלתם היום — חזרו מחר"), balance held at 1,200

**Notable history:**
- `c5b7ad8` (2026-06-02): login+signup now navigate on success (useRouter push+refresh); previously the session cookie was set but the user stayed on the form.

**Known gaps:** sign-out flow not explicitly walked (logout used as a setup step, worked); wrong-password error copy not re-walked this pass.

## daily-streak

**What it is:** A returning user claims the daily faucet, building a consecutive-day streak that scales the payout; misses reset it. Streak shows on the header reward + profile.

**Last walked:** 2026-06-02 `8547d36`. **Walks:** 1. **Coverage:** 4/4

**Steps:**
- ✅ claim shows reward "🔥 רצף 1 · +200" beside the faucet button; balance `1,000 → 1,200`
- ✅ 2nd claim within cooldown blocked; balance held at 1,200 (no double-pay, no double-increment)
- ✅ `/profile` "רצף נוכחי 1" (flame) + "שיא רצף 1" stat cards render in the 6-card grid (no overflow)
- ✅ reward text hidden on mobile (380px, `sm:inline`) — no header crowding

**Known gaps:** multi-day streak advance (day 2 → +225) + reset-after-gap only unit-tested (driving real wall-clock days in a browser isn't practical); bonus cap at day 8 unit-tested.

## politician-activity

**What it is:** On a politician's page, see their real current-Knesset parliamentary activity — bills sponsored, queries submitted, and recent bill names.

**Last walked:** 2026-06-02 `bcdb818`. **Walks:** 1. **Coverage:** 4/4

**Steps:**
- ✅ "פעילות פרלמנטרית" section renders with two stat cards (bills + queries)
- ✅ real K25 counts: Gafni 283 bills / 0 queries; Tibi 390 / 83; Liberman 301 / 1
- ✅ "הצעות חוק אחרונות" lists 6 real bill names (e.g. "הצעת חוק מס ערך מוסף…")
- ✅ source note "נתונים ממקור רשמי · הכנסת (OData)"; 0 console errors across 3 MKs

**Notable history:**
- `worktree-knesset-votes` (2026-06-11): bills/queries backfill landed (7.4k bills, 17.1k sponsors) — activity counts now real (Liberman: 301 bills / 2 queries).
- `bcdb818` (2026-06-02): scoped bill-sponsor ingest to K25 + join `bills` for the count — the recent-bills list was empty for every MK before (sponsor rows were truncated to a disjoint old-Knesset ID range).

**Known gaps:** an MK with zero bills AND zero queries (the "all zeros, no recent list" branch) not browser-walked (unit-tested in activity.test.ts).

## market-of-the-day

**What it is:** The homepage hero spotlights a daily market — an admin-flagged hot market, else the most-active open market.

**Last walked:** 2026-06-02 `8547d36`. **Walks:** 1. **Coverage:** 2/3

**Steps:**
- ✅ HOT branch: badge "השוק החם של היום" on the hero, links to a real open market
- ✅ hero card renders odds + politicians, desktop + mobile, no overflow
- ❌ MOTD-fallback branch ("שוק היום · הכי פעיל") not browser-walked — current seed always has a `hot` market, so the fallback never triggers; `getMarketOfTheDay` is unit-tested (4 tests: busiest open / ignores non-open / zero-bet fresh / null when none open)

**Known gaps:** the no-hot-market fallback needs a seed without any `hot` flag to surface in-browser.

## browse-politicians

**What it is:** Browse real MKs as caricature cards, filter by name, open a detail page.

**Last walked:** 2026-06-01 `8649d61`. **Walks:** 1. **Coverage:** 4/4

**Steps:**
- ✅ homepage featured 12 real MKs render
- ✅ `/politicians` gallery: 120 real MK cards
- ✅ Hebrew name filter: 'ליברמן' → 1 match
- ✅ `/politician/[personId]` detail: real card + facts ("בסיעה מאז") + "שווקים בקרוב"

**Known gaps:** unknown/non-numeric `personId` → `notFound()` path not walked.

## browse-markets

**What it is:** Browse mock markets, open a market detail with odds + bet preview.

**Last walked:** 2026-06-01 `8649d61`. **Walks:** 1. **Coverage:** 3/4

**Steps:**
- ✅ homepage hot-market + markets grid
- ✅ category rail renders
- ✅ `/market/[id]` detail: odds bar, bet panel "תצוגה מקדימה"
- ❌ category filter (`?cat=`) interaction not walked

**Known gaps:** category-filter (`?cat=`) click not exercised. (Betting is now live — see place-bet-resolve.)

## place-bet-resolve

**What it is:** A logged-in user stakes coins on a market outcome; an admin resolves it; winners are paid from the pot.

**Last walked:** 2026-06-09 `d738eab+wip` (mobile layout). **Walks:** 2. **Coverage:** 4/4

**Steps:**
- ✅ place bet (browser): select outcome + stake → balance debits (1000→900), outcome pool/odds move (0%→100%), "ההימור נרשם!"
- ✅ resolve (service, live Neon): winner paid `floor(total × stake / winningPool)`; balance 900→1000, bet `won`, market `resolved`
- ✅ resolved market detail: bet panel hidden, resolved state shown, balance reflects payout
- ✅ ledger integrity: bet debit + payout land as `transactions` rows (type bet/payout); never-negative enforced
- ✅ mobile layout (390px, logged-in, light+dark): page no longer clips (header overflow root-cause fixed); bet panel now sits above politicians+comments, not buried below

**Notable history:**
- `worktree-knesset-votes` (2026-06-11): roster extended to 148 (incl. 28 departed at active=false); gallery now filters active=true → still 120 cards. Departed MKs reachable only by direct /politician/[id] URL.
- `d738eab+wip` (2026-06-09): mobile fix — logged-in header overflow that expanded the layout viewport to 601px and clipped every logged-in page (this journey's literal "not rendering" report) fixed via MobileMenu; market grid reordered so the bet panel is reachable on phones.

**Known gaps:** admin **resolve via the /admin UI** not browser-walked (5-min session cookieCache delays a fresh `isAdmin` promotion) — resolution verified via the service against live Neon + 11 unit tests. Multi-bettor split + void not browser-walked (unit-tested).

## leaderboard-profile

**What it is:** A user sees the real leaderboard, their own profile/portfolio, and their forecaster accuracy updating as markets resolve.

**Last walked:** 2026-06-01 `38d344e`. **Walks:** 1. **Coverage:** 4/4

**Steps:**
- ✅ fresh user first-load: `/profile` shows balance/net-worth 1,000 (no grant race — fixed via grant-at-signup hook `38d344e`)
- ✅ homepage leaderboard: real users ranked by net worth, own row flagged "· אתה"
- ✅ accuracy updates on resolution: bet כן → resolve כן → `totalResolved 1 / totalWins 1` → 100% on profile + leaderboard
- ✅ `/profile` portfolio: stat cards + open positions + resolved history ("זכית +100")

**Known gaps:** multi-user leaderboard ordering by accuracy (vs net worth) not browser-walked (unit-tested); ties / mark-to-market net worth deferred.


## duel-challenge

**What it is:** A user shares a single-bet duel link with friends; a recipient opens the public `/duel/[token]` arena, sees a head-to-head VS face-off on one question, picks a side, and — once the market resolves — sees who was right. v0 is a **stateless token** (no `challenges` table): the link encodes market + challenger @handle + their pick; picks reuse the normal `bets` engine.

**Last walked:** 2026-06-18 `085fdc2` (feat/prediction-duels P1-persisted, localhost, @commenter_qa). **Walks:** 2. **Coverage:** 6/7

**Steps:**
- ✅ open shared `/duel/[token]` → arena renders: kicker, VS face-off (challenger gold ring + viewer mint ring, picks masked "???"), question card, live urgency chip, two color-coded sides (כן/לא). Hebrew correct (real DOM bidi). No overflow, 0 console errors.
- ✅ pick a side → optimistic reveal STATE: picked side gets mint border+glow+"המנדט שלך ✓", crowd split renders (60/40). Verified WITHOUT a prod write (server-action POST fetch-blocked).
- ✅ market-page hook: "🥊 התערבו על זה עם חבר" gold pill renders on global open markets for logged-in users (185×34, under the meta row).
- ✅ invalid token (`/duel/garbage`) → not-found UI "הדף לא נמצא" (HTTP 200 is app-wide, not duel-specific).
- ⚠️ logged-out reveal → "הצטרפו ושמרו את המנדט" login CTA (`/login?callbackUrl`): code-verified only — QA session was logged-in (commenter_qa), and the httpOnly session cookie can't be cleared to force logged-out.
- ✅ revealed-on-mount path (P1, `085fdc2`): a persisted challenge where the viewer/challenger has a pick renders the challenger's pick chip in the VS band + the picked badge + outcome rows — verified live (multi-outcome "מי ירכיב את הממשלה"). `initial={false}` dodges the occluded-tab rAF deadlock.
- ✅ P1 persistence: createChallenge (service, against prod) → persisted row → /duel/[token] reads challenger @handle + live pick from DB; migration 0033 applied; 13 PGlite tests green.
- ⚠️ INTERACTIVE reveal animation (prompt→revealed swap, crowd-fill growth, %/mandate count-up): still frozen by the occluded QA tab (rAF + AnimatePresence mode="wait"); foreground-only. Verify in a FOCUSED window.

**Notable history:**
- `c025e3a` (2026-06-18): feature built + wired (stateless `/duel/[token]` route, market-page challenge hook). OG unfurl image removed (Satori has no bidi → Hebrew reversed); text unfurl via generateMetadata. Entrances are transform-only so content stays visible if rAF is throttled — see [[motion-entrance-raf-throttle]].

**Known gaps:** focused-browser pass for the full reveal choreography; logged-out funnel walk; live mobile-viewport capture (tooling-blocked); persistent `challenges`/participants tables (P1 — needs a prod migration) → multi-participant leaderboard, settlement notifications, OG image with bundled Hebrew font + bidi-js.
