# PRD — Political-Stature Card Rarity (Gold / Silver / Bronze)

**Status:** Draft for review · **Date:** 2026-06-09 · **Branch:** `feat/polytical-caricatures`

## Problem Statement
Polytical's collectible cards have a rarity frame, but rarity is derived from a **role keyword** (`rarityForRole`) — so *every* minister becomes "legendary" gold and the tier carries no real meaning. In Israeli politics, stature is a clear, well-known ladder (you were either Prime Minister or you weren't), and players instantly read a gold card as "the big one." A rarity that mirrors real political stature makes the cards feel *true*, makes the gold card genuinely scarce, and gives the collection a meaningful spine instead of cosmetic noise.

## Goals
1. **Rarity = office, not adjectives.** A card's tier is a deterministic function of the office the politician holds or has held, sourced from official records — defensible and non-partisan.
2. **Gold is scarce and correct.** Exactly the **sitting** PM is gold at any time; the tier follows the office, not the person (when government changes, gold moves).
3. **A legible metal ladder.** Gold → Silver → Bronze → Base, readable at a glance, matching the premium trading-card look you approved.
4. **Maintainable & dynamic.** Tier recomputes from data (current role + a small sourced whitelist); no per-person hand-tuning and no art regeneration when office changes.

## The stature ladder (Israel-specific)
| Tier | Metal | Hebrew | Who | Scarcity (of 120 MKs) | Our 5 |
|---|---|---|---|---|---|
| **Legendary** | 🥇 Gold | אגדי | **Sitting** Prime Minister | exactly 1 | **Netanyahu** |
| **Epic** | 🥈 Silver | אגדי־כסף | **Former** PM who actually served | a handful (often ~1 sitting MK) | **Lapid** |
| **Rare** | 🥉 Bronze | נדיר | Held/holds a "great office" — senior minister (Defense/Finance/Foreign/Justice/Nat'l Security), Knesset Speaker, opposition leader, or major party leader | a few dozen | **Gantz, Lieberman, Ben Gvir** |
| **Common** | ◻️ Base | רגיל | Rank-and-file MK | the bulk (~90+) | — |

**Precedence (highest wins):** sitting-PM → served-as-PM → great-office → MK. This is why Lapid is Silver (former PM) even though his *current* role is opposition leader (which alone would be Bronze).

## Goals → why this matches your call
- Netanyahu (current PM) = **Gold**. ✅
- Lapid (served as caretaker PM, 2022) = **Silver**. ✅ ("it's ok silver")
- Gantz / Lieberman / Ben Gvir (never PM) = **less** → **Bronze** (they held great offices, so not bottom-tier). ✅

## Non-Goals
1. **Subjective "importance" ranking.** Tier is office-held only. We never editorialize who's a "bigger" politician — the seat decides, per official record. (Neutrality + defensibility.)
2. **Former PMs who aren't sitting MKs** (Bennett, Olmert, Barak…). The card universe is the current 120 MKs for now. A "Hall of Fame" expansion is P2.
3. **Tying rarity to any token economy.** ~~(collect cost / payout weighting by tier)~~ — SUPERSEDED: the Shekoin economy was removed in `0017_remove_coins`; rarity now drives the accuracy-unlock threshold instead (see `docs/decisions/no-coins.md`).
4. **Re-theming non-card surfaces.** This is about the card frame/tier only.
5. **Regenerating caricature art per tier.** Art is person-permanent; the *frame* carries the tier (see Key Decision).

## Key Decision (needs your call) — where does the metal frame live?
You pointed at the **AI-baked full card** (gold frame + banner + stats baked into the image). Two ways to ship it:

**Option A — App draws the frame over AI character-art (recommended).**
AI generates only the caricature (face + aura + Jerusalem backdrop). The **app** renders the metal frame, name banner, tier gem, and stats as crisp HTML/SVG, driven by the live stature tier.
- ✅ Frame is pixel-perfect, Hebrew-correct, identical across all cards.
- ✅ **Dynamic:** when the PM changes, gold→silver recolors automatically — no new art.
- ✅ No gibberish text ever.
- ➖ The on-card frame is "ours," not the exact gold filigree Gemini drew for Netanyahu (we'd design a frame that matches that vibe).

**Option B — AI bakes the whole card (what you pointed at).**
Prompt Gemini for the full gold/silver/bronze card per politician.
- ✅ Exactly the look you saw.
- ➖ Frames come out **inconsistent** (Lapid rendered silver unprompted; gold needs coaxing).
- ➖ **Static:** a baked gold frame can't become silver when office changes — requires re-generating art.
- ➖ **Gibberish** subtitle/flavor text is unavoidable (AI can't spell sentences); names sometimes misspell.

**My recommendation: Option A** — it delivers the same premium feel *and* makes the gold/silver/bronze ladder real, dynamic, and clean. Option B is viable if you want the exact baked look for a fixed launch set and accept the gibberish + manual upkeep.

## Requirements
### Must-Have (P0)
1. **`statureTierForPolitician({ personId, roleHe })`** in `lib/rarity.ts` returns `legendary | epic | rare | common` by the precedence above.
   - *Given* a politician whose `roleHe` is `ראש הממשלה` → *then* `legendary`.
   - *Given* a `personId` in the sourced `FORMER_PM_PERSON_IDS` whitelist → *then* `epic`.
   - *Given* a current senior office (`שר…`, `יו״ר הכנסת`, `ראש האופוזיציה`) or `personId` in the `GREAT_OFFICE_PERSON_IDS` whitelist → *then* `rare`.
   - *Given* none of the above → *then* `common`.
2. **Sourced whitelists.** `FORMER_PM_PERSON_IDS` (and any `GREAT_OFFICE_PERSON_IDS`) are exact `personId` lists with a `sourceUrl` (official PMO/Knesset record) per CLAUDE.md (resolve by stable id, never fuzzy; absent fact → base tier, never guessed).
3. **Metal palette.** Recolor `--rarity-*` tokens (light + dark) to Gold / Silver / Bronze / Base; keep the 4-name API (`common|rare|epic|legendary`) so existing components keep working.
4. **Card uses stature tier**, not `rarityForRole`, in `caricature-card.tsx` (frame, glow, tier label). `rarityForRole` is removed or deprecated in lockstep with call sites.
5. **The 5 top cards reflect tiers**: Netanyahu Gold, Lapid Silver, Gantz/Lieberman/Ben Gvir Bronze.

### Nice-to-Have (P1)
6. Tier-specific frame flourish (e.g., gold gets the glow it already has; silver/bronze get matched treatments).
7. A tiny `docs/decisions/card-rarity-stature.md` recording the precedence + the "alternate-PM = Bronze" call.

### Future (P2)
8. "Hall of Fame" cards for former PMs not in the Knesset.
9. Rarity-weighted economy (collect cost / payout by tier).
10. Per-tier card-back / holo treatment for ultra-rare.

## Open Questions
- **[stakeholder] Alternate PM who never rotated in (Gantz):** Silver or Bronze? *Recommend Bronze* — only politicians who actually served as PM get Silver. (Lapid served; Gantz did not.)
- **[data] Source for "great office" history:** live `roleHe` covers *current* senior roles; do we need a curated former-senior whitelist for v1, or is "current senior office OR former PM" enough? *Recommend: v1 = current senior office + former-PM whitelist; defer former-senior history.*
- **[design] Option A vs B** (the Key Decision above).
- **[design] Silver/Bronze frame treatment** if Option A — match the gold card's vibe in two more metals.

## Success Criteria
- Browsing the app, tiers read true: 1 gold (the PM), Silver only for real former PMs, Bronze for great-office holders, everyone else Base — verified against official records.
- Changing the sitting-PM data flips gold to the new PM and demotes the old to Silver with **no art changes**.
- Zero gibberish text on any card.

## Phasing
1. **Phase 1 (this branch):** palette recolor + `statureTierForPolitician` + whitelist + wire card → ship the 5 top with correct tiers. (Frame approach per Key Decision.)
2. **Phase 2:** backfill tiers across all 120; design Silver/Bronze frame flourishes.
3. **Phase 3 (P2):** Hall of Fame. ~~economy weighting~~ (superseded — no coin economy; rarity drives the accuracy-unlock threshold).
