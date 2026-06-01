---
name: seo
description: >
  Use this skill when creating or editing any page, component, guide, blog post, or content for the
  Green Card Genius website. Apply these rules whenever generating HTML, metadata, structured data,
  headings, images, FAQs, or any user-facing content. Also apply when configuring Next.js routes,
  sitemaps, robots.txt, or OpenGraph images.
---

# Green Card Genius — SEO & AI Discoverability Skill

**Project:** Green Card Genius (GCG) — a Next.js/React app helping couples navigate the marriage-based green card process (I-130, I-130A, I-485, I-864, DS-260, consular processing, adjustment of status).

**This is NOT a law firm.** GCG is an educational technology product. All content rules below reflect this.

---

## 1. Meta Tags

### Meta Titles
- **50-60 characters max** (Google truncates at ~600px width)
- **Keyword-first**: Place the primary keyword in the first half of the title
- **Pattern**: `{Primary Keyword} — {Benefit/Qualifier} | Green Card Genius`
- Examples:
  - `I-130 Petition Guide — Step-by-Step Instructions | Green Card Genius` (58 chars)
  - `Marriage Green Card Timeline (2026) | Green Card Genius` (54 chars)
  - `Form I-485 Checklist — Documents You Need | Green Card Genius` (60 chars)

### Meta Descriptions
- **150-160 characters max** (920px on desktop)
- Put the core value proposition in the **first 100 characters**
- Include a CTA or benefit statement
- Every page gets a **unique** description
- Example: `Learn exactly which documents you need for Form I-485. Our step-by-step checklist covers evidence, photos, fees, and common mistakes to avoid.` (143 chars)

### Implementation (Next.js App Router)

```typescript
// Static metadata
export const metadata: Metadata = {
  title: 'I-130 Petition Guide — Step-by-Step Instructions | Green Card Genius',
  description: 'Learn how to file Form I-130...',
}

// Dynamic metadata
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const guide = await getGuide(slug)
  return {
    title: `${guide.title} | Green Card Genius`,
    description: guide.metaDescription,
    alternates: { canonical: `https://greencardgenius.com/guides/${slug}` },
  }
}
```

### Title Template (Root Layout)

```typescript
export const metadata: Metadata = {
  metadataBase: new URL('https://greencardgenius.com'),
  title: {
    template: '%s | Green Card Genius',
    default: 'Green Card Genius — Marriage Green Card Made Simple',
  },
}
```

---

## 2. Heading Hierarchy

- **Exactly 1 H1 per page** — must include the primary keyword naturally
- **H2s** = major sections. Each H2 covers one distinct aspect of the topic
- **H3s** = sub-points within an H2 section
- **Never skip levels** (no H1 → H3)
- **Use question-format headings** for featured snippets and AI extraction:
  - `## How Long Does the I-130 Take to Process?` (not "Processing Times")
  - `## What Documents Do I Need for Form I-485?` (not "Required Documents")
  - `## How Much Does a Marriage Green Card Cost?` (not "Fees")

---

## 3. Content Structure (for Google + LLMs)

Every content page must follow these formatting rules to maximize both Google featured snippets and LLM citation:

### Answer-First Format
- Lead every section with a **40-60 word direct answer** immediately after the heading
- Then expand with supporting detail, lists, and evidence
- **44.2% of LLM citations come from the first 30% of a page** — front-load answers

### Self-Contained Paragraphs
- Each paragraph = a **modular "answer block"** that makes sense extracted in isolation
- LLMs chunk pages into 80-200 token blocks — write for this
- No unclear pronouns — define entities explicitly
- No "as mentioned above" references — each block must stand alone

### Citation-Ready Patterns
Use these high-citation formats throughout:

