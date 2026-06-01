import Link from "next/link";
import { notFound } from "next/navigation";
import { markets, marketPoliticians } from "@/lib/mock-data";
import { formatCoins, totalPool } from "@/lib/format";
import { OddsBar } from "@/components/odds-bar";
import { BetPanel } from "@/components/bet-panel";
import { CaricatureCard } from "@/components/caricature-card";
import { CategoryBadge, Countdown, HotBadge } from "@/components/badges";
import { ChatBubble, ChevronForward, Coin } from "@/components/icons";

export default async function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const market = markets.find((m) => m.id === id);
  if (!market) notFound();

  const pols = marketPoliticians(market);
  const volume = totalPool(market.outcomes);

  return (
    <main className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/#markets"
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        חזרה לשווקים
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <CategoryBadge category={market.category} />
            {market.hot ? <HotBadge /> : <Countdown closeAt={market.closeAt} />}
          </div>

          <h1 className="font-display text-3xl font-black leading-tight text-foreground sm:text-4xl">
            {market.question}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Coin className="h-4 w-4 text-accent" />
              <span className="nums font-bold text-foreground">
                {formatCoins(volume)}
              </span>
              מטבעות בקופה
            </span>
            <span className="text-border">•</span>
            <Countdown closeAt={market.closeAt} />
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <OddsBar market={market} />
          </div>

          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">
            הפוליטיקאים בשוק
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {pols.map((p) => (
              <CaricatureCard key={p.id} politician={p} />
            ))}
          </div>

          <h2 className="mb-3 mt-8 inline-flex items-center gap-2 font-display text-xl font-bold text-foreground">
            <ChatBubble className="h-5 w-5 text-primary" />
            דעות חמות
          </h2>
          <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-6 text-center text-muted-foreground">
            התגובות ייפתחו עם ההשקה — כאן יתווכחו על כל שוק.
          </p>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <BetPanel market={market} />
        </aside>
      </div>
    </main>
  );
}
