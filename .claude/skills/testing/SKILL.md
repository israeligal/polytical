---
name: testing
description: Testing patterns for Vitest, React Testing Library, Playwright, Storybook stories, mobile + PWA validation, Lighthouse CI, and the QA workflow (preflight, @flows tagging, drift sweep) in Next.js 16 + React 19. Use when writing or reviewing unit tests (unit-node / unit-dom project split), integration tests with PGLite, desktop OR mobile E2E tests, Storybook stories with play functions / argTypes / accessibility, PWA manifest validation, Lighthouse mobile audits, axe-core a11y sweeps, or when configuring preflight, pre-push hooks, @flows coverage tags, or the qa-dashboard. Triggers on .test.tsx/.test.ts, .integration.test.ts, .e2e.ts, .mobile.e2e.ts, .stories.tsx files, any `pnpm test*` / `pnpm mobile:*` / `pnpm preflight*` / `pnpm qa:*` / `pnpm drift:*` command, lighthouserc.cjs, playwright.config.ts, vitest.config.ts, or any testing-related question.
---

# Testing Skill — Unit, Integration, E2E, Storybook, Mobile, PWA, Lighthouse

Best practices for testing in this Next.js 16 + React 19 codebase. The **Core Principle** below is the umbrella rule for every kind of test. For per-type details, load the matching `references/*.md` file when you're about to write or review that kind of test.

## Stack Overview

| Test Type | Framework | Environment | Purpose | Detail |
|---|---|---|---|---|
| Unit (node) | Vitest | Node | Pure logic — services, repos, DTOs, schemas, utils, pdf-service mappers, packages | [`references/unit-tests.md`](./references/unit-tests.md) |
| Unit (dom) | Vitest + React Testing Library | happy-dom | Components, RHF hooks, anything touching `window` / `document` / `localStorage` | [`references/unit-tests.md`](./references/unit-tests.md) |
| Integration | Vitest + PGLite | Node + in-memory PostgreSQL | API routes, services, repositories with real DB | [`references/integration-tests.md`](./references/integration-tests.md) |
| E2E (desktop) | Playwright | Chromium + Firefox + WebKit | Critical user journeys | [`references/e2e-tests.md`](./references/e2e-tests.md) |
| Mobile + PWA | Playwright + axe-core + Lighthouse CI | iPhone 15 / Pixel 7 viewports | Mobile a11y sweep, horizontal-overflow, manifest validation, mobile-preset Lighthouse | [`references/mobile-and-pwa.md`](./references/mobile-and-pwa.md) |
| Storybook | Storybook 10 + addon-vitest + addon-a11y | Headless Chromium (Playwright browser-mode) | Visual variants + interaction + a11y in one pass | [`references/storybook.md`](./references/storybook.md) |

**Workflow layer** — preflight contract, smart pre-push, `@flows` coverage attribution, qa-dashboard, drift sweep: [`references/qa-workflow.md`](./references/qa-workflow.md).

Tests are split across **five Vitest projects** in [`vitest.config.ts`](../../../../vitest.config.ts):

- **`unit-node`** (~129 pure-logic files) — services, repos, DTOs, schemas, utils, pdf-service mappers, packages. Env: `node`. Skipping happy-dom for these is a real perf win.
- **`unit-dom`** (~42 files) — components, RHF hooks, anything touching `window`/`document`/`localStorage`. Env: `happy-dom`. A small `DOM_TEST_TS_FILES` allowlist handles the rare `.test.ts` that needs DOM; new tests touching `window` should use the `.test.tsx` extension to auto-route.
- **`integration`** (~49 files, PGLite-backed) — service-layer + DB + API route round-trips. Uses BOTH `vitest.setup.ts` (lean — Next.js/PostHog mocks + cleanup) AND `vitest.integration.setup.ts` (PGLite init via `setTestDb`). `globalSetup: vitest.global-setup.ts` builds the schema ONCE per suite run and dumps to `node_modules/.cache/vitest-pglite/schema.tar.gz`; per-file `getTestDb()` restores from that snapshot (~50ms) instead of replaying 235 lines of DDL (~1.5s). Single-file `vitest <path>` runs that skip globalSetup fall back to schema-from-scratch automatically.
- **`pdf-system`** (opt-in) — pdf-roundtrip tests that shell out to `pdftk` + load `form-filler.jar`. Excluded from `preflight:smart` and `preflight`; included in `preflight:full` and the dedicated `pnpm preflight:pdf-system`. Tests self-skip via `PDF_SYSTEM_READY` guard when either system dep is missing — fresh worktrees don't block pushes on missing `form-filler.jar`.
- **`storybook`** — every `*.stories.tsx` tagged `test` or `autodocs` runs as a Vitest test via addon-vitest in headless Chromium (Playwright).

