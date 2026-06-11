# Card overlay assets (decouple-the-frame system)

Assets for rendering the **frame as an overlay** instead of baking it into each
caricature PNG. Proven working: a transparent-window frame composited over bare
content (photo or frameless caricature) = a finished card; swapping the frame
changes the tier with **zero caricature regen**.

## Frames (`frames/`)
Six rarity frames, cropped from the design sheet (~565×770, 4:5):
`gold` · `silver` · `bronze` · `blue-sapphire` · `ruby` · `green-sapphire`.
- `frame-<tier>.png` — opaque crop (dark portrait window).
- `frame-<tier>-overlay.png` — **window knocked out to transparent** → ready to
  composite over content. Each frame includes the top banner, the LEADER + gem +
  PWR/DEF stat row, and the empty bottom name plate.

Composite: cover-fit the content image into the frame's transparent window bbox,
then `alpha_composite` the frame on top. (Window bbox is detectable as the
alpha==0 region; for gold it's ~x[47..519] y[110..716] within the 565×774 frame.)

## Name plate (`nameplate-template.png`, `bibi-clean-empty-plates.png`)
The large empty plate to render **name / rank / place-on-list** as live text,
tier-tinted, over the plate region.

## ⚠ Tier mapping is a NEW design decision (deferred)
These six frames (gold/silver/bronze/blue-sapphire/ruby/green-sapphire) are a
RICHER set than the live 5-tier ladder in `lib/rarity.ts`
(legendary=gold, epic=silver, rare=bronze, uncommon=sapphire, common=slate).
There is no "slate" frame here, and Ruby + Green-Sapphire are new. Before wiring
the overlay system, decide how the 120 politicians map onto these 6 frames
(e.g. faction-colored gems for the backbench instead of one flat slate).
