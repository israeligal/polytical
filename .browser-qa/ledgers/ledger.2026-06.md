# QA ledger — 2026-06

| Date (UTC) | Commit | Surface / Flow | Outcome | Notes |
|---|---|---|---|---|
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
