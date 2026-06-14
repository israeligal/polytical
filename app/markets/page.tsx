import type { Metadata } from "next";
import type { Category } from "@/lib/types";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getMarketCards, getMyPickLabels } from "@/app/lib/markets/feed";
import { CategoryRail } from "@/components/category-rail";
import { MarketCard } from "@/components/market-card";
import { EmptyState } from "@/components/empty-state";
import { Ballot } from "@/components/icons";
import { MARKETS_PAGE_CONTAINER } from "@/components/skeletons/containers";

export const metadata: Metadata = {
  title: "תחזיות",
  description: "כל התחזיות הפתוחות על הפוליטיקה הישראלית — בחרו תוצאה ותנו מנדט.",
};

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const active = (cat as Category) || undefined;

  const [cards, session] = await Promise.all([getMarketCards({ category: active }), getSession()]);
  const myPicks = session?.user
    ? await getMyPickLabels({ userId: session.user.id })
    : new Map<string, string>();

  return (
    <main className={MARKETS_PAGE_CONTAINER}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-4xl font-black text-foreground">תחזיות</h1>
        <Link
          href="/suggest"
          className="hidden items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground transition-colors hover:bg-accent-hover md:inline-flex"
        >
          <Ballot className="h-4 w-4" />
          הצעה לסדר
        </Link>
      </div>
      <div className="mb-6">
        <CategoryRail active={active} basePath="/markets" />
      </div>
      <div className="min-h-[50vh]">
        {cards.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <MarketCard key={c.market.id} market={c.market} featured={c.featured} myPickLabel={myPicks.get(c.market.id)} />
            ))}
          </div>
        ) : (
          <EmptyState>אין תחזיות פתוחות בקטגוריה הזו כרגע.</EmptyState>
        )}
      </div>
    </main>
  );
}
