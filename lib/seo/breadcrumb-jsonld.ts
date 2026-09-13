import { SITE_URL, absUrl } from "@/lib/seo/site";

type Crumb = { name: string; path: string };

// BreadcrumbList JSON-LD. Home is always position 1; callers pass the trail
// after Home.
export function buildBreadcrumbJsonLd({ trail }: { trail: Crumb[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "פוליטיקל", item: SITE_URL },
      ...trail.map((c, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: c.name,
        item: absUrl(c.path),
      })),
    ],
  } as const;
}
