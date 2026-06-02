import type { Politician } from "@/lib/types";
import { search, MIN_QUERY_LEN } from "@/app/lib/search/service";
import { MarketCard } from "@/components/market-card";
import { CaricatureCard } from "@/components/caricature-card";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search/search-input";
import { Search } from "@/components/icons";

export const metadata = {
  title: "חיפוש · פוליטיקל",
  description: "חיפוש שווקים ופוליטיקאים.",
};

// Discovery search. Reads `q` from searchParams (awaited) and passes it to the
// client input as a prop — so no useSearchParams / Suspense gap. The query is
// the source of truth in the URL (shareable).
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const trimmed = q.trim();
  const hasQuery = trimmed.length >= MIN_QUERY_LEN;
  const results = hasQuery ? await search({ q: trimmed }) : null;

  const politicians: Politician[] = results?.politicians ?? [];
  const markets = results?.markets ?? [];
  const total = politicians.length + markets.length;

  return (
    <main className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="font-accent text-sm font-bold text-primary">חיפוש</p>
        <h1 className="mb-4 font-display text-3xl text-foreground sm:text-4xl">מה מחפשים?</h1>
        <SearchInput initialQuery={q} />
      </header>

      {!hasQuery ? (
        <div className="rounded-card border border-dashed border-border bg-card px-4 py-14 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-display text-lg text-foreground">חפשו שוק או פוליטיקאי</p>
          <p className="mt-1 text-sm text-muted-foreground">הקלידו לפחות {MIN_QUERY_LEN} תווים כדי להתחיל.</p>
        </div>
      ) : total === 0 ? (
        <EmptyState>לא נמצאו תוצאות עבור “{trimmed}”. נסו ניסוח אחר.</EmptyState>
      ) : (
        <div className="space-y-10">
          {markets.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-baseline gap-2 font-display text-xl text-foreground">
                שווקים
                <span className="nums rounded-full bg-card px-2 py-0.5 text-sm font-bold text-muted-foreground">
                  {markets.length}
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {markets.map((m) => (
                  <MarketCard key={m.market.id} market={m.market} featured={m.featured} />
                ))}
              </div>
            </section>
          )}

          {politicians.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-baseline gap-2 font-display text-xl text-foreground">
                פוליטיקאים
                <span className="nums rounded-full bg-card px-2 py-0.5 text-sm font-bold text-muted-foreground">
                  {politicians.length}
                </span>
              </h2>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {politicians.map((p) => (
                  <CaricatureCard key={p.id} politician={p} realData />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
