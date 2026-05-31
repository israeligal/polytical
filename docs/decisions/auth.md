# Decisions — Auth

> Newest on top. Entries are immutable historical records.

## 2026-05-31 — Better Auth implemented (mirrors dirot)

Scaffolded and verified end-to-end against the live Neon DB, following dirot's pattern:

- **Deps** (pinned to dirot): `better-auth@^1.5.6`, `drizzle-orm@^0.45.2`, `postgres@^3.4.9`, `drizzle-kit@^0.31.10`, `dotenv`.
- **Files**: `app/lib/db.ts` (Neon pooler client, `prepare:false`, ssl stripped), `app/lib/schema.ts` (4 Better Auth tables + `isAdmin`), `lib/auth.ts` (drizzle adapter, email/password + guarded Google, rate limiting, `nextCookies`, `getSession`), `lib/auth-client.ts`, `app/api/auth/[...all]/route.ts`, `proxy.ts` (Next 16 route protection: `/profile` + `/admin` gated), `drizzle.config.ts`.
- **DB**: migration `drizzle/0000_even_zombie.sql` generated and **pushed to Neon** — tables `user`, `session`, `account`, `verification` exist.
- **Env**: `BETTER_AUTH_SECRET` (generated), `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` added to `.env` (gitignored); `.env.example` documents all keys. Google creds left blank (email/password works without them).
- **Verified**: `pnpm typecheck` clean; POST `/api/auth/sign-up/email` → 200 (user created with `isAdmin:false`), GET `/api/auth/get-session` → 200 round-trip. Smoke user deleted afterward.

**Deferred to the ledger/foundation phase:** `sendResetPassword` (needs transactional email), the starting-stack grant on first sign-up (needs the `transactions` ledger), and the `/login` + `/signup` UI pages. Google OAuth needs real `GOOGLE_CLIENT_ID/SECRET`.

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
