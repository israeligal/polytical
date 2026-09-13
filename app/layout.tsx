import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Secular_One, Heebo, Rubik } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { THEME_COOKIE, resolveTheme, type Theme } from "@/lib/theme";
import { ServiceWorkerRegistration } from "@/components/pwa/sw-register";
import { PwaInstall } from "@/components/pwa/pwa-install";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationJsonLd, webApplicationJsonLd } from "./site-jsonld";
import { SITE_URL, SITE_NAME, SITE_TAGLINE } from "@/lib/seo/site";

// Display — Secular One: heavy Hebrew display face for headlines + big odds.
const secularOne = Secular_One({
  subsets: ["hebrew", "latin"],
  weight: "400",
  variable: "--font-secular-one",
});

// Sans — clean Hebrew UI/data font for body, labels, numbers.
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
});

// Accent — Rubik: chips, badges, faction tags.
const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  variable: "--font-rubik",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} · ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "תנו מנדט על הפוליטיקה הישראלית: בחרו תוצאה בכל תחזית, עקבו אחרי כמה צדקתם, ובדקו איזה חבר כנסת מצביע כמוכם במליאה. חינם, בלי כסף אמיתי.",
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: "זירת תחזיות חינמית על הפוליטיקה הישראלית. בחרו תוצאה, צברו דיוק, עקבו אחרי הצבעות הכנסת.",
    locale: "he_IL",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: "זירת תחזיות חינמית על הפוליטיקה הישראלית. בחרו תוצאה, צברו דיוק, עקבו אחרי הצבעות הכנסת.",
    images: ["/icons/icon-512.png"],
  },
  // Installed-app look on iOS (without this, Add-to-Home-Screen renders in Safari chrome).
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "פוליטיקל",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/icons/favicon-32.png",
  },
};

export const viewport: Viewport = {
  // Dark is the default canvas; the browser chrome matches the trading floor.
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // iOS notch / safe-area handling
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the persisted theme server-side so the correct palette is in the first
  // paint — no flash. Default is dark; only an explicit "light" cookie opts out.
  const theme: Theme = resolveTheme({ cookieValue: (await cookies()).get(THEME_COOKIE)?.value });
  return (
    <html
      lang="he"
      dir="rtl"
      data-theme={theme}
      className={`${secularOne.variable} ${heebo.variable} ${rubik.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <SiteHeader />
        {children}
        <ServiceWorkerRegistration />
        <PwaInstall />
        <JsonLd payload={organizationJsonLd} />
        <JsonLd payload={webApplicationJsonLd} />
      </body>
    </html>
  );
}
