# Decision log — Polish & harden sweep (Phase 8)

A no-new-feature hardening pass, scoped from a 5-dimension discovery workflow (41 findings). What shipped and why.

## Resilience boundaries (were entirely missing)
Added `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`. Before this, a bad `/market/<id>` or `/politician/<id>` (both call `notFound()`) rendered Next's English LTR default inside a Hebrew RTL app, and any RSC DB throw crashed to a blank/overlay. The new boundaries render on-brand Hebrew copy inside the layout (so dir/fonts/header are inherited); `global-error` supplies its own `<html dir="rtl">` since it replaces the layout. `error.tsx` logs through the project logger (not bare `console.error`).

## Rate limiting extended to comments + bets (CLAUDE.md mandate)
`app/lib/rate-limit.ts` (built in Phase 7) now also guards `placeBetAction` (30/min), `postCommentAction` (8/5min), and `upvoteCommentAction` (40/min) — Better Auth's limiter can't see a Server Action. Admin + faucet actions are intentionally NOT rate-limited (role-gated / self-limiting via the 24h cooldown).

## Form resilience: try/catch around every action call
Actions deliberately `throw` on unmapped errors ("errors over fallbacks" on the server). Every client form (`bet-panel`, `comment-form`, `comment-row` optimistic toggle/hide, `faucet-button`, `suggest-market-form`, `create-market-form`, `market-admin-row`, `suggestion-review-row`) now wraps the awaited action in try/catch with a Hebrew fallback — so a thrown action shows "אירעה שגיאה — נסו שוב" instead of leaving the button frozen or the optimistic count desynced. The server still throws; the client never hangs.

## Accessibility
- **Global focus-visible ring** in `globals.css` (`outline: 2px solid var(--color-ring)`) — was entirely absent (WCAG 2.4.7). *(Caught a bug in browser QA: first wrote `var(--ring)` which is undefined → the outline silently dropped; the defined token is `--color-ring`.)*
- **prefers-reduced-motion** global guard neutralizes the hover-lifts + odds-bar width transitions (WCAG 2.3.3).
- Decorative initial-avatars (`aria-hidden`) in header/profile/leaderboard; the caricature portrait gets `role="img"` + `aria-label`; comment upvote gets an `aria-label`; create-market outcome inputs get `aria-label`; the resolution source-URL input gets `dir="ltr"` + `type="url"`.
- Tap targets raised toward ~40px (category rail, faucet button, comment upvote, header nav links).

## Loading skeletons
`loading.tsx` for home, `market/[id]`, `politician/[id]`, `politicians`, `profile`, `suggest` — layout-faithful `animate-pulse` skeletons with `role="status"` so navigation isn't a blank wait on a cold Neon connection.

## DRY
- `EmptyState` (shared dashed box) + `StatusChip` (closed-union tone → soft-bg ↔ saturated-text pairing in one place) extracted and used on the profile + homepage.
- `categoryLabel` widened to `(key: string)`, removing 3 `as Parameters<typeof categoryLabel>[0]` type-erasure casts (a CLAUDE.md violation).

## Deferred (low value, left as follow-ups)
- Migrating the remaining ~7 inline empty-states to `EmptyState`, and the category/outcome chips to `StatusChip` (functional today).
- A Zod schema for `placeBetAction` inputs — the existing hand-rolled guards already reject NaN/below-min and null markets; adding Zod would break the codebase's hand-rolled-validation consistency.
- Per-segment `error.tsx` on dynamic routes (the root boundary covers them).
- `comment-thread` `aria-live` on the count; a friendly "אין הרשאה" panel for a non-admin hitting `/admin` (currently a silent redirect home).
