---
name: analytics
description: How analytics events flow through this app — `analytics.track()` (RudderStack → PostHog + Brevo) for product/lifecycle events, `sendGAEvent` from `@next/third-parties/google` for GA4 + Google Ads conversion tags, and the rules for when each is appropriate. Use whenever the user is adding/modifying an analytics event, debugging why an event didn't land in PostHog/GA4/Brevo, touching `src/lib/analytics.ts`, `src/lib/analytics-shared.ts`, `instrumentation-client.ts`, or anything that calls `sendGAEvent` or `analytics.track`. Also trigger when the user mentions GA4, Google Ads, gtag, dataLayer, PostHog event capture, RudderStack destinations, Brevo, ad-blocker tracking gaps, `sign_up`, `offer_accepted`, FunnelAnalytics, or `@next/third-parties`. The decision history lives in `docs/decisions/analytics.md` — this skill is the operational recipe + the open refactor backlog.
---

# Analytics — RudderStack hub + GA4/Ads via `@next/third-parties`

The app has two **independent** analytics pipelines that fire side-by-side from the same conversion hooks. Neither one is a wrapper around the other.

```
User Action (signup / offer-accept / page nav)
  ├── analytics.track({event, properties})  ─→ RudderStack ─→ PostHog
  │                                                       └─→ Brevo (lifecycle / email)
  └── sendGAEvent("event", name, params)    ─→ GA4 (via gtag.js)
                                                └─→ Google Ads (AW- config)
```

- **`analytics.track()`** — for product/lifecycle events. Anything we want to query in PostHog Insights, segment in cohorts, or trigger Brevo email flows from. Loaded directly in `instrumentation-client.ts` (PostHog via `/ingest` proxy) + RudderStack browser SDK. Source of truth: `src/lib/analytics.ts` + `src/lib/analytics-shared.ts` (`AnalyticsEvents` enum).
- **`sendGAEvent`** — for GA4/Ads conversion + remarketing tracking. Pageviews are automatic via GA4 Enhanced Measurement ("Page changes based on browser history events"). Loaded by `<GoogleAnalytics>` in `src/app/layout.tsx`.

The two pipelines coexist because GA4's attribution + Google Ads remarketing audiences need their own gtag.js (RudderStack's GA4 destination has documented Measurement Protocol gaps — no UTMs, no demographics).

## Sources of truth

| Concern | File |
|---|---|
| `<GoogleAnalytics>` mount + Ads sibling `<Script>` | `src/app/layout.tsx` |
| Event-name constants (PostHog/Brevo side) | `src/lib/analytics-shared.ts` (`AnalyticsEvents`) |
| Analytics client wrapper | `src/lib/analytics.ts` |
| Client-side SDK init (PostHog direct + RudderStack) | `instrumentation-client.ts` |
| Server-side PostHog | `src/lib/server/posthog.ts` |
| Server-side RudderStack | `src/lib/server/rudderstack.ts` |
| Per-user identification flow | `src/components/providers/AnalyticsProvider.tsx` |
| React Query → `$exception` plumbing | `src/app/providers.tsx` — `QueryCache`/`MutationCache` `onError` filters out `ValidationError`, then calls `analytics.trackError(error, { queryKey })` / `{ mutationKey }` so triagers in PostHog can tell *which* fetch/mutation failed |
| CSP whitelist for gtag + GA4/Ads endpoints | `next.config.js` (`script-src` + `connect-src`) |
| Decision history + alternatives considered | `docs/decisions/analytics.md` |

## When to use which

| Event type | API | Example |
|---|---|---|
| Product event for funnel analysis (PostHog) | `analytics.track()` | `analytics.track({ event: AnalyticsEvents.QUIZ_STEP_COMPLETED, properties: { step: 3 }})` |
| Lifecycle trigger (Brevo email) | `analytics.track()` | `analytics.track({ event: AnalyticsEvents.AUTH_SIGNUP_SUCCESS, properties: { signup_method: "credentials" }})` |
| GA4 conversion event | `sendGAEvent` | `sendGAEvent("event", "sign_up", { method: "credentials" })` |
| Google Ads conversion / remarketing audience | `sendGAEvent` | `sendGAEvent("event", "offer_accepted", { pathway })` |
| Both (revenue event) | call both, colocated | see `src/hooks/useEmailSignup.ts`, `useSocialAuth.ts`, `useOfferPage.ts` |

