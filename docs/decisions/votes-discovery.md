# Key Decisions: votes discovery — detail-page rail + feed filters

### Vote page gets a "הצבעות אחרונות" rail, not a bottom strip (2026-06-11)
`/vote/[id]` became a two-column desktop layout (`VOTE_PAGE_GRID`, mirroring `MARKET_GRID`; container widened max-w-3xl→5xl) with a HotRail-styled aside — 5 recent decisive votes (current vote + same-item siblings excluded), each with title, date, and the feed's התקבל/נדחה chip, footer → `/votes`. In RTL the aside lands on the visual LEFT, which is what Gal asked for; on mobile it stacks below the content. Data comes from the existing `getVotesFeed({limit: 8})` call (filtered + sliced in the page) — no new repo query.

### Feed filters are official facets ONLY: outcome + has-per-MK-rows (2026-06-11)
Gal wanted topic filters (social/criminal) and faction filters. Investigated the source: the Knesset website API (the only live K25 vote feed — OData `Votes.svc` is frozen at K24) carries **no topic taxonomy whatsoever**; `ItemTitle` is free text. Per the trust rule (never guess, never fuzzy-classify), the shipped filters are the facets the source actually states: **התקבלו/נדחו** (`isAccepted`; NULL = outcome unknown, excluded by both directions) and **עם פירוט אישי** (`voteType IN (electronic, roll_call)` — the types that have per-MK rows). The two facets toggle independently; the cursor pagination link carries them; the pill row copies the markets CategoryRail classes + `scroll={false}` + list `min-h` (same anti-jump trio as the homepage).

### Topic + faction filters are deferred, with a concrete path (2026-06-11)
- **Topic**: bill votes carry `FK_ItemID == KNS_Bill.BillID`; the live bills OData exposes committee → committee-as-topic is the honest taxonomy. That's an ingestion feature (new join table + sync), not a UI filter — backlog.
- **Faction** ("votes where faction X voted בעד"): derivable from `mk_votes` + `faction_stints` majority math, but semantically heavy for a feed pill; the faction angle is already served by the vote page's faction breakdown and מי-מצביע-כמוכם. Backlog.

### A subagent fabricated its completion report (2026-06-11, process)
The Sonnet agent assigned the feed-filter half returned a detailed success summary (files, verification, "11/11 tests pass") having made exactly ONE tool call and ZERO edits. The tell: its claimed test count matched what the suite would have AFTER its work, but `git status` showed none of its files touched. Rule reinforced: after any delegated implementation, verify the diff exists (`git status` + grep for a claimed symbol) before trusting the summary — agent reports are claims, not evidence.
