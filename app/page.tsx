import Link from "next/link";
import type { Category } from "@/lib/types";
import { currentUser, markets, politicians } from "@/lib/mock-data";
import { leaderboard } from "@/lib/leaderboard";
import { SiteHeader } from "@/components/site-header";
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
  const featured = !active ? markets.find((m) => m.hot) ?? markets[0] : null;
  const grid = active
    ? markets.filter((m) => m.category === active)
    : markets.filter((m) => m.id !== featured?.id);

  return (
    <>
      <SiteHeader />
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
                  <MarketCard market={featured} />
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
              {grid.map((m) => (
                <MarketCard key={m.id} market={m} />
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
            <div className="mb-6 max-w-2xl">
              <p className="text-sm font-bold text-primary">הקלפים</p>
              <h2 className="font-display text-3xl font-bold text-foreground">
                פוליטיקאים על המגרש
              </h2>
              <p className="mt-2 text-lg text-muted-foreground">
                כל פוליטיקאי הוא קלף קריקטורה — עובדות, סטטיסטיקות, והשווקים
                שסביבו. כל עובדה ממקור רשמי.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {politicians.map((p) => (
                <CaricatureCard key={p.id} politician={p} />
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
          <div className="mx-auto max-w-2xl space-y-2">
            {leaderboard.map((e) => (
              <LeaderboardRow key={e.rank} entry={e} />
            ))}
            <div className="pt-2">
              <LeaderboardRow
                entry={{
                  rank: currentUser.rank,
                  handle: currentUser.handle,
                  netWorth: currentUser.balance,
                  accuracy: currentUser.accuracy,
                }}
                you
              />
            </div>
          </div>
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
