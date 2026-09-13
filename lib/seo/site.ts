// Single source of truth for site-wide SEO constants. Every JSON-LD module,
// sitemap, robots and metadata block imports from here so the canonical origin
// and brand identity can never drift across surfaces.

export const SITE_URL = "https://www.polytical.co.il";
export const SITE_NAME = "פוליטיקל";
export const SITE_TAGLINE = "זירת התחזיות של הפוליטיקה הישראלית";
export const SITE_CONTACT_EMAIL = "contact@polytical.co.il";

// Absolute URL for a path. Pass a leading-slash path; "/" returns the origin.
export function absUrl(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

export const SITE_AUTHOR = {
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
} as const;

export const SITE_PUBLISHER = {
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: { "@type": "ImageObject", url: absUrl("/icons/icon-512.png") },
} as const;
