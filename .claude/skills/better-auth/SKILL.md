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
// session?.user.id, session?.user.email, session?.user.name
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
