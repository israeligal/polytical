import Link from "next/link";
import type { Category } from "@/lib/types";
import { getSession } from "@/lib/auth";
import { getFeaturedPoliticians } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { getMarketOfTheDay } from "@/app/lib/markets/repo";
import { getMarketCards } from "@/app/lib/markets/feed";
import { getLeaderboard, getUserStats } from "@/app/lib/leaderboard/repo";
import { pctLabel } from "@/lib/format";
import { CategoryRail } from "@/components/category-rail";
import { HeroSpotlight, HotRail } from "@/components/hero";
import { MarketCard } from "@/components/market-card";
import { EmptyState } from "@/components/empty-state";
import { CaricatureCard } from "@/components/caricature-card";
import { LeaderboardRow } from "@/components/leaderboard-row";
import { Trophy } from "@/components/icons";
import { VoteRow } from "@/components/vote-row";
import { getVotesFeed } from "@/app/lib/votes/read-repo";
import { formatDate } from "@/lib/time";
import { HOME_SECTION_INNER } from "@/components/skeletons/containers";
import { POLITICIANS_GRID } from "@/components/skeletons/containers";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const active = (cat as Category) || undefined;

  // Fetch ALL open markets once; in-memory filtering keeps DB round-trips to 1.
  const allCards = await getMarketCards({});

  // Hero: always spotlights a market globally — independent of the category
  // filter so the hero persists when the user switches pills.
  // Preference: admin-flagged `hot` → market-of-the-day (most bets) → newest.
  const motd = await getMarketOfTheDay();
  const hotCard = allCards.find((c) => c.market.hot) ?? null;
  const motdCard = motd ? allCards.find((c) => c.market.id === motd.id) ?? null : null;
  const featured = hotCard ?? motdCard ?? allCards[0] ?? null;
  const featuredIsHot = !!featured && featured === hotCard;

  // "Hot now" rail: most-active open markets (by predictor count), excl. hero.
  // Only markets with real predictions qualify.
  const predictorsOf = (c: (typeof allCards)[number]) =>
    c.market.outcomes.reduce((sum, o) => sum + o.predictors, 0);
  const hotItems = featured
    ? allCards
        .filter((c) => c.market.id !== featured.market.id)
        .map((c) => ({ c, total: predictorsOf(c) }))
        .filter(({ total }) => total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map(({ c, total }) => {
          const leader = [...c.market.outcomes].sort((a, b) => b.predictors - a.predictors)[0];
          return { market: c.market, predictors: total, leaderPct: pctLabel(leader.predictors, total) };
        })
    : [];

  // Grid: filter in-memory by category (if active) then exclude the hero card.
  const filteredCards = active
    ? allCards.filter((c) => c.market.category === active)
    : allCards;
  const grid = filteredCards.filter((c) => c.market.id !== featured?.market.id);

  // Cap the homepage grid at 3 full rows (3-col density).
  const MARKETS_CAP = 9;
  const visibleGrid = grid.slice(0, MARKETS_CAP);
  const hiddenCount = grid.length - visibleGrid.length;

  const featuredPoliticians = (await getFeaturedPoliticians({ limit: 12 })).map(dbToCard);
  const recentVotes = (await getVotesFeed({ limit: 4 })).votes;

  // Real leaderboard: top 8 by correct predictions (handle = display name for
  // now). If the viewer is logged in but outside the top 8, append their own row
  // so they can always find themselves. Empty state until there are users to rank.
  const session = await getSession();
  const me = session?.user ?? null;
  const top = await getLeaderboard({ by: "wins", limit: 8 });
  const topEntries = top.map((e) => ({
    rank: e.rank,
    handle: e.name,
    totalWins: e.totalWins,
    totalResolved: e.totalResolved,
    accuracy: e.accuracy,
    you: me?.id === e.userId,
  }));
  const inTop = me ? top.some((e) => e.userId === me.id) : false;
  const myStats = me && !inTop ? await getUserStats({ userId: me.id }) : null;
  const myRow =
    me && myStats
      ? {
          rank: myStats.rank,
          handle: me.name,
          totalWins: myStats.totalWins,
          totalResolved: myStats.totalResolved,
          accuracy: myStats.accuracy,
        }
      : null;

  return (
    <>
      <main className="flex-1">
        {/* HERO — content-first (Polymarket style): a featured-market spotlight
            next to a ranked "hot now" rail. One compact title line, no
            marketing copy. */}
        <section className="border-b border-border bg-muted">
          <div className={HOME_SECTION_INNER}>
            {/* No visible title — the markets are the hero (Polymarket-style);
                sr-only h1 keeps the page's heading structure for a11y/SEO. */}
            <h1 className="sr-only">פוליטיקל — תחזיות על הפוליטיקה הישראלית</h1>
            {featured && (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className={hotItems.length > 0 ? "lg:col-span-2" : "lg:col-span-3"}>
                  <HeroSpotlight
                    market={featured.market}
                    featured={featured.featured}
                    badge={featuredIsHot ? "התחזית החמה של היום" : "הכי פעילה היום"}
                  />
                </div>
                {hotItems.length > 0 && <HotRail items={hotItems} />}
              </div>
            )}
          </div>
        </section>

        {/* MARKETS */}
        <section
          id="markets"
          className={`scroll-mt-24 ${HOME_SECTION_INNER}`}
        >
          <h2 className="mb-5 font-display text-4xl font-black text-foreground">
            תחזיות
          </h2>
          <div className="mb-6">
            <CategoryRail active={active} />
          </div>
          <div className="min-h-[28rem]">
            {visibleGrid.length > 0 ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleGrid.map((c) => (
                    <MarketCard key={c.market.id} market={c.market} featured={c.featured} />
                  ))}
                </div>
                {hiddenCount > 0 && (
                  <div className="mt-6 text-center">
                    <Link
                      href={`/markets${active ? `?cat=${active}` : ""}`}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      לכל התחזיות
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <EmptyState>אין תחזיות פתוחות בקטגוריה הזו כרגע.</EmptyState>
            )}
          </div>
        </section>

        {/* POLITICIANS */}
        <section
          id="politicians"
          className="scroll-mt-24 border-y border-border bg-muted"
        >
          <div className={HOME_SECTION_INNER}>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-sm font-bold text-primary">הקלפים</p>
                <h2 className="font-display text-3xl font-bold text-foreground">
                  פוליטיקאים על המגרש
                </h2>
                <p className="mt-2 text-lg text-muted-foreground">
                  כל פוליטיקאי הוא קלף קריקטורה — עובדות, סטטיסטיקות, והתחזיות
                  שסביבו. כל עובדה ממקור רשמי.
                </p>
              </div>
              <Link
                href="/politicians"
                className="rounded-lg border-2 border-primary px-5 py-2.5 text-sm font-bold text-primary transition-colors hover:bg-primary/5"
              >
                כל הפוליטיקאים
              </Link>
            </div>
            {featuredPoliticians.length > 0 ? (
              <div className={POLITICIANS_GRID}>
                {featuredPoliticians.map((p) => (
                  <CaricatureCard key={p.id} politician={p} realData />
                ))}
              </div>
            ) : (
              <EmptyState>הקלפים בדרך — חזרו בקרוב.</EmptyState>
            )}
          </div>
        </section>

        {/* LEADERBOARD */}
        <section
          id="leaderboard"
          className={`scroll-mt-24 ${HOME_SECTION_INNER}`}
        >
          <div className="mb-6 flex items-center gap-2">
            <Trophy className="h-7 w-7 text-accent" />
            <div>
              <p className="text-sm font-bold text-primary">טבלת המובילים</p>
              <h2 className="font-display text-3xl font-bold text-foreground">
                מובילי המנדטים
              </h2>
            </div>
          </div>
          {topEntries.length > 0 ? (
            <div className="mx-auto w-full max-w-2xl space-y-2">
              {topEntries.map(({ you, ...entry }) => (
                <LeaderboardRow key={entry.rank} entry={entry} you={you} />
              ))}
              {myRow && (
                <div className="pt-2">
                  <LeaderboardRow entry={myRow} you />
                </div>
              )}
            </div>
          ) : (
            <EmptyState className="mx-auto w-full max-w-2xl">
              עוד אין מספיק פעילות לטבלה. תנו מנדט ראשון כדי לפתוח את הדירוג.
            </EmptyState>
          )}
        </section>

        {/* KNESSET VOTES — real plenum roll-calls (muted stripe continues the alternation) */}
        <section id="votes" className="scroll-mt-24 border-t border-border bg-muted">
          <div className={HOME_SECTION_INNER}>
            <div className="mb-6">
              <p className="text-sm font-bold text-primary">ישר מהמליאה</p>
              <h2 className="font-display text-3xl font-bold text-foreground">הצבעות אחרונות בכנסת</h2>
            </div>
            {recentVotes.length > 0 ? (
              <div className="mx-auto grid max-w-2xl gap-3">
                {recentVotes.map((v) => (
                  <VoteRow key={v.voteId} vote={v} dateHe={formatDate(v.voteDate)} />
                ))}
              </div>
            ) : (
              <EmptyState className="mx-auto w-full max-w-2xl">אין הצבעות להצגה כרגע.</EmptyState>
            )}
            <p className="mt-5 text-center">
              <Link
                href="/votes"
                className="inline-flex items-center rounded-full border-2 border-primary px-6 py-2.5 text-sm font-bold text-primary transition-all hover:-translate-y-0.5"
              >
                לכל ההצבעות — מי בעד ומי נגד
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-foreground text-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="font-display text-xl font-black">פוליטיקל</span>
          <p className="text-sm opacity-80">
            משחק. בלי כסף אמיתי. עובדות ותוצאות ממקורות רשמיים בלבד.
          </p>
          <nav className="flex gap-4 text-sm opacity-80">
            <Link href="/terms" className="hover:underline">
              תנאי שימוש
            </Link>
            <Link href="/privacy" className="hover:underline">
              מדיניות פרטיות
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
