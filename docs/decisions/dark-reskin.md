# Decision log — Dark "trading-floor" re-skin (from the Ploytical design handoff)

The user exported a Claude Design handoff (`design_handoff_ploytical`) — a dark, collectible-prediction-market design — and asked to implement it. Full re-skin chosen (restyle every existing surface; keep all functionality; no new backend features).

## Strategy: remap semantic tokens, then restyle components
The app already used semantic Tailwind tokens (`bg-card`, `text-foreground`, `text-primary`, `text-positive/negative`, `bg-accent`, `border-border`…). Rather than touch every component, I **remapped the `:root` token VALUES** in `globals.css` from the light OKLCH "Ballot & Ink" palette to the dark hex palette from `prototype/colors_and_type.css`, keeping the `@theme` utility names. This flipped the whole app to dark in one move; component edits then handle the design-specific details (glows, the mint/coral odds split, the Shekoin coin, 22px card radius, rarity frames).

## Token mapping (light → dark)
- `--background` → `#0B1020` (deep navy); `--card` → `#1A2244`; `--muted` → `#121831`; added the surface ladder (`--bg-sunken`, `--bg-raised`, `--bg-overlay`) + `--line-soft`.
- `--foreground` → `#F5F7FF` (text-hi); `--muted-foreground` → `#A9B2D6` (text-mid); added `--text-low`.
- `--primary` → mint `#00E0A4` (the YES/confirm/action accent), `--primary-foreground` → dark ink `#07112B`.
- `--accent` → gold `#FFC23D` (Shekoins/hot/celebration), exposed as `--color-gold` too.
- `--positive` → mint, `--negative` → coral `#FF4D6D` (with `*-soft` tints); `--destructive` → coral.
- Added: `--blue`, `--purple`, rarity tiers (`--rarity-common/rare/epic/legendary`), `cat-1..8` re-tuned vivid-on-dark, glow box-shadows (`--shadow-glow-mint/coral/gold`) + depth shadows (`--shadow-1..3`), `--radius-card: 22px`.
- Fonts: Frank Ruhl Libre → **Secular One** (display, weight 400 — ships heavy), kept **Heebo** (UI/body), added **Rubik** (`--font-accent`, chips/badges). `:root` body grain dropped for a subtle top radial.

## Components restyled
- `icons.tsx`: added the gold **Shekoin** coin (Coin now aliases it), the duel-chevron **PolyticalLogo**, **Crest** (4 faction suits), **Gem** (4 rarities), Bell.
- `odds-bar.tsx`: the signature **mint YES / coral NO split bar** with the label+% set inside each segment in dark ink, widths animating.
- `market-card.tsx`: 22px radius, deep shadow + mint hover glow, Heebo-800 question, gold Shekoin volume.
- `caricature-card.tsx` + `politician-portrait.tsx`: **rarity-frame collectible** look — 2.5px rarity border, gem + faction crest header, legendary gold glow, dark rarity-tinted portrait dome. Rarity/suit are DERIVED from role/category (`lib/rarity.ts`) — presentation only, no collection economy.
- `site-header.tsx`: glassy translucent dark bar + duel-chevron logo (dropped the light newspaper masthead strip).
- `coin-pill.tsx`: gold-tinted Shekoin balance pill. `bet-panel.tsx`: mint/coral soft toggles, gold stake, mint-glow confirm. `badges.tsx` + `category-rail.tsx`: Rubik pills, mint-fill active. `faucet-button.tsx`: gold + glow. `leaderboard-row.tsx`: mint "you" rank + gold balance.

## Notes / deferred
- The handoff's NEW feature-screens (multi-step onboarding, notifications, seasons, search, win/loss celebrations, card-collection economy, admin redesign) were **out of scope** — this pass is the visual re-skin of the existing functional app only.
- Politician portraits remain initial-based placeholders (the design ships drop-in image slots, no real likenesses); a real caricature/image source is future work.
- Per-page pixel-tuning beyond the shared components (profile/admin/suggest fine-tuning) inherits the tokens + restyled components and is coherent, but wasn't individually pixel-matched to the gallery.
