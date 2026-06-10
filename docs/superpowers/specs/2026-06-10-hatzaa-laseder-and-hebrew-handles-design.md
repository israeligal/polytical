# הצעה לסדר + Hebrew auto-generated handles — Design

**Date:** 2026-06-10
**Status:** Approved (user, 2026-06-10)

## Goal

Two related UX upgrades:

1. **Onboarding**: pre-fill the handle step with a server-generated, political-playful **Hebrew** handle the user can accept as-is (🎲 reroll) or replace by typing their own.
2. **Suggest-a-market**: rename the feature to **"הצעה לסדר"** (Knesset "motion for the agenda"), drop the "מהקהל" eyebrow, and make the suggester provide a **required due date** (pre-fills the admin's `closeAt` at approval). Add an optional resolution-source field (Polymarket-inspired).

## Decisions (with user)

- Feature name: **הצעה לסדר**; CTA **«הגישו הצעה לסדר»**. Route stays `/suggest`.
- Eyebrow **"מהקהל"** removed entirely.
- Due date: **required** on the form; admin can still adjust at approval.
- Handle flavor: political-playful, **real Hebrew letters** → handle validation widened.
- Generation is **server-side** (RSC pre-fill + reroll server action), availability-checked before being offered. Word lists must be large ("a lot of options").
- Optional `מקור הכרעה` free-text field: **in** (recommended, user did not object).

## 1. Handle validation change

- Old rule: `/^[a-z0-9_]{3,20}$/`.
- New rule: 3–20 chars, **either** all-Latin `[a-z0-9_]` **or** all-Hebrew `[א-ת0-9_]`. **No mixed-script handles** (bidi rendering + impersonation risk). Digits and `_` allowed in both.
- `normalizeHandle` unchanged in spirit: strip leading `@`, trim, lowercase (no-op for Hebrew). Reject Hebrew presentation forms/niqqud (only the basic `א-ת` block).
- Anywhere a handle renders inline with other text (leaderboard, discussions, profile), wrap in `<bdi>` / `dir="auto"` so `@שר_הצללים_42` doesn't scramble next to Latin/digits.

## 2. Handle auto-generation

- New module `app/lib/onboarding/handle-generator.ts` (pure, unit-testable) + service function that checks availability.
- **Gender-matched** Hebrew word lists: masculine nouns pair only with masculine adjectives, feminine with feminine (`מנדט_עודף` ✓, `קואליציה_זריזה` ✓, `מנדט_זריזה` ✗). Political-playful vocabulary; target ≥40 nouns × ≥40 adjectives per gender bucket (thousands of combos), optional 1–2 digit suffix.
- Service: generate → check availability via existing repo lookup → retry up to 5 → fall back to appending random digits. Never offer a taken handle.
- Onboarding wizard step 1: input pre-filled from the RSC; 🎲 reroll button calls `generateHandleAction()` (rate-limited like other actions). Manual typing keeps the existing live availability check. Handle remains changeable later (existing behavior, no new work).

## 3. Rename to הצעה לסדר

On `/suggest` page + form + actions:

- Eyebrow "מהקהל": **delete**.
- Title: "הציעו שוק" → **"הצעה לסדר"**.
- Description: rewritten with the Knesset wink (propose-for-the-public-agenda framing; keep the "decidable from an official source" guidance).
- Submit: "שלחו הצעה" → **"הגישו הצעה לסדר"**.
- Success: **"ההצעה לסדר הוגשה — תודה!"**.
- Update every nav/menu/profile/empty-state label that references the old name.

## 4. Required due date on suggestions

- Schema: `proposedCloseAt: timestamp` on `marketSuggestions` — **nullable in DB** (legacy rows), **required by the service** for new submissions.
- Validation: must be in the future; sanity cap ≤ 2 years out. Display Asia/Jerusalem, store UTC (central time module).
- Form: required date picker, label ~"מתי השאלה תוכרע?".
- Admin approval row: `closeAt` picker **pre-fills from `proposedCloseAt`**, stays editable.

## 5. Optional resolution source

- Schema: `resolutionSourceNote: text` (nullable) on `marketSuggestions`.
- Form: optional free-text "מקור הכרעה (לא חובה)" with a placeholder example. Shown to the admin in the review row.

## DB / ops notes

- Both new columns are **additive + nullable** → safe `drizzle-kit push`. ⚠️ The only DATABASE_URL is production; push deliberately and remember declared-in-schema indexes (push drops migration-only ones).

## Testing

- Unit: every generated handle passes the new regex; gender agreement; collision retry/fallback; validation matrix (Latin ✓ / Hebrew ✓ / mixed ✗ / niqqud ✗ / length bounds).
- Integration (PGlite): submission without `proposedCloseAt` or with a past date rejected; approval creates market with admin-confirmed `closeAt` pre-filled from the suggestion.

## Out of scope

- Renaming the `/suggest` URL or the `marketSuggestions` table.
- A separate display-name field.
- Auto-approval or any change to the review workflow itself.
