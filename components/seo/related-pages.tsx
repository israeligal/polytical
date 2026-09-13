import Link from "next/link";
import { PAGES, RELATED, type PageSlug } from "@/lib/seo/related-pages";
import { ArrowForward } from "@/components/icons";

// Internal-link block. Renders the 3-5 topically-related siblings for a page
// from the RELATED map. Place directly above <CtaSection>, never below it.
export function RelatedPages({ slug }: { slug: PageSlug }) {
  const items = RELATED[slug].map((s) => PAGES[s]);
  return (
    <section className="mt-14 border-t border-border pt-8">
      <h2 className="mb-4 font-display text-2xl font-bold text-foreground">להמשך קריאה</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="group flex h-full flex-col gap-1 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-raised"
            >
              <span className="flex items-center gap-1.5 font-bold text-foreground">
                {p.title}
                <ArrowForward className="h-4 w-4 shrink-0 text-primary" />
              </span>
              <span className="text-sm text-muted-foreground">{p.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
