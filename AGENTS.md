<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# User identity — NEVER show the real name

The `user` table has two identity fields: `name` (the real personal name from
Google OAuth, e.g. "vera mordehayev") and `handle` (the public @-nickname picked
in onboarding). **We NEVER display `users.name` to anyone — every user-facing
identity is the public `@handle`.** This applies everywhere: profile, header
avatar, leaderboard, comments, admin screens, onboarding.

- Render `@{handle}` with bidi isolation (`<bdi>@{handle}</bdi>`); derive avatar
  initials from `handle`, never `name`.
- Repositories must `select` `users.handle`, never `users.name`. If a query
  joins users for display, return the handle.
- `handle` is nullable (legacy / mid-onboarding rows) — coalesce to
  `FALLBACK_HANDLE` from `app/lib/onboarding/handle.ts`: in SQL
  `coalesce(${users.handle}, ${FALLBACK_HANDLE})`, or `?? FALLBACK_HANDLE` in TS.
- The session user exposes `handle` (a Better Auth `additionalField` in
  `lib/auth.ts`), so RSCs/route handlers can read `user.handle` directly.
