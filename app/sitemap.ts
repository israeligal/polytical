import type { MetadataRoute } from "next";
import { absUrl } from "@/lib/seo/site";
import { PAGES, type PageSlug } from "@/lib/seo/related-pages";

// Bump-in-same-commit rule: when a marketing page's content changes, update its
// entry here (and its JSON-LD dateModified) so crawlers see the freshness.
const CONTENT_UPDATED = new Date("2026-09-14");

const priorityOf = (slug: PageSlug): number =>
  slug === "/about" ? 0.9 : slug === "/site-index" ? 0.5 : 0.8;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const marketing: MetadataRoute.Sitemap = (Object.keys(PAGES) as PageSlug[]).map((slug) => ({
    url: absUrl(PAGES[slug].href),
    lastModified: CONTENT_UPDATED,
    changeFrequency: "monthly",
    priority: priorityOf(slug),
  }));

  const app: MetadataRoute.Sitemap = [
    { url: absUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absUrl("/markets"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: absUrl("/politicians"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: absUrl("/votes"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: absUrl("/seasons"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];

  return [...app, ...marketing];
}
