# הצעה לסדר + Hebrew handles — Decisions

## 2026-06-10 — Feature naming: הצעה לסדר
The community suggest-a-market flow is branded **"הצעה לסדר"** (Knesset "motion for the agenda"), CTA **«הגישו הצעה לסדר»**. Considered שאילתה (collides with "DB query" in modern Hebrew) and הצעת חוק (a market is a question, not a law). The "מהקהל" eyebrow was removed — the Knesset framing carries the community angle. Route stays `/suggest`; `market_suggestions` table not renamed (URL/schema churn with zero user value).

## 2026-06-10 — Handles: single-script rule, real Hebrew letters
`HANDLE_RE` now accepts all-Latin `[a-z0-9_]{3,20}` **or** all-Hebrew `[א-ת0-9_]{3,20}` — never mixed. Mixed-script handles are a bidi-rendering hazard and an impersonation vector (Latin/Hebrew homoglyph games). Only the base letter block is allowed (no niqqud/geresh) so normalization stays the trivial trim/strip-@/lowercase. Handles rendered inline are wrapped in `<bdi>`.

## 2026-06-10 — Handle suggestions are server-generated
Generation lives in the onboarding service (RSC pre-fill + rate-limited `generateHandleAction` for 🎲 reroll) so every suggestion is availability-checked before it's shown — the wizard never offers a taken handle. Word lists are gender-paired (masc noun + masc adjective / fem + fem) because Hebrew adjectives inflect; ~49+40 nouns × 40+40 adjectives ≈ thousands of combos before the optional numeric suffix.

## 2026-06-10 — Due date is the proposer's, admin still decides
`proposedCloseAt` is **required by the service** for new suggestions (future, ≤2y sanity cap) but **nullable in the DB** (legacy pending rows). It pre-fills the admin's closeAt picker at approval and stays editable — the proposer owns intent, the admin owns the final market. Optional `resolutionSourceNote` (≤300 chars) added per Polymarket's proposal guidance (title + resolution source + demand); shown to the reviewer only.