| Format | Why It Works |
|---|---|
| `There are X steps to [process]` + numbered list | LLMs love definitive step counts |
| `[Form] typically costs between $X and $Y` | Highly cited for commercial queries |
| `According to USCIS, [fact]` | Statistics with attribution = 40% higher citation rate |
| `[Term] is [definition]` | Definitional pattern = most extracted format |
| Comparison tables with `<table>` HTML | 47% higher AI citation rate |
| Listicle format | Accounts for 50% of top AI citations |

### Specific Formatting Rules
- Use **bullet points** for concepts, **numbered lists** for sequences
- Use **HTML tables** for comparisons (not markdown in rendered content)
- Include **specific numbers, dates, and statistics** — quantitative claims get 40% higher citation rates than qualitative
- Keep paragraphs to **2-4 sentences**
- Every guide should include at least one comparison table

---

## 4. Schema.org Structured Data (JSON-LD)

### Reusable Component

```typescript
// components/json-ld.tsx
import { Thing, WithContext } from 'schema-dts'

export function JsonLd<T extends Thing>({ data }: { data: WithContext<T> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  )
}
```

### Required Schema by Page Type

**Every page**: `BreadcrumbList`

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://greencardgenius.com/" },
    { "@type": "ListItem", "position": 2, "name": "Guides", "item": "https://greencardgenius.com/guides/" },
    { "@type": "ListItem", "position": 3, "name": "I-130 Guide" }
  ]
}
```

**Homepage / About**: `ProfessionalService` (NOT `LegalService` — GCG is not a law firm)

```json
{
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  "name": "Green Card Genius",
  "url": "https://greencardgenius.com",
  "description": "Green Card Genius is an online immigration technology service that helps couples navigate the marriage-based green card process",
  "serviceType": ["Immigration Application Assistance", "Form Preparation"],
  "areaServed": { "@type": "Country", "name": "United States" }
}
```

**Guide / Article pages**: `Article` with author and dates

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "How to File Form I-130: Step-by-Step Guide (2026)",
  "datePublished": "2026-01-15",
  "dateModified": "2026-02-10",
  "author": { "@type": "Organization", "name": "Green Card Genius" },
  "publisher": { "@type": "Organization", "name": "Green Card Genius" }
}
```

**FAQ sections**: `FAQPage` — still worth implementing. FAQ schema makes content **2.7x more likely to be cited by LLMs** even though Google no longer shows FAQ rich results for non-government sites.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How long does the I-130 take to process?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "As of February 2026, USCIS processing times for Form I-130 range from 12 to 23 months for immediate relatives of U.S. citizens."
      }
    }
  ]
}
```

**DO NOT use**: `HowTo` schema (fully deprecated by Google in 2024).

### Schema Validation
- Always validate with Google's Rich Results Test before shipping
- `dateModified` is the strongest freshness signal — update it on every content revision

---

## 5. Internal Linking Strategy

### Hub-and-Spoke Architecture
- **Pillar page**: "Marriage-Based Green Card" (~2,500-3,000 words) links to 6-8 cluster pages
- **Cluster pages**: Each form (I-130, I-485, I-864, etc.), each step, each edge case
- **Every cluster links back** to the pillar page
- **Related clusters link laterally** to each other (e.g., I-130 guide links to I-485 guide)

### Rules
- Every page needs **3-10 contextual internal links** in body content
- Every page should have **at least 2-3 other pages pointing to it**
- Anchor text: **2-5 words**, descriptive, varied (don't use the same exact anchor everywhere)
- Balance exact-match, partial-match, and natural anchors
- No more than **10 links in a single paragraph**

### Recommended URL Structure

```
/                                    (homepage)
/guides/                             (pillar index)
/guides/marriage-green-card          (pillar page)
/guides/i-130-petition               (cluster)
/guides/i-485-adjustment-of-status   (cluster)
/guides/i-864-affidavit-of-support   (cluster)
/guides/ds-260-immigrant-visa        (cluster)
/guides/consular-processing          (cluster)
/guides/green-card-interview         (cluster)
/forms/                              (forms index)
/forms/i-130                         (form-specific page)
/faq/                                (FAQ index)
/faq/costs-and-fees                  (topic FAQ)
/blog/                               (blog index)
/blog/[slug]                         (blog post)
```

- **Lowercase, hyphen-separated**
- **2-3 folder levels max**
- **No trailing slashes** (Next.js default) — enforce consistently in links, sitemaps, and canonicals

---

## 6. Image Optimization

### Alt Text
- **5-15 words**, under **125 characters**
- Describe the image content + context — include keywords only if they genuinely describe what's shown
- Decorative images: `alt=""`
- Example: `alt="Couple reviewing Form I-130 petition documents together"` (not `alt="green card form"`)

### next/image Usage

```tsx
// Hero / LCP image — use preload (Next.js 16+) or priority (15)
<Image src="/hero.jpg" alt="..." width={1200} height={600} preload quality={85} />

