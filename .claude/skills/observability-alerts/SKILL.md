---
name: observability-alerts
description: PostHog/RudderStack/Slack alerting setup for prod (project 292471) — Slack destinations, PostHog alerts, cron heartbeats, and the gotchas (plan caps, writeKey traps, masking semantics). Use when adding a new Slack alert, debugging why an alert didn't fire, asking what events go to #errors, working with `analytics.track()` in server code, modifying anything in `src/app/api/cron/`, touching `src/lib/analytics-shared.ts`, or anything related to monitoring, alerting, or observability. Also use when the user asks "what alerts do we have", "rate limit on Slack messages", "PostHog destination", or mentions Render PDF service uptime.
---

# Observability & Alerting

Living reference for how alerts to Slack #errors `C0AAMA9HM8D` are wired on the prod PostHog project (`292471`, org "Green Card Genius"). All MCP calls below assume the right project — verify with `mcp__posthog__project-get` if unsure (the MCP context is known to drift back to preview `394420`; explicitly switch project + org first).

## Architecture in one sentence

Server-side `analytics.track()` (`src/lib/server/analytics.ts`) → RudderStack Server source → cloud-mode → PostHog → CDP destinations (hog functions of `type: destination` using `template-slack`) → Slack channel `C0AAMA9HM8D` (prod) or `C0B5C15L0DR` (#errors-developement-non-production, dev/preview mirrors).

Threshold-based alerts (e.g. cron heartbeat) use PostHog's `alerts` feature instead — those route via email only because the alert API doesn't expose Slack.

### Prod/dev channel split (Updated: 2026-05-22)

Every Slack destination exists as a **pair**: a prod destination filtered to `environment not_in [development, preview]` (routes to `C0AAMA9HM8D` or its sibling channel like `#marketing-events`/`#errors-user-experience`), plus a `[DEV]`-prefixed mirror filtered to `environment in [development, preview]` that routes to `C0B5C15L0DR`. The `events` array, masking, and message body are kept identical between siblings; only `name`, `channel`, and the top-level `properties` filter differ.

**Why `not_in` for prod (not `= production`):** ~15% of `$exception` events arrive without an `environment` property (posthog-js client-side autocapture doesn't auto-register it). `not_in [development, preview]` keeps those events in the prod channel as a safe default; `= production` would silently drop them. Audited 2026-05-22 via SQL — only `$exception` (18/122) and `$rageclick` (2/58) have missing-env events; all other event types are 100% tagged.

**Exception:** the Site heartbeat alert (`internal_destination` filtered to `$insight_alert_firing`) has no dev mirror — the alert is already prod-scoped via the underlying insight, and `$insight_alert_firing` is a PostHog-internal event without an `environment` property.

## What we have

### Slack destinations on prod (17 prod + paired [DEV] mirrors enabled, plus 1 internal_destination for site heartbeat)

Read these from PostHog with `mcp__posthog__cdp-functions-list { search: "Slack" }` — IDs and config below for reference, but the live state is authoritative.

| Destination | Trigger | Rate limit (masking) | Message style |
|---|---|---|---|
| `Slack: $exception (rich)` | `$exception` | none | Rich blocks: error type header, code-block message, user/page/browser/OS fields, source line + library context, View event/View person buttons |
| `Slack: $rageclick` | `$rageclick` | 10/hour per user (`{event.distinct_id}`) | Section + context blocks |
| `Slack: login_failed` | `login_failed` | 10/hour per email (`{event.properties.email}`) | Section + fields blocks (reason, method, page, browser) |
| `Slack: Cron failure` | `cron_run_failure` (any cron) | none | Plain text |
| `Slack: PDF service unreachable` | `pdf_generation_failed` filtered to `errorType ∈ {network, timeout}` | none | Plain text |
| `Slack: PDF generation failures (rate-limited)` | `pdf_generation_failed` (any) | 10/hour per `{event.properties.formType}` | Plain text |
| `Slack: Async package failure` | `package_failed` | none | Plain text |
| `Slack: Checkout/payment failure` | `checkout_session_failed` + `payment_verification_failed` + `payment_failed` | 10/hour per `{event.event}` | Plain text with `failureReason`, `orderId`, `amountCents`, user |
| `Slack: Error spike (api_error / error_occurred)` | `error_occurred` + `api_error` | 10/hour per `{event.event}` | Plain text |
| `Slack: PDF service health probe failed` | `pdf_service_health_failed` | none | Plain text |
| `Slack: Save failed (database_error)` | `database_error` | 10/hour per `{event.properties.operation}` | Rich blocks: operation + section + user + page fields, error in code block (currently fired by `questionnaire.service.ts` on save failures) |
| `Slack: Stripe dispute opened` | `payment_dispute_created` (charge.dispute.created webhook) | none | Plain text (Liquid): :rotating_light: amount + reason + evidence due-by + Stripe dashboard deep link. PR #293 |
| `Slack: Stripe dispute closed` | `payment_dispute_closed` (charge.dispute.closed webhook) | none | Plain text (Liquid): emoji branches on status (`won` :trophy: / `lost` :x: / `warning_closed` :warning:) + amount + Stripe link. PR #293 |
| `Slack: Stripe early fraud warning` | `payment_fraud_warning` (radar.early_fraud_warning.created webhook) | 10/hour per `{event.event}` | Plain text (Liquid): :warning: fraud_type + nudge to refund preemptively + charge link. PR #293 |
| `Slack: Stripe refund processed` | `payment_refunded` (charge.refunded webhook) | 10/hour per `{event.event}` | Plain text (Liquid): :leftwards_arrow_with_hook: amount + full/partial + customer email + payment link. PR #293 |
| `Slack: Stripe payout failed` | `payout_failed` (Stripe webhook) | none | Plain text (Liquid): :rotating_light: amount + failure_message + failure_code + payout link. PR #293 |
| `Slack: Site heartbeat alert (zero prod pageviews → possible outage)` | `$insight_alert_firing` filtered to `alert_id = 019de9cd-5e20-…` | none | Rich blocks: header + outage diagnosis + insight/Vercel-logs buttons + triage hint pointing to this skill. Fires when the Site heartbeat alert triggers (zero prod $pageview/hour). **This is the alert→Slack pattern from PostHog's canonical recipe** — `$insight_alert_firing` is an internal event PostHog emits when any threshold alert fires; filter on `alert_id` to scope to a specific alert. |

The Slack workspace integration ID is **`158263`** — reuse this for new destinations. The PostHog Slack OAuth was set up by the user pre-skill; we cannot re-auth from MCP.

### PostHog threshold alerts (2/2 plan slots used)

| Alert | Insight short_id | Threshold | Notification |
|---|---|---|---|
| Cron heartbeat (`cron_run_success` for `process-package-jobs`) | `uBvo4cgs` | `lower < 1` over `-2d` (daily) | email to user `390647` |
| Site heartbeat (`$pageview` from prod, `019de9cd-5e20`) | `HwlQUU5V` | `lower < 1/hour` (hourly) | email to `390647` + Slack `#errors` via the "Site heartbeat alert" CDP destination — wired via `$insight_alert_firing` event filter on `alert_id` (PostHog's canonical alert→Slack pattern) |

Previously slot 2 was "Cron failure summary" (insight `KBahjChp`). Removed 2026-05-02 because the existing `Slack: Cron failure` CDP destination already covers that signal via Slack — the alert was redundant. The slot was reclaimed for the Site heartbeat alert that catches the failure mode the 2026-05-02 prod 500 exposed (instrumentation crash → no JS loads → `$exception` destination silent).

Both alerts use `condition: {type: "absolute_value"}` and `config: {type: "TrendsAlertConfig", series_index: 0}` (the `config` field is required even though it looks redundant — see Gotchas).

There are 5 more saved insights ready for alerts but unwired due to the plan cap: error rate `xLuxCRrg`, PDF service availability `UGGhKcuE`, PDF generation umbrella `vrLaWXpC`, package failure `3AXr68Pn`, checkout failure `STL7NY81`. Their Slack delivery is handled by destinations instead.

### Code-side analytics events (in `src/lib/analytics-shared.ts` `AnalyticsEvents` enum)

The cron-related events were added by the observability work and require the events to be in the central enum (CLAUDE.md: "AnalyticsEvents enum has all event names — don't use string literals"):

- `CRON_RUN_SUCCESS` / `CRON_RUN_FAILURE` — emitted by `runCronWithObservability` helper (`src/lib/server/cron-observability.ts`) used by `process-package-jobs` and `cleanup-expired-packages`
- `PDF_SERVICE_HEALTH_OK` / `PDF_SERVICE_HEALTH_FAILED` — emitted by `/api/cron/ping-pdf-service` route (5-min Vercel cron)

### Vercel crons (in `vercel.json`)

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/process-package-jobs` | `0 * * * *` (hourly) | Async PDF package worker. Bumped from `* * * * *` on 2026-05-20 — every-minute polling was burning Neon free-tier compute quota (~1,440 wake-ups/day even when idle). Sub-hour latency is provided by a push-trigger in `/api/packages/request` (`after()` from `next/server` fire-and-forgets a request to this URL on every `created=true` enqueue). Hourly tick stays as the safety net for missed pushes. Worker is idempotent (`FOR UPDATE SKIP LOCKED` lease) |
| `/api/cron/cleanup-expired-packages` | `0 3 * * 0` (Sun 3 AM UTC, weekly) | Delete expired blobs (Vercel Blob has plenty of capacity, daily was overkill — 30-day TTL means blobs may now live up to 37 days) |
| `/api/cron/ping-pdf-service` | `*/5 * * * *` (every 5 min) | Probe `${PDF_SERVICE_URL}/health` + keep Render dyno warm |

All three use `Authorization: Bearer ${CRON_SECRET}` (set in Vercel + `.env.local`).

### `/api/health` shallow liveness probe

Returns `{ ok, environment, commit, timestamp }` with `Cache-Control: no-store`. Public, no DB/upstream calls. For external uptime monitors if you ever wire one (currently we just use the Vercel cron probe of the PDF service).

## How to add more

### Adding a new Slack destination (event → #errors)

This is the default for any new "alert me when X fires" need. **Bypasses the 2-alert plan cap** and supports rate limiting natively.

1. Make sure the event already fires through `analytics.track()` from `@/lib/server` (server) or `analytics.track()` from `@/lib/analytics` (client). If it's a new event, add it to `AnalyticsEvents` in `src/lib/analytics-shared.ts` first.

2. Confirm MCP context: `mcp__posthog__project-get { id: 292471 }`. If it returns 404, run `mcp__posthog__switch-organization { orgId: "019bcd27-65f8-0000-56bb-7a099107c823" }` then `mcp__posthog__switch-project { projectId: 292471 }`. The MCP context drifts back to the preview org (`019dbb1b-…`) frequently — re-check before any write.

3. Call `mcp__posthog__cdp-functions-create` **TWICE** — once for the prod destination, once for the `[DEV]` mirror. Use the same `events`, `masking`, and message body for both; only `name`, `channel`, and the env filter differ.

   **Prod destination:**
   - `type: "destination"`, `template_id: "template-slack"`, `enabled: true`
   - `inputs`:
     - `slack_workspace: { value: 158263, order: 0 }`  (reuse the existing workspace integration)
     - `channel: { value: "C0AAMA9HM8D", order: 1 }`
     - `icon_emoji`, `username`, `text`, `blocks` — see existing destinations for examples
   - `filters: { source: "events", events: [{ id: "<event_name>", name: "<event_name>", type: "events", order: 0, properties: [...optional] }], properties: [{ key: "environment", type: "event", value: ["development", "preview"], operator: "not_in" }], filter_test_accounts: false }`
   - Optional `masking: { ttl: 3600, hash: "{event.event}" or "{event.properties.X}", threshold: 10 }` if rate-limiting is needed

   **Dev mirror:**
   - Same payload as above EXCEPT:
     - `name: "[DEV] Slack: <same name>"`
     - `inputs.channel.value: "C0B5C15L0DR"`
     - `inputs.username.value` → suffix with `(dev)` for visual disambiguation
     - `filters.properties[0].operator: "in"` (flip from `not_in` to `in`)
     - Optionally prepend `[DEV \`{{ event.properties.environment | default: "?" }}\`]` to the text/blocks so the source environment is visible at a glance.

4. To rate-limit existing destinations, use `mcp__posthog__cdp-functions-partial-update` with just the `masking` field — apply to BOTH siblings to keep them in sync.

The `text` field is the plain-text fallback (also what shows in Slack notifications). The `blocks` field is the rich Block Kit JSON. For bug-report-style messages (errors), prefer rich blocks with a header + code block + fields grid + action buttons. See the `Slack: $exception (rich)` destination for the canonical template.

### Destination template playbook — preventing field-name drift

The most common Slack-destination bug is **field-name drift**: the template references `event.properties.X` but the emit site doesn't send `X`. Result: blank fields, empty backticks, or rendered `null`. Across PR #123 and the 2026-05-02 audit we shipped fixes for 8 destinations hitting this same class. The pattern that survived:

**1. Use `templating: liquid`, not `hog`, for any field that references event properties.**
Hog templating can't fall back gracefully on missing props — it emits `null`, which renders as the literal `null` string or empty backticks in code spans. Liquid supports the `default:` filter.

**2. Wrap every property reference with a `default:` fallback.**
```liquid
{{ event.properties.formType | default: "unknown" }}
{{ event.properties.error | default: event.properties.errorMessage | default: "(no message)" }}
{{ person.name | default: event.distinct_id }}
```
Chain `default:` for graceful degradation when one destination is fed by multiple events with heterogeneous shapes (e.g. checkout/payment funnel where 3 events send different props).

**3. Verify every `event.properties.X` reference against the actual emit site BEFORE saving.**
Run `grep -rn 'AnalyticsEvents.<NAME>' src` for each event the destination subscribes to, read the exact `properties: { ... }` shape, and confirm every X in the template is present in EVERY emit site that fires this event. If multiple emit sites send different shapes (common for `pdf_generation_failed`, `api_error`), use `default:` chains.

**4. Mask hash MUST reference a property the event always has.**
Earlier the auth destination had `hash: "{event.properties.email}"` but `email` was never sent — the hash collapsed to null and the rate limit became "10/hour total" instead of "10/hour per user". Use `{event.distinct_id}`, `{event.event}`, or a confirmed-present property.

**5. Standard wireup checklist when patching a destination:**
- Pull current config: `mcp__posthog__cdp-functions-retrieve { id }`
- List `event.properties.X` references in `inputs.text` and `inputs.blocks`
- `grep -rn 'AnalyticsEvents.<NAME>' src/` to find emit sites
- Diff template references vs emit-site `properties: { ... }` keys
- For each missing prop: either fix the emit site (preferred for high-value fields like `unsupportedCodepoint`) or wrap the template reference with `| default: "..."`
- Switch the affected input from `templating: hog` to `templating: liquid` if any `default:` fallback is needed
- Save via `mcp__posthog__cdp-functions-partial-update { id, inputs: {...} }`

Canonical examples on prod (project 292471): `Slack: $exception (rich)` (id `019bef61-248f-…`), `Slack: Auth failures` (id `019ddb3b-2b38-…`).

### Developer badge prefix (Updated: 2026-05-22)

Every event now carries two auto-added properties when fired by a known developer:

- `isDeveloper: true`
- `developerName: "Gal" | "Douglas"` (or whatever `NEXT_PUBLIC_LOCAL_DEVELOPER_NAME` is set to locally)

Source of truth: `detectDeveloperByEmail()` in `src/lib/analytics-shared.ts`. Spread into event properties at the two emit chokepoints (`src/lib/server/rudderstack.ts` line ~123, `src/lib/analytics.ts` line ~85).

**Why it exists:** prod alerts triggered by Gal/Douglas QAing should be visually distinguishable from real customer events; anonymous local-dev events should be attributable to whoever's laptop is firing them.

**Slack template pattern (add when patching any destination):**

```liquid
{% if event.properties.isDeveloper %}👤 *{{ event.properties.developerName }}-QA* · {% endif %}<rest of existing text unchanged>
```

For destinations that use `templating: hog`, switch to `liquid` first per the playbook above. Apply to BOTH the prod destination and its `[DEV]` mirror so both channels surface the badge.

**Status: badge prefix NOT yet applied to existing destinations** (deferred follow-up — 2026-05-22 session). Property lands on every event; PostHog event explorer surfaces it under `properties.isDeveloper` for filtering. Slack template rollout pending — when applying, batch-update all destinations via `mcp__posthog__cdp-functions-partial-update` with just the `inputs.text` (and `inputs.blocks[].text`) field. Skip the Site heartbeat alert (`$insight_alert_firing` doesn't carry `environment` or developer props).

### Adding a new threshold-based alert (periodic check)

Only use this for "fewer than N events in a window" or other periodic threshold checks that destinations can't express (destinations are per-event, alerts are periodic).

**You're capped at 2 alerts on the current plan.** Both slots are used. To add a new threshold alert:
- Either trade out one of the existing two (e.g. drop "Cron failure summary" since the destination covers it)
- Or upgrade the PostHog plan

If a slot is free:
1. Create the insight: `mcp__posthog__insight-create` with a TrendsQuery `InsightVizNode`. Use the existing 7 insights as templates (`uBvo4cgs`, `KBahjChp`, `xLuxCRrg`, etc.).
2. Create the alert: `mcp__posthog__alert-create` with:
   - `insight: <insight_id>` (the numeric ID, not short_id)
   - `subscribed_users: [390647]` (Gal — only PostHog user on the project)
   - `enabled: true`
   - `calculation_interval: "hourly"` (only "hourly", "daily", "weekly", "monthly" are supported)
   - `condition: { type: "absolute_value" }`
   - `threshold: { configuration: { type: "absolute", bounds: { lower: N } | { upper: N } } }`
   - **`config: { type: "TrendsAlertConfig", series_index: 0 }`** — required; alert-create returns "Unsupported alert config type: None" without it (see Gotchas)

### Adding a new Vercel cron with observability

1. Add the route under `src/app/api/cron/<name>/route.ts`. Use `runCronWithObservability` from `@/lib/server` for cron-tick semantics (emits `cron_run_success` / `cron_run_failure`):

   ```ts
   import { publicRoute, withFlush } from "@/lib/server/route-handler"
   import { runCronWithObservability } from "@/lib/server"

   export const maxDuration = 300

   export const GET = publicRoute(
     withFlush(async ({ request }) => {
       const secret = process.env.CRON_SECRET
       if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
         return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
       }
       return runCronWithObservability({
         cronName: "<name>",
         action: "<logger_action_label>",
         work: () => doTheWork(),
       })
     }),
   )
   ```

2. For probes that have their own success/failure semantics (i.e. cron tick succeeded but the thing it probed failed — like the PDF service health check), DON'T use `runCronWithObservability`. Emit your own events (e.g. `pdf_service_health_ok` / `_failed`) and don't rethrow on probe failure. See `src/app/api/cron/ping-pdf-service/route.ts` as the reference.

3. Add the cron entry to `vercel.json`. Use `withFlush` so events land before the function process exits (Vercel can tear down before the SDK's batch interval fires).

4. Wire a Slack destination for the failure event (see "Adding a new Slack destination" above).

## Incident playbook: site returns 500 on every request

**First place to look: `instrumentation.ts` boot-time crashes.** When the Next.js instrumentation hook fails, Next.js can't serve any request — every URL returns the generic 500 page. PostHog can't help because the analytics SDK never initializes (the page is plain HTML with no JS). Symptoms in Vercel logs: `An error occurred while loading instrumentation hook: ...`.

Most common cause: env validator (`src/lib/env.ts` `validateEnv()`) throwing on a missing required var. Triage:

1. **Vercel dashboard → Functions → Logs** → search for `failed to load instrumentation hook` or `Environment validation failed`. The full validator error names every missing var.
2. Set the missing vars in Vercel project settings → Environment Variables (Production scope) and redeploy. Use `printf '%s'` (NOT `echo`) when piping values via CLI — trailing newlines silently corrupt secrets per memory.
3. **If the missing var belongs to an optional feature** (push, OAuth, analytics, anything with a lazy-init guard at the call site): move it from `REQUIRED_IN_PRODUCTION` to `OPTIONAL_PROD_WARN` in `src/lib/env.ts`. That's the right architectural fix — see PR #144 / 2026-05-02 incident.

**Why we can't alert on this from inside the app:** when instrumentation crashes, `/api/cron/ping-pdf-service` (and every other route) is also down, so a self-probe cron emits nothing. The right "site is entirely down" signal needs to come from OUTSIDE the app:

- **Vercel's built-in error-rate alert** → Slack webhook integration. Configurable in Vercel project settings → Notifications. Covers this exact failure mode.
- **External uptime monitor** (UptimeRobot, Better Uptime free tier) hitting `/api/health` every minute. Posts to Slack #errors on 5xx.
- **Vercel deployment-error notifications** — only catches build/deploy failures, NOT runtime crashes. Useful but insufficient on its own for this incident class.

Wire one of the first two before the next deploy that introduces a new env var. The current setup leaves prod 500s undetected until a user reports them.

## What we don't have (and why)

- **External uptime monitor** (UptimeRobot, Better Uptime, etc.). The `/api/cron/ping-pdf-service` cron does the equivalent in-house: 5-min interval keeps the Render free-tier dyno warm AND emits `pdf_service_health_failed` on outage, which routes to Slack via the same pipeline as everything else. Trade-off: the probe goes silent if Vercel itself is down — Vercel's status page covers that. Decision logged in `docs/decisions/observability.md` ("PDF service liveness via Vercel cron, not external uptime monitor").

- **Slack notifications wired directly to PostHog alerts.** PostHog's `alert-create` MCP tool only takes `subscribed_users` (numeric IDs → email). Slack-on-alert is a UI-only step in PostHog. We work around this by using **CDP destinations** (which natively support Slack via `template-slack`) for everything except periodic thresholds.

- **Deep `/api/health` endpoint** that pings DB / PDF service / Blob storage. Rejected during the original audit because (a) every external monitor request would amplify into 3 backend calls and create a DoS surface that needs auth, (b) real DB/PDF/Blob outages already surface as 5xx on regular routes. The shallow `/api/health` we have is enough for monitor heartbeat, and probe-style observation belongs in dedicated cron probes (like `ping-pdf-service`) where each thing being probed has its own event + alert.

- **Login/signup-failure spike alerts beyond per-email throttling.** The `Slack: login_failed` destination fires per email at 10/hour — that's intentional. A global "X total failures in the last hour" alert would be noisy mostly from typos, not bot attacks. Revisit if a real bot incident shows the current setup is insufficient.

- **`payment_completed` drop-to-zero "revenue heartbeat" alert.** At current volume one quiet day would false-positive. Revisit when traffic increases or the business needs an explicit revenue SLA.

## Potential improvements (audit-identified gaps)

These were identified during the alerting audit and deliberately deferred. Revisit when the listed trigger applies.

### ~~Stripe disputes / refunds / fraud warnings / payout failures~~ — DONE in PR #293 (2026-05-22)
Webhook (`src/app/app/api/webhooks/stripe/route.ts`) now subscribes to `charge.dispute.created`, `charge.dispute.closed`, `radar.early_fraud_warning.created`, `charge.refunded`, `payout.failed` — see the 5 `Slack: Stripe ...` rows in the destinations table above. **No order-state mutation** (deliberate non-goal — forms are already downloaded, team responds out-of-band via Stripe dashboard). Spec: `docs/specs/stripe-dispute-alerts.md`.

### Stuck pending orders (probably redundant)
Orders stuck in `pending` without a terminal state. Stripe auto-expires checkout sessions at 30 min and fires `checkout.session.expired` which we already handle, so this is mostly covered. The remaining edge case is orders where our DB write failed AFTER Stripe charged — those are caught by the webhook returning 5xx and Stripe retrying. **No action needed unless we see real instances of stuck pending orders.**

### Webhook delivery failures (Stripe Dashboard only)
If Stripe can't reach our endpoint at all, neither side fires our analytics. Stripe Dashboard surfaces this prominently under Webhooks → Logs. Subscribing to a "webhook failed" event wouldn't help because that subscription would also fail. Trigger to add monitoring: only if Stripe Dashboard shows >1% delivery failure rate sustained.

## Limitations / gotchas

### MCP project context drift
The PostHog MCP defaults the project context back to preview (`394420`) between calls — even after `switch-project`. Symptoms: `partial-update` on a real prod resource ID returns 404 because the URL contains `/projects/394420/...`. Always re-confirm context before write operations. Switch sequence:
```
mcp__posthog__switch-organization { orgId: "019bcd27-65f8-0000-56bb-7a099107c823" }
mcp__posthog__switch-project { projectId: 292471 }
```

### `RUDDERSTACK_SERVER_WRITE_KEY` is required
Server-side `analytics.track()` falls back to `NEXT_PUBLIC_RUDDERSTACK_WRITE_KEY` if the server key isn't set, but that public key is the **Client (Javascript) source's** writeKey. Its connection to PostHog is `connectionMode.web: "device"` — events from a Node SDK get accepted by the data plane but silently dropped because device-mode requires `window.posthog` in a browser to forward. Server analytics went dark for hours before this was caught (April 2026).

The Server source's writeKey is `39ECiJrmwqarWhEBMhxUS5Ct81L`. It's set in Vercel production / preview / development + `.env.local`. If "events flowing through `analytics.track()` aren't appearing in PostHog", check this env var first.

### PostHog plan caps `alerts` at 2
Hard cap on the current plan. `alert-create` returns `"Your team has reached the limit of 2 alerts on your plan."` past 2. **Default to creating CDP destinations instead** (no cap) — they cover all event-triggered cases. Only use the alert slots for periodic threshold checks (heartbeat-style, "fewer than N in window") which destinations structurally cannot do.

### `alert-create` requires `config: { type: "TrendsAlertConfig", series_index: 0 }`
Even though the `condition` and `threshold` look complete, missing `config` returns `"Unsupported alert config type: None"`. The `series_index` is which series of the insight's `series` array to monitor (0 = first series).

### Masking semantics
PostHog destination `masking` deduplicates events that hash to the same value within `ttl` seconds. The `threshold` field is "minimum events before masking applies" — so `threshold: 10` means the **first 10 events** with the same hash within the TTL window pass through, events 11+ within the same window are dropped. After TTL expires, the counter resets.

This is "10 per TTL window", not "fire when 10 happen". For "fire after N events" semantics, use a PostHog alert (different mechanism, threshold-based, periodic).

The hash is a Hog template expression: `"{event.event}"` (per-event-name dedup), `"{event.properties.formType}"` (per-property dedup), `"{event.distinct_id}"` (per-user dedup), or any concat thereof.

### Slack-on-alert requires UI step
PostHog's MCP `alert-create` doesn't expose a Slack channel field. To add Slack notification to an alert: PostHog dashboard → open alert → add Slack as notification channel. Done once per alert. Currently both alerts only have email (the project's 2 alert slots are mostly redundant with destinations anyway).

### No trailing newline on env var values
When piping values into `vercel env add`, use `printf '%s'` (not `echo`). A trailing `\n` silently corrupts secrets like `RUDDERSTACK_SERVER_WRITE_KEY`, `STRIPE_*`, `DATABASE_URL`. The repo has a pre-commit hook that blocks `vercel env add` invocations matching the trailing-newline pattern.

### `$exception` properties live in `$exception_list[]`, not the deprecated top-level fields

posthog-js v1.300+ stopped writing `$exception_message` / `$exception_type` as top-level properties. The data now lives under `properties.$exception_list[]` — each item carries `type` and `value`. The Error Tracking UI reads `$exception_list` correctly; only ad-hoc HogQL using the deprecated property names returns NULL and looks like a complete instrumentation failure when nothing is wrong. Always query:

```sql
SELECT
  properties.$exception_list[1].value AS message,  -- HogQL is 1-indexed
  properties.$exception_list[1].type  AS type,
  count() AS n
FROM events
WHERE event = '$exception'
  AND timestamp > now() - interval 7 day
GROUP BY message, type
ORDER BY n DESC
```

Decision log: `docs/decisions/observability.md` ("$exception properties live in $exception_list…", 2026-05-02).

### Cron events vs probe events
`runCronWithObservability` emits `cron_run_success` / `cron_run_failure` — those signal the cron tick itself succeeded or threw. They're separate from any application-level signals about what the cron PROBED. Example: `ping-pdf-service` is a cron that probes the PDF service. The cron tick can succeed (we successfully ran the probe) AND `pdf_service_health_failed` fires (the service was unreachable). Don't conflate the two.

## Important IDs and references

- **Prod PostHog project**: `292471` (org `019bcd27-65f8-0000-56bb-7a099107c823`, "Green Card Genius")
- **Preview PostHog project**: `394420` (org `019dbb1b-f923-0000-fc42-6278a3ad519b`, "Green Card Genius Preview Env") — separate workspace, ignore unless intentionally targeting preview
- **Slack channels**:
  - `C0AAMA9HM8D` (#errors) — prod
  - `C0B60Q36PDW` (#marketing-events) — prod funnel signals (checkout abandonment)
  - `C0B0XL30ZMJ` (#errors-user-experience) — prod UX signals (rageclick)
  - `C0B5C15L0DR` (#errors-developement-non-production) — ALL dev/preview events
- **Slack workspace integration** (in PostHog): `158263`
- **Subscribed user for email alerts**: `390647` (Gal, `israeligal2@gmail.com`)
- **RudderStack data plane**: `https://hopesxlobigadl.dataplane.rudderstack.com`
- **RudderStack Client source writeKey** (browser): `39ECRwL1EPtCwZzmYLAWUD9ZCxE` (= `NEXT_PUBLIC_RUDDERSTACK_WRITE_KEY`)
- **RudderStack Server source writeKey** (Node SDK): `39ECiJrmwqarWhEBMhxUS5Ct81L` (= `RUDDERSTACK_SERVER_WRITE_KEY` — REQUIRED)
- **Developer email regex source of truth**: `detectDeveloperByEmail()` in `src/lib/analytics-shared.ts`. Used by both client and server emit chokepoints to auto-tag events with `isDeveloper` / `developerName`. To add or remove a developer, edit the `DEVELOPER_EMAILS` const there.

## Related files in the repo

- `src/lib/analytics-shared.ts` — `AnalyticsEvents` enum (single source of truth for event names)
- `src/lib/server/analytics.ts` — server `analytics.track()` (RudderStack hub)
- `src/lib/server/rudderstack.ts` — Server SDK init (writeKey fallback lives here)
- `src/lib/server/cron-observability.ts` — `runCronWithObservability` helper
- `src/app/api/cron/process-package-jobs/route.ts` — example cron using the helper
- `src/app/api/cron/ping-pdf-service/route.ts` — example probe-style cron with custom events
- `src/app/api/health/route.ts` — shallow liveness endpoint
- `vercel.json` — cron schedule entries
- `docs/decisions/observability.md` — full decision log (read this for "why" beyond what's in this skill)

## Memory pointers

- `project_posthog_alert_limit.md` — captures the 2-alert plan cap + CDP destination workaround. Updated whenever the alert/destination inventory changes.
- `feedback_env_vars_no_trailing_newline.md` — the trailing-newline gotcha (pre-existing, not specific to this work).
