import type { Metadata } from "next";
import { Secular_One, Heebo, Rubik } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

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
    "נחשו מה יקרה בפוליטיקה הישראלית, הִמְרו במטבעות משחק על אירועים והחלטות, ואספו קלפי קריקטורה של הפוליטיקאים. בלי כסף אמיתי — רק על הכבוד.",
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
      </body>
    </html>
  );
}
