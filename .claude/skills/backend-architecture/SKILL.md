---
name: backend-architecture
description: How the backend is layered (Route → Service → Repository → DTO) and the operational rules that hold the layers together — route wrappers (`authenticatedRoute` / `publicRoute`), `requireOrganizationId` / `requireUserId` scoping, DTO validation at the boundary, and the per-folder CLAUDE.md files that own the detail. Trigger this skill whenever the user is adding or editing an API endpoint under `src/app/app/api/*`, adding a service or repository function, asking "where does this code go" or "should this be in the route or the service", touching `authenticatedRoute` / `publicRoute` / `failureResponse` / `pdfErrorResponse`, writing or reading a Zod schema under `src/lib/dto/`, mentioning `requireOrganizationId` / `requireUserId` / "org-scoped" / "user-scoped", or hitting an import-boundary lint error (route → repository, service → `@/lib/db`). Also trigger for questions about the rate-limit + DTO-parse + service-call + analytics handler shape, and when they ask why `analytics.track` doesn't need a `distinctId` inside a route. This is the operational recipe — the detailed layer-by-layer docs live in per-folder CLAUDE.md files, and the architectural rationale lives in `docs/layered-architecture.md`.
---

# Backend architecture — Route → Service → Repository, with DTOs at the boundary

Backend code is layered. Each layer has one job and one allowed direction of dependency. The layers are physically split across four directories:

```
src/app/app/api/      Route handlers     → HTTP only (auth, parse, format)
src/services/         Services           → business logic, orchestration
src/repositories/     Repositories       → Drizzle CRUD, scoped by org/user
src/lib/dto/          DTOs               → Zod schemas for API boundary shapes
```

Dependencies flow inward only: **route → service → repository**. A route never imports a repository. A repository never imports a service. ESLint will eventually enforce this; until then, the convention is non-negotiable because crossing it breaks the testing strategy (services are integration-tested against real repos; bypassing a service means the integration test has nothing to assert).

## Where details live (read these, don't duplicate them)

This skill is the front door. The actual inventory and gotchas live in per-folder CLAUDE.md files. Read the right one before editing:

| You're touching… | Read first |
|---|---|
| A route under `src/app/app/api/*` | `src/app/app/api/CLAUDE.md` — endpoint inventory + handler shape + gotchas |
| A service under `src/services/*` | `src/services/CLAUDE.md` — service inventory + conventions |
| A repository under `src/repositories/*` | `src/repositories/CLAUDE.md` — repo inventory + scoping rules |
| A DTO under `src/lib/dto/*` | `src/lib/dto/CLAUDE.md` — DTO purpose, format vs business rules |
| `route-handler.ts`, signature verifiers, `pdfErrorResponse`, cron observability | `src/lib/server/CLAUDE.md` — wrappers + server-only utilities |
| Architectural rationale, history, planned work | `docs/layered-architecture.md` |

If you find yourself about to paste an endpoint list, a service description, or a DTO description into this file — stop and update the CLAUDE.md instead. This skill should stay short.

## Adding an API endpoint — checklist

1. **Pick the wrapper.** `authenticatedRoute()` for anything that requires a logged-in user (almost everything). `publicRoute()` for webhooks where the caller is verified by signature, not session (Stripe, Resend Inbound, Slack, PDF microservice callback). Raw `export async function GET/POST` is an ESLint error.

2. **Create the route file** at `src/app/app/api/<path>/route.ts`. The wrapper receives `{ request, userId, organizationId, session }` for authenticated routes, or just `{ request }` for public ones. `organizationId` is `session.session.activeOrganizationId` — the wrapper returns 403 if it's missing.

3. **Write the DTO** in `src/lib/dto/<resource>.dto.ts`:

   ```ts
   export const saveFooRequestSchema = z.object({ ... })
   export type SaveFooRequest = z.infer<typeof saveFooRequestSchema>
   ```

   DTOs own *structure + format* (shape, types, regex patterns, cross-field format constraints). They never own *business rules* (permissions, rate limits, pricing). Business rules live in the service.

