# QA ledger — 2026-06

| Date (UTC) | Commit | Surface / Flow | Outcome | Notes |
|---|---|---|---|---|
| 2026-06-01 | 8649d61 | `/politician/[id]` tenure label | 🔴 | "בכנסת מאז"→"בסיעה מאז" (faction-since, not career); fixed 8649d61, verified in browser |
| 2026-06-01 | 8649d61 | `/` homepage render (desktop) | ✅ | 12 real featured MKs, RTL, 0 console errors |
| 2026-06-01 | 8649d61 | `/politicians` gallery + Hebrew filter | ✅ | 120 real MK cards; filter 'ליברמן' → 1 (אביגדור ליברמן) |
| 2026-06-01 | 8649d61 | `/politician/427` detail | ✅ | real card + sourced facts + "שווקים בקרוב" placeholder |
| 2026-06-01 | 8649d61 | auth + ledger (signup→grant→faucet) | ✅ | signup→1,000 grant; faucet→1,200; 2nd claim cooldown; balance revalidates in shared header |
| 2026-06-01 | 8649d61 | `/market/[id]` detail (mock) | ✅ | 70/30 odds bar, bet panel "תצוגה מקדימה", 0 console errors |
| 2026-06-01 | 8649d61 | `/` mobile render | ✅ | 0px horizontal overflow; logged-in header usable |
