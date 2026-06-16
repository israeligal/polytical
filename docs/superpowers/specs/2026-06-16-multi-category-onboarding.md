# Spec — Multi-category onboarding + per-category aura lights

Date: 2026-06-16 · Branch: `feat/multi-arena-categories` (off main)

Let a user pick **1–3 focus categories** at onboarding (instead of one), each lighting up in its **own color**. No auth changes. No schema migration.

## Storage — no migration (prod-safe)
The picks are stored **comma-joined in the existing `users.arena text` column** (`"elections,security"`). Verified safe:
- Nothing reads `session.user.arena` (the proxy gate keys on `onboardedAt` only).
- Nothing queries `arena` relationally (the feed doesn't use it — see §Future).
- Existing single values are valid 1-item lists → no backfill, no `db:push`, no destructive op.
- Encoding is contained in `app/lib/onboarding/arenas.ts` (`parseArenas` / `formatArenas`, `MAX_ARENAS = 3`).

## Layers
- `app/lib/onboarding/arenas.ts` *(new, pure)* — `MAX_ARENAS`, `parseArenas`, `formatArenas` (validates 1..MAX, known `CATEGORIES` keys, dedupes; throws `InvalidArenaError`). Client-safe (no DB import).
- `service.ts` `completeOnboarding` — `arena: string` → `arenas: string[]`; `formatArenas` validates + comma-joins; repo write unchanged.
- `actions/onboarding.ts` `completeOnboardingAction` — `{ arenas: string[] }`.
- `onboarding-wizard.tsx` — step 2 multi-select (toggle, cap 3), "המשך" enabled at 1..3, "נבחרו X/3" counter.

## Aura lights
- Each category card plumbs its theme-aware color into a `--aura` CSS var inline (`var(--cat-${i+1})`); static utility classes read it.
- Selected: `border-[color:var(--aura)]` + `bg-[color-mix(in_oklab,var(--aura)_14%,transparent)]` tint + `shadow-[0_0_26px_-6px_var(--aura)]` bloom + lit Crest icon + `◉` indicator. Unselected: dim; at-cap: `opacity-60`. `motion-reduce:transition-none`.
- No new color tokens — reuses the existing `--cat-1..6`.

## Tests
- `arenas.test.ts` — parse/format edge cases (1..MAX, empty, unknown, over-cap, dedupe, round-trip).
- `service.test.ts` — single + multi (comma-join), rejects empty/unknown/over-cap, terminal. (40 onboarding tests pass.)

## Future — feed personalization (NOT built; tracked here per request)
The feed currently ignores `arena`. Future plan: in `app/lib/markets/feed.ts` (`getMarketCards`) + `/markets`, surface open markets whose `category ∈ parseArenas(user.arena)` above the rest (stable sort: in-arena first, then existing order), with a "כל הקטגוריות" escape. Needs a small repo read of the viewer's arenas + ordering tests. Separate PR.
