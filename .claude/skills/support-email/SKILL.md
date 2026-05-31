---
name: support-email
description: Two-way support email bridge between customers (support@greencardgenius.com) and Slack. Inbound = Resend Inbound webhook → per-customer public Slack channel + best-effort Gmail mirror. Outbound = agent runs `/reply <text>` slash command in the cust-* channel → email back to the customer with RFC-5322 threading headers + Gmail archive copy via response_url. Spans `/api/inbound/email` + `/api/slack/events` + `/api/slack/commands` routes, the Resend/Slack client wrappers, the Svix + Slack signature verifiers, the `customer_slack_channels` table + repo, and the `inboundEmail` + `outboundEmail` + `customerSlackChannel` services. Use when working on inbound webhook handling, the per-customer channel lifecycle, Resend transactional sending (`sendEmail`/templates), Slack Web API calls, RFC-5322 threading, slash command handling, signature verification, or anything touching support@greencardgenius.com routing.
---

# Support Email ↔ Slack Bridge

Two-way customer support pipeline. Inbound emails to `support@greencardgenius.com` land in a public per-customer Slack channel (or `#support-unmatched` for strangers) and optionally mirror to a personal Gmail. Outbound replies fire when an agent runs `/reply <text>` in the cust-* channel — the route returns an ephemeral 3-second ack and the orchestrator finishes the work async via `response_url`.

## File Map

