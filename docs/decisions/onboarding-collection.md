# Decision log — Onboarding gate + card collection (Phase 2)

Identity (a unique handle + a focus arena) and the collectible hook, from the Ploytical handoff.

## The onboarding gate is enforced in BOTH the proxy and the page — but the DB is the only authority
A logged-in user without `onboardedAt` is funneled to `/onboarding` from anywhere by `proxy.ts`; once cleared, `/onboarding` reverse-bounces home. The proxy decision is fast (it reads the 5-min Better-Auth cookie cache), but the cookie can be **stale**, so the `/onboarding` page *also* reads `onboardedAt` straight from the DB (`readOnboardingState`) and redirects home if already done. `onboardedAt` is mirrored into `lib/auth.ts` `additionalFields` (`input:false`) — without that it would never appear on `session.user` and the proxy gate couldn't see it.

## Breaking the proxy↔page redirect loop (adversarial-review fix)
The naive version (proxy trusts the cookie, page trusts the DB) **infinite-loops** when the two disagree: a second device whose 5-min cookie still says "not onboarded" gets bounced `/ → /onboarding` by the proxy, then `/onboarding → /` by the page's DB check, forever (`ERR_TOO_MANY_REDIRECTS`), because a plain `getSession` never re-issues the cookie mid-life. Two fixes, both shipped:
1. **The proxy confirms against the DB before *trapping* a user.** Only in the narrow `not-onboarded-cookie + path≠/onboarding` branch does it do a `disableCookieCache` read. If that fresh read says onboarded, it lets the request through — so a stale cookie can't ping-pong. The cost is bounded to genuinely-not-onboarded-or-stale users (a tiny, transient population; real new users sit on `/onboarding`, which is excluded), not every request.
2. **Every "you're done" path re-issues the cookie.** `completeOnboardingAction` calls `refreshSession()` (a Server Action *can* set cookies; an RSC cannot — that's why the heal lives in the action/proxy, not the page). The `AlreadyOnboardedError` branch does the same — it fires exactly in the DB-onboarded/cookie-stale state, so it must heal too.

## The proxy now reads the session on every request — so it must fail open
Adding the app-wide gate means `auth.api.getSession` runs for the public market feed too (it short-circuited before auth previously). A transient auth/DB error would otherwise 500 the *whole* site. The read is wrapped in `.catch(() => null)` → a failure degrades to anonymous (public pages still render; protected routes fall through to the login redirect), never a 500.

## Collect is one atomic ledger unit — the unique index is the real guard
`collectCard` resolves the MK by **stable `personId`** (never fuzzy), then in one `db.transaction`: `lockUser` first → `isOwned` guard → `applyEntry({type:"collect", amount:-250})` (the SOLE coin writer; surfaces `InsufficientFundsError`) → race-safe `insertOwnership` (`onConflictDoNothing`-returning). If a concurrent collect won the unique `(userId, personId)` index, the insert returns empty and we throw `AlreadyOwnedError` — which rolls back the debit. So you can never pay twice or pay-without-a-card. `"collect"` is appended to the `txType` enum (never reordered; the `ALTER TYPE … ADD VALUE` runs as its own migration statement).

## Handle: normalize-then-validate, DB-unique as the race backstop
`setHandle` strips a leading `@`, lowercases, trims, then validates `^[a-z0-9_]{3,20}$` (a shared pure `handle.ts` so the client wizard and server validate identically). Lock-first + `isHandleTaken` (excluding the user's own row) handles the common case; the DB `unique` constraint catches the cross-user race (`23505 → HandleTakenError`). A **rate-limited** availability check returns a distinct `rate_limited` reason (not `taken`) — a throttle is not a uniqueness fact, so the wizard shows a neutral "try again" instead of falsely claiming the handle is taken.

## Collection reuses CaricatureCard via an `owned` prop
`/collection` renders every MK as a card (owned = bright, un-owned = `grayscale`+`opacity` with a "לא נאסף" lock chip) plus a completion meter. `owned` defaults to `true`, so all existing `CaricatureCard` call sites are untouched (search-before-creating). Collection is a dedicated route, not a profile tab.

## Deferred
- Collecting from the gallery itself (cards link to the politician page, where the collect button lives).
- OAuth (Google) signup → onboarding walk (email path verified; same gate applies).
- Trading/selling collected cards (not in scope; play-money collectible only).
