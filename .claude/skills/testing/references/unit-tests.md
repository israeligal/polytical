# Unit Tests

Loaded on demand from the main testing skill. The **Core Principle** in SKILL.md (behavior, not implementation) is the umbrella rule — this doc shows what it looks like for unit tests.

This reference points to canonical tests in the codebase rather than inlining example code — examples rot, the real tests don't.

## Contents

- [File location & naming](#file-location--naming)
- [Canonical patterns — look at these first](#canonical-patterns--look-at-these-first)
- [Query priority](#query-priority)
- [User interactions — `userEvent.setup()`](#user-interactions--usereventsetup)
- [Async operations](#async-operations)
- [Mocking](#mocking)
- [Testing form validation](#testing-form-validation)
- [What NOT to mock](#what-not-to-mock)
- [Unit test checklist](#unit-test-checklist)

## File location & naming

- Co-locate with source: `src/components/Button.tsx` → `src/components/Button.test.tsx`
- Hooks: `src/hooks/useFeature.test.tsx`
- Utilities & pure modules: `src/lib/utils/helper.test.ts`
- Services with external SDK clients: `src/services/X.test.ts`

## Project routing — `.test.ts` vs `.test.tsx`

The unit suite splits across two Vitest projects to avoid paying happy-dom's setup cost on ~129 pure-logic tests:

| Project | Env | Picks up | Use for |
|---|---|---|---|
| `unit-node` | Node | `**/*.test.ts` | Services, repositories, DTOs, Zod schemas, validators, pdf-service mappers, packages |
| `unit-dom` | happy-dom | `**/*.test.tsx` (+ a small allowlist of `.test.ts` files that need DOM) | Components, RHF hooks, anything touching `window` / `document` / `localStorage` |

**Default to `.test.tsx` whenever you need DOM** — it's auto-routed. The allowlist `DOM_TEST_TS_FILES` in [`vitest.config.ts`](../../../../vitest.config.ts) only exists for legacy hook tests with the `.test.ts` extension that genuinely need DOM (e.g., `renderHook`). Don't grow the allowlist if you can rename to `.test.tsx` instead.

Pin a single-file run with `--project`: `vitest --project=unit-dom src/components/Foo.test.tsx`.

**Tests that shell out to system binaries belong in `pdf-system`, NOT `unit-node`.** Anything calling `pdftk` or loading `services/pdf-service/java/target/form-filler.jar` must live under `services/pdf-service/src/lib/mapping/definitions/**/__tests__/*roundtrip*.test.ts` (covered by the `pdf-system` project's `include` glob) and guard with the `PDF_SYSTEM_READY` pattern (mirror of [`pdf-roundtrip.test.ts`](../../../../services/pdf-service/src/lib/mapping/definitions/i130/__tests__/pdf-roundtrip.test.ts)). Tests that *mock* `fillPdfForm` are fine in `unit-node` — they don't touch the system dep.

## Canonical patterns — look at these first

When you're about to write a unit test, find the closest analog below and copy its shape. These files are kept current by the team's own test runs — they're the source of truth, not inline snippets.

| Pattern | Canonical file |
|---|---|
| Pure function / pure module | [`src/repositories/require-user-id.test.ts`](../../../../src/repositories/require-user-id.test.ts) |
| Hook + React Query + `fetch` mock | [`src/hooks/useQuestionnaireQuery.test.tsx`](../../../../src/hooks/useQuestionnaireQuery.test.tsx) |
| Hook for a mutation (fetch + blob download) | [`src/hooks/useGenerateI130.test.tsx`](../../../../src/hooks/useGenerateI130.test.tsx) |
| Hook that uses the auth session | [`src/hooks/usePayment.test.tsx`](../../../../src/hooks/usePayment.test.tsx) |
| Service with external SDK (mock `fetch` / SDK only) | [`src/services/pdf.service.test.ts`](../../../../src/services/pdf.service.test.ts) |
| Service with repository collaborators | [`src/services/aos-qualifying.service.test.ts`](../../../../src/services/aos-qualifying.service.test.ts) |
| Zod schema — parameterized required-field failures | [`src/lib/dto/common.dto.test.ts`](../../../../src/lib/dto/common.dto.test.ts) |
| Zod refinements / format validators | [`src/lib/validation/format-validation.test.ts`](../../../../src/lib/validation/format-validation.test.ts) |
| Review validation (composed validators) | [`src/lib/validation/questionnaire-review-validation.test.ts`](../../../../src/lib/validation/questionnaire-review-validation.test.ts) |

Global Vitest setup — Next.js navigation mocks, PostHog mock, PGLite lifecycle — lives in [`vitest.setup.ts`](../../../../vitest.setup.ts). Don't re-mock these in individual tests.

## Query priority

Use queries that resemble how a real user finds elements. In order of preference:

1. **Accessible**: `getByRole`, `getByLabelText`, `getByPlaceholderText`, `getByText`
2. **Semantic**: `getByAltText`, `getByTitle`
3. **Test IDs**: `getByTestId` — **banned in this codebase**; if you need one, the component has an accessibility gap, or you're over-specifying

## User interactions — `userEvent.setup()`

Always call `userEvent.setup()` before `render()`. All userEvent methods are async and must be awaited. See the form-interaction patterns in hook tests like [`usePayment.test.tsx`](../../../../src/hooks/usePayment.test.tsx) for current usage.

## Async operations

- **`findBy*`** — preferred for async elements (auto-waits and retries)
- **`waitFor`** — for complex multi-assertion waits; never empty callbacks, never side-effects inside
- React 19 note: RTL's `findBy*` / `waitFor` wrap `act()` automatically — prefer them over manual `act()`

## Mocking

**Only mock what leaves the process:**
- `next/navigation` — already globally mocked in `vitest.setup.ts`
- `posthog-js` — already globally mocked
- `global.fetch` — for hooks/services that call our own APIs (we're testing the client, the server has its own integration tests)
- External SDKs: Stripe, Resend, `@/lib/auth-client`

**Never mock our own:** repositories, services, internal hooks, Zod schemas, pure utilities.

For how to structure each kind of mock, see the canonical tests listed above — they all follow the same rule and demonstrate the live pattern.

## Testing form validation

React-Hook-Form + Zod format errors flow via `fieldState.error`. To test validation:
- Type into a field, blur (via `user.tab()`), then assert the visible error text renders (e.g., `await screen.findByText(/invalid email/i)`)
- Required-field errors are suppressed pre-submit — check for format errors on blur, required errors only on submit or review

Canonical: [`src/lib/validation/format-validation.test.ts`](../../../../src/lib/validation/format-validation.test.ts) for validator units; field-blur interaction patterns live in the co-located `*.stories.tsx` play functions (see `references/storybook.md`).

## What NOT to mock

**CRITICAL: Never mock internal services in unit tests.** If you need to mock an internal module to make your test work, the test is probably at the wrong layer — move it to integration or push the assertion up to an observable boundary (DB state, rendered output, returned value). See the Core Principle in SKILL.md.

## Unit test checklist

- [ ] Co-located next to source (`Foo.tsx` → `Foo.test.tsx`)
- [ ] `userEvent.setup()` before `render()`
- [ ] Accessible queries (`getByRole`/`getByLabelText`) — never `getByTestId`
- [ ] `findBy*` for async; `queryBy*` only for absence checks
- [ ] Every `userEvent.*` and async `expect` awaited
- [ ] Only external deps mocked (fetch, SDKs, `next/navigation`, `posthog-js`, `@/lib/auth-client`)
- [ ] Assertions describe observable state (rendered output, return value, DB row), not internal call shape
- [ ] UTC dates for timestamp comparisons (`new Date("YYYY-MM-DD")`)
