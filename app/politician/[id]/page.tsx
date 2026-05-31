import Link from "next/link";
import { notFound } from "next/navigation";
import { getPoliticianByPersonId } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { SiteHeader } from "@/components/site-header";
import { CaricatureCard } from "@/components/caricature-card";
import { ChevronForward } from "@/components/icons";

export default async function PoliticianPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = Number(id);
  const row = Number.isInteger(personId)
    ? await getPoliticianByPersonId({ personId })
    : null;
  if (!row) notFound();

  const politician = dbToCard(row);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/politicians"
          className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          <ChevronForward className="h-4 w-4 rotate-180" />
          חזרה לפוליטיקאים
        </Link>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <CaricatureCard politician={politician} realData />
          </div>

          <div>
            <h1 className="font-display text-3xl font-black text-foreground sm:text-4xl">
              {politician.name}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {politician.role} · {politician.party}
            </p>

            <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
              {politician.facts.map((f) => (
                <div
                  key={f.label}
                  className="flex items-center justify-between gap-3 bg-card px-4 py-3"
                >
                  <dt className="text-sm text-muted-foreground">{f.label}</dt>
                  <dd className="nums text-sm font-bold text-foreground">{f.value}</dd>
                </div>
              ))}
            </dl>

            <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">
              השווקים של {politician.name}
            </h2>
            <div className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-10 text-center">
              <p className="font-display text-lg font-bold text-foreground">
                שווקים בקרוב
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                עוד לא נפתחו שווקים סביב {politician.name}. בקרוב תוכלו לנחש על
                ההחלטות והאירועים שלו/ה.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
