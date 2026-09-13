---
name: seo
description: >
  Polytical's LLM-SEO / marketing layer — the /about pillar, /guides/* content pages, /site-index,
  robots, sitemap, llms.txt, and the shared JSON-LD + section-sandwich kit. Use when creating or
  editing a marketing/guide page (מדריך), page metadata, canonical/OpenGraph, structured data
  (Article/FAQPage/BreadcrumbList/Organization/WebApplication), robots.ts, sitemap.ts, public/llms.txt,
  internal linking, or when asking how Polytical pages get cited by ChatGPT/Perplexity/Gemini/Claude.
  Hebrew, RTL, no real money, Knesset-sourced. For the generic GEO method + audit scripts, load the
  global `llm-seo` skill.
---

# Polytical — LLM-SEO & marketing pages

Content pages built to be **cited by AI assistants** when Israelis ask about Israeli politics / prediction games in Hebrew. This skill is Polytical-specific plumbing; the generic method (fan-out queries, page archetype, audit scripts) lives in the **global `llm-seo` skill** (`/Users/gal/.claude/skills/llm-seo`, scripts under `scripts/`). Build spec for one page: `docs/prompts/marketing-page-agent.md`. Why: `docs/decisions/llm-seo.md`.

## File Map

| Layer | Path | Purpose |
|---|---|---|
| Constants | `lib/seo/site.ts` | `SITE_URL` (polytical.co.il), brand strings, `absUrl`, `SITE_AUTHOR`/`SITE_PUBLISHER` |
| Source of truth | `lib/seo/related-pages.ts` | `PAGES` (every page's title/href/summary), `RELATED`, `TOPICS`. Titles here are authoritative |
| JSON-LD helpers | `lib/seo/breadcrumb-jsonld.ts`, `lib/seo/faq.ts` | `buildBreadcrumbJsonLd`, `FaqItem` type |
| Kit | `components/seo/marketing.tsx` | Section-sandwich components (MarketingMain, Hero, AtAGlance, Section, Bullets, KeyTakeaways, Faq) |
| Kit | `components/seo/{json-ld,related-pages,cta-section}.tsx` | `<JsonLd>` wrapper, `<RelatedPages>`, `<CtaSection>` |
| Site schemas | `app/site-jsonld.ts` + `app/layout.tsx` | Organization + WebApplication JSON-LD; `metadataBase` + title template + default OG/Twitter/canonical |
| Crawl | `app/robots.ts`, `app/sitemap.ts`, `public/llms.txt` | 10 AI bots; sitemap from `PAGES` + app routes; curated llms.txt overview |
| Pillar (template) | `app/about/page.tsx` + `app/about/about-jsonld.ts` | Copy this shape for every guide |
| Guides | `app/guides/<slug>/page.tsx` + `<slug>-jsonld.ts` | One folder per page; slugs listed in `PAGES` |
| Discovery | `app/site-index/page.tsx` | Human/crawler index, rendered from `PAGES`/`TOPICS` |

## Invariants (Polytical-specific — these override the generic skill's examples)

- **No real money, ever.** The coin economy was removed (`docs/decisions/no-coins.md`). Never write copy about coins, stakes, deposits, cash prizes, betting-with-money, or odds-as-probability. The only score is accuracy (מאזן דיוק); a crowd split is a headcount, not a pool. Legal framing = play-money game, not financial or political advice — must stay consistent with `/terms` + `/privacy` (content-vs-legal rule).
- **No em-dashes (—) in any user-facing text** (personal rule 4). Titles, meta, body. Use comma / colon / period / parentheses. The audit + `sound-human-lint.sh` grep for them.
- **Hebrew, RTL.** Logical Tailwind props only (`ms`/`me`/`ps`/`pe`/`text-start`), design tokens only (see `app/globals.css`), no hex, no `ml/mr/left/right`. Times in Asia/Jerusalem (`time-and-timezone` skill).
- **`PAGES` is the single source of truth.** A page's `metadata.title` MUST equal `PAGES[slug].title` verbatim; `/site-index`, `llms.txt`, and `<RelatedPages>` all read `PAGES` so titles/links can't drift. Adding a page = add to `PAGES`/`RELATED`/`TOPICS` + `llms.txt` first.
- **JSON-LD triple per page** in the sibling `*-jsonld.ts`: Article + FAQPage + BreadcrumbList. Keep `"@type": "Article"`, `"@type": "FAQPage"`, and `dateModified` as **literal text in that file** (the audit greps the file, not the render); breadcrumb via `buildBreadcrumbJsonLd`. The FAQ array is declared once and shared by the FAQPage `mainEntity` and the visible `<Faq>`.
- **Section-sandwich order** is the contract — see `docs/prompts/marketing-page-agent.md` and `app/about/page.tsx`. `<KeyTakeaways>` needs `title="עיקרי הדברים"` so the audited token is literal in each `page.tsx`.
- **Sourced to X.** The Knesset is the canonical authority. Vote facts / market resolutions cite the official source and are attributed by stable id, never fuzzy name (mirrors the data-integrity rule + `knesset-votes` skill). A missing fact shows "לא נמצא", never a guess.
- **Never show `users.name`** — public identity is `@handle` only (see `AGENTS.md`).

## Add a page

Follow `docs/prompts/marketing-page-agent.md` end to end. In short: wire the slug into `PAGES`/`RELATED`/`TOPICS` + `llms.txt`, then create `app/guides/<slug>/page.tsx` + `<slug>-jsonld.ts` by copying `app/about/`. Gate before finishing: `npx tsc --noEmit`, `pnpm lint`, and from the global skill `bash scripts/audit-page.sh <page>` (RESULT: PASS) + `bash scripts/sound-human-lint.sh <page>` (0 em-dashes). Bump `dateModified` + the sitemap entry when content changes.

## Gotchas

- **OG image is a fallback.** Root metadata points OG/Twitter at `/icons/icon-512.png` (square). A dedicated 1200×630 image is a TODO — a Hebrew dynamic `opengraph-image.tsx` needs a bundled Hebrew TTF (next/og's default font is Latin-only).
- **The old `seo` skill was a Green Card Genius carry-over** (USCIS, English, em-dash titles, law-firm rules). This file replaces it; ignore any cached GCG SEO guidance.
