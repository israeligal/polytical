# Key Decisions: /markets page + stable homepage filtering

### Browsing depth lives on /markets, not in-place expansion (2026-06-11, #53)
The homepage grid stays a 9-card teaser; "see more" navigates to a dedicated `/markets` page (full grid, category pills, own skeleton) instead of the short-lived `?all=1` in-place expander — one mechanism, and the homepage length stays bounded. No numbered pagination yet: at ~10 open markets the page IS the pagination; add `?page=` only when the count makes a single grid heavy (~50+). Route is English (`/markets`) per the standing rule that code/route identifiers stay `market` while all user-facing copy says תחזיות.

### Filter clicks must not move the page — three roots fixed together (2026-06-11, #53)
The category-pill jump had three independent causes, and fixing any one alone still jumps: (1) the hero only rendered when no `?cat=` was set, so filtering unmounted the whole spotlight+rail block — now the hero is picked globally from ALL cards and persists; (2) pill `Link`s scrolled to top by default and carried `#markets` anchors — now `scroll={false}`, no anchors; (3) sparse categories collapsed the grid height — now a stable `min-h` on the grid wrapper. Homepage still makes one markets DB pass: it fetches all cards and filters in memory (`market.category`), rather than re-querying per category.

### Shared feed pipeline: `getMarketCards` in app/lib/markets/feed.ts (2026-06-11, #53)
The bundles→cards assembly (markets → outcomes/personIds → portraits map → live counts) was extracted from `app/page.tsx` so `/markets` doesn't duplicate it. Extraction happened BEFORE fanning implementation out to two parallel agents, so neither owned a moving target. Lesson from this round: two agents both "fixed" `category-rail.tsx` despite ownership instructions, and the later write silently dropped the earlier one's `scroll={false}` — after parallel agents touch adjacent UI, re-read the shared file, don't trust the summaries.
