import Link from "next/link";
import { notFound } from "next/navigation";
import { getPolitician, marketsForPolitician } from "@/lib/mock-data";
import { SiteHeader } from "@/components/site-header";
import { CaricatureCard } from "@/components/caricature-card";
import { MarketCard } from "@/components/market-card";
import { ChevronForward } from "@/components/icons";

export default async function PoliticianPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const politician = getPolitician(id);
  if (!politician) notFound();

  const theirMarkets = marketsForPolitician(id);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/#politicians"
          className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          <ChevronForward className="h-4 w-4 rotate-180" />
          חזרה לפוליטיקאים
        </Link>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <CaricatureCard politician={politician} />
          </div>

          <div>
            <h1 className="font-display text-3xl font-black text-foreground sm:text-4xl">
              {politician.name}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {politician.role} · {politician.party}
            </p>

            <h2 className="mb-3 mt-6 font-display text-xl font-bold text-foreground">
              השווקים של {politician.name}
            </h2>
            {theirMarkets.length > 0 ? (
              <div className="grid gap-4">
                {theirMarkets.map((m) => (
                  <MarketCard key={m.id} market={m} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-6 text-center text-muted-foreground">
                אין שווקים פעילים כרגע.
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
