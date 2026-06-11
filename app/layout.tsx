import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Secular_One, Heebo, Rubik } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { THEME_COOKIE, resolveTheme, type Theme } from "@/lib/theme";
import { ServiceWorkerRegistration } from "@/components/pwa/sw-register";
import { PwaInstall } from "@/components/pwa/pwa-install";

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
  title: "פוליטיקל — זירת התחזיות של הפוליטיקה הישראלית",
  description:
    "תנו מנדט על הפוליטיקה הישראלית — בחרו תוצאה בכל תחזית, עקבו אחרי כמה צדקתם, ואספו קלפי קריקטורה לפי דיוק המנדטים. בלי כסף — רק על הכבוד.",
  // Installed-app look on iOS (without this, Add-to-Home-Screen renders in Safari chrome).
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "פוליטיקל",
  },
  icons: {
    icon: [
      // Theme-aware SVG first (darker star on light chrome, bright on dark);
      // PNG/ico fallbacks carry the darkened palette.
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
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
      </body>
    </html>
  );
}
