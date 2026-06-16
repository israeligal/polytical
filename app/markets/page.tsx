import type { Metadata } from "next";
import type { Category } from "@/lib/types";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getActiveCoalition } from "@/app/lib/groups/context";
import { getGroupById } from "@/app/lib/groups/repo";
import { groupLabel } from "@/lib/group-display";
import { CoalitionScopeBanner } from "@/components/groups/coalition-scope-banner";
import { getMarketCards, getMyPickLabels, type MarketCardData } from "@/app/lib/markets/feed";
import { getMarketOfTheDay } from "@/app/lib/markets/repo";
import { CategoryRail } from "@/components/category-rail";
import { MarketCard } from "@/components/market-card";
import { EmptyState } from "@/components/empty-state";
import { HeroSpotlight, HotRail } from "@/components/hero";
import { Ballot } from "@/components/icons";
import { pctLabel } from "@/lib/format";
import { MARKETS_PAGE_CONTAINER, HOME_SECTION_INNER } from "@/components/skeletons/containers";

export const metadata: Metadata = {
  title: "תחזיות",
  description: "כל התחזיות הפתוחות על הפוליטיקה הישראלית — בחרו תוצאה ותנו מנדט.",
};

const predictorsOf = (c: MarketCardData) =>
  c.market.outcomes.reduce((sum, o) => sum + o.predictors, 0);

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const active = (cat as Category) || undefined;

  // The active coalition (or null = ארצי) scopes the whole feed — same cards,
  // different audience. Resolved before the reads so they all share one scope.
  const session = await getSession();
  const groupScope = session?.user
    ? await getActiveCoalition({ userId: session.user.id, defaultGroupId: session.user.defaultGroupId })
    : null;
  const activeGroup = groupScope ? await getGroupById({ id: groupScope }) : null;

  // Fetch all open markets once; hero is category-independent.
  const [allCards, motd] = await Promise.all([
    getMarketCards({ groupScope }),
    getMarketOfTheDay({ groupScope }),
  ]);
  const myPicks = session?.user
    ? await getMyPickLabels({ userId: session.user.id, groupScope })
    : new Map<string, string>();

  // Hero: hot-flagged > market-of-the-day > most-active > first.
  const hotCard = allCards.find((c) => c.market.hot) ?? null;
  const motdCard = motd ? (allCards.find((c) => c.market.id === motd.id) ?? null) : null;
  const hero = hotCard ?? motdCard ?? allCards[0] ?? null;
  const heroIsHot = !!hero && hero === hotCard;

  // "Hot now" rail — top 5 most-active markets, excluding the hero.
  const hotItems = hero
    ? allCards
        .filter((c) => c.market.id !== hero.market.id)
        .map((c) => ({ c, total: predictorsOf(c) }))
        .filter(({ total }) => total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map(({ c, total }) => {
          const leader = [...c.market.outcomes].sort((a, b) => b.predictors - a.predictors)[0];
          return { market: c.market, predictors: total, leaderPct: pctLabel(leader.predictors, total) };
        })
    : [];

  // Grid: filter by category in-memory, exclude hero.
  const filtered = active ? allCards.filter((c) => c.market.category === active) : allCards;
  const cards = filtered.filter((c) => c.market.id !== hero?.market.id);

  return (
    <>
      {hero && (
        <section className="border-b border-border bg-muted">
          <div className={HOME_SECTION_INNER}>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className={hotItems.length > 0 ? "min-w-0 lg:col-span-2" : "min-w-0 lg:col-span-3"}>
                <HeroSpotlight
                  market={hero.market}
                  featured={hero.featured}
                  badge={heroIsHot ? "התחזית החמה של היום" : "הכי פעילה היום"}
                />
              </div>
              {hotItems.length > 0 && <HotRail items={hotItems} />}
            </div>
          </div>
        </section>
      )}

      <main className={MARKETS_PAGE_CONTAINER}>
        {activeGroup && <CoalitionScopeBanner label={groupLabel(activeGroup)} slug={activeGroup.slug} />}
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
    </>
  );
}