| Layer | Path | Purpose |
|-------|------|---------|
| Route (inbound) | `src/app/api/inbound/email/route.ts` | Resend `email.received` webhook — Svix-verified, parsed, delegated |
| Route (events) | `src/app/api/slack/events/route.ts` | Slack Events API — verifies `v0` signature, echoes `url_verification` challenge, ack-200s `event_callback` (capture-only; outbound routing now lives on `/api/slack/commands`) |
| Route (outbound) | `src/app/api/slack/commands/route.ts` | Slack slash-command webhook — same `v0` signature verifier (raw body bytes are signed regardless of `application/x-www-form-urlencoded` vs JSON), returns ephemeral "📨 Sending…" within the 3-second window and fires `handleSlashReply` async via `void` |
| Service | `src/services/inboundEmail.service.ts` | Inbound orchestrator — fetch body, autoreply gate, resolve user, post to Slack **with `metadata.event_type: "inbound_email"`** carrying `inboundMessageId`/`inboundReferences`/`originalSubject`, upload attachments, optional Gmail forward (threaded) |
| Service | `src/services/outboundEmail.service.ts` | Outbound orchestrator — reverse-lookup channel via `findCustomerSlackChannelBySlackChannelId`, find the most recent inbound via `conversationsHistory({ includeAllMetadata: true })` filtered by `metadata.event_type === "inbound_email"`, build RFC-5322 reply headers, fire `sendOutboundReplyToCustomer` + optional `sendOutboundReplyToMirror`, POST `in_channel` echo to `response_url`. Slack-domain helpers live in `outboundEmail.service.utils.ts` (`extractInboundMetadata`, `stripSlackMentions`); RFC-5322 / 3834 helpers (`buildReplySubject`, `buildReplyHeaders`, `pickReferencesHeader`, `isAutoReply`) live in `@/lib/email/threading` and are shared with `send.ts` + `inboundEmail.service` |
| Service | `src/services/customerSlackChannel.service.ts` | Idempotent channel resolver — find / unarchive / create+invite, stores DB row |
| Repository | `src/repositories/customerSlackChannel.repository.ts` | CRUD on `customer_slack_channels` (`requireUserId`-scoped) plus `findCustomerSlackChannelBySlackChannelId` (reverse lookup for slash commands — no userId guard since the slash command IS the lookup) |
| Schema | `src/lib/db/schema.ts` (`customerSlackChannels` ~L314) | `id, userId UNIQUE → users.id, slackChannelId, slackChannelName, archivedAt?, createdAt, updatedAt` |
| External client | `src/lib/resend/inboundClient.ts` | Resend Receiving API — `getReceivedEmail`, `listReceivedAttachments`, `downloadAttachment` |
| External client | `src/lib/slack/slackClient.ts` | Hand-rolled Slack Web API `fetch` wrapper — `conversations.{create,invite,setTopic,setPurpose,unarchive}`, `chat.postMessage` (accepts optional `metadata`), `conversationsHistory({ channel, limit, includeAllMetadata })` (defaults `includeAllMetadata: true` — without it Slack returns only `event_type`, no `event_payload`), `postToResponseUrl({ responseUrl, payload })` (JSON POST to the slash command's `response_url` — supports `in_channel` and `ephemeral`), `files.uploadV2` (3-step), 429 retry with `Retry-After` |
| External client | `src/lib/email/send.ts` | Resend `emails.send` wrapper — transactional kinds (`sendVerificationEmail`/`sendPasswordResetEmail`/`sendInvitationEmail`/`sendPackage{Ready,Failed}Email`), `forwardInboundEmail` (Gmail mirror with threading), and `sendOutboundReplyTo{Customer,Mirror}` (Phase 2 outbound). All accept optional `headers` for `In-Reply-To`/`References`. Templates in `src/lib/email/templates/` (see `src/lib/email/CLAUDE.md`) |
| Signature verifier | `src/lib/server/signatures/svixVerify.ts` | HMAC-SHA256 over `${id}.${ts}.${body}`, `whsec_<base64>` secret format. Used by inbound route |
| Signature verifier | `src/lib/server/signatures/slackVerify.ts` | HMAC-SHA256 over `v0:${ts}:${rawBody}` → hex, secret used as **raw string** (NOT base64). Used by both `/api/slack/events` and `/api/slack/commands` — algorithm is identical whether the body is JSON or form-encoded, since raw bytes are signed |
| Capture logs | `src/lib/server/capture.ts` | `captureInboundEmail` / `captureOutboundEmail` / `captureSlackEvent` — structured logs that contain everything needed to reconstruct a test fixture from a real production event |
| DTO | `src/lib/dto/inboundEmail.dto.ts` | `inboundEmailEventSchema` — Resend `email.received` envelope (`type`, `created_at`, `data: { email_id, from, to, cc, bcc, subject, message_id, attachments }`) |
| DTO | `src/lib/dto/slackEvent.dto.ts` | `slackEventEnvelopeSchema` — union of `url_verification` + `event_callback`. Inner `event` is union of typed `message` event + passthrough fallback |
| DTO | `src/lib/dto/slackCommand.dto.ts` | `slackCommandRequestSchema` — Slack slash-command form-encoded payload (`token`, `command`, `text`, `response_url`, `trigger_id`, `team_id`, `channel_id`, `user_id`, `api_app_id`, + optional `team_domain`/`channel_name`/`user_name`/`enterprise_*`) |
| Spec | `docs/specs/outbound-email-slack.md` | Phase-2 outbound design (RFC-5322 threading, trigger UX, autoreply gating) |
| Decisions | `docs/decisions/inbound-email.md` | Throw-vs-catch asymmetry, hand-rolled Svix rationale, why `userId UNIQUE` not `organizationId`, slash-command-not-threads pivot (2026-05-13), Resend headers passthrough verification |
| Tests | `src/__tests__/integration/api/webhooks/{inbound-email,slack-events,slack-commands}.integration.test.ts`, `src/__tests__/integration/services/{customerSlackChannel,inboundEmail,outboundEmail}.service.integration.test.ts`, co-located `*.test.ts` for verifiers + DTOs + `outboundEmail.service.utils.test.ts` (32 unit tests on the pure helpers) | HTTP-level + service-level coverage |

## Inbound Request Flow

```
Customer email → Resend MX → Resend webhook POST /api/inbound/email
  ↓ verifySvixSignature  (bad sig → 400; missing secret → 500)
  ↓ slackEventEnvelope   no — wrong shape; inboundEmailEventSchema (malformed → 200 ignored, no Resend retry storm)
  ↓ routeInboundEmail({ emailId, from, subject })
      → getReceivedEmail   (Resend Receiving API — webhook is metadata-only)
      → resolveUserFromEmail({ from, replyTo: email.reply_to })
            tries `from` first via findUserByEmail (real customer emails)
            falls back to reply_to[0] if no match (self-originated emails:
              contact form, automated notifications — our verified sender is
              in `from`; customer's real address is in `reply_to`)
      → resolveDestination
            matched   → resolveChannelForUser  (find or create+invite+topic+purpose; archived row → mint new cust-* and repoint)
            unmatched → resolveUnmatchedChannelId (env: SLACK_UNMATCHED_CHANNEL_ID)
      → chatPostMessage    (matched: self-heals via postWithChannelArchiveRecovery on `is_archived` — mark DB archived, re-resolve, retry once; ANY remaining Slack failure is CAUGHT, logged, fires INBOUND_EMAIL_SLACK_FAILED, and the flow CONTINUES to the Gmail forward — Slack failures must not block the operator's only durable surface)
      → uploadAttachmentsToSlack (per-attachment try/catch — best-effort; skipped entirely if Slack post failed since there's no threadTs to attach under)
      → forwardToPersonalInbox   (try/catch — best-effort; opt-in via SUPPORT_FORWARD_TO_EMAIL)
  ↓ analytics.track INBOUND_EMAIL_{RECEIVED,ROUTED|UNMATCHED,SLACK_FAILED,FAILED}
  → 200 received (or 500 only if BOTH Slack AND forward failed — that's the only path that triggers a Resend retry)
```

See `docs/decisions/inbound-email.md` for the throw-vs-catch rationale at each step.

## Agent-Gmail-echo branch (inbound short-circuit)

When ops hits Reply on the Gmail mirror copy, the reply lands back at `/api/inbound/email`. Without this branch, the agent's reply would (a) go nowhere visible in Slack and (b) open a fresh `cust-*` channel keyed on `agent@personal-gmail.com` — both wrong. The branch routes the reply BACK into the customer's existing `cust-*` channel as a clearly-labeled "Sent from Gmail" post and SKIPS forwarding (the agent already has the email in their Sent folder).

**Wiring (one-time, on every outbound mirror)**:
- `forwardInboundEmail` (inbound mirror) + `sendOutboundReplyToMirror` (`/reply` mirror) add `support-bridge@<FROM_EMAIL domain>` to `Reply-To` alongside the customer address. Gmail's Reply auto-fills both → inbound webhook receives an email whose `to:` list includes the alias.
- The same outbound also sets `Message-ID: <gcg-(u|c)-<id>-<32-hex>@<domain>>` — `kind=u` + customer userId for matched, `kind=c` + Slack channel ID for unmatched. Random suffix is 32 lowercase-hex chars (`crypto.randomUUID().replace(/-/g,'')`) — the fixed shape is the boundary marker for `parseIdentityFromInReplyTo` (regex `/<gcg-(u|c)-(.+?)-([a-f0-9]{32})@/`); shorter/non-hex on the right side → no match → fall through to normal flow.

**Inbound flow with the branch**:
```
routeInboundEmail
  ↓ archiveAlias present in to/cc/bcc? && parseIdentityFromInReplyTo(headers) → {kind, id} ?
      → routeAgentEcho({ kind, id })
          kind=u → findUserBasicInfo(id)
              no user           → return true (drop, encoded-but-unknown — usually deleted account)
              senderEmail===customer.email (case-insensitive)
                                → return false (Reply-All loop guard; fall through to normal flow)
              else              → resolveChannelForUser → postAgentEchoToSlack → return true
          kind=c → postAgentEchoToSlack({ channelId: id }) → return true
      routed === true  → return (echo handled, SKIP Gmail forward — agent has it in Sent)
      routed === false → fall through to normal inbound flow
  ↓ (normal flow: autoreply check → resolveUser → channel → post → forward → capture)
```

**postAgentEchoToSlack**: posts top-level with badge `📧 *Sent from Gmail by ${senderEmail}*` + `stripQuotedReply(body)` (chops at Gmail `On ... wrote:` or Outlook `-----Original Message-----`) + attachment uploads. Metadata `event_type: "agent_gmail_echo"`.

**Why this design** (vs alternatives like a webhook on Gmail Push or a separate `support-archive@` mailbox):
- One mailbox, one webhook. No new Gmail OAuth, no separate inbound endpoint, no DB column on `customer_slack_channels`.
- Routing identity is opaque (Message-ID), not in a visible header — customers don't see Slack channel IDs in their inbox.
- The static `support-bridge@` alias reads as a generic forwarding address; specific IDs are encoded in the (already-opaque) Message-ID.
- Falling back to normal flow on parse failure means a broken/mangled Message-ID is never worse than a regular customer reply.

See `docs/specs/agent-gmail-echo.md` for the full design rationale and Q&A.

## Contact form path (bypasses inbound webhook)

In-app contact-form submissions (`SupportFormDialog`, `HistoryContactSupport`, etc.) don't round-trip through Resend Inbound. The flow is:

```
Contact form action → globalConfig.processSubmission callback (wired in src/lib/contact-form-config.ts)
  ↓ submitContactForm.service ({ name, email, message, formType, attachments, userId })
      → resolveUser({ session.user.id via findUserBasicInfo, OR findUserByEmail for anonymous })
      → resolveChannelForUser OR resolveUnmatchedChannelId
      → chatPostMessage({ channel, text, metadata: { event_type: "inbound_email", inboundMessageId, ... } })
      → uploadAttachmentsToSlack({ channel, threadTs, attachments }) — best-effort per file
      → forwardContactFormEmail({ to: gireddit@, attachments, ... }) — best-effort, SKIPPED for anonymous (no replyTo target)
  → return {success, messageId}
```

**Why bypass:** same-domain Resend `emails.send → MX → email.received` silently drops attachment-bearing sends (verified in PostHog logs — the route fires in 2-10ms because the schema parse rejects what Resend sends), and `forwardInboundEmail` doesn't carry attachments to Gmail anyway. Going direct fixes both bugs in one path.

**Real customer emails (typed-from-Gmail, no contact form)** still flow through `inboundEmail.service` via `/api/inbound/email`. That path is unchanged.

The synthetic `inboundMessageId` set on the Slack post (`<contact-form-${uuid}@greencardgenius.com>`) is read by the `/reply` slash command via `extractInboundMetadata`, so threading-related behavior is consistent with real inbound mail (note: customer's inbox treats it as a new conversation since they never had an email with that Message-ID).

## Outbound Request Flow

```
Agent runs `/reply <text>` inside cust-<userId> channel → Slack POST /api/slack/commands
  ↓ verifySlackSignature (same v0 HMAC as events; raw form-encoded body bytes are signed)
  ↓ slackCommandRequestSchema.safeParse (malformed → 200 ephemeral)
  ↓ command !== "/reply" → 200 ephemeral "Unknown command"
  ↓ !command.text.trim() → 200 ephemeral usage hint
  ↓ void handleSlashReply({ channelId, userId, text, responseUrl })   ← fire-and-forget
  → 200 ephemeral "📨 Sending…" returned within ~100ms (3-second budget intact)

handleSlashReply (async, never throws — all errors route to response_url ❌):
  → findCustomerSlackChannelBySlackChannelId   (no row → IGNORED + ephemeral)
  → findUserBasicInfo                          (no user → data inconsistency + ephemeral)
  → findMostRecentInbound (uses conversationsHistory limit=50, includeAllMetadata=true,
                           filtered to metadata.event_type === "inbound_email")
                                              (no parent → ephemeral "No inbound to thread to")
  → extractInboundMetadata(parent)             → { inboundMessageId, inboundReferences, originalSubject }
  → buildReplySubject + buildReplyHeaders      → RFC-5322 In-Reply-To + References chain
  → sendOutboundReplyToCustomer                (Resend emails.send with headers)
  → if SUPPORT_FORWARD_TO_EMAIL: sendOutboundReplyToMirror (same headers — Gmail threads all 3)
  → analytics.track OUTBOUND_EMAIL_SENT
  → postToResponseUrl { response_type: "in_channel", text: `📨 Sent to ${email}:\n>${cleanText…}` }
  catch → analytics.track OUTBOUND_EMAIL_FAILED + ephemeral ❌
```

`/api/slack/events` still receives all message + bot_message events but is currently capture-only (no routing). Slash commands cannot be invoked from threads at all (Slack spec), so the trigger sits at channel-level. Each `cust-<userId>` channel is per-customer, so threading isn't needed for disambiguation — the channel IS the customer.

## Data Model

- `customer_slack_channels` — 1:1 with users (`userId UNIQUE`), NOT org-scoped. Reasoning: support thread keys on the human who emailed, not on the org. Two co-applicants in the same org get separate channels. See `docs/decisions/inbound-email.md`.
- `archivedAt` nullable — when present, resolver unarchives in place (preserves history) instead of dropping/recreating.

## External Dependencies

- **Resend SDK** (`resend` 6.8.0) — `emails.send` (outbound + Gmail mirror) and `emails.receiving.{get,attachments}` (inbound body + attachments). Lazy singleton in `src/lib/email/send.ts:12`.
- **Slack Web API** — hand-rolled `fetch` wrapper in `src/lib/slack/slackClient.ts`. Avoids 1MB+ `@slack/web-api` bundle. Implements 429 retry with `Retry-After` header.
- **Svix** signature scheme — Resend wraps Svix; verified via hand-rolled `svixVerify.ts` (no `svix` SDK dep — see decision log).
- **Environment variables** (in `.env.local.example`):
  - `RESEND_API_KEY`, `FROM_EMAIL` (default `noreply@greencardgenius.com`)
  - `RESEND_WEBHOOK_SECRET` — `whsec_<base64>` from Resend webhook dashboard (inbound)
  - `SLACK_BOT_TOKEN` (`xoxb-…`), `SLACK_UNMATCHED_CHANNEL_ID` (`C…`), `SLACK_SUPPORT_USER_IDS` (comma-separated `U…`)
  - `SUPPORT_FORWARD_TO_EMAIL` — opt-in Gmail mirror; unset = silently skip (applies to both inbound forward and outbound mirror)
  - `SLACK_SIGNING_SECRET` — raw string (NOT base64) from Slack app's Basic Information → App Credentials (used by both `/api/slack/events` and `/api/slack/commands`)
- **Required Slack scopes** (request when registering the slash command):
  - `commands` — register and receive `/reply` invocations (NEW for Phase 2)
  - `chat:write` — `chat.postMessage` (and posting `metadata` on it)
  - `channels:history` + `groups:history` — `conversations.history` reads (public + private)
  - `metadata.message:read` — keep granted to be safe; some `conversations.history` modes need it for metadata
  - `chat:write.public` — already granted; lets the bot post to channels it created but isn't explicitly in

## Analytics Events

Defined in `src/lib/analytics-shared.ts`:
- `EMAIL_SEND_FAILED` — any Resend send failure (kind tagged: `verification`/`password_reset`/`invitation`/`package_ready`/`package_failed`/`inbound_forward`/`outbound_reply`)
- `INBOUND_EMAIL_RECEIVED` — webhook fired, before routing
- `INBOUND_EMAIL_ROUTED` — matched user, posted to `cust-…` channel
- `INBOUND_EMAIL_UNMATCHED` — no user match, posted to `#support-unmatched`
- `INBOUND_EMAIL_AUTOREPLY_BLOCKED` — `isAutoReply(headers)` matched `Auto-Submitted: auto-replied` / `Precedence: bulk` / `X-Autorespond` — force-routed to `#support-unmatched` so vacation bouncebacks don't open cust-* channels
- `INBOUND_EMAIL_FAILED` — service threw (will be retried by Resend). Fires only when BOTH Slack post AND Gmail forward failed
- `INBOUND_EMAIL_SLACK_FAILED` — Slack post failed (after the matched-customer self-heal also failed, or for non-archive errors like rate_limit). The Gmail forward still ran; webhook returned 200. Surfaces "lost-to-Slack" cases for ops without triggering Resend retries.
- `INBOUND_EMAIL_AGENT_ECHO` — Agent-Gmail-echo branch handled the inbound (`outcome: routed | unknown_user | loop_guard_fall_through`). Echo path skips Gmail forward (the agent already has it in Sent)
- `OUTBOUND_EMAIL_SENT` — `/reply` succeeded; both customer and mirror sends landed
- `OUTBOUND_EMAIL_FAILED` — `/reply` orchestrator caught a send failure (Resend SDK threw); user got ephemeral ❌
- `OUTBOUND_EMAIL_IGNORED` — `/reply` ran outside a recognized `cust-*` channel, or text was empty after stripping mentions, or no parent inbound found in `conversations.history`
- `SLACK_CHANNEL_CREATED` — new `cust-<short-id>` channel + DB row created

## Key Patterns

- **Inbound MX hostname is `inbound-smtp.us-east-1.amazonaws.com` — that IS Resend Inbound, not orphan AWS SES** — Resend's receiving plane runs on AWS SES infrastructure under the hood, so the SES hostname in `dig MX greencardgenius.com` output is the *correct* Resend Inbound endpoint. Don't propose DNS / SES Receipt Rule / Lambda forwarder changes based on seeing this MX. The actual wiring is: Resend dashboard → Domain → Enable Receiving toggle (sets the MX), inbound webhook URL configured to `https://www.greencardgenius.com/app/api/inbound/email`, secret `RESEND_WEBHOOK_SECRET` (`whsec_<base64>`) set in Vercel.
- **Throw-vs-catch is asymmetric and intentional** — body fetch + channel resolve throw on inbound (Resend retry recovers; channel resolution is idempotent on `userId`). **Slack post is CAUGHT and logged** — Gmail forward must still fire so the operator always gets a durable copy even when Slack is broken (the matched-user `postWithChannelArchiveRecovery` helper self-heals on `is_archived`; other Slack errors fire `INBOUND_EMAIL_SLACK_FAILED` and the flow continues). Attachments + Gmail forward also catch and warn (a duplicate Slack message per attachment is worse than dropping it). Webhook returns 500 (= Resend retries) ONLY when BOTH Slack and Gmail forward failed. `handleSlashReply` (outbound) NEVER throws — every error path routes through `postToResponseUrl` as ephemeral ❌ so the agent sees the failure in Slack, since the slash-command HTTP response has already been sent
- **Slash command 3-second budget forces async** — Slack disables a command after repeated `operation_timeout`. The route ack'd in ~100ms; the orchestrator (DB lookup + `conversations.history` + 2 Resend sends + `response_url` POST = ~5 outbound round-trips, worst case ~5s) runs after the ack via fire-and-forget `void handleSlashReply(...)`. Up to 5 follow-up POSTs in 30 min are allowed via `response_url`
- **`conversations.history` needs `include_all_metadata=true`** — without it Slack returns only `metadata.event_type` and OMITS `event_payload`. Since the whole flow keys on `event_payload.inboundMessageId`, forgetting this flag silently breaks every outbound reply. `slackClient.conversationsHistory` defaults the flag to true; never override to false in the orchestrator
- **`chat.postMessage` is NOT idempotent on our side** — Slack's `client_msg_id` dedup is per-client and we don't generate one. Any time a Slack post can be retried, design assumes one duplicate is acceptable or invest in a `processed_inbound_emails` table (deferred — see decision log)
- **Verifier secret formats differ** — Svix is `whsec_<base64>` (decode the base64 before HMAC); Slack is the raw string (no decode). Mixing them silently fails verification. Length pre-check before `timingSafeEqual` is required since the latter throws on length mismatch
- **Slack signature works on raw bytes** — same `v0=hmacSha256(secret, "v0:" + ts + ":" + rawBody)` algorithm whether the body is form-encoded (slash commands) or JSON (events). `slackVerify.ts` is the single verifier for both routes; never re-parse the body before verifying
- **Hand-rolled fetch wrapper > Slack SDK** — `slackClient.ts` is ~7 methods, ~250 lines. `@slack/web-api` is 1MB+ and pulls `axios`. Same logic for `svixVerify` vs `svix` SDK (~30 lines vs 200KB)
- **Slack channel name rules** — lowercase, 1-80 chars, alphabet `a-z0-9-_`. `cust-<8-char-base36-from-hex>` satisfies. Don't widen to base64
- **`files.upload` was retired 2025-03** — `slackClient.filesUpload` implements the v2 three-step flow (`getUploadURLExternal` → POST raw bytes → `completeUploadExternal`). Don't try to call the legacy endpoint
- **`extractEmailAddress` is intentionally lossy** — quoted display names with embedded `<` (`"Weird <name>" <a@x.com>`) and multi-recipient `from:` values degrade to "no match" → `#support-unmatched`. Acceptable; the unmatched channel is the safety net. Applied to both the `from` header AND `reply_to[0]` (defensive parsing — the SDK gives bare address strings in `reply_to` but the same helper future-proofs against RFC 5322 values)
- **Webhook routes use `publicRoute()` + `withFlush()`** — signature is the auth. Bad signature → 400. Malformed payload → 200 (don't trigger retry storms). Service throw → 500 (do retry). Missing required env → 500
- **Resend `from:` must be a verified sender** — `forwardInboundEmail` and `sendOutboundReplyTo*` keep `from = FROM_EMAIL`; `forwardInboundEmail` sets `replyTo = originalFrom` so Gmail replies route back to the customer. Outbound replies don't set `replyTo` because the customer IS the `to` recipient
- **Slash command `escape` setting must be OFF** — when registering `/reply` in the Slack app, do NOT enable "Escape channels, users, links". Otherwise Slack mangles `<@U123>` and URLs in `text` before posting, breaking the email body. `stripSlackMentions` defensively strips Slack-style `<@U…>`, `<#C…>` and `<https://…|label>` formatting anyway
- **Gmail forward self-loop guard** — `forwardToPersonalInbox` compares the inbound sender's bare email (lowercased via `extractEmailAddress(from)`) against every `SUPPORT_FORWARD_TO_EMAIL` target and SKIPS the matching one(s). Without this, an operator emailing support@ from a mailbox that's ALSO a forward target sees their own test boomerang back on every cycle. Per-recipient skip (not all-or-nothing): multi-target `a@x,b@y` still forwards to the non-matching addresses. `forwardedTo` in the audit log reflects only addresses that actually received a forward — null when everything was skipped
- **Inline `📎 *Attachments:*` line in Slack posts** — both `postEmailToSlack` (inbound) and `postContactFormToSlack` (contact form) render an attachment summary as a header line above the body. The files still upload via `uploadAttachmentsToSlack` (thread reply under the bot post), but cust-* channels collapse threads by default — without the inline indicator, ops misses attachments entirely. Shared helper `formatAttachmentList({ filename, size })` in `src/lib/email/attachments.ts` (with `formatBytes` for `<KB|KB|MB` rendering)
- **Outbound `/reply` renders the branded `SupportReplyEmail` template** — `sendOutboundReplyToCustomer` + `sendOutboundReplyToMirror` BOTH attach the rendered HTML AND a plain-text version with `PLAIN_TEXT_SIGNATURE` appended. Mirror gets the same HTML+text as the customer so ops's Sent-folder copy looks identical to what the customer received. The template splits agent text on `\n\n` for paragraphs and `\n` for `<br>` inside a paragraph. Brand name uses `{`${BRAND_NAME} Support`}` (template literal, not adjacent JSX) so React emits one text node — adjacent text nodes get `<!-- -->` comments injected, which breaks both visual rendering in some clients and string-greppability in tests

## Existing fixtures

8 real PostHog payloads under `src/__tests__/fixtures/email/` — see `README.md` there for the full table. Highlights:
- `inbound-contact-form-with-body.json` — canonical inbound shape (full body + html, complete RFC-5322 headers, `routing.kind: "matched"` via reply_to fallback)
- `inbound-self-domain-{shape,with-replyto-shape}.json` — own-domain `from` with empty vs populated `reply_to[]` (negative cases)
- `outbound-forward-shape.json` — Gmail mirror outbound
- `slack-event-{bot-message-test5,bot-message-test6-with-body,bot-message-contact-form,channel-join}.json` — 4 Slack `event_callback` variants for outbound-flow ignore-bot/ignore-join logic

Reach for the existing fixture before sending another live email.

## Capturing a new fixture from production logs

When a real support email lands and you want to lock it in as a regression test:

1. **Flip the env flag** — `CAPTURE_EMAIL_BODIES=1` in Vercel (production) before the email arrives. Default is off so steady-state ops never log customer-pasted PII or one-time auth tokens. Use `printf '%s' '1' | vercel env add CAPTURE_EMAIL_BODIES production` (no trailing newline; do NOT use `--sensitive` — that makes `vercel env pull` return empty values which broke a debug session). **Then trigger a redeploy** — Vercel does NOT apply env-var changes to running deployments; the next prod build picks them up. Skip the redeploy and `capturedBodies` stays `false` even after the env shows the var. **Turn it back off (`vercel env rm`) the moment you've captured what you need.**
2. **Inbound webhook**: PostHog Logs → search `capture: inbound_email`. The `context` payload contains the parsed Resend webhook (`webhook`), the `getReceivedEmail` response (`received` — `message_id`, threading-relevant headers, body/html, body lengths), an attachment list (metadata only — no bytes), and the routing outcome (`routing.kind` / `channelId` / `slackMessageTs` / `forwardedTo`). With the flag off, `text`/`html` are `null` and `headers` is narrowed to threading-relevant keys (`message-id`, `in-reply-to`, `references`, `subject`, `from`, `to`, `cc`, `date`, `auto-submitted`, `precedence`). With the flag on, full body + full headers are logged. Copy the `context` into `src/__tests__/fixtures/email/<scenario>.inbound.json`.
3. **Outbound send**: search `capture: outbound_email`. `context.kind` tells you which transactional path fired (`inbound_forward` for Gmail mirror, `outbound_reply` for `/reply` agent replies). Body capture requires BOTH the env flag AND a body-safe kind (`inbound_forward` or `outbound_reply`). Auth-token kinds (`verification`, `password_reset`, `invitation`) and signed-URL kinds (`package_ready`, `package_failed`) capture shape only — never bodies — even with the flag on. Resend's message id (`resendId`) is always captured for cross-system tracing.
4. **Slack event**: search `capture: slack_event`. The full `event_callback` envelope (`event_id`, `team_id`, inner `event` with `thread_ts`/`text`/`bot_id`) is captured every time Slack POSTs to `/api/slack/events`. Not gated on `CAPTURE_EMAIL_BODIES` — Slack message text is the workflow surface, not paste-area for customer secrets. Slash command POSTs to `/api/slack/commands` are not captured here yet (add `captureSlackCommand` if a regression case shows up).
5. **Body cap**: text and HTML bodies are truncated at 50 KB with a `…[truncated N chars]` marker. Tests don't need full bodies; if you do, raise `BODY_MAX_LENGTH` in `capture.ts` for the next email.

## Testing Notes

- **Integration tests** (`src/__tests__/integration/`) use real PGLite + real repositories. Only externals are mocked: `fetch` to `slack.com/api`, the Resend SDK methods, `@/lib/auth` session extraction
- **HTTP-level webhook tests** mock `@/services/inboundEmail.service` — the route's job is verify + parse + delegate, not the orchestration
- **Verifier tests** (`*.test.ts` co-located in `src/lib/server/signatures/`) sign requests with `node:crypto` and assert the verifier accepts/rejects. They cover: valid sig, tampered body, wrong secret, stale ts (>5 min back), future ts (>5 min ahead), missing headers, wrong scheme prefix, non-numeric ts, length-mismatch (catches the `timingSafeEqual` throw bug)
- **DTO tests** (`*.dto.test.ts`) only assert on `safeParse` results — happy path, per-required-field failure, passthrough behavior for unknown event types
- **Services with side effects** (`customerSlackChannel.service.integration.test.ts`, `inboundEmail.service.integration.test.ts`, `outboundEmail.service.integration.test.ts`) cover create/reuse/unarchive paths, invite-failure-is-best-effort, known-sender → cust channel vs unknown → unmatched, opt-in Gmail forward, autoreply blocked → unmatched only, metadata attached on bot's chat.postMessage, References chain accumulated, outbound happy path 2× Resend send + in_channel response_url echo, non-cust channel → IGNORED ephemeral, no metadata in history → ephemeral error, Resend failure → ephemeral ❌, multi-agent simultaneous /reply → N sends no dedup
- **Threading helper unit tests** (`src/lib/email/threading.test.ts`, 19 cases) cover the 4 pure RFC-mail helpers shared across services: `buildReplySubject` (Re: prefix preservation), `buildReplyHeaders` (RFC-5322 chain accumulation), `pickReferencesHeader` (case-insensitive header pickup), `isAutoReply` (Auto-Submitted/Precedence/X-Autorespond detection)
- **Outbound Slack-helper unit tests** (`outboundEmail.service.utils.test.ts`, 13 cases) cover the Slack-domain helpers: `extractInboundMetadata` (from `metadata.event_type === "inbound_email"` Slack messages) and `stripSlackMentions` (`<@U…>`, `<#C…>`, `<https://…|label>`, `<https://…>`, HTML entities)
