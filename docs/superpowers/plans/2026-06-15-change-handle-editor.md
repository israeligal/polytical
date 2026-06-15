# Plan — "Change my handle" on /profile

**Goal:** let a logged-in user edit their public `@handle` from `/profile`, reusing the existing onboarding handle infrastructure. No schema change, no migration (the `user.handle` column + unique constraint already exist).

**Worktree:** already created — `feat/handle-editor` at `../polytical-handle-editor`, branched off `origin/main` (`a45e157`, which has the @handle leak fix + `FALLBACK_HANDLE`). All work happens here; `main` and `feat/bill-pages` stay clean.

---

## Files read (verified, not from memory)

| File | What it gives us |
|---|---|
| `app/actions/onboarding.ts` | `checkHandleAction` (generic, session-gated availability — reusable as-is), `setHandleAction` (claims handle, **does NOT refreshSession**), `generateHandleAction`. Already imports `setHandle`, `refreshSession`, error types, `ActionResult`, `checkRateLimit`, `revalidatePath`. |
| `app/lib/onboarding/service.ts` | `setHandle({userId,handle})` — lock-first tx, `isHandleTaken(excludeUserId)` guard + DB-unique backstop, normalizes + validates, throws `InvalidHandleError`/`HandleTakenError`. **No onboarding-only guard** → reusable for re-naming. `checkHandleAvailable` returns `{available,normalized,reason}`. |
| `app/lib/onboarding/repo.ts` | `isHandleTaken` already excludes the current user (`ne(users.id, excludeUserId)`) → re-checking your own handle is safe. `setHandle` writes `handle`+`updatedAt`. |
| `app/lib/onboarding/handle.ts` | `HANDLE_RE`, `normalizeHandle`, `FALLBACK_HANDLE` (pure, client-safe — no DB import). |
| `app/onboarding/onboarding-wizard.tsx` | Reference UI: debounced `checkHandleAction` + monotonic `availSeq` ticket guard, `normalizeHandle`/`HANDLE_RE`, save via `setHandleAction`, `<bdi>@{...}</bdi>` rendering. |
| `app/profile/page.tsx` | RSC; `const handle = user.handle ?? FALLBACK_HANDLE`, header renders `<bdi>@{handle}</bdi>`. Mount point for the editor. |
| `lib/auth.ts` | `refreshSession()` = `getSession({headers, query:{disableCookieCache:true}})`; with `nextCookies()` plugin it re-issues the cookie. `handle` is an `additionalField` (`input:false`) → present on `session.user`. |
| `app/actions/types.ts` | `ActionResult = { ok: boolean; message?: string }`. |

---

## Design

### 1. New server action — `changeHandleAction` (in `app/actions/onboarding.ts`)
Reuses the file's existing imports. Mirrors `setHandleAction` but adds the session refresh + profile revalidation that a standalone change needs (the wizard relies on `completeOnboardingAction` to refresh; the profile flow has no such follow-up step):

```ts
/** Profile: change the public @handle post-onboarding. Unlike setHandleAction
 *  (mid-wizard), this refreshes the session cookie so the header avatar + profile
 *  reflect the new handle immediately. */
export async function changeHandleAction({ handle }: { handle: string }): Promise<ActionResult & { handle?: string }> {
  const s = await getSession();
  if (!s?.user) return { ok: false, message: "התחברו" };
  const limit = checkRateLimit({ key: `handle-change:${s.user.id}`, max: 5, windowMs: 60_000 });
  if (!limit.allowed) return { ok: false, message: "האטו לרגע" };
  let normalized: string;
  try {
    ({ handle: normalized } = await setHandle({ userId: s.user.id, handle }));
  } catch (e) {
    if (e instanceof InvalidHandleError) return { ok: false, message: "כינוי לא תקין — 3–20 תווים בעברית או באנגלית (בלי לערבב): אותיות, ספרות ו-_" };
    if (e instanceof HandleTakenError) return { ok: false, message: "הכינוי תפוס — בחרו אחר" };
    throw e;
  }
  await refreshSession();                 // re-issue cookie → session.user.handle updates
  revalidatePath("/profile");
  revalidatePath("/", "layout");          // header avatar initial
  return { ok: true, handle: normalized };
}
```
Reuse `checkHandleAction` as-is for live availability (it is not onboarding-specific). Do NOT touch `setHandleAction` (still used mid-wizard).

