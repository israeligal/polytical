import Link from "next/link";
import { redirect } from "next/navigation";
import type { Market } from "@/lib/types";
import { getSession } from "@/lib/auth";
import { formatCoins } from "@/lib/format";
import { getUserStats } from "@/app/lib/leaderboard/repo";
import { getUserBets, getMarketBundle, type PortfolioBet } from "@/app/lib/markets/repo";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import { CoinPill } from "@/components/coin-pill";
import { OddsBar } from "@/components/odds-bar";
import { Trophy } from "@/components/icons";

export default async function ProfilePage() {
  const session = await getSession();
  const user = session?.user ?? null;
  // proxy.ts already gates /profile, but redirect defensively (and to carry the
  // callbackUrl) so a direct hit without a session still lands on login → back.
  if (!user) redirect("/login?callbackUrl=%2Fprofile");

  const [stats, allBets] = await Promise.all([
    getUserStats({ userId: user.id }),
    getUserBets({ userId: user.id }),
  ]);

  const open = allBets.filter((b) => b.betStatus === "open");
  const history = allBets.filter((b) => b.betStatus !== "open");

  // Live odds for each open position: pull the (distinct) market bundles once and
  // map id → view model so the OddsBar can show where the crowd sits right now.
  const openMarketIds = [...new Set(open.map((b) => b.marketId))];
  const bundles = await Promise.all(
    openMarketIds.map((id) => getMarketBundle({ marketId: id })),
  );
  const marketById = new Map<string, Market>();
  for (const b of bundles) {
    if (b) marketById.set(b.market.id, bundleToMarket(b));
  }

  const initial = user.name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      {/* HEADER + STAT CARDS */}
      <section className="mb-8">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-muted font-display text-2xl font-black text-foreground ring-1 ring-border">
            {initial}
          </span>
          <div>
            <h1 className="font-display text-3xl font-black leading-tight text-foreground">
              {user.name}
            </h1>
            <p className="text-sm text-muted-foreground">הפרופיל שלך</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="יתרה">
            <CoinPill amount={stats?.balance ?? 0} />
          </StatCard>
          <StatCard label="שווי נטו">
            <span className="nums text-2xl font-black text-foreground">
              {formatCoins(stats?.netWorth ?? 0)}
            </span>
          </StatCard>
          <StatCard label="דירוג">
            <span className="inline-flex items-center gap-1.5">
              <Trophy className="h-5 w-5 text-accent" />
              <span className="nums text-2xl font-black text-foreground">
                #{stats?.rank ?? "—"}
              </span>
            </span>
          </StatCard>
          <StatCard label="דיוק">
            <span className="nums text-2xl font-black text-foreground">
              {stats?.accuracy ?? 0}%
            </span>
            <span className="block text-xs text-muted-foreground">
              {stats?.totalWins ?? 0}/{stats?.totalResolved ?? 0} שווקים
            </span>
          </StatCard>
        </div>
      </section>

      {/* OPEN POSITIONS */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-2xl font-bold text-foreground">
          פוזיציות פתוחות
        </h2>
        {open.length > 0 ? (
          <ul className="space-y-3">
            {open.map((b) => (
              <li
                key={b.betId}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    href={`/market/${b.marketId}`}
                    className="font-display text-lg font-bold text-foreground hover:text-primary"
                  >
                    {b.questionHe}
                  </Link>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-bold text-foreground">
                    {b.outcomeLabelHe}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  הימור:{" "}
                  <span className="nums font-bold text-foreground">
                    {formatCoins(b.amount)}
                  </span>{" "}
                  מטבעות
                </p>
                {marketById.get(b.marketId) && (
                  <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                    <OddsBar market={marketById.get(b.marketId) as Market} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-8 text-center text-muted-foreground">
            אין לך פוזיציות פתוחות.{" "}
            <Link href="/#markets" className="font-semibold text-primary hover:underline">
              בחרו שוק להמר עליו
            </Link>
            .
          </p>
        )}
      </section>

      {/* HISTORY */}
      <section>
        <h2 className="mb-3 font-display text-2xl font-bold text-foreground">
          היסטוריית הימורים
        </h2>
        {history.length > 0 ? (
          <ul className="space-y-2">
            {history.map((b) => (
              <li
                key={b.betId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/market/${b.marketId}`}
                    className="block truncate font-semibold text-foreground hover:text-primary"
                  >
                    {b.questionHe}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {b.outcomeLabelHe} ·{" "}
                    <span className="nums">{formatCoins(b.amount)}</span> מטבעות
                  </p>
                </div>
                <HistoryResult bet={b} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-8 text-center text-muted-foreground">
            עוד לא הוכרעו אצלך הימורים.
          </p>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-1.5 text-xs font-bold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** A resolved/refunded bet's outcome chip: won (+payout), lost, or refunded. */
function HistoryResult({ bet }: { bet: PortfolioBet }) {
  if (bet.betStatus === "won") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-positive-soft px-3 py-1 text-sm font-bold text-positive">
        זכית
        <span className="nums">+{formatCoins(bet.payout)}</span>
      </span>
    );
  }
  if (bet.betStatus === "refunded") {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-3 py-1 text-sm font-bold text-muted-foreground">
        הוחזר
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-negative-soft px-3 py-1 text-sm font-bold text-negative">
      הפסדת
    </span>
  );
}
