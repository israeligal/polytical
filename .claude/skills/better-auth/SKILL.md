---
name: better-auth
description: Better Auth authentication patterns for this Next.js project — server config, client hooks, session access, route protection, and Drizzle schema.
---

# Better Auth Integration

## Architecture

```
Client (browser)           Server
─────────────────          ──────────────────────
lib/auth-client.ts    →    app/api/auth/[...all]/route.ts
  useSession, signIn        → toNextJsHandler(auth)
  signUp, signOut            → lib/auth.ts (betterAuth config)
                              → app/lib/schema.ts (Drizzle tables)
```

No `SessionProvider` wrapper needed — Better Auth uses nano-store internally.

## Key Files

| File | Purpose |
|------|---------|
| `lib/auth.ts` | Server-side Better Auth config (drizzle adapter, session, plugins) |
| `lib/auth-client.ts` | Client instance — exports `signIn`, `signUp`, `signOut`, `useSession` |
| `app/api/auth/[...all]/route.ts` | Catch-all API route handler |
| `app/lib/schema.ts` | Drizzle schema (users, sessions, accounts, verifications tables) |
| `proxy.ts` | Route protection (Next.js 16 proxy pattern) |

## Import Patterns

```typescript
// Client components — ALWAYS import from auth-client
import { useSession, signIn, signUp, signOut } from "@/lib/auth-client"

// Server-side (API routes, server components) — import from auth
import { getSession } from "@/lib/auth"
```

**Never** import from `better-auth/react` or `better-auth` directly in application code.

## Client-Side Usage

### useSession (reactive)
```typescript
"use client"
import { useSession } from "@/lib/auth-client"

const { data: session, isPending } = useSession()
// session?.user.id, session?.user.email, session?.user.handle
// NB: use `handle` for any user-facing display — NEVER `user.name` (see "User identity" below)
```

### Sign In
```typescript
const { error } = await signIn.email({
  email: "user@example.com",
  password: "password123",
  callbackURL: "/",
})
```

### Sign Up
```typescript
const { error } = await signUp.email({
  name: "User Name",
  email: "user@example.com",
  password: "password123",
  callbackURL: "/",
})
```

### Sign Out
```typescript
await signOut({
  fetchOptions: {
    onSuccess: () => router.push("/login"),
  },
})
```

## Server-Side Usage

### Get Session in API Routes
```typescript
import { getSession } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Use session.user.id for per-user operations
}
```

## Environment Variables

```bash
BETTER_AUTH_SECRET=<openssl rand -hex 32>   # Server secret
BETTER_AUTH_URL=http://localhost:3000         # Server base URL
NEXT_PUBLIC_APP_URL=http://localhost:3000     # Client base URL (public)
```

## Database Tables

4 tables in `app/lib/schema.ts`: `user`, `session`, `account`, `verification`.
All use `text` primary keys, `timestamp` dates, CASCADE on delete for foreign keys.

## User identity — NEVER display `name`, ALWAYS `handle`

The `user` row carries two identity fields:

| Field | Source | Use |
|-------|--------|-----|
| `name` | Google OAuth / sign-up — the **real personal name** | **Never shown in the UI.** Internal only. |
| `handle` | the public **@-nickname** picked in onboarding | The one and only user-facing identity. |

**Rule: we NEVER surface `users.name` to anyone — every user-facing identity is the public `@handle`.** (profile, header avatar, leaderboard, comments, admin screens, onboarding greeting). This is a hard product rule; a `users.name` in any display path (or a repo `select` that returns `users.name` for rendering) is a bug.

- Render `@{handle}` with bidi isolation — `<bdi>@{handle}</bdi>` — and derive avatar initials from `handle`, never `name`.
- `handle`, `arena`, `onboardedAt` are Better Auth `additionalFields` in `lib/auth.ts` (so they're on the session `user` server- and client-side). `handle` is nullable.
- For nullable `handle` (legacy / mid-onboarding rows) coalesce to `FALLBACK_HANDLE` ("משתמש") from `app/lib/onboarding/handle.ts`:
  - SQL select: `authorHandle: sql<string>\`coalesce(${users.handle}, ${FALLBACK_HANDLE})\``
  - TS: `user.handle ?? FALLBACK_HANDLE`
- Repositories `select` `users.handle` (e.g. `app/lib/leaderboard/repo.ts`, `app/lib/comments/repo.ts`, `app/lib/suggestions/repo.ts`) — never `users.name`.

## Rate Limiting

Built-in rate limiting protects auth endpoints from brute-force attacks. Configured in `lib/auth.ts`:

```typescript
rateLimit: {
  window: 120,       // 2-minute window (seconds)
  max: 10,           // general: 10 requests per window
  customRules: {
    "/sign-in/email": { window: 120, max: 3 },  // 3 login attempts per 2 min
    "/sign-up/email": { window: 120, max: 3 },  // 3 signup attempts per 2 min
  },
},
```

Uses in-memory store by default (sufficient for single-server). **All new Better Auth projects must include rate limiting** — never ship without it.

## CSRF Protection

Better Auth handles CSRF implicitly — no manual token handling needed.

## Route Protection

`proxy.ts` handles redirects:
- Unauthenticated users on protected routes → `/login`
- Authenticated users on auth pages → `/`

For API routes, check session directly with `getSession()` and return 401.
