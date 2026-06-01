import Link from "next/link";
import type { Category, Politician } from "@/lib/types";
import { getSession } from "@/lib/auth";
import { getAllPoliticians, getFeaturedPoliticians } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { getMarketBundle, listOpenMarkets } from "@/app/lib/markets/repo";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import { getLeaderboard, getUserStats } from "@/app/lib/leaderboard/repo";
import { CategoryRail } from "@/components/category-rail";
import { MarketCard } from "@/components/market-card";
import { CaricatureCard } from "@/components/caricature-card";
import { LeaderboardRow } from "@/components/leaderboard-row";
import { Trophy } from "@/components/icons";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const active = (cat as Category) || undefined;

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

  const cards = bundles.map((b) => ({
    market: bundleToMarket(b),
    featured: featuredFor(b.personIds),
  }));

  // No category filter → spotlight a hot market in the hero, rest in the grid.
  const featured = !active ? cards.find((c) => c.market.hot) ?? cards[0] ?? null : null;
  const grid = active ? cards : cards.filter((c) => c.market.id !== featured?.market.id);

  const featuredPoliticians = (await getFeaturedPoliticians({ limit: 12 })).map(dbToCard);

  // Real leaderboard: top 8 by net worth (handle = display name for now). If the
  // viewer is logged in but outside the top 8, append their own row so they can
  // always find themselves. Empty state until there are users to rank.
  const session = await getSession();
  const me = session?.user ?? null;
  const top = await getLeaderboard({ by: "networth", limit: 8 });
  const topEntries = top.map((e) => ({
    rank: e.rank,
    handle: e.name,
    netWorth: e.netWorth,
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
          netWorth: myStats.netWorth,
          accuracy: myStats.accuracy,
        }
      : null;

  return (
    <>
      <main className="flex-1">
        {/* HERO */}
        <section className="border-b border-border bg-muted">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div>
                <p className="text-sm font-bold text-primary">
                  מהדורת היום · שוק הניחושים
                </p>
                <h1 className="mt-2 font-display text-4xl font-black leading-[1.1] text-foreground sm:text-5xl">
                  נחשו את הפוליטיקה הישראלית.
                  <br />
                  <span className="text-primary">בלי כסף</span> — רק על הכבוד.
                </h1>
                <p className="mt-4 max-w-xl text-lg text-muted-foreground">
                  המרו מטבעות משחק על אירועים ועל החלטות של פוליטיקאים, צפו
                  בסיכויים זזים עם הקהל, ואספו קלפי קריקטורה עם עובדות אמיתיות.
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
                      השוק החם של היום
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
          className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8 lg:py-16"
        >
          <div className="mb-5">
            <p className="text-sm font-bold text-primary">השווקים</p>
            <h2 className="font-display text-3xl font-bold text-foreground">
              על מה מהמרים עכשיו
            </h2>
          </div>
          <div className="mb-6">
            <CategoryRail active={active} />
          </div>
          {grid.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {grid.map((c) => (
                <MarketCard key={c.market.id} market={c.market} featured={c.featured} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-10 text-center text-muted-foreground">
              אין שווקים פתוחים בקטגוריה הזו כרגע.
            </p>
          )}
        </section>

        {/* POLITICIANS */}
        <section
          id="politicians"
          className="scroll-mt-24 border-y border-border bg-muted"
        >
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-sm font-bold text-primary">הקלפים</p>
                <h2 className="font-display text-3xl font-bold text-foreground">
                  פוליטיקאים על המגרש
                </h2>
                <p className="mt-2 text-lg text-muted-foreground">
                  כל פוליטיקאי הוא קלף קריקטורה — עובדות, סטטיסטיקות, והשווקים
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
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featuredPoliticians.map((p) => (
                <CaricatureCard key={p.id} politician={p} realData />
              ))}
            </div>
          </div>
        </section>

        {/* LEADERBOARD */}
        <section
          id="leaderboard"
          className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6 lg:px-8 lg:py-16"
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
            <div className="mx-auto max-w-2xl space-y-2">
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
            <p className="mx-auto max-w-2xl rounded-xl border border-dashed border-border bg-muted/50 px-4 py-10 text-center text-muted-foreground">
              עוד אין מספיק פעילות לטבלה. המרו על שוק ראשון כדי לפתוח את הדירוג.
            </p>
          )}
        </section>
      </main>

      <footer className="border-t border-border bg-foreground text-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="font-display text-xl font-black">פוליטיקל</span>
          <p className="text-sm opacity-80">
            משחק. בלי כסף אמיתי. עובדות ותוצאות ממקורות רשמיים בלבד.
          </p>
        </div>
      </footer>
    </>
  );
}
