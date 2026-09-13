import type { Metadata } from "next";
import Link from "next/link";
import { PAGES, TOPICS } from "@/lib/seo/related-pages";

export const metadata: Metadata = {
  title: PAGES["/site-index"].title,
  description: "כל המדריכים והעמודים של פוליטיקל, מקובצים לפי נושא: התחלה, המשחק, ונתוני הכנסת.",
  alternates: { canonical: "/site-index" },
  openGraph: {
    title: PAGES["/site-index"].title,
    description: "כל המדריכים והעמודים של פוליטיקל, מקובצים לפי נושא.",
    url: "/site-index",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGES["/site-index"].title,
    description: "כל המדריכים והעמודים של פוליטיקל, מקובצים לפי נושא.",
  },
};

export default function SiteIndexPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 lg:py-16">
      <header className="mb-10">
        <p className="text-sm font-bold text-primary">פוליטיקל</p>
        <h1 className="mt-2 font-display text-4xl font-black text-foreground">מפת האתר</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          כל המדריכים והעמודים של פוליטיקל, מקובצים לפי נושא.
        </p>
      </header>

      <div className="space-y-10">
        {TOPICS.map((topic) => (
          <section key={topic.heading}>
            <h2 className="mb-3 border-b border-border pb-2 font-display text-xl font-bold text-foreground">
              {topic.heading}
            </h2>
            <ul className="space-y-3">
              {topic.slugs.map((slug) => {
                const p = PAGES[slug];
                return (
                  <li key={p.href}>
                    <Link href={p.href} className="font-bold text-primary hover:underline">
                      {p.title}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted-foreground">{p.summary}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
