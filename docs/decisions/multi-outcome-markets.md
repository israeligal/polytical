# Multi-outcome markets

## 2026-06-11 — Single-pick multi, not Polymarket's grouped Yes/No

Polymarket renders "who/what" questions as a group of INDEPENDENT Yes/No markets
(you can hold "No Netanyahu" + "Yes Bennett" simultaneously). We deliberately chose
**one market, N outcomes, one pick** instead: it rides the existing
`unique(userId, marketId)` upsert, keeps the prediction record one-right-or-wrong
per market, and asks the more natural question ("מי?" not 4× "האם?"). No
events/group table was added. Spec:
`docs/superpowers/specs/2026-06-11-multi-outcome-markets.md`.

## 2026-06-11 — A politician-linked winning outcome scopes card progress

New nullable `outcomes.personId` (resolve-by-stable-id, no FK — the
`market_politicians` pattern). Resolution rule: when the winning outcome carries a
`personId`, correct predictors advance card progress **only for that politician**;
an unlinked winner ("אחר", every binary outcome, all legacy rows) keeps the
market-level behavior (every featured MK advances). Rationale: predicting Netanyahu
must not unlock Bennett's card. `repo.createMarket` auto-unions outcome personIds
into `market_politicians`, which is what makes the scoping filter safe.

## 2026-06-11 — Multi outcome-count bounds: 3–8

2 outcomes = a binary market (use that type); 8 is the categorical color-slot
ceiling (`CatColor` 1–8 / `outcomes.cat`). Enforced in `createMarketAction`
(`MULTI_MIN_OUTCOMES`/`MULTI_MAX_OUTCOMES` in `app/lib/markets/constants.ts`).

## 2026-06-11 — Multi detail page: the rows ARE the picker

Open multi markets render sorted candidate rows (portrait, label, share-as-tinted-
fill, pick button) in the main column — no OddsBar block and no sidebar BetPanel
(two pickers would fight over state). The sidebar instead carries the resolution
criterion (`descriptionHe`) or a how-it-works hint. Feed cards use the stacked bar
plus a top-2-outcomes line (`OddsBar compact`) instead of the full legend.
