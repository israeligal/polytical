# Key Decisions: Profile Consolidation + Dark Default

### Dark "trading floor" becomes the DEFAULT theme (2026-06-11, feat/politician-activity-counts)
`resolveTheme({cookieValue})` in `lib/theme.ts` centralizes the cookie mapping — absent cookie → dark; only an explicit `light` opts out. Both readers (root layout, site header) use it; viewport `themeColor` flipped to `#0b1020` matching the PWA manifest. Existing users with a saved `dark` cookie see no change; saved `light` users keep light. The CSS stays light-at-`:root` + `[data-theme="dark"]` overrides — safe because the layout always sets `data-theme` explicitly.

### האוסף + עונה leave the nav; the profile becomes their home (2026-06-11, feat/politician-activity-counts)
Nav is product surface (תחזיות · פוליטיקאים · טבלת מובילים + the הצעה-לסדר pill); collection and season are PERSONAL progress, so they moved into `/profile` as compact sidebar cards (`SeasonCard`, `CollectionCard`) linking to the full pages. Routes `/collection` + `/seasons` stay alive for deep links and the full experience. טבלת מובילים stays in the nav — it's social/competitive, not personal. Considered tabs vs columns → columns won: RSC-only (no client tab state), nothing hidden, uses the desktop width the user asked to exploit.

### Profile = two-column desktop layout, sidebar-first source order (2026-06-11)
`grid lg:grid-cols-[1fr_340px]` with the aside placed via explicit col/row (the /market pattern): on mobile the season+collection cards land right after the stats; on desktop they form a sticky sidebar. Push-notification settings moved from the page's most prominent slot to a `הגדרות התראות` section at the bottom — plumbing, not progress.

### Google is the first auth option (2026-06-11)
/login and /signup render the Google button above the divider, email/password below. One-tap OAuth is the lowest-friction path; email is the fallback.

### Session interleaving on a shared checkout (2026-06-11, process note)
This work was committed while another session was actively working in the same checkout on `feat/politician-activity-counts` — a `--amend` briefly folded a profile fix into that session's commit (repaired via `reset --soft` + re-commit). Verification ran in a throwaway worktree (`git worktree add /tmp/polytical-verify HEAD`) because the shared tree's uncommitted schema WIP broke runtime. Reinforces the CLAUDE.md rule: isolate feature work in worktrees.
