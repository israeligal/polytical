# QA ledger — 2026-06

| Date (UTC) | Commit | Surface / Flow | Outcome | Notes |
|---|---|---|---|---|
| 2026-06-02 | 27bd4fc | season reachability fix (wagered metric) | ✅ | logged in as dogfood highroller → /seasons progress 610 (was stuck 0), 2 tiers claimable; claimed tier1 → balance 140→190 (reward 50), terminal "נתבע ✓"; 0 errors |
| 2026-06-02 | 27bd4fc | definite-article search fix | ✅ | vs Neon: "הבחירות"→1 market, "הליברמן"→1 MK (were 0); bare forms still 1; backfilled 4 markets + 11 politicians |
| 2026-06-02 | 27bd4fc | SQLSTATE leak fixes (claimTier/upvote) | ✅ | bad-uuid tierId → TierNotFoundError; missing/bad comment id → CommentNotFoundError (unit-tested; pgErrorCode walks .cause) |
| 2026-06-02 | c36fc23 | global search (/search) | ✅ | P3: "נתניהו"→1 politician; "קואליציה"→1 market card (hot+odds+portrait); header search icon; 0 errors |
| 2026-06-02 | c36fc23 | seasons board (anonymous) | ✅ | P3: banner "עונת הפתיחה" + countdown 29d + progress 0 + 4 tiers נעול w/ Shekoin rewards; gold glow |
| 2026-06-02 | c36fc23 | season tier claim (◈ credit) | ✅ | P3: progress 150→tier1 claimable→claim→balance 1,000→1,050; DB: 1 reward(50)+1 claim, no double-credit; terminal "נתבע ✓" |
| 2026-06-02 | 46f0770 | onboarding gate (signup→/onboarding) | ✅ | P2: fresh signup forced to /onboarding; onboarded user reverse-bounced /onboarding→/ |
| 2026-06-02 | 46f0770 | onboarding wizard (handle→arena→finish) | ✅ | P2: live availability invalid"ab"→valid"qa_player_p2 פנוי ✓"; arena ביטחון; finish→/ (gate cleared, refreshSession) |
| 2026-06-02 | 46f0770 | collect card (◈250 debit) | ✅ | P2: collect משה גפני → header 1,000→750, button→"הקלף באוסף שלכם"; ins-funds+double-collect unit-tested |
| 2026-06-02 | 46f0770 | /collection gallery | ✅ | P2: progress 1/120, owned bright + 119 grayscale-locked "לא נאסף" chips; "באוסף" filter → 1 card; 0 console errors |
| 2026-06-02 | (phase8) | Hebrew 404 (not-found.tsx) | ✅ | /politician/abc + /market/<bad> → on-brand "הדף לא נמצא" in-layout (was Next English default) |
| 2026-06-02 | (phase8) | global focus-visible ring | 🔴 | first wrote var(--ring) (undefined) → ring silently dropped; fixed to var(--color-ring), re-verified 2px solid primary on Tab |
| 2026-06-02 | (phase8) | politician page after a11y/tap-target changes | ✅ | portrait role=img+aria-label, 0 overflow, activity intact, 0 console errors |
| 2026-06-02 | a7135e3 | suggestion reject path | ✅ | reject w/ note → queue 0 → profile shows "נדחה" + note; terminal |
| 2026-06-02 | a7135e3 | admin gate (re-login refreshes isAdmin) | ✅ | promote in DB + sign out/in (cookieCache 5min) → /admin loads; non-pending queue empty-state |
| 2026-06-02 | a7135e3 | approve past-closeAt guard (review fix) | ✅ | service ClosePastError + action msg + min/dir=ltr on datetime inputs; unit-tested |
| 2026-06-02 | a7135e3 | politician markets filter (review fix) | ✅ | getMarketsForPolitician → open only (draft/resolved/voided excluded); unit-tested |
| 2026-06-02 | c5b7ad8 | login/signup redirect after success | 🔴 | callbackURL no-op for email flow → user stranded on form; fixed c5b7ad8 (useRouter push+refresh), both verified → `/` |
| 2026-06-02 | bcdb818 | `/politician/[id]` activity (data fix) | ✅ | Gafni 283 bills/0 q/6 recent; Tibi 390/83/6; Liberman 301/1/6 — real K25, recent-bills list renders, 0 errors |
| 2026-06-02 | 8547d36 | faucet streak reward | ✅ | "🔥 רצף 1 · +200"; balance 1000→1200; 2nd claim cooldown held 1200 (no double-pay) |
| 2026-06-02 | 8547d36 | `/profile` streak cards | ✅ | "רצף נוכחי 1" (flame) + "שיא רצף 1"; 6-card grid, 0 overflow |
| 2026-06-02 | 8547d36 | homepage market-of-the-day | ✅ | HOT branch "השוק החם של היום" verified; MOTD fallback unit-tested (4 tests) |
| 2026-06-02 | 8547d36 | homepage desktop + mobile (regression) | ✅ | 0 horizontal overflow; streak reward hidden on 380px (sm:inline); markets+cards+leaderboard render |
| 2026-06-02 | 8547d36 | `/market/[id]` detail (regression) | ✅ | bet panel + odds + comments thread render, 0 console errors |
| 2026-06-01 | c2fbd05 | post comment (browser) | ✅ | posted on a market → appears in the thread |
| 2026-06-01 | c2fbd05 | upvote comment (browser) | ✅ | ▲0 → ▲1; comment_votes PK prevents double-vote; empty post rejected |
| 2026-06-01 | 38d344e | profile/leaderboard balance-0 (fresh user) | 🔴 | lazy grant raced the stat read on first load; fixed via grant-at-signup hook (38d344e), re-verified |
| 2026-06-01 | 38d344e | `/profile` portfolio | ✅ | balance/net-worth/rank/accuracy + open positions + history ("כן · 100 · זכית +100") |
| 2026-06-01 | 38d344e | homepage leaderboard (real) | ✅ | 2 real users ranked by net worth; own row flagged "· אתה" |
| 2026-06-01 | 38d344e | accuracy on resolution | ✅ | bet כן → resolve כן → totalResolved 1 / totalWins 1 → 100%; profile + leaderboard reflect |
| 2026-06-01 | c55699b | place-bet (browser) | ✅ | sign-up→1000; bet 100 on כן → 900, odds 0%→100%, "ההימור נרשם!" |
| 2026-06-01 | c55699b | resolve market (service · live Neon) | ✅ | resolve כן → balance 900→1000, bet won/payout 100, market `resolved` |
| 2026-06-01 | c55699b | resolved market detail | ✅ | bet panel hidden, resolved state shown, balance reflects payout |
| 2026-06-01 | c55699b | test-suite stability | ✅ | hookTimeout fix → 3× full-suite green (57/57); was a PGlite beforeEach flake |
| 2026-06-01 | 8649d61 | `/politician/[id]` tenure label | 🔴 | "בכנסת מאז"→"בסיעה מאז" (faction-since, not career); fixed 8649d61, verified in browser |
| 2026-06-01 | 8649d61 | `/` homepage render (desktop) | ✅ | 12 real featured MKs, RTL, 0 console errors |
| 2026-06-01 | 8649d61 | `/politicians` gallery + Hebrew filter | ✅ | 120 real MK cards; filter 'ליברמן' → 1 (אביגדור ליברמן) |
| 2026-06-01 | 8649d61 | `/politician/427` detail | ✅ | real card + sourced facts + "שווקים בקרוב" placeholder |
| 2026-06-01 | 8649d61 | auth + ledger (signup→grant→faucet) | ✅ | signup→1,000 grant; faucet→1,200; 2nd claim cooldown; balance revalidates in shared header |
| 2026-06-01 | 8649d61 | `/market/[id]` detail (mock) | ✅ | 70/30 odds bar, bet panel "תצוגה מקדימה", 0 console errors |
| 2026-06-01 | 8649d61 | `/` mobile render | ✅ | 0px horizontal overflow; logged-in header usable |
