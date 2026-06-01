import type { Metadata } from "next";
import { Frank_Ruhl_Libre, Heebo } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

// Display — the classic Hebrew newspaper serif, for op-ed headlines.
const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  variable: "--font-frank-ruhl",
});

// Sans — clean Hebrew UI/data font for body, labels, numbers.
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
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
      className={`${frankRuhl.variable} ${heebo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
