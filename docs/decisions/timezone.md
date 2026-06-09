# Decisions — Date/time display

Newest on top. Entries immutable.

## 2026-06-09 — Israel-time everywhere via a central formatter; killed #418

**Context.** Production threw a React #418 hydration error on `/notifications`. Root
cause: all displayed dates were formatted in `"use client"` components with the
**runtime** timezone (`new Intl.DateTimeFormat(...)` / `toLocale*String` with no
`timeZone`). Vercel renders the server tree in **UTC**; the browser renders in the
visitor's **local** tz (e.g. Asia/Jerusalem, +3 in summer). The SSR text ≠ the
hydrated text → #418. Users also saw wrong times.

**Decisions.**

- **One formatter module, `lib/time.ts`**, pinned to `Asia/Jerusalem`. Polytical is
  Israel-only (fixed tz), so no per-org timezone machinery (unlike the shift-manager
  `time-and-timezone` skill, which is date-fns + per-org and was NOT adopted). Intl
  only — the repo has no date lib.
- **`timeZone: "Asia/Jerusalem"` is the fix AND the hydration guarantee.** An explicit
  IANA `timeZone` makes `Intl.DateTimeFormat.format` deterministic regardless of the
  host process tz — server and client produce identical strings. A unit test forces
  `process.env.TZ` and asserts the output is unchanged.
- **Two formatters:** `formatDateTime` (day + Hebrew month + HH:mm) and `formatDate`
  (day + Hebrew month). Admin rows moved from numeric `toLocaleString` to the same
  long format — consistent app-wide.
- **ESLint guard (regression prevention):** `no-restricted-syntax` bans
  `new Intl.DateTimeFormat` and `toLocale(Date|Time)?String` outside `lib/time.ts`,
  `lib/format.ts` (number formatting), and `app/lib/knesset/normalize.ts` (server-only
  data day-key, already Asia/Jerusalem). This is the lint-level version of CLAUDE.md's
  recommended `block-direct-date-imports` hook.
- **Left alone:** `lib/format.ts#timeUntil` (`Countdown`) — a *relative* duration, not
  a tz format, and server-rendered (no `"use client"`), so its output is static HTML
  with no client hydration → not a #418 source.

**Verification.** Reproduced the exact prod condition locally — prod build served under
`TZ=UTC` with the browser in Asia/Jerusalem (a 3-hour gap the old code mismatched on) —
and confirmed **0 console errors** on `/notifications` with timestamps in Israel time.
Unit tests cover DST (summer UTC+3 / winter UTC+2), the midnight-boundary roll, and
tz-env-independence.