*Placement note:* colocated in `onboarding.ts` to reuse its imports + keep all handle actions together. (Alternative: a new `app/actions/profile.ts`; rejected to avoid a near-empty file + duplicate imports.)

### 2. New client component — `components/profile/change-handle-form.tsx`
`'use client'`. Props: `{ currentHandle: string }`. Collapsed by default → shows current `@handle` + an "ערכו כינוי" button. Expanded → input + debounced availability + "שמרו"/"ביטול", mirroring wizard step-0 exactly (the `availSeq` monotonic guard, `normalizeHandle`, `HANDLE_RE`, 350ms debounce, `checkHandleAction`). Differences from the wizard:
- Save calls `changeHandleAction`; on `res.ok` → collapse + `router.refresh()` (re-render RSC with new handle); else show `res.message`.
- Save disabled when `normalized === normalizeHandle(currentHandle)` (no-op guard) or `!canSubmit`.
- No arena step, no reroll (you change to a *chosen* handle).
- Reuse existing Tailwind classes/tokens from the wizard (logical props, OKLCH tokens — no new colors).

### 3. Mount in `app/profile/page.tsx`
Render `<ChangeHandleForm currentHandle={user.handle ?? ""} />` directly under the header `<h1>@handle</h1>` block (most discoverable). Pass `""` when handle is null so the form opens empty rather than prefilling "משתמש".

---

## Reused data structures (no new types)
- `ActionResult` — `app/actions/types.ts:3`. Return `ActionResult & { handle?: string }` (same shape as `GenerateHandleResult` at `app/actions/onboarding.ts:21`; reuse that alias if exported, else inline-extend like it does).
- `HANDLE_RE`, `normalizeHandle`, `FALLBACK_HANDLE` — `app/lib/onboarding/handle.ts:7,10,11`.
- `setHandle`, `checkHandleAvailable` — `app/lib/onboarding/service.ts:74,34`.
- Error types — `InvalidHandleError`, `HandleTakenError` — `app/lib/errors.ts`.
- **No Zod schema** — searched `app/lib/onboarding/` (no `schemas.ts`); handle validation is `HANDLE_RE` shared client+server by design (pure module, no DB). Do not introduce a parallel Zod schema.

## Verified third-party signatures
- **Drizzle** — no new queries (reusing `setHandle`/`isHandleTaken`). N/A.
- **Better Auth `refreshSession`** — `lib/auth.ts:106-108`: `auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } })`; `nextCookies()` plugin (`lib/auth.ts:88`) re-issues the Set-Cookie. Confirmed by `completeOnboardingAction` using the identical pattern to heal the gate cookie.
- **`next/cache` `revalidatePath`** — already imported + used in `onboarding.ts`; `revalidatePath("/", "layout")` is the established header-refresh call (`completeOnboardingAction:107`).

## Fixtures
No third-party payloads or novel internal shapes involved (handle is a plain string; user row already seeded by `createTestDb` helpers). No fixture capture needed.

---

## Convention compliance (CLAUDE.md)
- **Layered Route→Service→Repo**: action → `setHandle` service → repo. Action does no DB access. ✓
- **RORO / named exports / no inline types**: action + component use object params, named exports; reuse `ActionResult`. ✓
- **Errors over fallbacks**: service throws `InvalidHandleError`/`HandleTakenError`; action maps to Hebrew, never silently no-ops. ✓
- **RSC-first**: page stays RSC; only the interactive editor is `'use client'` (justified). ✓
- **Mutations in event handlers, never useEffect**; data via the server action, no raw `fetch`. ✓
- **Logical Tailwind props + OKLCH tokens**: reuse wizard classes; no `ml/mr`, no hex. ✓
- **Hebrew RTL copy**; `<bdi>` around `@handle`. ✓
- **Rate-limit the mutation** (`handle-change` key) + validate server-side. ✓
- **Files < 500 lines**: new component ~120 lines. ✓
- **Identity = @handle, never name** (AGENTS.md): the whole feature operates on `handle`. ✓