Routing is by file location + extension. Run `pnpm setup:worktree` after `git worktree add` to install deps, build the jar (if `mvn` available), and verify `pdftk`.

---

## PGLite primer (read this before writing any DB-touching test)

**Every DB-touching test runs against PGLite — an embedded in-memory PostgreSQL.** No Docker, no Postgres container during tests. The integration project spawns a fresh PGLite instance per file (restored from a cached schema snapshot in ~50ms) and routes `getDb()` from `@/lib/db` to it via `setTestDb`.

### Why PGLite over mocks

| Problem with mocking the DB | What PGLite gives us |
|---|---|
| Mock shapes drift from real Drizzle types — tests pass, prod breaks | Real Drizzle queries running on real SQL → if Drizzle compiles + executes, prod will too |
| Mocked transactions can't model concurrent state / FK errors / unique violations | Real Postgres semantics — UNIQUE constraints fire, FK cascades cascade, ON CONFLICT actually conflicts |
| You end up testing "did we call `.update().set(...)` with the right args" instead of "is the row right" | Read the row back via `db.select()` and assert against the real value |
| New columns added to the schema silently miss the mock until prod | The schema cascade rule (below) makes new columns mandatory at test time |

### The three things every integration test needs

1. **PGLite bridge** — happens automatically via `vitest.integration.setup.ts` (`getTestDb()` + `setTestDb({ testDb })`). Code under test calls `getDb()` from `@/lib/db` and gets PGLite. Per-file `vi.mock` only needed when you also want to override other exports of `@/lib/db`.
2. **`cleanupTestDb()` in `beforeEach` AND `afterEach`** — wipes rows in FK-safe order. Already wired in the setup file.
3. **Seed via helpers** (`seedUser`, `seedOrganization`, `seedOrder`, `seedQuestionnaireResponse`) — never hand-roll fixtures. Helpers know which columns are NOT NULL.

### Schema snapshot caching (perf)

`globalSetup: vitest.global-setup.ts` builds the schema ONCE per suite run and dumps it via `dumpDataDir('gzip')` to `node_modules/.cache/vitest-pglite/schema.tar.gz`. Per-file `getTestDb()` restores from that snapshot (`new PGlite({ loadDataDir: <Blob> })`) — ~50ms vs ~1.5s for replaying 235 lines of DDL. Single-file `vitest <path>` runs that skip globalSetup fall back to schema-from-scratch automatically.

If you see suspicious "schema doesn't match" errors after a column change, blow away the cache: `rm -rf node_modules/.cache/vitest-pglite/`.

### Schema cascade rule (the #1 PGLite gotcha)

PGLite's schema is **hand-maintained DDL** in `src/lib/db/test-db.ts`, not auto-generated from `src/lib/db/schema.ts`. When you add or modify a column, update **five** files in lockstep:

1. `src/lib/db/schema.ts` — production Drizzle schema
2. `src/lib/db/test-db.ts` — `CREATE_TABLES_SQL` (must use SQL column names, not the camelCase Drizzle JS names)
3. `src/__tests__/helpers/db-helpers.ts` — `cleanupTestDb()` DELETE list (if you added a new table) + `seedUser` / `seedOrganization` / etc. factories
4. `src/__tests__/fixtures/users.ts` — default user shapes
5. `src/__tests__/helpers/test-server.ts` — `createMockSession` shape, and every `createMockSession(...)` call site