GA4 reserved event names (`sign_up`, `purchase`, `login`, etc.) follow [Google's recommended-events list](https://support.google.com/analytics/answer/9267735). Custom events use snake_case.

## Adding a new analytics event — checklist

1. **Decide which pipeline(s)**:
   - PostHog/Brevo only → add to `AnalyticsEvents` in `src/lib/analytics-shared.ts`, call `analytics.track()`.
   - GA4/Ads only → call `sendGAEvent` directly (GA4 event names are an external contract; don't put them in `AnalyticsEvents`).
   - Both → do both, colocated in the same hook (see `useOfferPage.ts:35-37` for the canonical pattern).
2. **Type properties**: add the event's property shape to `EventProperties` in `src/lib/analytics-shared.ts` if it's a `analytics.track()` event.
3. **Test that the event fires**:
   - PostHog: Live Events in dashboard, filter by event name. Server-side events should land within seconds.
   - GA4: Admin → DebugView with `?debug_mode=true` query param, or wait 24h for the standard reports.
   - Brevo: dashboard → Automations → check the workflow's "triggered" log.
4. **Do NOT** add a manual `<Script>` for additional gaIds — use the sibling-`<Script>` pattern documented in `docs/decisions/analytics.md` (`@next/third-parties` hardcodes its script ids and dedup will silently drop a second `<GoogleAnalytics>` mount).

## SPA pageviews

GA4 Enhanced Measurement on the web stream handles SPA pageviews automatically when "Page changes based on browser history events" is enabled (default on streams created after Oct 2022). **Do NOT** re-implement a manual `useEffect` + `usePathname()` loop — that was PR #229's bespoke pattern, replaced in PR #240 (see decision log).

PostHog captures `$pageview` via autocapture (configured in `instrumentation-client.ts`) on `pushState`/`popState` — also automatic.

## URL semantics in reports

GA4 receives the **real browser URL** (`/app/quiz`, `/app/register`, etc.) — matches Search Console, PostHog `$pathname`, and the URL bar. Don't strip the `/app` prefix from analytics events; PR #229's strip-regex hack was removed for this reason.

## Ad-blocker resilience

- **PostHog**: served via `/ingest` proxy in `next.config.js` rewrites → first-party endpoint → not ad-blocked.
- **RudderStack**: served via `/rs` proxy similarly. Both are bundled in `instrumentation-client.ts` with `await import()` so they don't bloat the main chunk.
- **GA4 / Google Ads (gtag.js)**: loaded from `googletagmanager.com` → **IS** ad-blocked by uBlock Origin / Brave Shields / etc. The PostHog↔GA4 delta on the same event is the ad-blocker tax.

## Open refactors (deferred — track usage first)

### `trackConversion()` helper to unify the dual-fire pattern
**Status**: deferred (2026-05-15). Not implemented.

**Idea**: extract a `src/lib/analytics-conversions.ts` helper that wraps both `analytics.track()` and `sendGAEvent` in one call:

```ts
export function trackConversion({ event, properties, ga4Event, ga4Params }) {
  analytics.track({ event, properties })
  sendGAEvent("event", ga4Event, ga4Params)
}
```

**Wins**: drift-impossible-by-construction across the 3 current call sites (`useEmailSignup`, `useSocialAuth`, `useOfferPage`); one central place to add Mixpanel/Klaviyo/server-side mirroring later without touching every hook.

**Why deferred**: 3 call sites is a borderline DRY win, and the events are colocated within each hook (~2 lines apart), so the drift risk is low today. Reconsider when:
- A 4th conversion event is added (extracting saves more than it costs)
- We add a 3rd destination (server-side Measurement Protocol, Mixpanel, Klaviyo)
- A drift bug actually happens (one side fires, the other doesn't)

**Sources**: [`docs/decisions/analytics.md`](../../../docs/decisions/analytics.md) (decision history), this skill's research arc on 2026-05-15.

### Server-side Measurement Protocol for `offer_accepted`
**Status**: deferred. Reconsider when **PostHog `offer_accepted` count ≥ GA4 `offer_accepted` count × 1.15** (~15% ad-blocker tax = meaningful revenue lost in Ads attribution).

### RudderStack GA4 Hybrid Mode
**Status**: deferred. Reconsider when marketing wants single-source-of-truth event config OR we hit 3+ destinations beyond PostHog + Brevo.

### Google Tag Manager instead of GA4 direct
**Status**: deferred. Reconsider when marketing team grows and starts requesting tag changes that would otherwise need code deploys.

## Known limitations of `@next/third-parties` (relevant to us)

- No `gaOptions` parameter ([Discussion #68801](https://github.com/vercel/next.js/discussions/68801)). Can't pass `send_page_view: false`, `user_id`, etc.
- No CSP nonce support ([Issue #61714](https://github.com/vercel/next.js/issues/61714)). Affects strict CSPs only — our CSP allows `'unsafe-inline'`, so we're not affected today.
- `<GoogleAnalytics>` cannot be mounted twice — hardcodes inline-init `<Script>` id. Workaround documented above + in decision log.
- `sendGAEvent` no-ops with a `console.warn` if called before `<GoogleAnalytics>` has initialized — safe in event handlers post-hydration.

## CSP requirements

`next.config.js` must whitelist:
- `script-src`: `https://www.googletagmanager.com` (gtag.js loader), `https://us.i.posthog.com` (PostHog SDK + array.js)
- `connect-src`: `https://www.google-analytics.com`, `https://analytics.google.com`, `https://stats.g.doubleclick.net`, `https://region1.google-analytics.com`, `https://googleads.g.doubleclick.net`, plus PostHog endpoints

Don't remove any of these without auditing the impact on GA4 DebugView + Google Ads remarketing.
