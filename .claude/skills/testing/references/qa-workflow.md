# QA Workflow — Preflight, Coverage Dashboard, Drift Sweep

Loaded on demand from the main testing skill. This reference covers the **pre-push contract** and the **coverage attribution layer** — what tests run when, how they map back to user flows, and how drift gets caught between full preflight runs.

## Contents

- [Preflight contract (pre-push)](#preflight-contract-pre-push)
- [Smart preflight (`preflight:smart`)](#smart-preflight-preflightsmart)
- [Preflight tripwires](#preflight-tripwires)
- [`@flows` tagging — coverage attribution](#flows-tagging--coverage-attribution)
- [QA dashboard](#qa-dashboard)
- [STATUS.md update obligation](#statusmd-update-obligation)
- [Drift sweep (`drift:sweep`)](#drift-sweep-driftsweep)
- [Workflow checklist](#workflow-checklist)

## Preflight contract (pre-push)

CI is intentionally off pre-launch — `pnpm preflight` is the pre-push contract. It runs five tasks **in parallel** via `run-p --aggregate-output --max-parallel 4 --continue-on-error`:

1. `preflight:lint` — ESLint with `--cache --cache-strategy content` (cache at `node_modules/.cache/eslint`)
2. `preflight:typecheck` — `tsc --noEmit` with incremental cache at `node_modules/.cache/typescript/tsbuildinfo`
3. `preflight:check-links` — static internal-href resolver (`scripts/check-broken-links.ts`)
4. `preflight:unit` — full unit suite (both `unit-node` + `unit-dom` projects)
5. `preflight:integration` — full integration suite (PGLite)

`--continue-on-error` runs every task even after the first failure, so a single push gets all surfaces in one report instead of trickling them across N retries. `--aggregate-output` keeps each task's logs grouped, not interleaved.

**Variants:**
- `pnpm preflight:fast` — drops integration (~3min saved); use during inner-loop iteration
- `pnpm preflight:full` — runs preflight then `test:e2e` (serial, desktop projects only)
- `pnpm preflight:smart` — diff-aware (below); used by the husky pre-push hook

## Smart preflight (`preflight:smart`)

Script: [`.claude/scripts/preflight-smart.sh`](../../../../.claude/scripts/preflight-smart.sh). Wired into [`.husky/pre-push`](../../../../.husky/pre-push). It computes the diff vs `origin/main` (or `HEAD~10` on main) and runs only the preflight tasks whose paths changed — plus targeted Vitest via `--changed=<ref>` so only tests in the changed-file import graph run.

Outcome by scenario (warm caches):

| Diff shape | Tasks run | Wall-clock |
|---|---|---|
| Empty / docs / markdown only | lint + tc | ~10s |
| 1 component change | lint + tc + targeted unit + targeted stories | ~30s |
| 1 service change | lint + tc + targeted unit + targeted integration | ~60s |
| Tripwire change (see below) | full preflight + test:stories | ~3min |

**Trust but verify**: smart preflight is correct on the import-graph side (vitest `--changed` is reliable), but a non-typescript change that affects test fixtures or environment can slip past. If you've changed something subtle, run `pnpm preflight` once manually before the push.

## Preflight tripwires

Smart preflight falls back to **full** preflight + stories when any of these change — they affect tests we'd otherwise skip:

- `tsconfig*.json`, `vitest.config.ts`, `playwright.config.ts`, `.eslintrc*`
- `vitest.setup.ts`, `.storybook/preview.tsx`, `.storybook/main.ts`
- `package.json` (deps), `pnpm-lock.yaml`
- `src/lib/db/test-db.ts`, `src/__tests__/helpers/*`, `src/__tests__/fixtures/*`

If you're editing one of these, expect the ~3-min hit and don't fight the hook — the alternative is shipping a change that silently breaks tests we deliberately skipped.

## `@flows` tagging — coverage attribution

Every test file can declare which user flows it covers with a header comment:

```ts
// @flows: anon-login-qualify, anon-login-success
import { test } from '@playwright/test'
```

The flow IDs are defined in [`qa-dashboard/flows.json`](../../../../qa-dashboard/flows.json) — that file is the source of truth for which flows exist, their priority (P0/P1/P2), and which steps each flow has.

`pnpm qa:sync` ([`qa-dashboard/sync-coverage.ts`](../../../../qa-dashboard/sync-coverage.ts)) walks the repo, parses every `@flows:` tag, and populates `flows.json` `step.tests[layer]` arrays. Layer is inferred from filename:

| Filename pattern | Layer |
|---|---|
| `*.e2e.ts` | e2e |
| `*.integration.test.ts(x)` | integration |
| `*.stories.tsx` | storybook |
| `*.test.ts(x)` | unit |

Stale tags (deleted/renamed files) drop off automatically — `qa:sync` resets all `tests` arrays before populating.

**When adding a new test/story/e2e file**, add the `@flows:` tag in the same commit. Without it, the dashboard counts the flow as uncovered even though the coverage exists.

## QA dashboard

`pnpm qa:dashboard` opens [http://127.0.0.1:4321/](http://127.0.0.1:4321/) — a static visualization of `flows.json` + `STATUS.md`. Use it when you want to see:

- Which flows are P0/P1/P2 and which are uncovered
- Which test files cover a given step (and at which layer)
- Plan progress vs the QA spec at `~/.claude/plans/i-want-maximum-testabilitiy-cuddly-comet.md`

The dashboard is NOT shipped to prod — excluded via `.vercelignore` and `tsconfig`. Serve it locally only.

## STATUS.md update obligation

**Every PR that ships a deliverable from `~/.claude/plans/i-want-maximum-testabilitiy-cuddly-comet.md` (or its follow-ups) MUST update [`qa-dashboard/STATUS.md`](../../../../qa-dashboard/STATUS.md):**

- Flip the row's Status from `todo` → `done` (or `partial`)
- Fill in the PR number column
- The dashboard's plan-progress bar reads this file via `/status.json`

Skip this and the dashboard misrepresents what's shipped — defeating the whole point of having coverage attribution.

## Drift sweep (`drift:sweep`)

Script: [`.claude/scripts/check-drift-patterns.sh`](../../../../.claude/scripts/check-drift-patterns.sh). Three modes:

| Mode | What it scans | Exit behavior |
|---|---|---|
| `--pre-commit` | staged diff only | exits 1 on hit (blocks commit) |
| `--session` | uncommitted + staged diff | warns at Stop, never blocks |
| `--full-tree` (`pnpm drift:sweep`) | every tracked TS/TSX | informational only, exits 0 |

Patterns are intentionally narrow (low false-positive) — examples: `pathway-as-string` (using `string` where the `Pathway` literal union is required), `hex-color-in-tsx` (hex literal instead of design token). Each pattern can be silenced per-line with `// drift-ok: <reason>`.

Run `pnpm drift:sweep` periodically (monthly-ish) to surface drift that accumulated below the pre-commit threshold. Don't fix everything at once — pick one pattern and fix all its hits in a single PR.

**Adding a new pattern**: copy a `check_pattern` call in the script and adjust the args. Broader checks belong in ESLint or `/code-review`, not here.

## Workflow checklist

When you add or change a test file:
- [ ] `@flows: <id>, <id>` tag at the top so `qa:sync` can attribute it
- [ ] Filename suffix matches the layer (`.test.ts(x)`, `.integration.test.ts`, `.e2e.ts`, `.mobile.e2e.ts`, `.stories.tsx`)
- [ ] If the test ships a QA-plan deliverable, `qa-dashboard/STATUS.md` flipped to `done` and PR number filled in
- [ ] Ran `pnpm qa:sync` if you added new `@flows:` tags or removed old ones

Before pushing:
- [ ] Hook fires `pnpm preflight:smart` automatically — if it fails, fix the underlying issue (don't `--no-verify`)
- [ ] If you changed a tripwire file, expect the full ~3-min path
- [ ] If you touched anything responsive or PWA-shaped, run `pnpm mobile:check` manually too — it's not in preflight
