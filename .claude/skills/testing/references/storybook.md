# Storybook Stories — Patterns & Anti-Patterns

Loaded on demand from the main testing skill. The **Core Principle** in SKILL.md (behavior, not implementation) is the umbrella rule — this doc shows what it looks like for stories.

This reference points to canonical stories in the codebase rather than inlining example code — examples rot, the real stories don't.

Canonical docs: https://storybook.js.org/docs.

## Contents

- [What stories are for](#what-stories-are-for)
- [File location & setup](#file-location--setup)
- [Canonical stories — look at these first](#canonical-stories--look-at-these-first)
- [Story shape (CSF3)](#story-shape-csf3)
- [Play functions](#play-functions)
- [`step()` for multi-action flows](#step-for-multi-action-flows)
- [Running stories as tests — `@storybook/addon-vitest`](#running-stories-as-tests--storybookaddon-vitest)
- [Portable stories: import stories into Vitest tests](#portable-stories-import-stories-into-vitest-tests)
- [Story tags for test inclusion/exclusion](#story-tags-for-test-inclusionexclusion)
- [Accessibility via `addon-a11y`](#accessibility-via-addon-a11y)
- [Network mocking via MSW addon](#network-mocking-via-msw-addon)
- [`loaders` for async story setup](#loaders-for-async-story-setup)
- [Dialogs, portals, `document.body`](#dialogs-portals-documentbody)
- [State-dependent stories: per-story QueryClient](#state-dependent-stories-per-story-queryclient)
- [Visual regression (Chromatic)](#visual-regression-chromatic)
- [Anti-patterns (from audit findings)](#anti-patterns-from-audit-findings)
- [Story checklist](#story-checklist)

## What stories are for

Stories serve three jobs simultaneously: visual review of variants, usable component docs via the Controls panel, and automated interaction tests via play functions. Args-first authoring favors the Controls panel and docs; play functions add test coverage for interactions. Plan for both — prefer args wherever possible, add plays only where user simulation is needed.

## File location & setup

- Co-located: `Component.stories.tsx` next to `Component.tsx`
- Global decorators in [`.storybook/preview.tsx`](../../../../.storybook/preview.tsx): `QueryClientProvider` (fresh per story — prevents cross-story cache pollution), `TooltipProvider`, `parameters.a11y.test` for accessibility
- Shared helpers in [`src/stories/decorators.tsx`](../../../../src/stories/decorators.tsx):
  - `withForm({ defaultValues, schema? })` — wraps story in RHF `FormProvider`
  - `centered(widthClass?)` — fixed-width container for fields and small components
- Storybook config in [`.storybook/main.ts`](../../../../.storybook/main.ts)

## Canonical stories — look at these first

When writing a new story, find the closest analog here and copy its shape.

| Pattern | Canonical file |
|---|---|
| Simple args-first story with argTypes (Controls + autodocs) | [`src/components/dashboard/StepCard.stories.tsx`](../../../../src/components/dashboard/StepCard.stories.tsx) |
| Form field + `withForm` decorator + format-error play function | [`src/components/questionnaire/fields/ConnectedField.stories.tsx`](../../../../src/components/questionnaire/fields/ConnectedField.stories.tsx) |
| Auth form — blur-triggered Zod validation (pre-submit only) | [`src/components/auth/LoginForm.stories.tsx`](../../../../src/components/auth/LoginForm.stories.tsx) |
| Per-story `QueryClient.setQueryData` (payment-status states) | [`src/components/payment/CheckoutButton.stories.tsx`](../../../../src/components/payment/CheckoutButton.stories.tsx) |
| Payment gate wrapper with pre-seeded cache | [`src/components/payment/PaymentGate.stories.tsx`](../../../../src/components/payment/PaymentGate.stories.tsx) |
| Dialog portaled to `document.body` | [`src/components/questionnaire/UnsavedChangesDialog.stories.tsx`](../../../../src/components/questionnaire/UnsavedChangesDialog.stories.tsx) |
| Multi-step play function using `step()` | [`src/components/questionnaire/fields/BirthInfoFields.stories.tsx`](../../../../src/components/questionnaire/fields/BirthInfoFields.stories.tsx) |
| Conditional field visibility (`EmploymentFields`, status toggle) | [`src/components/questionnaire/fields/EmploymentFields.stories.tsx`](../../../../src/components/questionnaire/fields/EmploymentFields.stories.tsx) |
| Complex form container with required children + render | [`src/components/questionnaire/FormLayout.stories.tsx`](../../../../src/components/questionnaire/FormLayout.stories.tsx) |
| Structural MANDATORY save-block (ExclusionaryGate) | [`src/components/questionnaire/ExclusionaryWarning.stories.tsx`](../../../../src/components/questionnaire/ExclusionaryWarning.stories.tsx) |

## Story shape (CSF3)

Prefer `args` + `argTypes` over custom `render` functions wherever possible. Args drive the Controls panel, let stories share state across variants, and survive component prop renames with zero rewrite. Per the Storybook docs: use args as much as possible; play functions are for scenarios that require user simulation.

**Required in meta:**
- `component: YourComponent` — enables autodocs + Controls panel
- `tags: ['autodocs']` — generates the Docs page
- `argTypes` — Controls panel entries for each prop (`select`, `boolean`, `text`; `control: false` for complex props like `children`)

**When you must use `render`**: complex required children, nested providers, or context the component consumes that args can't express. Still set `component` in meta and declare argTypes with `{ control: false }` for the uneditable props. See [`FormLayout.stories.tsx`](../../../../src/components/questionnaire/FormLayout.stories.tsx) for the live pattern.

## Play functions

Play functions run after render, in order. **Always await** both `userEvent.*` and `expect(...)` calls — the docs are explicit: "userEvent methods should always be awaited... expect calls should always be awaited." This ensures the Interactions panel logs them correctly.

Imports come from `storybook/test`: `expect`, `userEvent`, `within`, `fn`.

Blur-triggered format validation is the most common pattern — see [`LoginForm.stories.tsx`](../../../../src/components/auth/LoginForm.stories.tsx) `WithEmailFormatError`.

## `step()` for multi-action flows

Multi-step plays (3+ user actions) get grouped in the Interactions panel via `step`, pulled from the play-function context argument: `play: async ({ canvasElement, step }) => { ... }`.

Don't wrap 1–2 action plays — overkill. Canonical multi-step usage: [`BirthInfoFields.stories.tsx`](../../../../src/components/questionnaire/fields/BirthInfoFields.stories.tsx) and [`ConnectedAddressFields.stories.tsx`](../../../../src/components/questionnaire/fields/ConnectedAddressFields.stories.tsx) `CountryToggle`.

## Running stories as tests — `@storybook/addon-vitest`

**Wired.** Every story runs as a real Vitest test via `pnpm test:stories`. Execution path: Vite transforms each story via portable stories → Vitest runs it in headless Chromium through Playwright's browser-mode provider → smoke render + play functions + a11y all validated in one pass.

Config lives in [`vitest.config.ts`](../../../../vitest.config.ts) as a project called `storybook` alongside the existing `unit` project. Setup file: [`.storybook/vitest.setup.ts`](../../../../.storybook/vitest.setup.ts) wires `setProjectAnnotations` so stories run with the global decorators from `.storybook/preview.tsx` (QueryClientProvider, TooltipProvider, MSW loader).

**Run commands:**
```bash
pnpm test:stories          # every story in headless Chromium
pnpm vitest --project=storybook run src/components/payment/  # subset
pnpm vitest --project=storybook  # watch mode (Vitest UI works)
```

**Vs. the unit project:** real-browser execution catches issues JSDOM misses — portal focus behavior, `navigator.clipboard` permissions, real CSS layout, timing of Radix dropdowns, etc. Stories that passed in the unit tests may legitimately fail here — that's signal, not noise.

**Tag filter:** the plugin is configured with `tags: { include: ['test', 'autodocs'] }` so every story tagged `autodocs` (default via `preview.tsx`) runs automatically. Opt a specific story out with `tags: ['!test']`.

Docs: https://storybook.js.org/docs/writing-tests/integrations/vitest-addon.

## Portable stories: import stories into Vitest tests

`composeStories` from `@storybook/react` (or the framework-specific re-export) lets you import a whole stories file into a regular Vitest test and execute stories with all their decorators, args, and play functions applied. Useful when:

- You want to test a component composition that's hard to express as yet another story
- You want to reuse the args/decorators from Story A as the fixture for a bespoke assertion in a `.test.ts`
- You want to run play-driven tests in Vitest directly without addon-vitest's browser mode

Docs: https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest.

## Story tags for test inclusion/exclusion

`tags: ['autodocs']` makes a story appear in the Docs page. `tags: ['test']` (the default include for `addon-vitest`) makes it run as a test. Stories can carry multiple tags. To opt OUT of automatic test execution (e.g., a story that intentionally crashes to demo an error boundary), use `tags: ['!test']`.

**In this codebase we typically use `tags: ['autodocs']`** — once addon-vitest is wired, we'll need to either add `'test'` to that list or configure the addon to include autodocs stories too (`{ include: ['autodocs', 'test'] }` in the plugin options).

## Accessibility via `addon-a11y`

The addon is already configured. `parameters.a11y.test: 'todo'` is set globally in [`.storybook/preview.tsx`](../../../../.storybook/preview.tsx) — WCAG violations surface in the Accessibility panel without blocking the build. Use `'todo'` while triaging; elevate to `'error'` per-story or globally to fail on violations. Per Storybook docs, the addon catches ~57% of WCAG issues via automated axe-core scanning. With `addon-vitest` wired, these checks also run on every `pnpm test` pass.

## Network mocking via MSW addon

**Wired.** `msw` + `msw-storybook-addon` are installed. The service worker lives at [`public/mockServiceWorker.js`](../../../../public/mockServiceWorker.js) (generated via `npx msw init public/ --save`). [`.storybook/preview.tsx`](../../../../.storybook/preview.tsx) calls `initialize({ onUnhandledRequest: 'bypass' })` and `loaders: [mswLoader]` so every story can opt into per-story handlers.

Storybook's recommended approach for anything story-level that hits the network — superior to per-story `global.fetch` stubs because (a) it catches fetches in any indirection (native fetch, `@tanstack/react-query`, axios, etc.), (b) it matches real HTTP shapes, and (c) parameters merge cleanly across meta and story levels.

Per-story usage:

```ts
import { http, HttpResponse } from 'msw'

export const SuccessfulLogin: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/auth/login', () => HttpResponse.json({ success: true })),
      ],
    },
  },
  play: async ({ canvasElement }) => { /* click submit, assert post-submit state */ }
}
```

`onUnhandledRequest: 'bypass'` is the global default so stories that don't define handlers let real requests through (useful when a component's fetches are harmless). Override per-story if you want strict mode.

Docs: https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-network-requests.

## `loaders` for async story setup

`loaders` run before render and can populate story context with async-fetched data. Useful for stories that need seeded data available synchronously during render (e.g., a fixture file loaded once per story, a pre-computed QueryClient cache).

```ts
const meta: Meta<typeof Component> = {
  loaders: [
    async () => ({ fixture: await import('./fixtures/full.json') }),
  ],
}
```

Docs: https://storybook.js.org/docs/writing-stories/loaders. We don't currently use loaders — most of our state needs are covered by per-story QueryClient pre-seeding (below), but loaders are the right tool for fixture-file-heavy stories or when you need `await` before the first render.

## Dialogs, portals, `document.body`

Radix (and other) dialogs portal their content outside `canvasElement`. Query them via the document body: `within(canvasElement.ownerDocument.body)`. For absence checks on a closed dialog, `queryByRole('dialog')` + `.not.toBeInTheDocument()` is the legitimate use of `queryBy*`.

Canonical: [`UnsavedChangesDialog.stories.tsx`](../../../../src/components/questionnaire/UnsavedChangesDialog.stories.tsx) shows both the open and closed cases.

## State-dependent stories: per-story QueryClient

When a component reads from React Query (payment status, session, member list), override the global QueryClient with a per-story `QueryClientProvider` that pre-seeds the cache via `queryClient.setQueryData(key, value)`. The nearest provider wins, so the override naturally replaces the global one.

Canonical: [`CheckoutButton.stories.tsx`](../../../../src/components/payment/CheckoutButton.stories.tsx) and [`DashboardHeader.stories.tsx`](../../../../src/components/dashboard/DashboardHeader.stories.tsx).

## Visual regression (Chromatic)

**Workflow stubbed.** [`.github/workflows/chromatic.yml`](../../../../.github/workflows/chromatic.yml) is committed but gated behind a `CHROMATIC_ENABLED=true` repo variable. To activate: set `CHROMATIC_PROJECT_TOKEN` secret + `CHROMATIC_ENABLED` variable in the repo settings, and the workflow will publish the built Storybook on every push + PR. Uses `onlyChanged: true` (TurboSnap) so only affected stories re-snapshot.

Visual tests catch pixel-level changes that interaction tests miss — font metrics, padding, color drift, layout shift under long data. Defer activation until we hit a regression play functions didn't catch, or the team signs up for the Chromatic plan.

DIY alternative: Playwright `toHaveScreenshot()` on the built Storybook static site. More setup, zero cost.

## Anti-patterns (from audit findings)

These are real mistakes caught and fixed during GRE-133. Avoid them.

### 1. Tautological `.toBeTruthy()` on `getBy*`

`getByRole` / `getByText` / `getByLabelText` **throw** when the element is missing. Appending `.toBeTruthy()` adds no signal — the throw already asserted existence. Use `.toBeEnabled()`, `.toBeDisabled()`, `.toHaveAttribute('href', '/x')`, `.toHaveValue('...')`, or omit the assertion (the throw on miss is sufficient).

### 2. Empty `Default: Story = {}` with no args or play

A story with no args override, no argTypes, and no play function only verifies "renders without crashing" — zero signal beyond the framework's existence check. At minimum, add args that exercise a variant OR a minimal play function that asserts on the initial state. See [`LoginForm.stories.tsx`](../../../../src/components/auth/LoginForm.stories.tsx) `Default` for a proper minimum.

### 3. `getByTestId` / `data-testid`

Banned. Use accessible queries (`getByRole`, `getByLabelText`, `getByText`). If you feel you need a testid, either the component has an accessibility gap (fix the component) or you're over-specifying (use text/role instead).

### 4. Mirroring implementation via `expect(fn).toHaveBeenCalled`

Asserting on internal function calls is the same anti-pattern we ban in unit tests. Exception: the call IS the externally-visible output — analytics events, router navigation, external SDK writes. Scope the assertion to the externally-visible payload shape, not the full call signature.

### 5. Brittle counts coupled to implementation

Don't assert `getAllByRole(...).length >= N` — the count breaks if a row is added or moved. Assert on visible content by role+name instead.

### 6. `component` field omitted from meta

Loses autodocs and the Controls panel. Always set `component: YourComponent`. If complex required props can't be expressed as `args`, keep `render` but still set `component` + mark those props `{ control: false }` in argTypes.

### 7. Unused `eslint-disable` directives

The `custom/prefer-parameter-destructuring` rule only fires on 2+ positional params. Storybook decorators take a single `(Story)` argument — no disable needed. Don't scatter useless suppressions.

### 8. Creating `fn()` spies and never asserting them

If a story creates `fn()` mocks for callback props, either assert on them in a play function or remove them. Unused spies are dead code. If the only point is visibility in the Actions panel, that's OK — but don't create them under the pretense of testing.

## Story checklist

- [ ] `component: X` set in meta (enables autodocs + Controls)
- [ ] `argTypes` declared for enumerated props (`select`, `boolean`, `text`)
- [ ] `tags: ['autodocs']` on meta (unless explicitly opting out)
- [ ] At least one story shows the happy path; others cover error, loading, disabled, empty
- [ ] Play functions `await` every `userEvent.*` and `expect(...)` call
- [ ] Play function assertions describe behavior (visible state, attribute, spy on external boundary), not internal function calls
- [ ] 3+ action flows wrapped in `step()` with a descriptive label
- [ ] Accessible queries only (`getByRole`, `getByLabelText`, `getByText`) — never `getByTestId`
- [ ] Absence checks use `queryBy*` + `.not.toBeInTheDocument()`
- [ ] Dialogs queried via `within(canvasElement.ownerDocument.body)` — they portal outside the canvas
- [ ] Per-story `QueryClient.setQueryData` for state-dependent stories
- [ ] `withForm` from `src/stories/decorators.tsx` for RHF-coupled components; `centered()` for fields
- [ ] No `fn()` spies created and never asserted — if you spy, assert
- [ ] Real defaults from `src/lib/defaults/` / `src/lib/mocks/` — don't hand-roll fixture shapes
