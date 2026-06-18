# QA ledger — 2026-06

| Date (UTC) | Commit | Surface / Flow | Outcome | Notes |
|---|---|---|---|---|
| 2026-06-18 | 085fdc2 | duel P1 persistence — create→persist→render (prod, @commenter_qa) | ✅ | minted real challenge via service (makePrediction+createChallenge against prod) → /duel/[token] renders the PERSISTED multi-outcome challenge: @commenter_qa handle from DB, question "מי ירכיב...", challenger pick "בנימין נתניהו" REVEALED in VS band (revealed-on-mount initial=false → dodges occluded-tab rAF), picked badge, 4 rows, overflowX=false. Migration 0033 applied to prod (challenges+challenge_participants). 13 PGlite tests green. % count-up still 0 in occluded tab (focused-only). |
| 2026-06-18 | c025e3a | duel arena `/duel/[token]` landing (localhost branch feat/prediction-duels, @commenter_qa) | ✅ | full render: kicker+VS face-off (mint/gold rings, "???" masks)+question+"נסגר בעוד 75 ימים" chip+two sides כן/לא; Hebrew correct (real DOM bidi, unlike OG/Satori); overflowX=false; 0 console errs |
| 2026-06-18 | c025e3a | duel arena pick→reveal (fetch-blocked, NO prod write) | ✅ | click כן → optimistic reveal: picked side mint border+glow+"המנדט שלך ✓", crowd split 60/40 rendered. Animated sub-reveals (challenger flip, share-CTA swap, fill-bar growth) frozen by occluded QA tab (visibility=hidden→rAF; AnimatePresence mode=wait) — foreground-only, NOT a bug |
| 2026-06-18 | c025e3a | duel mobile reflow + logged-out login-CTA | ⚠️ | CSS-verified (mobile-first max-w-md + grid-cols-2 2-char btns → no overflow); login-CTA code-verified (!isLoggedIn→/login?callbackUrl). Live capture blocked: claude-in-chrome resize_window won't shrink viewport; chrome-devtools can't reach localhost (sandbox) |
| 2026-06-18 | c025e3a | duel invalid token `/duel/garbage` | ✅ | renders not-found UI "הדף לא נמצא"; HTTP 200 — same as /market & /politician app-wide (custom app/not-found.tsx), pre-existing, NOT a duel regression |
| 2026-06-18 | c025e3a | market `/market/[id]` "🥊 התערבו על זה עם חבר" challenge button (logged-in, global, open) | ✅ | renders 185×34 gold pill under meta row. First appeared absent due to stale Turbopack `.next` cache on the pre-existing market route (new duel route compiled fine) — fixed by rm -rf .next + restart; see [[turbopack-worktree-stale-compile]] |
| 2026-06-16 | f631964 | deck vote pills (נגד/בעד BinaryPills) glow+cursor (PR #100, user report) | ✅ | prod /vote/46131: both pills `cursor:pointer` (v4 dropped btn default); בעד hover→shadow-glow-mint live; selected נגד→shadow-glow-coral live (new); 0 console errs; no stance mutation |
| 2026-06-16 | 2879102 | coalition global-context — full feature walk (localhost:3210 branch, @commenter_qa) | ✅ | switcher click on / STAYS on / + scopes (the bug fix); חזרה לארצי; scope sticky to /markets; /g/[slug] management-only (no motions feed); /g/by-id enters scoped feed; scoped hero=coalition motion; reveal gate; profile scope-note + stays national. 0 console errs. Created test group "QA בדיקת סקופ" + 1 motion. Nit: 0-pred odds bar shows "לא 100%" (pre-existing). Deferred: search(code-verified) + mobile(code-responsive). |
| 2026-06-15 | 25d3df6 | coalition global-context REDESIGN baseline (prod, read-only) | ✅ | before-shots for feat/coalition-global-context: `/`→redirect `/g/djowNrd8` (proxy landing); side-page = motions feed (RTL-right) + scoreboard/roster/stance aside (RTL-left); `?view=general` shows national feed reused by scoped feed. No prod mutation; viewed existing QA group. 0 console errs |
| 2026-06-15 | 237a588 | /g/new create-coalition emoji picker (prod) | ✅ | broken empty box gone → 😊 btn inside name field; picker preset grid; pick 🦁→counter 39 (emoji=1 cp); type rest→24, submit enabled |
| 2026-06-15 | 237a588 | coalition icon/name display, no double-emoji (prod) | ✅ | header 🦁+name once; gold switcher chip once; /g list avatar once; DB: nameHe carries emoji, emblem=derived leading 🦁. nit: focus not returned after picker insert |
| 2026-06-11 | 0061203 | hot-rail hover glitch (user report, screenshots) | ⚠️ | NOT repro either theme; shot pixel-matches light-hover; deploy-skew suspect (6 deploys/day); SW ruled out |
| 2026-06-11 | 0061203 | hover/focus token audit, all state variants × both themes | ✅ | every state token has dark override; raised/sunken/ring are aliases — verified in-browser |
| 2026-06-11 | 7e4a516 | prod: Bennett missing from מי-ירכיב market (user report) | 🔴 | NO politicians row; inserted 23511 (OData provenance, inactive) + market link; renders live |
| 2026-06-11 | 7e4a516 | prod: Eizenkot caricature missing (user report) | 🔴 | imageUrl NULL, no file; generated sapphire card via Gemini → /caricatures/30836.png; Bennett silver card too |
| 2026-06-11 | 7e4a516 | prod: ALL 119 active MKs image sweep | ✅ | every politicians.imageUrl set AND serves 200 on prod; no wider issue |
| 2026-06-11 | 1662daa | rename שווקים→תחזיות + card CTA + suggest pill + login note | ✅ | suite 294/294; browser-verified home/login/politicians/seasons; rebased over multi-outcome merge (2 new strings renamed) |
| 2026-06-10 | b605d11 | onboarding: Hebrew handle prefill + 🎲 reroll + mixed-script reject | ✅ | fresh signup → @סגן_אמיץ_75 פנוי✓; reroll; מנדטx inline error; onboarded @הסכם_מסתורי |
| 2026-06-10 | b605d11 | /suggest הצעה לסדר rename + required due date + source field | ✅ | submit gated on date; מגישים…; success copy; no מהקהל eyebrow |
| 2026-06-10 | b605d11 | /admin queue pre-fill from proposedCloseAt + source note | ✅ | closeAt prefilled 2026-12-31T20:00 exact; rejected QA row → queue 0 |
| 2026-06-10 | f9bb1e4+wip | `/market/[id]` mobile grid blow-out (user: "really bad on android") | 🔴 | ROOT CAUSE: 500-char unbroken comment strings; break-words doesn't reduce min-content → grid col 3770px. Fix: wrap-anywhere on comment/notification/suggestion UGC + min-w-0 on market grid children. Verified 412px docW==vw, yyyy… wraps in-card; desktop + home clean, 0 console errors |
| 2026-06-10 | f9bb1e4+wip | no-coins on migrated prod DB (post-0017) | ✅ | market page + homepage render against live Neon post-migration; predictor counts real (5 ניחשו), coin-free header/copy live |
| 2026-06-09 | d738eab+wip | 🔴 logged-in header overflow (mobile, app-wide ROOT CAUSE) | 🔴 | logged-in action cluster (search+theme+faucet+coin+bell+avatar+signout) 438px>390px → layout viewport 601px → EVERY logged-in page shifts right + clips (incl. /market — the user's report). Fixed: new MobileMenu drawer + slim mobile bar (logo·coin·bell·☰). Verified market/onboarding/collection/seasons/profile clientW==scrollW==390 |
| 2026-06-09 | d738eab+wip | mobile navigation (was absent) | 🔴 | nav was `hidden md:flex` w/ no mobile fallback — couldn't reach collection/seasons/suggest/leaderboard on phone. Added hamburger→top-sheet drawer (nav + search + faucet + theme + profile + signout); closes on link/backdrop/X/Esc; light+dark verified |
| 2026-06-09 | d738eab+wip | `/market/[id]` bet panel order (mobile) | 🔴 | aside was source-last → bet UI buried below card+comments on phone. Reordered grid (head→aside→body via col/row placement): mobile = odds→bet→politicians→comments; desktop sticky sidebar unchanged. Verified betTop<polTop<commentsTop |
| 2026-06-09 | d738eab+wip | PWA install pill dismiss (app-wide) | 🔴 | `fixed bottom-4` pill floated over bottom content everywhere, no dismiss, overlapped market CTA. Added × dismiss + localStorage persistence mirroring iOS hint (dismissBipHint). Verified click→pill gone, flag persists. (sonnet-agent fix) |
| 2026-06-09 | d738eab+wip | mobile sweep — home/politicians/politician/collection/seasons/profile/notifications/suggest/search/login/signup | ✅ | all 0-overflow at 390px after header fix; cards/forms/tables render; light+dark spot-checked on market+home+menu. Admin not walked (no admin acct). |
| 2026-06-09 | 7e2fc16 | `/notifications` #418 hydration fix (Israel-time formatter) | 🔴 | repro'd prod cond. (prod build TZ=UTC + browser Asia/Jerusalem, 3h gap) → 0 console errors, times in Israel time; lib/time + eslint guard |
| 2026-06-09 | 34ca9c3 | notification prefs on `/profile` (per-category toggles) | ✅ | 4 category switches render all-on; toggle off → persists across reload; others independent; re-enable works; 0 console errors |
| 2026-06-09 | fabb59a | push: EnablePush CTA on `/notifications` (PR #15, prod:3211) | ✅ | SW active at /sw.js (scope /), perm=default, "🔔 קבלו התראות" renders, 0 console errors |
| 2026-06-09 | fabb59a | push: notifications feed render (widened FeedItem) | ✅ | bet_won (mint) + market_resolved (neutral) correct copy/accents/timestamps; 0 errors; new types not in data |
| 2026-06-09 | c24ef5b | mobile header overflow FIX (MobileMenu collapse) | ✅ | 390px now 0 overflow on `/` + `/notifications`; hamburger menu holds nav + theme + bonus + logout; desktop unchanged; verified in browser |
| 2026-06-09 | fabb59a | mobile 390px `/notifications` + `/` header overflow | ⚠️ | 200px h-overflow from SiteHeader (~590px, no mobile collapse); IDENTICAL on untouched `/`; was pre-existing; FIXED c24ef5b |
| 2026-06-02 | 849c33d | light Israeli theme (default) | ✅ | white bg, BLUE=כן / RED=לא odds bars, blue CTAs, gold coins+hot badge; header/portrait/pill theme-fixed; 0 console errors |
| 2026-06-02 | 849c33d | dark toggle (Sun/Moon) | ✅ | click moon → dark "trading floor" (mint=כן/coral=לא) instantly, no flash; cookie-persisted; click sun → back to light |
| 2026-06-02 | 849c33d | multi-persona dogfood (7 accts) | ⚠️ | money/ledger invariants ALL held across 45+ adversarial probes; leaderboard now populated; 5 bugs found (1 HIGH season-unreachable, see dogfood-fixes) |
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
| 2026-06-11 | e174e70 | /politicians active-filter (120 not 148) | ✅ | departed absent; ⚠️ 2 caricature 400s = cross-branch asset skew |
| 2026-06-11 | e174e70 | /politician/427 activity (bills backfill) | ✅ | 301 bills + 2 queries real; provenance line ok |
| 2026-06-11 | e174e70 | /politician/30083 departed direct-URL | ✅ | renders w/ fallback card; role שר correct (Norwegian law) |
| 2026-06-11 | e174e70 | / home featured + mobile 380px | ✅ | 12 active MKs; 0 errors; no h-scroll |
| 2026-06-11 | 6ef8bec | /votes feed + pagination + tokens | 🔴 | getFeaturedVotes Date-in-raw-sql crash + stale CSS cache; both fixed in-pass |
| 2026-06-11 | 6ef8bec | stance set/flip/retract + k-gate (vote/46077) | ✅ | optimistic pills; progress nudge; aggregate hidden <10 |
| 2026-06-11 | 6ef8bec | /my-match unlock at 5 stances | 🔴 | worst-party tie contradiction → hidden when tied; basis lines honest |
| 2026-06-11 | 6ef8bec | politician record + home module + mobile | ✅ | 16 vote links on /politician/427; no h-scroll 380px |
| 2026-06-11 | 6ef8bec | admin votes: queue/featured/agenda round-trips | ✅ | featured→rail→untoggle; agenda add→drop; left prod clean |
| 2026-06-11 | 127c976 | review-fix re-verify: composite cursor + garbage ?before= | ✅ | literal trigger re-run: page2 200, garbage→first page no boundary |
| 2026-06-11 | 127c976 | review-fix re-verify: returning-user stance seeding /vote/46076 | ✅ | server-rendered בעד✓ + match link w/o casting |
| 2026-06-11 | 2d497e4 | FULL sweep (8 parallel agents): pagination/states/dark/mobile/geometry/auth/departed/regression | ✅ | all flows green; heartbeat stamped (freshness line restored); hamburger 36px + gallery=119 are pre-existing/cross-branch |
| 2026-06-11 | 2d497e4 | /code-review 7-angle batch (14 fixes) | ✅ | set-based decisive recompute, scoreable single-source, signup callbackUrl, parallelized pages |
| 2026-06-11 | 6dc8786 | loading-states overhaul: 12 route skeletons + stories + shared containers | ✅ | audit found home 3/5 sections, my-match wrong state, vote/[id] missing StanceWidget; all rebuilt; collection+notifications gained skeletons |
| 2026-06-11 | 4ebe29c | prod smoke: /votes 200 on vercel.app; cron route deployed (401 unauth) | ✅ | full egress proof = heartbeat after next :30 cron fire |
| 2026-06-11 | a0a3d55 | suggest form: searchable combobox (multi+binary), related hidden in multi | ✅ | Bennett(inactive)+Regev found; label auto-fill; portrait chip; 0 console errors |
| 2026-06-11 | a0a3d55 | hero/feed outcome avatars via stable-id lookup | 🔴 | active-only map dropped Bennett/Eizenkot; fixed feed.ts → all 3 portraits |
| 2026-06-11 | a0a3d55 | market-card equal heights @1400px | 🔴 | 1-line title compacted card; h-full+line-clamp+mt-auto; footer min-h aligns border-t ±1px |
