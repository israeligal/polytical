import Link from "next/link";
import { ArrowForward } from "@/components/icons";

// Single consistent conversion block, shared across every marketing page. One
// primary action (join) plus one low-commitment secondary (browse forecasts).
export function CtaSection({
  title = "מוכנים לתת מנדט?",
  body = "הצטרפו חינם, בחרו תוצאה בתחזית הראשונה שלכם, ותתחילו לבנות מאזן דיוק.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="mt-14 rounded-card border border-border bg-muted p-8 text-center">
      <h2 className="font-display text-3xl font-black text-foreground">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/signup"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          הצטרפות חינם
          <ArrowForward className="h-5 w-5" />
        </Link>
        <Link
          href="/markets"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-6 py-3 font-bold text-foreground transition-colors hover:bg-raised"
        >
          עיון בתחזיות
        </Link>
      </div>
    </section>
  );
}