---

## Build steps (in order)

1. **Worktree** — done (`feat/handle-editor` off main). Run `pnpm install` in the worktree if node_modules isn't linked.
2. **TDD: component test first** — write `components/profile/change-handle-form.test.tsx` (unit-dom, co-located). Mock ONLY the boundary: `@/app/actions/onboarding` (`checkHandleAction`, `changeHandleAction`) + `next/navigation` (`useRouter`). Assert observable behavior (Core Principle): typing a taken handle shows "תפוס"; a valid free handle enables save; clicking save in the happy path calls the action and shows the collapsed new `@handle`; an error `res.message` renders. Accessible queries (`getByRole('textbox')`, `getByRole('button', {name:/שמ/})`). Watch it fail.
3. **Implement `changeHandleAction`** in `app/actions/onboarding.ts`.
4. **Implement `ChangeHandleForm`** in `components/profile/change-handle-form.tsx` until the test passes.
5. **Mount** in `app/profile/page.tsx`.
6. **Storybook story** — `components/profile/change-handle-form.stories.tsx`: variants (collapsed, editing-empty, checking, taken, available, error) + a play function for the type→available→save interaction + `parameters.a11y.test`. Follow the `storybook-stories` skill for action-module mocking. Run `pnpm test:stories` for this file.
7. **Service coverage** — `setHandle` is already covered by `app/lib/onboarding/service.test.ts` (normalize/invalid/taken/race). Add one case only if missing: "changing to a brand-new handle for an already-onboarded user persists" (PGlite, via `createTestDb`), asserting the row's `handle` via `db.select()` — behavior, not calls.
8. **Verify** — `pnpm typecheck`, `pnpm lint` (changed files), `pnpm test run` for the new test files + `app/lib/onboarding`. (Pre-existing local `fflate` tsc error in `app/lib/votes/docx.ts` is unrelated — ignore.)
9. **Refresh/cleanup fixtures** — none captured; nothing to refresh.
10. **`/wrap-up`** if present — advisory gate for whether `/log-decisions` (no major decision here; likely skip) and `/evergreen-documentation` (none needed — no structural change) should follow.
11. **`/code-review`** before pushing.
12. **Ship** — commit, push `feat/handle-editor`, PR → squash-merge to `main` (Vercel deploys). Same flow as PR #89. Remove the worktree after merge (`git worktree remove`).

---

## Verification status

### Verified from source
| Item | Citation |
|---|---|
| `setHandle` has no onboarding-only guard, excludes self in taken-check | `service.ts:74-96`, `repo.ts:39-57` |
| `refreshSession` re-issues cookie (handle additionalField) | `lib/auth.ts:55-57,88,106-108`; pattern at `onboarding.ts:100-107` |
| `checkHandleAction` is generic/session-only (reusable on profile) | `onboarding.ts:28-42` |
| `ActionResult` shape | `types.ts:3` |
| No Zod handle schema exists | searched `app/lib/onboarding/` — none |

### NOT verified — needs live testing
| Item | How to verify | Gate |
|---|---|---|
| Header avatar initial + profile `@handle` update WITHOUT re-login after change | After deploy (or local dev), change handle on /profile, confirm header + H1 update on `router.refresh()` (cookieCache 5-min — `refreshSession` should pre-empt it) | **HARD GATE** — if stale, add explicit cookie heal / confirm `revalidatePath("/","layout")` ran. Covered by build step 8 local run + browser check. |
| Rate-limit copy/threshold feels right | Manual: rapid saves show "האטו לרגע" | soft |
