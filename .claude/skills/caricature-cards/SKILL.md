---
name: caricature-cards
description: Generate a politician caricature trading-card for Polytical — source a real photo, drive Gemini image-gen in Chrome to make the card, capture it, and wire it into the app (public/caricatures/<personId>.png + politicians.imageUrl). Covers the rarity→frame ladder, the prompt, and the clipboard/paste gotchas. Use when adding or regenerating a politician's card art.
---

# Caricature Cards Pipeline

Each card = a fully-baked Gemini image (frame + name banner + caricature) made from the politician's **real** photo. The user is logged into `gemini.google.com` (Pro); drive it with the `claude-in-chrome` MCP. The macOS clipboard moves images between disk and Gemini. Never enter the user's credentials.

## Rarity → frame
Tier comes from `roleHe` via `statureTierForPolitician` in `lib/rarity.ts` (by stable `personId`, never fuzzy). Precedence: sitting-PM → served-as-PM → party-leader → minister → MK. Deputies (`סגן/סגנית`) are common.

| Rarity | Hebrew | Who | Frame phrase in prompt |
|---|---|---|---|
| legendary | זהב | sitting PM | ornate GOLD |
| epic | כסף | former PM | SILVER |
| rare | ארד | party leader (`PARTY_LEADER_PERSON_IDS`) | ornate BRONZE |
| uncommon | ספיר | minister / Speaker | ornate deep ROYAL SAPPHIRE-BLUE |
| common | רגיל | rank-and-file MK | understated STEEL-GRAY / slate |

## Per card

**1. Photo** → `.caricature-capture/refs/ref-<personId>.png`. Sources, in order: he-Wikipedia `pageimages` (lead image); Wikidata Commons by exact Hebrew name (`?item wdt:P9770 ?kid; wdt:P18 ?img; rdfs:label ?l (he)` via query.wikidata.org); per-MK Wikidata/Commons name search. No free photo → flag photo-pending, don't guess a likeness.

**2. Generate in Gemini** — set photo on clipboard, New chat, paste, type prompt, submit, wait ~36s:
```bash
osascript -e 'set the clipboard to (read (POSIX file ".../ref-<id>.png") as «class PNGf»)'
```
Prompt (swap NAME / frame phrase / his·her; legendary+uncommon add "PREMIUM … like a legendary card", common omits):
> Use the attached photo as the exact likeness reference for **his/her** face. Create a bold caricature of Israeli politician **NAME** as COLLECTIBLE TRADING-CARD ART with **<FRAME>** and **his/her** name on the top banner. NO stats and NO bottom flavor-text box — only the name banner and the artwork. Exaggerated caricature features (slightly oversized head, expressive larger-than-life face), dynamic confident 3/4 hero pose, clean comic-book ink linework with cel shading, dramatic rim lighting, rich saturated colors, a subtle Israeli-blue energy glow behind **him/her**, vertical 4:5 portrait. Punchy, fun, iconic. Clearly a stylized caricature, NOT photorealistic. Keep **his/her** face true to the photo.

The sitting PM (965) keeps a hand-supplied full-stats gold card — don't regenerate.

**3. Capture** — hover the result, click Gemini's **Copy image**, dump + verify it's a portrait (clobber check):
```bash
osascript -e 'set p to (the clipboard as «class PNGf»)' -e 'set f to open for access POSIX file ".../fullcard-<id>.png" with write permission' -e 'set eof f to 0' -e 'write p to f' -e 'close access f'
w=$(sips -g pixelWidth fullcard-<id>.png|grep -oE '[0-9]+$'); h=$(sips -g pixelHeight fullcard-<id>.png|grep -oE '[0-9]+$')
[ "$h" -gt "$w" ] && echo OK || echo "CLOBBERED — re-Copy and re-dump"
```

**4. Wire** — `sips --resampleWidth 760 fullcard-<id>.png --out public/caricatures/<id>.png`; set `imageUrl='/caricatures/<id>.png'` by `personId` (script starts with `assertNonProductionDb()`); `rm -rf .next/dev/cache/images`; hard-reload and confirm the card + rarity badge.

## Gotchas (load-bearing)
- **First paste after "New chat" fails silently** — do a second, separate (un-batched) click-input + `cmd+v`.
- **Clipboard is shared with the user** — a stray copy yields a landscape/tiny dump, not the portrait card. Step 3's portrait check is mandatory; re-copy on failure. Pause if the user is actively on the clipboard. (Alternative: Gemini's `+` file-picker upload via `mcp__claude-in-chrome__file_upload` frees the input side.)
- Capture path: Gemini's Download button hangs and base64 returns are blocked — clipboard→`osascript` is the only reliable capture.
- Stale image after overwrite: clear `.next/dev/cache/images` (Turbopack dev path), hard-reload. ⚠ `.env DATABASE_URL is production` — there's no dev DB.
- Gemini window resizes between sessions — re-find New-chat/input/send from a screenshot, don't hard-code.
- **Wrong-person photos:** fuzzy name-matching a photo source can return the WRONG person. Gemini REFUSES to caricature a recognizable real face it identifies as someone else (stalls with a "who is this?" text reply) — treat that refusal as a signal the ref photo is wrong; re-source, don't force it. Prefer exact-name / Knesset-ID matches over fuzzy.
- **Scaling via subagents:** the grind parallelizes across SESSIONS but not within one — clipboard + the single Gemini window are shared singletons, so run Sonnet subagents SEQUENTIALLY (one card/agent at a time), never in parallel. A robust attach inside a subagent: focus the `.ql-editor`, inject the clipboard image via `navigator.clipboard.read()` + a synthetic `ClipboardEvent('paste')`, type via `document.execCommand('insertText', …)`, click `button[aria-label="Send message"]`. Always re-verify each saved card is a portrait (h>w, >300KB) — subagents over-accept landscape/garbled outputs.

## Files
`lib/rarity.ts` · `components/politician-portrait.tsx` (renders `imageUrl`, object-cover) · `app/lib/politicians/adapter.ts` (`roleHe`→`role`,`imageUrl`) · `.caricature-capture/` (gitignored scratch: `refs/`, `fullcard-*.png`) · `public/caricatures/<personId>.png` (live, committed).
