# Integration Tests

Loaded on demand from the main testing skill. The **Core Principle** in SKILL.md (behavior, not implementation) is the umbrella rule — this doc shows what it looks like for integration tests.

This reference points to canonical tests in the codebase rather than inlining example code — examples rot, the real tests don't.

## Contents

- [File location](#file-location)
- [Canonical patterns — look at these first](#canonical-patterns--look-at-these-first)
- [Core setup pattern](#core-setup-pattern)
- [Helpers available](#helpers-available)
- [Integration test shape](#integration-test-shape)
- [Schema cascade rule](#schema-cascade-rule)
- [Integration test checklist](#integration-test-checklist)

## File location

All integration tests live under `src/__tests__/integration/`, mirroring the source tree:

- `api/` — API route handlers (`POST`, `GET`, `DELETE` tested end-to-end)
  - `api/checkout/` — Stripe checkout routes
  - `api/forms/` — PDF-generation routes
  - `api/webhooks/` — Stripe webhook handler
- `repositories/` — data access layer tests against PGLite
- `services/` — business logic tests with real repositories
- `db/` — raw schema / migration tests

## Canonical patterns — look at these first

| Pattern | Canonical file |
|---|---|
| Repository CRUD + data isolation between orgs/users | [`src/__tests__/integration/repositories/questionnaire.repository.integration.test.ts`](../../../../src/__tests__/integration/repositories/questionnaire.repository.integration.test.ts) |
| User-scoped repository (vs org-scoped) | [`src/__tests__/integration/repositories/user-profile.repository.integration.test.ts`](../../../../src/__tests__/integration/repositories/user-profile.repository.integration.test.ts) |
| Payment / order lifecycle repository | [`src/__tests__/integration/repositories/payment.repository.integration.test.ts`](../../../../src/__tests__/integration/repositories/payment.repository.integration.test.ts) |
| API route (auth → service → repo → response) | [`src/__tests__/integration/api/questionnaire.integration.test.ts`](../../../../src/__tests__/integration/api/questionnaire.integration.test.ts) |
| Stripe webhook — idempotency, signature, DB state | [`src/__tests__/integration/api/webhooks/stripe.integration.test.ts`](../../../../src/__tests__/integration/api/webhooks/stripe.integration.test.ts) |
| Service orchestrating multiple repositories | [`src/__tests__/integration/services/user-profile.service.integration.test.ts`](../../../../src/__tests__/integration/services/user-profile.service.integration.test.ts) |
| Destructive flow — switchPathway (deletes + updates) | [`src/__tests__/integration/services/switch-pathway.integration.test.ts`](../../../../src/__tests__/integration/services/switch-pathway.integration.test.ts) |
| PDF generation route — auth/payment/complete gates | [`src/__tests__/integration/api/forms/i130a.integration.test.ts`](../../../../src/__tests__/integration/api/forms/i130a.integration.test.ts) |
| Invitation / member flow | [`src/__tests__/integration/api/invitation-flow.integration.test.ts`](../../../../src/__tests__/integration/api/invitation-flow.integration.test.ts) |

## Core setup pattern

The integration project loads two setup files (configured in [`vitest.config.ts`](../../../../vitest.config.ts)):

- [`vitest.setup.ts`](../../../../vitest.setup.ts) — lean, shared with the unit projects. Mocks `next/navigation` + `posthog-js`, runs `cleanup()` afterEach. NO DB init.
- [`vitest.integration.setup.ts`](../../../../vitest.integration.setup.ts) — integration-only. `beforeAll` calls `getTestDb()` + `setTestDb({ testDb })` so services that import `getDb()` from `@/lib/db` see the PGLite instance.

Plus a `globalSetup: ['./vitest.global-setup.ts']` entry on the integration project. That file (which runs ONCE before any worker spawns) builds the schema in a temp PGLite, dumps it via `dumpDataDir('gzip')` to `node_modules/.cache/vitest-pglite/schema.tar.gz`, and returns a teardown that deletes the file. Each test file's `getTestDb()` then restores from this snapshot via `new PGlite({ loadDataDir: <Blob> })` instead of re-running 235 lines of CREATE TABLE/INDEX DDL — ~50ms per file vs ~1.5s. Single-file `vitest <path>` runs that skip `globalSetup` fall back to schema-from-scratch automatically.

**Two viable PGLite bridge approaches** in individual test files:

1. **Global bridge (recommended for new tests)** — do nothing; the setup files above already make `getDb()` return PGLite. Just write the test.
2. **Per-file `vi.mock` (used by some existing tests)** — explicit module replacement:
   ```ts
   vi.mock('@/lib/db', async () => {
     const testDbModule = await import('@/lib/db/test-db')
     const db = await testDbModule.getTestDb()
     return { getDb: () => db, schema: testDbModule.schema }
   })
   ```
   Use when you need to also mock other exports of `@/lib/db` (e.g., `setTestDb` as a `vi.fn()`).

Plus `cleanupTestDb()` in **both** `beforeEach` and `afterEach`. The PGLite factory and table DDL live in [`src/lib/db/test-db.ts`](../../../../src/lib/db/test-db.ts) — that's where you add a new table to the in-memory schema if you introduce one. Make sure the same table gets added to [`src/__tests__/helpers/db-helpers.ts`](../../../../src/__tests__/helpers/db-helpers.ts) `cleanupTestDb()` deletion list — a missing entry silently leaks rows between tests.

## Helpers available

**[`src/__tests__/helpers/db-helpers.ts`](../../../../src/__tests__/helpers/db-helpers.ts)** — seeding + cleanup:
- `cleanupTestDb()` — deletes everything in FK-safe order
- `seedUser`, `seedUserWithOrg`, `seedOrganization`, `seedMember`, `seedInvitation`
- `seedCredentialsAccount`, `seedSession` — for auth-dependent tests
- `seedQuestionnaireResponse`, `seedOrder` — domain data
- `getUserByEmail`, `getQuestionnaireResponse`, `getOrderBySessionId` — direct DB reads for assertions

**[`src/__tests__/helpers/test-server.ts`](../../../../src/__tests__/helpers/test-server.ts)** — request-side helpers:
- `createNextRequest({ method, url, body, headers, cookies })`
- `createMockSession({ user, activeOrganizationId })` — Better Auth session shape

**[`src/__tests__/fixtures/`](../../../../src/__tests__/fixtures/)** — shared test data (users, questionnaire responses). Import from here rather than hand-rolling fixtures.

## Integration test shape

The real flow to test is **request → handler → service → repository → DB, then read the DB back and assert**. Don't stop at "200 OK" — assert the data landed correctly. See the "round-trip" tests in [`questionnaire.integration.test.ts`](../../../../src/__tests__/integration/api/questionnaire.integration.test.ts) — they POST, then GET, then read the DB row directly and compare.

**Only mock what leaves our process:** `@/lib/auth` `getSession` (Better Auth server session), external SDKs (Stripe, Resend), `@/services/pdf.service` (client to the external PDF microservice). Everything else runs real.

## Schema cascade rule

When DB columns become `notNull` or gain new required fields, the following fixtures must be updated in lockstep:

1. [`src/lib/db/schema.ts`](../../../../src/lib/db/schema.ts) — production Drizzle schema
2. [`src/lib/db/test-db.ts`](../../../../src/lib/db/test-db.ts) — PGLite `CREATE_TABLES_SQL` must match
3. [`src/__tests__/fixtures/users.ts`](../../../../src/__tests__/fixtures/users.ts) — default user shapes
4. [`src/__tests__/helpers/db-helpers.ts`](../../../../src/__tests__/helpers/db-helpers.ts) — `seedUser` and friends
5. [`src/__tests__/helpers/test-server.ts`](../../../../src/__tests__/helpers/test-server.ts) — `createMockSession` shape
6. Every `createMockSession(...)` call site in integration tests

Miss one and the whole integration suite starts failing on "column X violates not-null constraint."

## Integration test checklist

- [ ] Under `src/__tests__/integration/` in the correct subdirectory
- [ ] `vi.mock('@/lib/db', ...)` PGLite bridge at top of file
- [ ] `cleanupTestDb()` in `beforeEach` AND `afterEach`; `vi.clearAllMocks()` in `afterEach`
- [ ] Seed via helpers, not hand-rolled fixtures
- [ ] Mock only `@/lib/auth` and external SDKs — never repositories or services
- [ ] Assertions read the DB directly (e.g. `db.select().from(...)`) or call public repo functions, not mock call-shape checks
- [ ] Round-trip where applicable: POST → GET → DB read
- [ ] Schema cascade applied if you added a `notNull` column
