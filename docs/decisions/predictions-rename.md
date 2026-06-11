# Key Decisions: Rename "שווקים" → "תחזיות" (copy-only)

### vitest must exclude `.claude/worktrees/**` (2026-06-11, main)
A root `pnpm test` was sweeping in duplicated suites from other sessions' worktree checkouts (`.claude/worktrees/*`), whose in-progress schema changes fail against the root's migration chain — 72 "failed" files that had nothing to do with the working tree. Added `exclude: ["**/node_modules/**", "**/.claude/**"]` to both vitest projects. RTL tests that query by Hebrew label (notification-prefs, notifications service) were updated with the rename — UI-copy assertions live in tests too.

### "תחזיות" replaces "שוק/שווקים" in ALL user-facing Hebrew copy (2026-06-11, main)
With the coin economy gone (`no-coins.md`) nothing is traded, so "שוק" stopped describing the product. User picked **תחזיות** over the alternatives (הצעות — collides with "הצעה לסדר" + "הצעות חוק"; שאלות — flavorless; "על סדר היום" — cute but unclear standalone). Singular is feminine: a renamed string must agree (התחזית נסגרת / בוטלה / הוכרעה), so the sweep was exact-string, not mechanical find-replace.

### Code identifiers, routes, and DB names stay `market` (2026-06-11, main)
Only Hebrew strings changed. `markets` table, `/market/[id]`, `marketId`, `MarketCard`, `marketsForPolitician`, the `/#markets` anchor, and notification type names (`market_resolved` …) all keep their names — same rationale as keeping the `bets` table in the coin removal: a cosmetic rename cascading through dozens of sites + a migration buys nothing. The Hebrew layer is the product language; the English layer is legacy-stable.

### Push/notification copy is single-sourced; tests updated in lockstep (2026-06-11, main)
`composeNotification` is the one place notification Hebrew lives (push payloads derive from it), so the rename touched it once + its `payload.test.ts` expectations. Old already-delivered notification rows keep their stored old-copy titles — acceptable, they're historical.

### "הצעה לסדר" promoted from nav link to gold pill CTA (2026-06-11, main)
Moved out of the plain `NAV` array into a dedicated accent-styled pill (desktop nav + mobile menu, `border-accent/50 bg-accent/10 text-gold` + Ballot icon). Rationale: it's the community's only "create" action and was drowning as the 6th grey link. Gold (not primary blue) so it reads as special-action, distinct from the login button.

### /login shows a contextual note per gated destination (2026-06-11, main)
`/login?callbackUrl=/suggest` renders a gold note ("התחברו כדי להגיש הצעה לסדר משלכם…") via a `CALLBACK_NOTES` prefix table — extensible for future gated surfaces. Login now honors `callbackUrl` on success (email/password push + Google OAuth `callbackURL` prop) instead of always landing on "/"; the value is sanitized to same-origin paths (must start `/`, not `//`).

### Season "עונת הפתיחה" ends on election day (2026-06-11, main)
Set the active season's `endAt` to 2026-10-27 21:59:59 UTC (27.10.2026, end-of-day Israel time) directly in the DB — the next Knesset election date per the court-set schedule. The seed script's +30d default is dev-only and unchanged.
