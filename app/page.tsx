import Link from "next/link";
import type { Category, Politician } from "@/lib/types";
import { getSession } from "@/lib/auth";
import { getAllPoliticians, getFeaturedPoliticians } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { getMarketBundle, getMarketOfTheDay, listOpenMarkets, getOutcomeCountsForMarkets } from "@/app/lib/markets/repo";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import { getLeaderboard, getUserStats } from "@/app/lib/leaderboard/repo";
import { CategoryRail } from "@/components/category-rail";
import { MarketCard } from "@/components/market-card";
import { EmptyState } from "@/components/empty-state";
import { CaricatureCard } from "@/components/caricature-card";
import { LeaderboardRow } from "@/components/leaderboard-row";
import { Trophy } from "@/components/icons";
import { VoteRow } from "@/components/vote-row";
import { getVotesFeed } from "@/app/lib/votes/read-repo";
import { formatDate } from "@/lib/time";
import { HOME_SECTION_INNER } from "@/components/skeletons/containers";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; all?: string }>;
}) {
  const { cat, all } = await searchParams;
  const active = (cat as Category) || undefined;
  const showAll = all === "1";

  // Real markets from the DB. Each card needs its featured MK portraits, so we
  // pull each market's bundle (outcomes + personIds), build view models, and
  // resolve personIds against a single politicians map (one query, no N+1).
  const marketRows = await listOpenMarkets({ category: active });
  const bundles = (
    await Promise.all(marketRows.map((m) => getMarketBundle({ marketId: m.id })))
  ).filter((b): b is NonNullable<typeof b> => b !== null);

  const polById = new Map<string, Politician>();
  for (const row of await getAllPoliticians()) {
    polById.set(String(row.personId), dbToCard(row));
  }
  const featuredFor = (personIds: number[]): Politician[] =>
    personIds.map((id) => polById.get(String(id))).filter((p): p is Politician => Boolean(p));

  // Live predictor counts for every card in one query so each OddsBar shows the
  // real crowd split (not a blank 0/0 bar).
  const countsByMarket = await getOutcomeCountsForMarkets({ marketIds: bundles.map((b) => b.market.id) });

  const cards = bundles.map((b) => ({
    market: bundleToMarket({ ...b, counts: countsByMarket.get(b.market.id) }),
    featured: featuredFor(b.personIds),
  }));

  // No category filter → spotlight a market in the hero, rest in the grid.
  // Preference: an admin-flagged `hot` market, else the data-driven "market of
  // the day" (the open market with the most bets), else the newest. The badge
  // reflects which rule chose it.
  const motd = !active ? await getMarketOfTheDay() : null;
  const hotCard = !active ? cards.find((c) => c.market.hot) ?? null : null;
  const motdCard = motd ? cards.find((c) => c.market.id === motd.id) ?? null : null;
  const featured = !active ? hotCard ?? motdCard ?? cards[0] ?? null : null;
  const featuredIsHot = !!featured && featured === hotCard;
  const grid = active ? cards : cards.filter((c) => c.market.id !== featured?.market.id);

  // Cap the homepage grid at 3 full rows (Polymarket-density 3-col) so a
  // growing market count can't make the page endless; `?all=1` (URL-derived,
  // no client state) expands in place until the dedicated /markets page lands.
  const MARKETS_CAP = 9;
  const visibleGrid = showAll ? grid : grid.slice(0, MARKETS_CAP);
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
        {/* HERO */}
        <section className="border-b border-border bg-muted">
          <div className={HOME_SECTION_INNER}>
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div>
                <p className="text-sm font-bold text-primary">
                  מהדורת היום · זירת התחזיות
                </p>
                <h1 className="mt-2 font-display text-4xl font-black leading-[1.1] text-foreground sm:text-5xl">
                  נחשו את הפוליטיקה הישראלית.
                  <br />
                  <span className="text-primary">בלי כסף</span> — רק על הכבוד.
                </h1>
                <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                  נחשו מה יקרה באירועים ובהחלטות של פוליטיקאים, צפו
                  בקהל זז עם כל ניחוש, ואספו קלפי קריקטורה לפי דיוק הניחושים שלכם.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="#markets"
                    className="rounded-lg bg-primary px-7 py-3 text-lg font-bold text-primary-foreground shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-primary-hover"
                  >
                    התחילו לנחש
                  </Link>
                  <Link
                    href="#politicians"
                    className="rounded-lg border-2 border-primary px-7 py-3 text-lg font-bold text-primary transition-colors hover:bg-primary/5"
                  >
                    גלו את הקלפים
                  </Link>
                </div>
              </div>
              {featured && (
                <div>
                  <p className="mb-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-foreground">
                      {featuredIsHot ? "התחזית החמה של היום" : "תחזית היום · הכי פעילה"}
                    </span>
                  </p>
                  <MarketCard market={featured.market} featured={featured.featured} />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* MARKETS */}
        <section
          id="markets"
          className={`scroll-mt-24 ${HOME_SECTION_INNER}`}
        >
          <div className="mb-5">
            <p className="text-sm font-bold text-primary">התחזיות</p>
            <h2 className="font-display text-3xl font-bold text-foreground">
              על מה מנחשים עכשיו
            </h2>
          </div>
          <div className="mb-6">
            <CategoryRail active={active} />
          </div>
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
                    href={`/?${active ? `cat=${active}&` : ""}all=1#markets`}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    הצגת כל <span className="nums">{grid.length}</span> התחזיות
                  </Link>
                </div>
              )}
            </>
          ) : (
            <EmptyState>אין תחזיות פתוחות בקטגוריה הזו כרגע.</EmptyState>
          )}
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
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                המנחשים הגדולים
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
              עוד אין מספיק פעילות לטבלה. נחשו על תחזית ראשונה כדי לפתוח את הדירוג.
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
