import type { ReactNode } from "react";
import type { FaqItem } from "@/lib/seo/faq";

// The marketing section-sandwich kit. Every /about + /guides/* page composes
// these so structure, spacing and RTL stay identical across the set. Order on a
// page: <MarketingMain> → <Hero> → <AtAGlance>|lead → <Section>… → <KeyTakeaways>
// → <Faq> → <RelatedPages> → <CtaSection> → JSON-LD script tags.

export function MarketingMain({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 lg:py-16">
      {children}
    </main>
  );
}

// Hero: eyebrow + H1 (phrased as the user's question) + a lead paragraph that
// answers the question in its first sentence (first-100-words rule).
export function Hero({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead: ReactNode;
}) {
  return (
    <header className="mb-10">
      {eyebrow && <p className="text-sm font-bold text-primary">{eyebrow}</p>}
      <h1 className="mt-2 font-display text-4xl font-black leading-tight text-foreground sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{lead}</p>
    </header>
  );
}

// At-a-glance: a two-column quick-facts table placed directly under the Hero.
// Each row is self-contained so an LLM can lift one row as a standalone answer.
export function AtAGlance({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <div className="mb-12 overflow-hidden rounded-card border border-border bg-card">
      <table className="w-full text-start">
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className={i > 0 ? "border-t border-border" : ""}>
              <th
                scope="row"
                className="w-2/5 bg-muted px-4 py-3 text-start align-top font-bold text-foreground"
              >
                {r.label}
              </th>
              <td className="px-4 py-3 align-top text-foreground">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-display text-2xl font-bold text-foreground sm:text-3xl">{title}</h2>
      <div className="space-y-4 leading-relaxed text-foreground">{children}</div>
    </section>
  );
}

export function Subheading({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 mb-2 font-bold text-foreground">{children}</h3>;
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="ms-5 list-disc space-y-2">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

// Key Takeaways: 3-5 declarative, quotable bullets at the end of the body. The
// heading text is what the SEO audit greps for, keep it as-is.
export function KeyTakeaways({ items }: { items: ReactNode[] }) {
  return (
    <section className="mb-10 rounded-card border border-border bg-muted p-6">
      <h2 className="mb-3 font-display text-2xl font-bold text-foreground">עיקרי הדברים</h2>
      <ul className="ms-5 list-disc space-y-2 leading-relaxed text-foreground">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

// Visible FAQ. Renders from the SAME FaqItem[] the FAQPage JSON-LD maps over.
export function Faq({ items }: { items: readonly FaqItem[] }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 font-display text-2xl font-bold text-foreground sm:text-3xl">
        שאלות נפוצות
      </h2>
      <div className="space-y-3">
        {items.map((f) => (
          <details
            key={f.question}
            className="group rounded-lg border border-border bg-card p-4 open:bg-raised"
          >
            <summary className="cursor-pointer list-none font-bold text-foreground">
              {f.question}
            </summary>
            <p className="mt-2 leading-relaxed text-muted-foreground">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
