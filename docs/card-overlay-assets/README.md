# Card overlay assets (future work)

When we want **dynamic per-card content rendered as an app overlay** (instead of
baked into the PNG), these are the starting assets:

- `bibi-clean-empty-plates.png` — a clean gold-frame card with TWO empty bottom
  plates (a thin accent strip + a large name plate). The live Netanyahu card
  (`public/caricatures/965.png`) uses this with the plates left empty.
- `nameplate-template.png` — the large empty plate cropped out, the canvas for
  rendered text.

## The idea (deferred)
Render the politician's **name** and game-dynamic bits — e.g. **rank / place on
the leaderboard / recent order** — as a CSS/SVG/text overlay positioned over the
plate region, colored by rarity tier. This pairs with the decouple-the-frame
direction: caricature + frame baked, but the name/stats plate is live data, so
nothing needs regenerating when a rank or name changes.

Pattern: position the overlay over the plate's normalized rect (the plate sits in
roughly the bottom ~18% of the 4:5 card), render the name in the app's display
font, tier-tinted. Today the plates are decorative/empty.
