# Journey coverage map

| Journey | Last walked | Walks | Coverage |
|---|---|---|---|
| [onboarding](#onboarding) | 2026-06-02 `46f0770` | 1 | 5/5 |
| [card-collection](#card-collection) | 2026-06-02 `46f0770` | 1 | 5/5 |
| [community-suggestion](#community-suggestion) | 2026-06-02 `a7135e3` | 1 | 6/6 |
| [auth-signup-grant-faucet](#auth-signup-grant-faucet) | 2026-06-02 `c5b7ad8` | 2 | 7/7 |
| [daily-streak](#daily-streak) | 2026-06-02 `8547d36` | 1 | 4/4 |
| [politician-activity](#politician-activity) | 2026-06-02 `bcdb818` | 1 | 4/4 |
| [market-of-the-day](#market-of-the-day) | 2026-06-02 `8547d36` | 1 | 2/3 |
| [browse-politicians](#browse-politicians) | 2026-06-01 `8649d61` | 1 | 4/4 |
| [browse-markets](#browse-markets) | 2026-06-01 `8649d61` | 1 | 3/4 |
| [place-bet-resolve](#place-bet-resolve) | 2026-06-01 `c55699b` | 1 | 4/4 |
| [leaderboard-profile](#leaderboard-profile) | 2026-06-01 `38d344e` | 1 | 4/4 |

## onboarding

**What it is:** A new account is gated into a first-run wizard that sets a unique @-handle (live availability check) and a focus "arena", then lands in the app. The gate funnels any not-onboarded logged-in user to /onboarding from anywhere and reverse-bounces a finished user away from it.

**Last walked:** 2026-06-02 `46f0770`. **Walks:** 1. **Coverage:** 5/5

**Steps:**
- ✅ fresh email signup → proxy gate redirects to `/onboarding` (not `/`)
- ✅ handle step live availability: invalid "ab" → "3–20 תווים…" (format), valid "qa_player_p2" → "פנוי ✓" (debounced server check); "המשך" disabled until valid
- ✅ arena step: 6 CATEGORIES tiles, single-select (aria-pressed), "המשך" gated on a pick
- ✅ finish ("יאללה, מתחילים") → completeOnboarding + refreshSession → lands on `/` (gate cleared, no loop)
- ✅ reverse-bounce: onboarded user visiting `/onboarding` → redirected to `/` (proxy + page's authoritative DB read)

**Notable history:**
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

**Last walked:** 2026-06-02 `a7135e3`. **Walks:** 1. **Coverage:** 6/6

**Steps:**
- ✅ `/suggest` (gated; `?person=526` pre-selects the MK) — question + category + politician; submit → "ההצעה נשלחה לבדיקה — תודה!", form clears
- ✅ profile "ההצעות שלי" shows the proposal as ממתין (pending)
- ✅ admin `/admin` "הצעות מהקהל" queue lists it with proposer + related MK
- ✅ approve (future closeAt) → ATOMIC: open binary כן/לא market created + linked to personId 526 + suggestion → approved (verified in DB); queue → 0
- ✅ approved market renders on `/politician/526` (placeholder gone); profile shows אושר + market link
- ✅ reject with note → terminal; profile shows נדחה + the note

**Notable history:**
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

**Last walked:** 2026-06-01 `c55699b`. **Walks:** 1. **Coverage:** 4/4

**Steps:**
- ✅ place bet (browser): select outcome + stake → balance debits (1000→900), outcome pool/odds move (0%→100%), "ההימור נרשם!"
- ✅ resolve (service, live Neon): winner paid `floor(total × stake / winningPool)`; balance 900→1000, bet `won`, market `resolved`
- ✅ resolved market detail: bet panel hidden, resolved state shown, balance reflects payout
- ✅ ledger integrity: bet debit + payout land as `transactions` rows (type bet/payout); never-negative enforced

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