Miss any of these and you'll get `column "X" violates not-null constraint` on tests that worked yesterday.

### Ad-hoc PGLite use (local exploration)

Want to poke at a freshly-seeded DB without spinning up Postgres? `pnpm tsx -e` works:

```ts
import { getTestDb, cleanupTestDb } from "./src/lib/db/test-db"
import { seedUserWithOrg, seedOrder } from "./src/__tests__/helpers/db-helpers"
const db = await getTestDb()
const { user, organization } = await seedUserWithOrg({ db })
const order = await seedOrder({ db, userId: user.id, organizationId: organization.id })
console.log(await db.select().from(/* schema.orders */))
await cleanupTestDb()
```

PGLite has no on-disk footprint by default — it lives entirely in process memory and disappears when the script exits.

### When PGLite isn't enough

- **Cross-process scenarios** (Playwright e2e against a separately-spawned dev server) — PGLite is process-local. Our e2e suite hits a real ephemeral DB (see [e2e-tests.md](./references/e2e-tests.md)). The `@electric-sql/pglite-socket` package is one route to a TCP-wrapped PGLite if we ever want e2e against a "fake" DB.
- **Replicating provider-specific quirks** (Neon connection pooling, RDS planner stats) — PGLite is vanilla Postgres; provider-specific bugs slip past integration tests and need e2e or staging.

For everything else: PGLite over mocks, always.

---

## Core Principle: Test Behavior, Not Implementation

**Every assertion should describe what a user or caller can observe, not how the code achieves it.** Tests that mirror implementation are brittle: they break on harmless refactors and still miss real bugs. Tests that describe observable behavior survive refactors and actually catch regressions.

### The rule

> Write assertions about **inputs → outputs**, **actions → state**, and **events → UI**. Never write assertions about **which internal function was called**, **the order of internal calls**, or **the shape of a call's arguments** when that shape is an implementation detail.

### Good vs bad assertions

| ❌ Implementation test (brittle) | ✅ Behavior test (real signal) |
|---|---|
| `expect(markOrderCompleted).toHaveBeenCalledWith({ ... })` | After webhook runs: `findCompletedOrder({orgId})` returns the row AND `hasOrgPaid({orgId})` is `true` |
| `expect(updateOrgPathway).toHaveBeenCalled()` | After `switchPathway(AOS)`: `getOrgPathway()` returns `"adjustment-of-status"` AND questionnaire row is gone |
| `expect(fetch).toHaveBeenCalledWith('/api/x', expect.anything())` | Hook's exposed `data` matches the server's response body |
| `expect(someRepoFn).toHaveBeenCalledTimes(2)` | DB has 2 new rows with the expected shape |
| `expect(mockLogger.error).toHaveBeenCalled()` | Response status is 500 and body is the documented error shape |

### When you *must* assert a call (rare)

Only acceptable when the call IS the observable behavior and no end-state exists to query:
- **Analytics events**: `expect(analyticsTrack).toHaveBeenCalledWith({ event: 'ORDER_COMPLETED', ... })` — there's no "analytics DB" to read from; the event itself is the output.
- **External SDK calls in unit tests**: verifying `Stripe.checkout.sessions.create` was called with the right amount. (Integration tests should still prefer asserting the returned session URL.)

Even then, scope the assertion to the externally-visible payload shape — don't lock down internal helper function calls.

### Heuristic

> If a refactor that **keeps the behavior** (same inputs → same outputs) would break your test, your test is wrong. Re-state the assertion as "given X, the world is in state Y," and assert that.

### Concrete translation examples

**Before:**
```typescript
it('calls updateOrderCheckoutSession when reusing a pending order', async () => {
  await createCheckout({ userId, organizationId })
  expect(updateOrderCheckoutSession).toHaveBeenCalled()
  expect(createOrder).not.toHaveBeenCalled()
})
```