// Content image — lazy loaded by default
<Image src="/form-sample.jpg" alt="..." width={800} height={500} quality={75} />

// Responsive fill image
<Image src={src} alt="..." fill sizes="(max-width: 768px) 100vw, 50vw" />
```

### Rules
- **One `preload` / `priority` image per page** — the LCP candidate (hero)
- Always specify `width` + `height` or use `fill` (prevents CLS)
- Use `sizes` with `fill` to avoid oversized downloads on mobile
- Target **< 200KB** per image, **1,280-1,920px** width
- Configure AVIF + WebP in `next.config.js`:

```javascript
images: {
  formats: ['image/avif', 'image/webp'],
  qualities: [25, 50, 75, 85],
}
```

---

## 7. Open Graph & Twitter Cards

### Required on Every Page

```typescript
openGraph: {
  title: 'Page Title',
  description: 'Page description (100-200 chars)',
  url: 'https://greencardgenius.com/guides/i-130',
  siteName: 'Green Card Genius',
  images: [{ url: '/og/i-130-guide.png', width: 1200, height: 630 }],
  locale: 'en_US',
  type: 'article',  // or 'website' for non-article pages
},
twitter: {
  card: 'summary_large_image',
},
```

### Image Requirements
- **1200x630px** minimum (1.91:1 ratio)
- **Under 5MB** file size
- **Absolute URLs** only (relative paths break on social shares)

### Dynamic OG Images

Use `opengraph-image.tsx` file convention for auto-generated images per route:

```typescript
// app/guides/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const guide = await getGuide(slug)
  return new ImageResponse(
    <div style={{ /* ... */ }}>{guide.title}</div>,
    { ...size }
  )
}
```

---

## 8. Canonical URLs

- **Self-referential canonical on every page** — even pages with no duplicates
- **One canonical per page** — multiple canonicals causes Google to ignore all of them
- **Full absolute URLs**: `https://greencardgenius.com/guides/i-130` (not relative)
- Must match your trailing-slash convention (no trailing slash)

```typescript
alternates: {
  canonical: 'https://greencardgenius.com/guides/i-130-petition',
},
```

---

## 9. Sitemap & robots.txt

### Sitemap (Built-in Next.js)

```typescript
// app/sitemap.ts
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const guides = await getAllGuides()

  return [
    { url: 'https://greencardgenius.com', lastModified: new Date(), priority: 1 },
    { url: 'https://greencardgenius.com/guides', lastModified: new Date(), priority: 0.9 },
    ...guides.map((g) => ({
      url: `https://greencardgenius.com/guides/${g.slug}`,
      lastModified: new Date(g.updatedAt),
      priority: 0.8,
    })),
  ]
}
```

### robots.txt — Allow All AI Crawlers

```typescript
// app/robots.ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/'] },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'OAI-SearchBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Claude-SearchBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
      { userAgent: 'Amazonbot', allow: '/' },
      { userAgent: 'Applebot-Extended', allow: '/' },
    ],
    sitemap: 'https://greencardgenius.com/sitemap.xml',
  }
}
```

---

## 10. LLM / AI Discoverability (GEO)

### Semantic HTML Structure
Every content page must use proper semantic elements:

```html
<main>
  <article>
    <header>
      <h1>...</h1>
      <p>Last updated: February 2026</p>
    </header>
    <section>
      <h2>...</h2>
      <p>Answer-first paragraph (40-60 words)...</p>
    </section>
    <section>
      <h2>Frequently Asked Questions</h2>
      <!-- FAQ section -->
    </section>
    <footer>
      <p>Disclaimer...</p>
    </footer>
  </article>
