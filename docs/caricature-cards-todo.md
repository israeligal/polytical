# Caricature cards — roster coverage

**✅ COMPLETE: every active Knesset member is carded (120 cards live on prod).**
The only DB row without a card is Merav Michaeli (personId 23565) — intentionally excluded by the maintainer (no longer relevant).

## How coverage was reached
Cards are generated with the interactive Gemini-in-Chrome pipeline (see `.claude/skills/caricature-cards`). Photos were sourced, in order of preference, from:
1. he-Wikipedia `pageimages` lead image,
2. Wikidata Commons by exact / fuzzy Hebrew name and by English name (politician-verified),
3. the **official Knesset member photos** (`fs.knesset.gov.il/globaldocs/MK/<internal-id>/…`) — reached via the browser (server-side curl is bot-blocked). This is the authoritative source and resolved the long tail of first-term backbenchers, and corrected two earlier wrong-person matches (Taieb, Tur-Paz).

## Rarity tiers (frame baked into the art) — `lib/rarity.ts`
gold = sitting PM · silver = former PM · bronze = party leader · sapphire = minister/Speaker · slate = rank-and-file MK. Israel Katz + Goldknopf are sapphire; the rest of the backbench is slate.

## Keeping it current
The weekly Sonnet routine (`trig_018PkYLFapcB2ddXTcEV42Gs`, Mondays 08:00 Asia/Jerusalem) diffs the live Knesset roster against the cards in `public/caricatures/` and the tiers in `lib/rarity.ts`, then opens a PR listing:
- **NEW** members with no card (generate via the skill),
- **DEPARTED** members (stale cards),
- **TIER CHANGES** (e.g. a backbencher promoted to minister → needs a sapphire re-gen),
- skill drift.

When the routine flags a new member, source their photo (Knesset CDN preferred) and run the `caricature-cards` skill — typically a single Sonnet subagent per the per-card SOP.

> Note: the politicians table is a 25th-Knesset snapshot; a few roles may lag reality between re-ingests (the routine surfaces this). A fresh `pnpm ingest:knesset` recomputes names/roles → rarity tiers.