**After:**
```typescript
it('reuses the existing pending order instead of creating a new one', async () => {
  const existing = await seedOrder({ userId, organizationId, status: 'pending' })
  await createCheckout({ userId, organizationId })

  const orders = await db.select().from(schema.orders).where(eq(schema.orders.organizationId, organizationId))
  expect(orders).toHaveLength(1)
  expect(orders[0].id).toBe(existing.id)
  expect(orders[0].stripeCheckoutSessionId).not.toBe(existing.stripeCheckoutSessionId) // session rotated
})
```

The second version survives any refactor that keeps the "one pending order per org" invariant. The first breaks if we rename the repo function or inline its logic.

---

## Coverage map — what test type for what source file

When you change a source file, this is the test type expected next to it. `/code-review` Step 4 reads this table to flag missing tests as advisory gaps.

| Source file pattern | Expected test type | Location |
|---|---|---|
| `src/components/**/*.tsx` (excluding `*.stories.tsx`, `*.test.tsx`) | Storybook story OR co-located unit test | `Component.stories.tsx` OR `Component.test.tsx` next to source |
| `src/app/**/page.tsx` | Page-level Storybook story (broken-link / CTA-href guard, see PR #105 / #108) | `page.stories.tsx` next to source |
| `src/hooks/use*.ts(x)` | Co-located unit test | `useFoo.test.tsx` |
| `src/services/*.ts` | Integration test (real PGLite) | `src/__tests__/integration/services/*.integration.test.ts` |
| `src/repositories/*.ts` | Integration test (real PGLite) | `src/__tests__/integration/repositories/*.integration.test.ts` |
| `src/app/api/**/route.ts` | Integration test | `src/__tests__/integration/api/**/*.integration.test.ts` |
| `src/lib/utils/*.ts`, `src/lib/http/*.ts` | Co-located unit test | `*.test.ts` next to source |
| `src/lib/dto/*.ts`, `src/lib/schemas/*.ts` | Schema test (advisory) | Co-located or `__tests__/` |
| `src/lib/server/*.ts`, `src/lib/data/*.ts`, `src/lib/config/*.ts` | Case-by-case (no auto-expectation) | — |

For pages, **page-level stories serve as broken-link regression guards** — the play function asserts every primary CTA (`/quiz`, `/login`, `/faq`, etc.) resolves to a real internal route. Cheap layer; catches dead-link regressions before `pnpm check-links` does. Canonical examples: [`src/app/page.stories.tsx`](../../../src/app/page.stories.tsx) (PR #105), [`src/app/dashboard/page.stories.tsx`](../../../src/app/dashboard/page.stories.tsx) (PR #108).

---

## Commands

```bash
# Unit (both projects: unit-node + unit-dom)
pnpm test                    # WATCH MODE — never use (causes infinite session loops)
pnpm test:unit               # Run once
pnpm test:stories            # Storybook stories as Vitest tests (headless Chromium)
pnpm test:all                # Every Vitest project once

# Integration
pnpm test:integration        # Run once
pnpm test:integration:watch  # Watch
pnpm test:integration:ui     # Vitest UI

# E2E (desktop projects only — chromium + firefox + webkit pinned via --project)
pnpm test:e2e                # All desktop projects
pnpm test:e2e:headed         # See browser
pnpm test:e2e:ui             # Playwright UI

# Mobile / PWA / Lighthouse — OPT-IN (not in preflight, not in pre-push)
pnpm mobile:check            # Serial bundle ~10min: e2e + axe + storybook + lighthouse
pnpm mobile:e2e              # iPhone 15 + Pixel 7
pnpm mobile:axe              # WCAG 2.0/2.1/2.2 AA + horizontal-overflow + reduced-motion/dark-mode
pnpm mobile:lighthouse       # lhci autorun (requires :3100 already up)

# Preflight (pre-push contract — CI off pre-launch)
pnpm preflight               # parallel: lint + tc + check-links + unit + integration
pnpm preflight:fast          # drops integration (~3min saved)
pnpm preflight:smart         # diff-aware + tripwire-aware (used by husky pre-push)
pnpm preflight:full          # preflight + e2e (serial)

# Storybook
pnpm storybook               # Dev server (:6006)
pnpm build-storybook         # Static build

# QA Dashboard + coverage attribution
pnpm qa:dashboard            # Open http://127.0.0.1:4321/
pnpm qa:sync                 # Refresh dashboard from @flows tags
pnpm drift:sweep             # Informational full-tree drift scan

# Single file (use --project to pin)
vitest --project=unit-dom src/components/MyComponent.test.tsx
vitest --project=unit-node src/services/myService.test.ts
vitest --project=integration src/__tests__/integration/api/route.integration.test.ts
vitest --project=storybook run src/components/payment/CheckoutButton.stories.tsx
```

---

## Authoring rule: point at canonical files, don't inline examples

This skill's references deliberately **do not** embed long code snippets. Each reference file instead has a "Canonical patterns — look at these first" table that names the real test / story files in `src/` and `src/__tests__/` demonstrating each pattern. Why:

- Code examples in docs drift as the codebase evolves; the real tests don't — they're maintained by the team's own test runs.
- Pointing at a real file forces the reader to see current API shape and current conventions, not a frozen snapshot.
- Keeps the skill body small so progressive disclosure works — the reference files stay scannable.

**When adding to this skill or its references:** prefer `` see [`src/path/to/example.test.ts`](...) `` over inline code. Inline code is acceptable only for (a) structural setup that must be copy-pasted verbatim (e.g., the `vi.mock('@/lib/db', ...)` PGLite bridge, the `storybookTest` plugin config), (b) the Core Principle's "good vs bad" comparison table in SKILL.md, or (c) a one-liner that clarifies a word in prose. Everything else is a link.

## Test Type Index — when to load which reference

Load the reference file that matches the task you're about to do. Each goes deep into that flavor's patterns, fixtures, and gotchas. The Core Principle above still applies across all of them.

### Unit tests — [`references/unit-tests.md`](./references/unit-tests.md)
Co-located `*.test.ts(x)` next to source. RTL + userEvent v14+. Mock external deps only (`next/navigation`, `posthog-js`, external SDKs). Covers: file location, query priority (`getByRole` over testid), `userEvent.setup()` pattern, async handling (`findBy*` vs `waitFor`), mocking Next.js navigation and react-hook-form context, testing async state updates and form validation, and what not to mock.

### Integration tests — [`references/integration-tests.md`](./references/integration-tests.md)
Live under `src/__tests__/integration/`. Real PGLite (in-memory PostgreSQL), real services, real repositories — only `@/lib/auth` (session) and external services get mocked. Covers: file location, `cleanupTestDb` lifecycle, seed helpers (`seedUser`, `seedOrganization`, `seedOrder`, `seedQuestionnaireResponse`), `createNextRequest` request builder, and the round-trip pattern (`POST` → `GET` → direct DB read).

### E2E tests — [`references/e2e-tests.md`](./references/e2e-tests.md)
Playwright specs under `src/__tests__/e2e/*.e2e.ts`. Real browser, real app, real flows. Covers: accessible selectors (`getByRole`/`getByLabel`), E2E helpers (`generateTestEmail`, `signUp`, `logIn`, `goToQuestionnaire`), happy-path user-journey pattern, error-state pattern, and test isolation via browser contexts.

### Storybook stories — [`references/storybook.md`](./references/storybook.md)
Co-located `*.stories.tsx`. Global `QueryClientProvider` + `TooltipProvider` in `.storybook/preview.tsx`; `withForm`/`centered` helpers in `src/stories/decorators.tsx`. Covers: args-first CSF3, argTypes for Controls panel, play functions (`await` every `userEvent.*` and `expect`), `step()` for complex flows, `parameters.a11y.test` for accessibility via `addon-a11y`, MSW addon for network mocking, dialog/portal queries via `document.body`, per-story `QueryClient.setQueryData`, addon-vitest (`pnpm test:stories`), portable stories (`composeStories`), and 8 anti-patterns from the GRE-133 audit.

### Mobile + PWA tests — [`references/mobile-and-pwa.md`](./references/mobile-and-pwa.md)
Opt-in suite (NOT in preflight, NOT in pre-push, NOT in `test:e2e`). Covers: the six Playwright projects (3 desktop + 2 mobile + Pixel-7 shared), `testIgnore` pattern that pins `*.mobile.e2e.ts` to mobile-only, the `mobile:check` serial orchestrator (and why parallel breaks dev-server contention), `mobile:axe` sweep (WCAG 2.0/2.1/2.2 AA + horizontal-overflow + reduced-motion/dark-mode), `pwa.mobile.e2e.ts` (manifest + icons + viewport, replacing the deprecated Lighthouse PWA category), `mobile:lighthouse` mobile preset (`lighthouserc.cjs`, accessibility blocking ≥0.95), and the naming convention for adding a new mobile-only spec.

### QA workflow — [`references/qa-workflow.md`](./references/qa-workflow.md)
The pre-push contract and the coverage attribution layer. Covers: `preflight` (parallel lint + tc + check-links + unit + integration) and its variants (`:fast`, `:smart`, `:full`), the `preflight:smart` diff-aware path used by husky pre-push (with tripwire fallback to full preflight), `@flows: <id>` tagging convention to attribute tests to user flows in `qa-dashboard/flows.json`, `pnpm qa:sync` (parses tags and populates the dashboard), `pnpm qa:dashboard` (serve at :4321), the STATUS.md update obligation for QA-spec deliverables, and `pnpm drift:sweep` informational scan modes.

---

## React 19 Specific Considerations

### `act()` changes
- Import from `react` (not `react-dom/test-utils`)
- Prefer async `act()` — the sync version is being deprecated
- React Testing Library's `findBy*` and `waitFor` wrap `act()` automatically — prefer them over manual `act()`

```typescript
// AVOID manual act() when possible
import { act } from 'react'

// PREFER Testing Library async utilities
await screen.findByText('Loaded')
await waitFor(() => expect(mockFn).toHaveBeenCalled())
```

### Async Server Components
- Vitest doesn't support async Server Components
- Use E2E tests for async Server Component testing
- Unit test Client Components and hooks normally

---

## Cross-Cutting Anti-Patterns

These apply to all test types. Per-type anti-patterns live in each reference file.

### 1. Empty `waitFor` callback
```typescript
// BAD - fragile, non-deterministic
await waitFor(() => {})

// GOOD - wait for specific condition
await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument())
```

### 2. Using `queryBy*` for existence assertions
```typescript
// BAD - returns null, unhelpful error message
expect(screen.queryByText('Welcome')).toBeInTheDocument()

// GOOD - throws with helpful error showing rendered content
expect(screen.getByText('Welcome')).toBeInTheDocument()

// CORRECT use of queryBy* - checking absence
expect(screen.queryByText('Error')).not.toBeInTheDocument()
```

### 3. Side effects inside `waitFor`
```typescript
// BAD - side effect may run multiple times
await waitFor(() => {
  fireEvent.click(button)  // DON'T DO THIS
  expect(result).toBe(true)
})

// GOOD - side effect outside waitFor
await user.click(button)
await waitFor(() => expect(result).toBe(true))
```

### 4. `fireEvent` instead of `userEvent`
```typescript
// BAD - doesn't simulate real user behavior
fireEvent.change(input, { target: { value: 'test' } })

// GOOD - simulates actual typing
const user = userEvent.setup()
await user.type(input, 'test')
```

### 5. Mocking internal modules
```typescript
// BAD - tests don't verify real behavior
vi.mock('@/lib/services/myService')
vi.mock('@/hooks/useMyHook')

// GOOD - only mock external boundaries
vi.mock('next/navigation')
vi.mock('posthog-js')
```

---

## High-Level Checklist

### Before writing tests
- [ ] Identify test type (unit / integration / E2E / story) and load the matching reference file
- [ ] Check for existing test patterns in sibling files
- [ ] Determine what to mock — only external dependencies that leave our process

### For every test
- [ ] Assertions describe observable behavior, not internal call shape (Core Principle)
- [ ] Accessible queries (`getByRole`, `getByLabelText`) — never `getByTestId`
- [ ] `userEvent.setup()` before render; `await` every user interaction
- [ ] `findBy*` for async elements; `queryBy*` only for absence checks
- [ ] UTC dates when comparing parsed timestamps

---

## Performance tuning (when tests get slow again)

Already shipped (in `vitest.config.ts` + `tsconfig.json` + `package.json`):
- PR #113: `pool: 'threads'` + `useAtomics: true` for the unit project — **2.25× faster** than vitest 4 default `forks`.
- PR #113: `tsBuildInfoFile` at `node_modules/.cache/typescript/tsbuildinfo` — warm tsc 3.4s.
- PR #113: ESLint `--cache-strategy content` — survives `git checkout`/`rebase`.
- PR #113: `run-p --max-parallel 4 --continue-on-error` — caps oversubscription, shows all failures.
- PR #113: `preflight:smart` script — diff-aware, only runs tasks/tests for paths in the diff vs `origin/main`.
- PR #290: Split `vitest.setup.ts` → unit-only setup + integration-only setup. Removed PGLite init from unit projects — unit suite wall 117s → 27s. Removed `src/app/providers.tsx` from tripwire regex. Added opt-in `pdf-system` vitest project + `JAR_AVAILABLE` skip pattern so fresh worktrees don't block pushes.
- PR ?: PGLite schema snapshot via Vitest `globalSetup` for integration project — integration setup phase 159s → ~50s parallel time; full preflight wall ~99s → ~70s. See `vitest.global-setup.ts` + `PGLITE_SCHEMA_SNAPSHOT_PATH` in `src/lib/db/test-db.ts`.

Not yet shipped — measured impact + risk for the next person who needs more speed:

| Option | Estimated saving | Risk | Notes |
|---|---|---|---|
| Per-file `// @vitest-environment node` on the 81 unit tests that don't import `@testing-library/react` | ~3–5s | Low | Drop happy-dom setup cost on pure-logic tests. Per-file magic comment OR `environmentMatchGlobs` |
| `isolate: false` on the unit project | ~12s (43s vs 55s for unit) | Medium | Tests share module graph across files in same worker. Audit `vitest.setup.ts` mocks (Next.js router, PostHog) for cross-file pollution first |
| `tsc --build` with composite projects | ~2× warm (3.4s → ~1.5s) | High | Multi-day refactor: per-package tsconfigs + `composite: true` + `declaration: true`. Skip unless we add many more packages |
| TRUNCATE-based `cleanupTestDb()` | ❌ TRIED, REVERTED | — | Measured ~30% slower than per-table DELETEs in PGLite for the mostly-empty cleanup pattern (TRUNCATE CASCADE has fixed per-table overhead; DELETE on empty table is near-free). |

Already considered + rejected (don't re-investigate without new signal):
- `vmThreads`, vitest `--shard=N/M`, SWC transformer, `experimental.fsModuleCache`, more chromium workers in storybook — all out of scope for our shape (single-app, single-machine, browser-mode chromium already at memory cap).

Full reasoning + measurements: `docs/decisions/dev-experience.md` (entries dated 2026-05-01).

## Resources

- [React Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Docs](https://vitest.dev/)
- [Playwright Docs](https://playwright.dev/)
- [Common RTL Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Fix act() Warnings](https://kentcdodds.com/blog/fix-the-not-wrapped-in-act-warning)
- [Storybook — Writing Stories](https://storybook.js.org/docs/writing-stories)
- [Storybook — Interaction Testing](https://storybook.js.org/docs/writing-tests/interaction-testing)
- [Storybook — Accessibility Testing](https://storybook.js.org/docs/writing-tests/accessibility-testing)
