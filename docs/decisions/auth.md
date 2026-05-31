# Decisions — Auth

> Newest on top. Entries are immutable historical records.

## 2026-05-31 — Use Better Auth (not Auth.js/NextAuth)

**Decision:** Auth for Polytical is **Better Auth** with the Drizzle adapter, replacing the Auth.js/NextAuth choice in the original PRD.

**Why:**
- dirot already runs Better Auth + Drizzle + Neon on the *exact* Polytical stack (Next 16, React 19) — a proven reference implementation and a ready `better-auth` skill, so we inherit working patterns (server config, client hooks, session access, route protection, Drizzle schema) instead of deriving them.
- Auth tables live in the same Drizzle schema as app tables (generated via `@better-auth/cli`), keeping one migration story — a good fit for the PRD's "ledger + auth in one transactional Postgres" model.

**Scope of the change (no code yet — pre-foundation):**
- Added the `better-auth` skill (from dirot) to `.claude/skills/`.
- Updated root `CLAUDE.md` (new "Auth (Better Auth)" rule cluster; stack line) and `.claude/skills/PROVENANCE.md` (better-auth now copied, not skipped; `backend-architecture` auth note now aligns).
- Updated the PRD stack line, §12 Auth bullet, and §16 Foundation phase.

**Still to do (foundation phase):** install `better-auth`, create `lib/auth.ts` (drizzle adapter) + `lib/auth-client.ts` + `app/api/auth/[...all]/route.ts`, generate auth schema, wire Google + email providers, map `users.is_admin`, grant the 1,000-coin starting stack as a ledger row on first sign-in. Requires the Drizzle/Neon client to exist first.
