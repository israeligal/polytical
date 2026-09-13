# Decision Log — LLM-SEO / marketing pages

> Newest on top. Entries are immutable historical records: supersede, don't edit.
> Feature skill: `.claude/skills/seo/SKILL.md` · build spec: `docs/prompts/marketing-page-agent.md` · generic method: global `llm-seo` skill.

---

## 2026-09-14 — Marketing/guide layer built (foundation + 11 pages)

Polytical had no SEO surface (no robots, sitemap, llms.txt, JSON-LD, or marketing pages). Added a Hebrew, RTL, money-free, Knesset-sourced content layer designed to be cited by AI assistants.

**Scope.** `/about` pillar + 9 `/guides/*` pages + `/site-index`, plus `app/robots.ts`, `app/sitemap.ts`, `public/llms.txt`, Organization + WebApplication JSON-LD in the root layout, and root `metadataBase` + title template + default OG/Twitter/canonical.

**Decisions + why:**
- **Route base `/guides/<slug>` + top-level `/about`.** Latin slugs match the app's existing routes (`/markets`, `/votes`) and give clean canonicals. Hebrew slugs were rejected (percent-encoded URLs, inconsistent with the app).
- **`lib/seo/related-pages.ts` `PAGES` is the single source of truth** for every page's title/href/summary. A page's `metadata.title` must equal `PAGES[slug].title` verbatim; `/site-index`, `llms.txt`, and `<RelatedPages>` all derive from `PAGES`, so titles/links can't drift.
- **JSON-LD triple (Article + FAQPage + BreadcrumbList) per page, with `"@type"` + `dateModified` kept as LITERAL text in the sibling `*-jsonld.ts`.** The `llm-seo` audit greps the file source, not the render, so a DRY builder that hides those tokens fails it. Breadcrumb via the `buildBreadcrumbJsonLd` helper is allowed (the audit accepts it).
- **FAQ declared once as `FaqItem[]` in the sibling**, shared by the FAQPage `mainEntity` and the visible `<Faq>` — schema and copy can never diverge.
- **`<KeyTakeaways title="עיקרי הדברים">` takes the heading as a required prop** so the audited token is literal in each `page.tsx`, not hidden in the component.
- **No em-dashes in any user-facing text** (personal rule 4), enforced by the `sound-human-lint` + audit greps; titles use `·`/colon.
- **OG image is a root fallback to `/icons/icon-512.png` (square).** A dedicated 1200×630 image is deferred: a Hebrew dynamic `opengraph-image.tsx` needs a bundled Hebrew TTF (next/og's default font is Latin-only). Follow-up.
- **`elections-2026` page added (timely) under a hard no-invention rule:** never assert an election date, turnout, seat count, or winner; Polytical publishes no forecast of its own (crowd split = participant count); dates/results come from official sources only.
- **Content-vs-legal:** `is-it-free` + `about` claims are aligned to `/terms` + `/privacy` (play-money, ages 13+, cards have no monetary value, no data sold).

**Build method (orchestrated subagents, per the `subagent-prompting` skill):** the orchestrator built all shared infra + the `/about` pilot, then dispatched one page per subagent in waves, each gated by the orchestrator on `tsc` + `audit-page.sh` + `sound-human-lint.sh`; `PAGES` and the build spec were frozen during each dispatch. Run artifacts under `.subagent-runs/` (gitignored).

**Reskinned the `seo` skill.** It was a verbatim Green Card Genius carry-over (USCIS, English, em-dash titles, law-firm rules) that contradicted Polytical. Rewritten to point at the built infra with Polytical invariants; the generic GEO method stays in the global `llm-seo` skill (`PROVENANCE.md` updated).
