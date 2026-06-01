# Mobile & PWA Tests

Loaded on demand from the main testing skill. The **Core Principle** in SKILL.md (behavior, not implementation) applies here too — these tests just assert on a different observable surface (mobile viewport, accessibility tree, manifest doc, Lighthouse score).

Mobile/PWA testing is **opt-in**. It does NOT run in `preflight`, in the pre-push hook, or in `test:e2e`. The default `test:e2e` is pinned to desktop projects so mobile work doesn't quadruple every push. Run mobile suites explicitly when you touch responsive layout, PWA install, manifest/icons, or a public marketing page.

## Contents

- [When to run mobile tests](#when-to-run-mobile-tests)
- [Playwright project layout](#playwright-project-layout)
- [Canonical specs — look at these first](#canonical-specs--look-at-these-first)
- [`mobile:check` orchestrator](#mobilecheck-orchestrator)
- [Mobile a11y sweep (`mobile:axe`)](#mobile-a11y-sweep-mobileaxe)
- [PWA validation (`pwa.mobile.e2e.ts`)](#pwa-validation-pwamobilee2ets)
- [Lighthouse mobile preset (`mobile:lighthouse`)](#lighthouse-mobile-preset-mobilelighthouse)
- [Writing a new mobile spec](#writing-a-new-mobile-spec)
- [Mobile test checklist](#mobile-test-checklist)

## When to run mobile tests

Run `pnpm mobile:check` (or the targeted variants) when your diff touches any of:

- Public marketing / auth pages (mobile a11y sweep covers `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email/sent`)
- Responsive layout (CSS, Tailwind breakpoints, viewport-dependent components)
- `src/app/manifest.ts` or `public/icons/*`
- Service worker (`public/sw.js`) or PWA install flow (`src/components/pwa/*`, `src/lib/pwa/*`)
- Any change you'd expect to regress horizontal overflow, target-size, dark-mode contrast, or reduced-motion behavior

These changes won't be caught by desktop E2E or unit tests — the assertions live in the mobile suite.

## Playwright project layout

[`playwright.config.ts`](../../../../playwright.config.ts) defines six projects. They partition by viewport AND by which specs each runs:

| Project | Device | Runs |
|---|---|---|
| `chromium` / `firefox` / `webkit` | Desktop Chrome / Firefox / Safari | All `.e2e.ts` EXCEPT `*.mobile.e2e.ts` (excluded via `testIgnore`) |
| `mobile-iphone` | iPhone 15 (393×852, hasTouch) | All `.e2e.ts` including the two mobile specs |
| `mobile-android` | Pixel 7 | Same 6 shared e2e specs; mobile-only specs (`a11y.mobile`, `pwa.mobile`) excluded so we don't double-run them on Android |

Why this split: `pnpm test:e2e` pins to the three desktop projects (`--project=chromium --project=firefox --project=webkit`), so the default push path never touches mobile. `pnpm mobile:e2e` selects `mobile-iphone` + `mobile-android` explicitly.

## Canonical specs — look at these first

| Concern | Canonical spec |
|---|---|
| Mobile a11y sweep (axe-core, overflow, dark-mode) | [`src/__tests__/e2e/a11y.mobile.e2e.ts`](../../../../src/__tests__/e2e/a11y.mobile.e2e.ts) |
| PWA manifest + icons + viewport | [`src/__tests__/e2e/pwa.mobile.e2e.ts`](../../../../src/__tests__/e2e/pwa.mobile.e2e.ts) |
| Anonymous CTA sweep (cross-page link integrity, desktop+mobile) | [`src/__tests__/e2e/anonymous-cta-sweep.e2e.ts`](../../../../src/__tests__/e2e/anonymous-cta-sweep.e2e.ts) |
| Lighthouse config (mobile preset, URLs, assertions) | [`lighthouserc.cjs`](../../../../lighthouserc.cjs) |

`a11y.mobile.e2e.ts` and `pwa.mobile.e2e.ts` use `test.use({ ...devices['iPhone 15'] })` at file scope so the spec pins its own viewport — they run correctly under any selected project.

## `mobile:check` orchestrator

`pnpm mobile:check` runs four sub-tasks **serially** via `run-s --continue-on-error`:

1. `mobile:e2e` — iPhone 15 + Pixel 7 across all 6 shared e2e specs
2. `mobile:axe` — WCAG sweep on iPhone 15
3. `mobile:stories` — Storybook a11y (real-browser axe via addon-vitest)
4. `mobile:lighthouse` — `lhci autorun` against the local dev server

**Why serial, not parallel**: parallel runs cause dev-server contention — false hydration mismatches and page-load timeouts on port 3100. The 10-min wall-clock cost is the price of stability. `--continue-on-error` means every task still runs even if step 1 fails, so a single push surface gets the full report.

**Prerequisite**: lighthouse expects `pnpm dev` already running on :3100 (no `startServerCommand` in `lighthouserc.cjs` — it would fight Playwright for the port). Boot dev in another terminal first.

## Mobile a11y sweep (`mobile:axe`)

[`a11y.mobile.e2e.ts`](../../../../src/__tests__/e2e/a11y.mobile.e2e.ts) has three describe blocks:

1. **WCAG 2.0/2.1/2.2 AA via `@axe-core/playwright`** on every public URL. The `wcag22aa` tag includes `target-size` (touch-target ≥24×24 CSS px). Fails on `serious` or `critical` impact only — `moderate` and `minor` go to triage manually.
2. **Horizontal-overflow assertion** at 360, 390, and 412 px widths. Catches "fixed-width hero overflows on Pixel" regressions.
3. **Reduced-motion + dark-mode** axe pass on the top-traffic public URLs. Catches dark-mode contrast regressions and motion-triggered violations.

The `PUBLIC_URLS` constant inside the spec is the source of truth for what's swept — keep it in sync with public routes in `src/proxy.ts`. Routes that 302-redirect (e.g., `/terms` → marketing site) are excluded; axe can't sweep a redirect.

## PWA validation (`pwa.mobile.e2e.ts`)

[`pwa.mobile.e2e.ts`](../../../../src/__tests__/e2e/pwa.mobile.e2e.ts) replaces what the deprecated Lighthouse PWA category used to check (removed in Lighthouse v12, May 2024). It asserts:

- `/manifest.webmanifest` serves with a JSON content-type, required fields (`name`, `start_url`, `display` in `standalone`-class), at least one 192×192 icon, at least one 512×512 icon, at least one `maskable` icon.
- Every icon URL in the manifest resolves with `image/*` content-type (catches a broken `public/icons/*` reference before it ships).
- `<head>` carries `viewport` meta with `width=device-width`, and a `theme-color` meta.

The app is **online-only by design** — the service worker exists solely for web-push (not offline caching). Push-notification behavior is covered by integration tests in `src/__tests__/integration/services/`, NOT by this spec.

## Lighthouse mobile preset (`mobile:lighthouse`)

Config: [`lighthouserc.cjs`](../../../../lighthouserc.cjs). Runs the `lighthouse:no-pwa` preset on 12 public URLs with the mobile form factor + Slow-4G + 4× CPU throttle (matches Lighthouse's default mobile defaults).

Assertions:
- `categories:accessibility` — **error** at <0.95 (blocking)
- `categories:performance` — warn at <0.80
- `categories:best-practices` — warn at <0.90
- `categories:seo` — warn at <0.90

Reports land in `./test-results/lighthouse/` (gitignored). Only accessibility blocks — perf/best-practices/SEO are advisory because mobile perf scores swing with local CPU load and external script timing.

## Writing a new mobile spec

Two patterns, pick the one that fits:

1. **Cross-device behavior** (same spec runs on both iPhone and Android): name it `*.e2e.ts` (NOT `*.mobile.e2e.ts`). The desktop `testIgnore` only excludes the `.mobile.e2e.ts` suffix, so a plain `.e2e.ts` automatically runs everywhere.
2. **Mobile-only behavior** (truly device-specific — touch gestures, viewport overflow, PWA install): name it `*.mobile.e2e.ts` and pin the viewport at file scope with `test.use({ ...devices['iPhone 15'] })`. The naming convention is enforced by the `testIgnore: ['**/a11y.mobile.e2e.ts', '**/pwa.mobile.e2e.ts']` lists in [`playwright.config.ts`](../../../../playwright.config.ts) — if you add a third mobile-only spec, add it to those `testIgnore` arrays so desktop projects don't pick it up.

Tag the spec with `// @flows: <flow-id>, <flow-id>` at the top so `pnpm qa:sync` attributes the coverage in the QA dashboard. See [`qa-workflow.md`](./qa-workflow.md) for the @flows convention.

## Mobile test checklist

- [ ] Spec under `src/__tests__/e2e/` with the right suffix (`.e2e.ts` for cross-device, `.mobile.e2e.ts` for mobile-only)
- [ ] If `.mobile.e2e.ts`, viewport pinned at file scope via `test.use({ ...devices['iPhone 15'] })`
- [ ] If `.mobile.e2e.ts`, added to the `testIgnore` lists in `playwright.config.ts` so desktop projects skip it
- [ ] `@flows: <id>` tag at the top so `qa:sync` can attribute it
- [ ] Uses helpers from `src/__tests__/e2e/helpers.ts` for auth / navigation
- [ ] Role-based selectors only — `getByRole`, `getByLabel`, `getByText` (axe will flag missing labels anyway)
- [ ] Mobile-specific assertions describe externally-visible state: rendered DOM, network response, axe violations, manifest field — never internal call shape
- [ ] If asserting on the manifest, mirror the field list from `src/app/manifest.ts` so a drift here flags a drift there
