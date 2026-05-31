# E2E Tests

Loaded on demand from the main testing skill. The **Core Principle** in SKILL.md (behavior, not implementation) is the umbrella rule — this doc shows what it looks like for E2E tests.

This reference points to canonical tests in the codebase rather than inlining example code — examples rot, the real tests don't.

## Contents

- [File location](#file-location)
- [Canonical flows — look at these first](#canonical-flows--look-at-these-first)
- [Helpers](#helpers)
- [Selector priority](#selector-priority)
- [Test isolation](#test-isolation)
- [E2E test checklist](#e2e-test-checklist)

## File location

All Playwright specs under [`src/__tests__/e2e/`](../../../../src/__tests__/e2e/). Config at [`playwright.config.ts`](../../../../playwright.config.ts) (project root).

**Suffix routing**: `*.e2e.ts` runs on every project (desktop + mobile). `*.mobile.e2e.ts` is excluded from desktop projects via `testIgnore` so `pnpm test:e2e` doesn't run mobile-only specs three times. When you add a touch-gesture or viewport-overflow spec, name it `*.mobile.e2e.ts` and add it to the `testIgnore` arrays in `playwright.config.ts`. See [`mobile-and-pwa.md`](./mobile-and-pwa.md) for the full split.

**Default `pnpm test:e2e` is pinned to desktop projects only** (`--project=chromium --project=firefox --project=webkit`). Mobile projects only execute under `pnpm mobile:e2e` / `pnpm mobile:axe` / `pnpm mobile:check`.

## Canonical flows — look at these first

| Flow | Canonical spec |
|---|---|
| Signup / login / logout | [`src/__tests__/e2e/auth.e2e.ts`](../../../../src/__tests__/e2e/auth.e2e.ts) |
| Questionnaire page filling + persistence | [`src/__tests__/e2e/questionnaire.e2e.ts`](../../../../src/__tests__/e2e/questionnaire.e2e.ts) |
| Dashboard navigation | [`src/__tests__/e2e/dashboard.e2e.ts`](../../../../src/__tests__/e2e/dashboard.e2e.ts) |
| PDF download flow (I-130 gated on payment) | [`src/__tests__/e2e/pdf-download.e2e.ts`](../../../../src/__tests__/e2e/pdf-download.e2e.ts) |

Copy the structure from the closest analog.

## Helpers

[`src/__tests__/e2e/helpers.ts`](../../../../src/__tests__/e2e/helpers.ts) exports the shared flows every spec should use:

- `generateTestEmail()` — unique email per run (test isolation across parallel specs)
- `signUp(page, { name, email, password })` — runs the real signup flow
- `logIn(page, { email, password })` — runs the real login flow
- `goToQuestionnaire(page, section, pageId)` — navigates to a specific questionnaire page

**Don't reinvent these inline** — one canonical helper per flow keeps the specs readable and robust to UI tweaks.

## Selector priority

The same accessibility-first rule as unit tests, expressed in Playwright API:

1. **Role-based (best)**: `page.getByRole('button', { name: /submit/i })`, `page.getByRole('textbox', { name: /email/i })`
2. **Label-based**: `page.getByLabel('Email')` (use `{ exact: true }` when needed)
3. **Text content**: `page.getByText(/welcome back/i)`
4. **Test IDs (last resort, banned by project policy)**: `page.getByTestId(...)` — don't

Use exact-match (`{ name: 'Submit', exact: true }`) only when a regex would be ambiguous.

## Test isolation

Each test should be independent. Playwright gives each test a fresh browser context by default — use it.

- Use `generateTestEmail()` to produce unique emails per test
- Don't share session state between tests unless the test setup explicitly logs in via `signUp`/`logIn`
- Clear cookies / localStorage at the top of a test if it needs a pristine origin:
  - `await page.context().clearCookies()`
  - `await page.evaluate(() => localStorage.clear())`

The canonical auth flow in [`auth.e2e.ts`](../../../../src/__tests__/e2e/auth.e2e.ts) demonstrates the full signup-then-verify pattern.

## E2E test checklist

- [ ] Spec file under `src/__tests__/e2e/` with `.e2e.ts` suffix
- [ ] Uses helpers from `helpers.ts` for auth / navigation — no inline flows
- [ ] Unique test data (`generateTestEmail()`) — no shared email strings
- [ ] Role-based selectors (`getByRole`, `getByLabel`, `getByText`) — never `getByTestId`
- [ ] Assertions use Playwright's retrying matchers (`await expect(page).toHaveURL(...)`, `await expect(locator).toBeVisible()`) — not raw `expect(await page.locator(...).count())`
- [ ] Timeouts set where the app's own timing justifies it; don't paper over real flakiness with longer waits
- [ ] Focused on a critical user journey — 3–5 high-value flows per area, not exhaustive permutations (unit/integration/story tests cover permutations)
