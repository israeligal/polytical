# Skills provenance & adaptation notes

These skills were gathered from four sibling projects (`dirot`, `shift-manager-single`, `green-card-genius-marketing`, `green-card-genius-platform`) and copied **best-of-breed** (one copy of each, from the project with the strongest version). Polytical's stack: Next 16 · React 19 · Tailwind v4 · Neon Postgres · Drizzle · **Better Auth** · Vercel Blob · PWA · Hebrew RTL.

## Copied skills

| Skill | Source project | Status / what to reskin |
|---|---|---|
| `better-auth` | dirot | **Reference implementation** — dirot runs Better Auth + Drizzle + Neon on this exact Next 16 stack. Server config + client hooks + session + route protection + Drizzle schema. Swap dirot's `ALLOWED_EMAILS` invite gate for Polytical's open Google+email sign-up + starting-stack grant. |
| `tailwind-v4` | gcg-platform | Drop-in. Includes RTL logical-props guidance. |
| `zod-4` | shift-manager | Drop-in (most complete copy, ~795 lines). |
| `react-hook-form` | gcg-platform | Drop-in API patterns; the `Connected*`-field layer is GCG scaffolding — ignore. |
| `testing` | gcg-platform | Drop-in. PGlite in-memory Postgres fits Drizzle/Neon; ignore PDF-system project. |
| `integration-nextjs-app-router` | gcg-platform | PostHog App Router integration. **Only if PostHog is the analytics vendor** (PRD says "analytics events", vendor TBD). |
| `storybook-stories` | gcg-platform | Only if Polytical adopts Storybook. |
| `backend-architecture` | gcg-platform | High value. **Re-map `organizationId` org-scoping → Polytical user-scoping** (Polytical has no orgs). Auth wrapper already uses Better Auth — aligns with Polytical. |
| `nextjs-pwa` | gcg-platform | Drop-in (exact stack, Next16+Turbopack); iOS/WebKit OAuth-cookie gotcha already solved. |
| `analytics` | gcg-platform | Pattern ports; references RudderStack→PostHog + GA4. Swap to Polytical's chosen pipeline. |
| `observability-alerts` | gcg-platform | Pattern ports (Slack alerts, cron heartbeats, `/api/health`). Re-point vendor + channels. |
| `support-email` | gcg-platform | Use the transactional-email half (React Email templates); Slack inbound bridge optional. |
| `seo` | gcg-marketing | Drop-in. Swap the "not a law firm" legal section for Polytical's play-money/no-financial-advice disclaimer. |
| `time-and-timezone` | shift-manager | Concepts for Asia/Jerusalem; impl is date-fns + shift helpers + Prisma — adapt. |
| `government-data-sources` | dirot | **Template** — content is Israeli real-estate APIs. Keep the *structure* (source table, per-source `references/`, "naming traps"), reskin sources to Polytical's gov sites + curated newsletters. |
| `data-pipeline` | dirot | **Template** — keep the provenance pattern (`sourceUrl`/`fetchedAt` per row) + Neon batch limits; table list is real-estate. |

## Deliberately NOT copied — already available as global skills/commands
`react-best-practices`, `motion-for-react`, `frontend-design`, `design-system`, `brand-voice`, `llm-seo`, `stock-images`, `browser-qa`, `qa-session`, `code-review` (`/code-review`), `create-plan`, `verify`. Use the global versions instead of project-local copies.

## Deliberately NOT copied — domain-specific, but the MECHANIC is worth adapting
| Skill (source) | Pattern to lift into Polytical |
|---|---|
| `payment` (gcg-platform, Stripe) | Webhook-authoritative + idempotent + terminal-state machine + atomic DB → **the parimutuel coin ledger**. |
| `async-pdf-package` (gcg-platform) | Async job pkg: enqueue → cron worker w/ `FOR UPDATE SKIP LOCKED` lease → dedup → TTL → signed callback → **AI caricature generation + market resolution/settlement jobs**. |
| `questionnaire` (gcg-platform) | Multi-step form engine (debounced save, JSONB merge) → suggest-a-market / admin forms. |
| `local-page` / `form-question-page` (gcg-marketing) | Research → cache → synthesize → AI-tell grep-lint → multi-persona review-panel → wire-up **page factory** → Hebrew SEO/content pages. |

## Skipped entirely (not relevant)
Mastra/chat: `chat-conversation`, `hitl-tool-ui`, `traces`, `assistant-ui-agents`, `mastra-docs` · real-estate: `pinui-binui-analysis`, `property-analysis-qa`, `product-knowledge` · shift-domain: `swap-marketplace`, `feature-availability`, `reset-org`, `db-reset`/`db-seed` (Prisma) · GCG immigration: `uscis-agent`, `pathway-selection`, `pdf-form`, `pdf`, `xlsx`, `gcg-*`, multi-zone `routing` · `organization-membership` (Polytical has no orgs — but its Better Auth `admin`/role patterns inform `is_admin` gating) / `packages-core`.

## Guardrail hooks (documented, not installed)
The source repos use a `hookify` plugin (`.claude/hookify.*.md`). The most portable: `verify-before-stop`, `review-before-push`, `sync-claude-md`, `block-direct-date-imports`, `block-dynamic-imports`, `block-barrel-imports`, `block-find-unique` (reframe for Drizzle). They reference scripts/paths Polytical doesn't have yet (`pnpm typecheck`, `.husky/pre-push`, `@shift-manager/lib/time`) — adapt before enabling. Summarized in the root `CLAUDE.md`.
