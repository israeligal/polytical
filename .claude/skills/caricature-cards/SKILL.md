---
name: caricature-cards
description: Generate AI politician caricature trading-cards for Polytical — fetch a reference photo, drive Gemini image-gen via Claude-in-Chrome, capture the result, and wire it into the app. Covers the 5-tier rarity→frame mapping, the prompt templates, and the clipboard/paste gotchas that make the pipeline reliable. Use when adding or regenerating a politician's `imageUrl` card art.
---

# Caricature Cards Pipeline

Generates the collectible card art shown on politician pages (`PoliticianPortrait` → `politicians.imageUrl` → `public/caricatures/<personId>.png`). Each card is a fully-baked Gemini image (ornate frame + name banner + caricature), generated from the politician's **real** photo so the likeness is accurate.

**Tooling:** the user is logged into `gemini.google.com` (Pro) in Chrome; drive it with the `claude-in-chrome` MCP (NOT chrome-devtools). The macOS clipboard is the transport between the filesystem and Gemini. Never enter the user's credentials — they stay logged in themselves.

## Rarity → frame (the visual ladder)

Tier is computed from `roleHe` by `statureTierForPolitician` in `lib/rarity.ts` (sourced by stable `personId`, never fuzzy-matched). Precedence: sitting-PM → served-as-PM → party-leader → minister → MK.

| Tier (`Rarity`) | Hebrew | Who | Frame in the prompt |
|---|---|---|---|
| `legendary` | זהב | sitting PM | ornate **GOLD** |
| `epic` | כסף | former PM who served | **SILVER** |
| `rare` | ארד | party leader (curated `PARTY_LEADER_PERSON_IDS`) | ornate **BRONZE** |
| `uncommon` | ספיר | minister / Knesset Speaker | ornate deep **ROYAL SAPPHIRE-BLUE** |
| `common` | רגיל | rank-and-file MK (incl. deputy ministers/speakers) | understated **STEEL-GRAY / slate** |

Deputy roles (`סגן`/`סגנית`) correctly fall to `common` — `isMinisterRole` excludes them. Confirm a politician's `roleHe` against the rarity regex before generating so the frame matches the tier the app will render.

## Step 1 — fetch the reference photo (offline, safe)

He-Wikipedia `pageimages` lead image → jpg → png in `.caricature-capture/refs/ref-<personId>.png`:

```bash
title="גילה גמליאל"   # canonical he.wikipedia article title
url=$(curl -s -G "https://he.wikipedia.org/w/api.php" \
  --data-urlencode "action=query" --data-urlencode "redirects=1" \
  --data-urlencode "titles=$title" --data-urlencode "prop=pageimages" \
  --data-urlencode "piprop=thumbnail" --data-urlencode "pithumbsize=700" \
  --data-urlencode "format=json" | python3 -c "import sys,json;p=json.load(sys.stdin).get('query',{}).get('pages',{});v=list(p.values())[0] if p else {};print(v.get('thumbnail',{}).get('source',''))")
curl -s "$url" -o ".caricature-capture/refs/ref-1025.jpg"
sips -s format png ".caricature-capture/refs/ref-1025.jpg" --out ".caricature-capture/refs/ref-1025.png"
```

If a politician has no free lead image (e.g. Israel Katz 468, Zvika Fogel 30859), flag them photo-pending — do NOT guess a likeness.

## Step 2 — generate in Gemini (Claude-in-Chrome)

For each card: set the photo on the clipboard, open a **New chat**, paste the photo, type the tier prompt, submit, wait ~36s.

```bash
osascript -e 'set the clipboard to (read (POSIX file ".../refs/ref-1025.png") as «class PNGf»)'
osascript -e 'clipboard info' | grep -oE 'class PNGf., [0-9]+' | head -1   # verify a PNG is on the clipboard
```

**Prompt template** (swap NAME, the frame phrase per tier, and his/her pronouns; sapphire/legendary use "PREMIUM … like a legendary card", common drops that):

