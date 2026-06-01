import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { formatCoins, totalPool } from "@/lib/format";
import { getMarketBundle } from "@/app/lib/markets/repo";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import { getPoliticianByPersonId } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { OddsBar } from "@/components/odds-bar";
import { BetPanel } from "@/components/bet-panel";
import { CaricatureCard } from "@/components/caricature-card";
import { CategoryBadge, Countdown, HotBadge } from "@/components/badges";
import { CommentThread } from "@/components/comments/comment-thread";
import { ChatBubble, ChevronForward, Coin } from "@/components/icons";

export default async function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getMarketBundle({ marketId: id });
  if (!bundle) notFound();

  const market = bundleToMarket(bundle);
  const status = bundle.market.status;
  const settled = status === "resolved" || status === "voided";
  const winningOutcome =
    status === "resolved" && bundle.market.resolvedOutcomeId
      ? bundle.outcomes.find((o) => o.id === bundle.market.resolvedOutcomeId)
      : undefined;

  // Real featured MKs by personId (the system of record), mapped to card shape.
  const pols = (
    await Promise.all(bundle.personIds.map((personId) => getPoliticianByPersonId({ personId })))
  )
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .map(dbToCard);

  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);
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
          {pols.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {pols.map((p) => (
                <CaricatureCard key={p.id} politician={p} realData />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-6 text-center text-muted-foreground">
              לא שויכו פוליטיקאים לשוק הזה.
            </p>
          )}

          <h2 className="mb-3 mt-8 inline-flex items-center gap-2 font-display text-xl font-bold text-foreground">
            <ChatBubble className="h-5 w-5 text-primary" />
            דעות חמות
          </h2>
          <CommentThread
            marketId={market.id}
            viewerId={session?.user?.id}
            isAdmin={!!session?.user?.isAdmin}
          />
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          {settled ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
              <h3 className="mb-2 font-display text-lg font-bold text-foreground">
                {status === "voided" ? "השוק בוטל" : "השוק הוכרע"}
              </h3>
              {status === "voided" ? (
                <p className="text-sm text-muted-foreground">
                  כל ההימורים הוחזרו במלואם.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">התוצאה הזוכה:</p>
                  <p className="mt-1 text-2xl font-black text-positive">
                    {winningOutcome?.labelHe ?? "—"}
                  </p>
                  {bundle.market.resolutionSourceUrl && (
                    <a
                      href={bundle.market.resolutionSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
                    >
                      מקור ההכרעה
                    </a>
                  )}
                </>
              )}
            </div>
          ) : (
            <BetPanel market={market} isLoggedIn={isLoggedIn} />
          )}
        </aside>
      </div>
    </main>
  );
}
