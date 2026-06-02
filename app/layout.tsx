import type { Metadata, Viewport } from "next";
import { Secular_One, Heebo, Rubik } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
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
  title: "פוליטיקל — שוק הניחושים של הפוליטיקה הישראלית",
  description:
    "נחשו מה יקרה בפוליטיקה הישראלית, הִמְרו בשקוינים על אירועים והחלטות, ואספו קלפי קריקטורה של הפוליטיקאים. בלי כסף אמיתי — רק על הכבוד.",
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
  themeColor: "#0B1020",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // iOS notch / safe-area handling
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
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