> Use the attached photo as the exact likeness reference for **his/her** face. Create a bold caricature of Israeli politician **NAME** as COLLECTIBLE TRADING-CARD ART with **<FRAME phrase>** and **his/her** name on the top banner. NO stats and NO bottom flavor-text box — only the name banner and the artwork. Exaggerated caricature features (slightly oversized head, expressive larger-than-life face), dynamic confident 3/4 hero pose, clean comic-book ink linework with cel shading, dramatic rim lighting, rich saturated colors, a subtle Israeli-blue energy glow behind **him/her**, vertical 4:5 portrait composition. Punchy, fun, iconic. Make it clearly a stylized caricature, NOT photorealistic. Keep **his/her** face true to the photo.

The current PM keeps the ORIGINAL full-stats gold card (`965`) — that one is hand-restored from a user-supplied image, not regenerated.

## Step 3 — capture (clipboard → file, with a sanity check)

Hover the generated image, click Gemini's **Copy image** button, then dump:

```bash
osascript -e 'set thePng to (the clipboard as «class PNGf»)' \
  -e 'set f to open for access POSIX file ".../fullcard-1025.png" with write permission' \
  -e 'set eof f to 0' -e 'write thePng to f' -e 'close access f'
# REQUIRED sanity check — a real card is a portrait ~825×1024, >300KB:
w=$(sips -g pixelWidth fullcard-1025.png | grep -oE '[0-9]+$'); h=$(sips -g pixelHeight fullcard-1025.png | grep -oE '[0-9]+$')
[ "$h" -gt "$w" ] && echo OK || echo "CLOBBERED — re-click Copy image and re-dump"
```

## Step 4 — wire into the app

```bash
sips --resampleWidth 760 fullcard-1025.png --out public/caricatures/1025.png   # match the 760-wide convention
# then set imageUrl in a scripts/_set-imageurls*.ts (assertNonProductionDb first), resolving by stable personId:
#   db.update(politicians).set({ imageUrl: `/caricatures/${personId}.png` }).where(eq(politicians.personId, personId))
pnpm tsx --env-file=.env scripts/_set-imageurls-x.ts
rm -rf .next/dev/cache/images        # Turbopack image cache — NOT .next/cache/images
```
Then hard-reload the politician page and confirm the card paints + the rarity badge matches the tier. Clean up the temp `scripts/_*.ts` after.

## Gotchas (load-bearing — these cost hours)

- **First paste after "New chat" silently fails.** The first `cmd+v` into a fresh Gemini chat does NOT attach; the input stays empty. Do a SECOND, separate (un-batched) click-input + `cmd+v`. Batching two pastes in one action is flaky.
- **The clipboard is shared with the user.** If they copy-paste mid-capture, your dump grabs THEIR content (seen: a 2936×1534 landscape blob, 256KB, instead of the portrait card). That's why Step 3's portrait check is mandatory — re-copy on failure. If the user is actively on the clipboard, pause and coordinate.
- **`save_to_disk` / javascript_tool base64 returns are blocked**, and Gemini's Download button hangs on a browser prompt. The clipboard → `osascript` dump is the only reliable capture path.
- **Stale next/image after overwrite:** clear `.next/dev/cache/images` (the Turbopack dev path, not `.next/cache/images`) and hard-reload. See the `next-image-cache-path` memory.
- Gemini's window resizes between sessions (≈1470–1568 wide), shifting coordinates — re-find New-chat/input/send positions from a screenshot rather than hard-coding.

## Key files
- `lib/rarity.ts` — `statureTierForPolitician`, `PARTY_LEADER_PERSON_IDS`, `RARITY_HE`
- `components/politician-portrait.tsx` — renders `imageUrl` via next/image `object-cover`
- `app/lib/politicians/adapter.ts` — maps `roleHe`→`role`, `imageUrl`
- `.caricature-capture/` — gitignored scratch: `refs/`, `fullcard-<id>.png`, `all-cards.html` preview
- `public/caricatures/<personId>.png` — the live, committed card art
