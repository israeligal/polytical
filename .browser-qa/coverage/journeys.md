# Journey coverage map

| Journey | Last walked | Walks | Coverage |
|---|---|---|---|
| [auth-signup-grant-faucet](#auth-signup-grant-faucet) | 2026-06-01 `8649d61` | 1 | 5/5 |
| [browse-politicians](#browse-politicians) | 2026-06-01 `8649d61` | 1 | 4/4 |
| [browse-markets](#browse-markets) | 2026-06-01 `8649d61` | 1 | 3/4 |

## auth-signup-grant-faucet

**What it is:** A new visitor signs up (email/password), receives the 1,000-coin starting stack, and claims the daily faucet.

**Last walked:** 2026-06-01 `8649d61`. **Walks:** 1. **Coverage:** 5/5

**Steps:**
- ✅ `/signup` email/password form submits (real keyboard input)
- ✅ session established; `proxy.ts` redirects `/signup` → `/` when logged in
- ✅ starting grant: header shows `1,000` via lazy `getOrInitBalance`
- ✅ faucet claim: `1,000 → 1,200`; balance revalidates in the shared (layout) header
- ✅ faucet cooldown: 2nd claim blocked ("כבר קיבלתם היום — חזרו מחר"), balance held at 1,200

**Known gaps:** login (existing-user) path + sign-out not walked this pass.

## browse-politicians

**What it is:** Browse real MKs as caricature cards, filter by name, open a detail page.

**Last walked:** 2026-06-01 `8649d61`. **Walks:** 1. **Coverage:** 4/4

**Steps:**
- ✅ homepage featured 12 real MKs render
- ✅ `/politicians` gallery: 120 real MK cards
- ✅ Hebrew name filter: 'ליברמן' → 1 match
- ✅ `/politician/[personId]` detail: real card + facts ("בסיעה מאז") + "שווקים בקרוב"

**Known gaps:** unknown/non-numeric `personId` → `notFound()` path not walked.

## browse-markets

**What it is:** Browse mock markets, open a market detail with odds + bet preview.

**Last walked:** 2026-06-01 `8649d61`. **Walks:** 1. **Coverage:** 3/4

**Steps:**
- ✅ homepage hot-market + markets grid
- ✅ category rail renders
- ✅ `/market/[id]` detail: odds bar, bet panel "תצוגה מקדימה"
- ❌ category filter (`?cat=`) interaction not walked

**Known gaps:** betting is non-functional by design (Phase 2/3); category-filter click not exercised.