</main>
```

### Entity Definition
The homepage and About page must clearly state what GCG is in the first paragraph:

> Green Card Genius is an online immigration technology service that helps couples navigate the marriage-based green card process. It provides step-by-step guidance for USCIS forms including I-130, I-485, I-864, and DS-260, covering both adjustment of status and consular processing.

### Content Freshness Signals (Critical for LLM Citation)
- Display **"Last updated: [Month Year]"** on every guide — this is one of the strongest AI freshness signals
- Use **`dateModified`** in Article schema on every content update
- Include **"As of [Month Year]"** in body text when citing processing times, fees, or statistics
- Reference the **current year** in content naturally (e.g., "In 2026, the I-130 filing fee is...")
- 65% of AI crawler hits target content less than 1 year old — stale content gets ignored

### FAQ Sections for AI
- Write questions as people actually ask AI: `How much does a marriage green card cost?` (not "Pricing Overview")
- Lead each answer with a **complete, self-contained 40-60 word response**
- Include **specific numbers and dates** in answers
- One clear answer per question — no hedging or multi-option answers
- Implement FAQPage schema on all FAQ sections

### Citation-Boosting Techniques (Princeton GEO Paper)
The top three techniques that improve LLM citation rates by 30-40%:

1. **Add source citations**: "According to USCIS.gov, the filing fee for Form I-130 is $625 as of 2026."
2. **Add statistics**: "Approximately 300,000 marriage-based green cards are issued annually."
3. **Add expert quotes**: Quote from official USCIS guidance or policy memos.

### Server-Side Rendering Is Mandatory
- Most AI crawlers **do NOT execute JavaScript**
- All content must be in the initial HTML response — no client-side-only rendering for content pages
- Use SSG (`generateStaticParams`) for all guides, forms, FAQs, and blog posts
- Reserve SSR/dynamic rendering for authenticated pages only

---

## 11. Legal Compliance for Content

**GCG is NOT a law firm.** Every page must follow these rules:

### Required Disclaimer
Every guide, form page, FAQ, and blog post must include this disclaimer (or equivalent) in a visible footer or sidebar:

> This information is provided for educational purposes only and does not constitute legal advice. Green Card Genius is not a law firm and does not provide legal representation. For legal advice specific to your situation, consult a licensed immigration attorney. Information is current as of [Month Year] but immigration law changes frequently — always verify with official USCIS sources.

### Language Rules
| DO | DON'T |
|---|---|
| "Applicants typically file..." | "We recommend you file..." |
| "If approved, you can expect..." | "You will get approved..." |
| "USCIS generally requires..." | "You need to..." (implies legal advice) |
| "Processing times are currently..." | "Your case will take..." |
| "Many couples choose to..." | "You should..." (prescriptive) |
| "According to USCIS.gov..." | Unsourced claims about legal requirements |

### Sourcing Rules
- **Every factual claim** about immigration law, fees, processing times, or requirements must be attributable to an official source (USCIS.gov, travel.state.gov, Federal Register)
- Include source links in content where practical
- Never guarantee outcomes
- Never imply attorney-client relationship
- Never use the word "guarantee" in any context related to immigration outcomes

### Freshness Rules
- Every content page must display a **"Last updated: [Month Year]"** date
- When citing USCIS fees or processing times, include the phrase **"as of [Month Year]"**
- Review and update all content with USCIS data changes (fees, processing times, policy updates)

---

## 12. Core Web Vitals

| Metric | Target | How to Hit It |
|---|---|---|
| **LCP** | ≤ 2.5s | SSG for content pages, `preload` on hero image, `next/font` |
| **INP** | ≤ 200ms | React Server Components, minimize client JS, `next/dynamic` for heavy components |
| **CLS** | ≤ 0.1 | `width`/`height` on all images, `next/font` with `display: 'swap'`, no injected ads/banners |

### Key Next.js Optimizations
- Use `next/font` with `display: 'swap'` and `variable` for zero-CLS font loading
- Use `next/dynamic` with `ssr: false` for heavy below-fold components (maps, charts) — **never** for SEO content
- Use `generateStaticParams` for all content routes
- Use ISR (`revalidate: 3600`) for content that changes periodically (processing times)

---

## 13. Accessibility (WCAG 2.2 / SEO Impact)

Accessible sites get **23% more organic traffic** and rank for **27% more keywords**. Google's September 2025 update made accessibility a direct ranking factor.

### Minimum Requirements
- **Color contrast**: 4.5:1 for normal text, 3:1 for large text (18px+)
- **Touch targets**: 44x44px minimum for buttons and links
- **Focus indicators**: Visible focus rings on all interactive elements
- **Keyboard navigation**: All interactive elements reachable via Tab
- **Alt text**: On all meaningful images (see Section 6)
- **Heading hierarchy**: Proper H1-H6 structure (see Section 2)
- **ARIA labels**: On interactive elements without visible text
- **Skip navigation link**: For screen reader users
- **Form labels**: Every input must have an associated `<label>`

---

## Pre-Delivery Checklist

Before shipping any page or content, verify:

### Meta & Structure
- [ ] Meta title is 50-60 characters, keyword-first
- [ ] Meta description is 150-160 characters, unique, includes CTA
- [ ] Exactly 1 H1 per page containing the primary keyword
- [ ] H2/H3 hierarchy is clean (no skipped levels)
- [ ] Self-referential canonical URL is set (absolute, no trailing slash)
- [ ] OpenGraph title, description, image (1200x630) are set
- [ ] Twitter card is set to `summary_large_image`

### Content Quality
- [ ] First paragraph provides a direct 40-60 word answer
- [ ] Each paragraph is self-contained (no "as mentioned above" references)
- [ ] Question-format headings used for key sections
- [ ] At least one comparison table or numbered list per guide
- [ ] Statistics and facts are attributed to official sources (USCIS.gov, etc.)
- [ ] "Last updated: [Month Year]" is displayed visibly
- [ ] "As of [Month Year]" is used with any fees, processing times, or statistics
- [ ] Content is server-side rendered (not client-only)

### Legal Compliance
- [ ] Educational disclaimer is present on the page
- [ ] No language implying legal advice or attorney-client relationship
- [ ] No outcome guarantees ("you will be approved")
- [ ] All factual claims sourced to official government sources

### Schema & Technical
- [ ] BreadcrumbList JSON-LD matches visible breadcrumb
- [ ] Article JSON-LD includes `datePublished` and `dateModified`
- [ ] FAQPage JSON-LD on any page with FAQ section
- [ ] JSON-LD validates in Google Rich Results Test
- [ ] 3-10 contextual internal links in body content
- [ ] All images have descriptive alt text (5-15 words)
- [ ] Hero image uses `preload` / `priority`; other images lazy-load
- [ ] Image files are < 200KB, served as AVIF/WebP

### Performance
- [ ] Page uses SSG or ISR (not SSR for content pages)
- [ ] Heavy components below fold use `next/dynamic`
- [ ] Fonts loaded via `next/font` with `display: 'swap'`
- [ ] Color contrast meets WCAG 4.5:1 minimum
- [ ] All interactive elements are keyboard-accessible