4. **Write the service** in `src/services/<resource>.service.ts`. Direct function exports, not classes. Thread `organizationId` (org-scoped) or `userId` (user-scoped). Services never import from `@/lib/db` directly — call repositories. Services never throw upward — return result objects (often discriminated unions like `{ ok: true; ctx } | { ok: false; reason: "…" }`).

5. **Write the repository** in `src/repositories/<resource>.repository.ts`. The **first line of every method** validates scope:

   ```ts
   export async function findFooByOrg({ organizationId }: { organizationId: string }) {
     requireOrganizationId({ organizationId })  // first line, always
     const db = getDbOrNull()                    // or getDbOrThrow() if the row must exist
     // ...Drizzle query filtering by organizationId
   }
   ```

   Org-scoped repos validate `organizationId`; user-scoped repos validate `userId`. Use parameter destructuring (`{ organizationId, data }`), not positional args. Never log or call analytics here — that's the service's job.

6. **Standard handler shape** — once the layers are in place, the handler is small. This is the canonical pattern (mirrored verbatim in `src/app/app/api/CLAUDE.md`):

   ```ts
   export const POST = authenticatedRoute(async ({ request, userId, organizationId }) => {
     // 1. Rate limiting (where applicable)
     const { success } = await checkRateLimit({ identifier: userId, endpoint: "..." })

     // 2. Parse + validate body with the DTO
     const parsed = saveFooRequestSchema.safeParse(await request.json())
     if (!parsed.success) {
       return NextResponse.json(
         { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
         { status: 400 }
       )
     }

     // 3. Call the service — pass organizationId for org-scoped data, userId for user-scoped
     const result = await saveFoo({ organizationId, ...parsed.data })

     // 4. Track analytics — userId + traits auto-included from the wrapper's AsyncLocalStorage context
     analytics.track({ event: AnalyticsEvents.FOO_SAVED, properties: { ... } })

     // 5. Return a consistent response shape
     return NextResponse.json({ success: true, data: result })
   })
   ```

7. **If the handler is a PDF download** — use `withPdfDownloadGuards()` from `@/lib/server/pdf-route-helpers` rather than re-implementing rate-limit + paywall + context-resolution. `createFormPdfRoute()` is the factory for simple form routes; only bypass it for bespoke cases (see `src/app/app/api/CLAUDE.md`).

8. **If it's a webhook** — `publicRoute()`. Verify the signature using a verifier from `@/lib/server/signatures/` (Svix for Resend, Slack `v0` for Slack, HMAC-SHA256 with raw secret for the PDF service callback). Return 400 on bad signature, 200 on malformed-but-authenticated payloads (otherwise Slack/Resend will disable the webhook), 500 only when the service throws and the caller should retry.

## Layer placement decision tree

When you're not sure which layer something belongs in, ask the questions in order. The first "yes" tells you the layer.

1. **Does it touch `request` / `NextResponse` / status codes / signature headers / auth?** → Route.
2. **Is it a Zod schema describing the wire shape of a request or response body?** → DTO. (Form-data validation — required fields, business rules, cross-field invariants — lives in `src/lib/schemas/`, not here.)
3. **Does it run raw SQL or Drizzle queries against the DB?** → Repository.
4. **Does it coordinate two or more repository calls, call an external API, fire analytics, or apply a business rule (paid? rate-limited? eligible?)?** → Service.
5. **Is it a pure helper with no IO and no business meaning (date formatting, string parsing)?** → `src/lib/utils/` or a colocated helper.

If a piece of code answers "yes" to multiple layers, it's almost always doing too much and should be split.

## Scoping — org vs user (the most common bug-source)

Every repository function is either **org-scoped** (`requireOrganizationId`) or **user-scoped** (`requireUserId`). Mixing them silently leaks data across organizations.

- **Org-scoped** (questionnaire, payment, mailing-tracking, organization, aos-qualifying, pdf-package-job, customer-slack-channel): the data belongs to the *organization*, not the individual user. Multiple users in the same org see the same row. Repository filters `where: eq(table.organizationId, organizationId)`.
- **User-scoped** (user-profile, push-subscriptions): personal-to-the-user data. Repository filters `where: eq(table.userId, userId)`.

A few intentional exceptions are documented inline — e.g. `deletePushSubscriptionByEndpoint` is intentionally not user-scoped because it's called both from authenticated routes (which check user separately) and from `push.service`'s 410-Gone cleanup (no user context). When you write an exception, comment why.

