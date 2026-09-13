import { SITE_URL, SITE_NAME, SITE_TAGLINE, SITE_CONTACT_EMAIL, absUrl } from "@/lib/seo/site";

// Site-wide schemas, embedded once in the root layout so every page carries
// them. Organization is the brand-identity anchor; WebApplication tells crawlers
// the game itself is the product (free, browser-based).

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  alternateName: "Polytical",
  url: SITE_URL,
  logo: absUrl("/icons/icon-512.png"),
  description:
    "פוליטיקל היא זירת תחזיות חינמית על הפוליטיקה הישראלית. משתמשים בוחרים תוצאה בכל שאלה, עוקבים אחרי מאזן הדיוק שלהם, וצופים בהצבעות מליאה אמיתיות של הכנסת. בלי כסף אמיתי.",
  email: SITE_CONTACT_EMAIL,
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: SITE_CONTACT_EMAIL,
      availableLanguage: ["Hebrew"],
    },
  ],
} as const;

export const webApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  alternateName: "Polytical",
  url: SITE_URL,
  description: `${SITE_TAGLINE}. משחק תחזיות חינמי, בלי כסף אמיתי.`,
  applicationCategory: "GameApplication",
  operatingSystem: "Web (any modern browser)",
  inLanguage: "he",
  isFamilyFriendly: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "ILS" },
  publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
} as const;