The route wrapper resolves both: `userId` from the session and `organizationId` from `session.session.activeOrganizationId`. Thread the one you need into the service, and let the repository validate it on the first line.

## Import boundaries

| Layer | Can import from | Must not import from |
|---|---|---|
| Route (`src/app/app/api/`) | `src/services/`, `src/lib/dto/`, `src/lib/server/` | `src/repositories/`, `@/lib/db` |
| Service (`src/services/`) | `src/repositories/`, `src/lib/server/`, `packages/core` | `@/lib/db` directly (one documented exception: `questionnaire.service.ts` for raw-SQL JSONB merging) |
| Repository (`src/repositories/`) | `@/lib/db`, `drizzle-orm`, `packages/core` | `src/services/`, `src/lib/server/logger`, `src/lib/server/analytics` |
| DTO (`src/lib/dto/`) | `zod`, `packages/core` | Anything stateful (no DB, no services) |

If the lint error says "service cannot import from `@/lib/db`", you're trying to write a Drizzle query in a service — move it to a repository.

## Cross-cutting things that aren't obvious

- **Analytics inside a route handler.** `analytics.track()` reads `userId` + traits from AsyncLocalStorage (set by the wrapper). Don't pass `distinctId` — that's only for system events outside a request scope (cron ticks, webhook system-level events). For an authenticated route, `analytics.track({ event, properties })` is enough.
- **403 vs 401.** `authenticatedRoute` returns **401** for missing session and **403** for session-without-active-org. Don't conflate them in client error handling.
- **No try/catch around the handler.** Neither wrapper wraps the handler in try/catch — thrown errors propagate to Next.js and become 500s with a `route_error` analytics event. Use `failureResponse({ action, error, statusCode? })` from `@/lib/server/route-handler` when you want to fire `api_error` analytics and return a clean `{ success: false, error }` body in one call. Don't echo raw `error.message` back to the client — DB drivers can leak SQL fragments and schema names.
- **PDF routes return binary on success, JSON on failure.** Status split: 422 when the PDF service reports `errorKind: "unsupported-script"` (user input contains a glyph no bundled font covers — not retryable), 500 otherwise. `pdfErrorResponse()` does this mapping; every `/api/forms/*` route uses it.
- **Webhooks: 200 on malformed-but-authenticated payloads.** Slack and Resend Inbound disable webhooks after repeated 5xx. If signature passes but the body is unparseable, return 200 — log + alert internally, don't make the caller retry forever.
- **`React.cache()` for per-request memoization.** When the same server-side service call is made from multiple `<Suspense>` boundaries during one request (e.g., `getAosQualifyingAnswers` is read by 5+ dashboard components), wrap the read in `React.cache()` so it dedupes per request. See `aos-qualifying.service.ts`.

## When *not* to use this skill

- Page routes (`src/app/app/<path>/page.tsx`), Link/router/redirect navigation, the `/app/*` mount prefix → use the `routing` skill instead.
- Form-data validation, react-hook-form, conditional fields → use `react-hook-form` / `zod-4` / `questionnaire` skills.
- Better Auth specifics (session shape, OAuth, invitations, passkeys) → use the `better-auth` skill. This skill only covers how `authenticatedRoute` *consumes* the session.
- Async PDF package job lifecycle, cron worker, callback HMAC → use the `async-pdf-package` skill for the full flow; this skill only mentions the wrapper choice.

## Testing each layer

The strategy is documented in `.claude/skills/testing/SKILL.md` and `docs/layered-architecture.md` — short version:

| Layer | Test type | What to mock |
|---|---|---|
| Repository | Integration (PGLite) | Nothing — real DB |
| Service | Integration (PGLite) | External APIs only (Stripe, PDF service, Resend, PostHog) |
| Route | Integration (PGLite) | External APIs only |
| DTO | Co-located unit test | Nothing — pure `safeParse` assertions |

Never mock repositories or services — we own them, so we can test against the real implementation. This is the whole reason the layers exist: integration tests can hit a real DB and assert real DB state, because the layer above (the wrapper) handled the parts you'd otherwise have to mock (auth, request parsing, error mapping).
