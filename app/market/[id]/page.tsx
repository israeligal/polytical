import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { getMarketBundle, getOutcomeCounts, getUserPositions } from "@/app/lib/markets/repo";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import { getPoliticianByPersonId } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { getCelebrations } from "@/app/lib/bets/service";
import { CelebrationHost } from "@/components/celebration/celebration-host";
import { OddsBar } from "@/components/odds-bar";
import { BetPanel } from "@/components/bet-panel";
import { OutcomeRows } from "@/components/outcome-rows";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { CaricatureCard } from "@/components/caricature-card";
import { CategoryBadge, Countdown, HotBadge } from "@/components/badges";
import { CommentThread } from "@/components/comments/comment-thread";
import { ChatBubble, ChevronForward, Users } from "@/components/icons";

export default async function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getMarketBundle({ marketId: id });
  if (!bundle) notFound();

  const counts = await getOutcomeCounts({ marketId: id });
  const market = bundleToMarket({ ...bundle, counts });
  const status = bundle.market.status;
  const settled = status === "resolved" || status === "voided";
  const winningOutcome =
    status === "resolved" && bundle.market.resolvedOutcomeId
      ? bundle.outcomes.find((o) => o.id === bundle.market.resolvedOutcomeId)
      : undefined;

  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);
  const predictors = market.outcomes.reduce((sum, o) => sum + o.predictors, 0);
  // The interactive rows render only on OPEN markets — an admin-closed (or
  // draft/voided) multi must not invite picks that always fail. Past-closeAt
  // open markets keep parity with binary's BetPanel: the server action is the
  // authoritative closeAt guard (render-time Date.now is impure in RSCs).
  const multiOpen = market.type === "multi" && bundle.market.status === "open";

  // Featured MK cards + the viewer's current pick (the highlighted row) are
  // independent reads — overlap them instead of paying serial roundtrips.
  const [polRows, positions] = await Promise.all([
    Promise.all(bundle.personIds.map((personId) => getPoliticianByPersonId({ personId }))),
    multiOpen && session?.user
      ? getUserPositions({ userId: session.user.id, marketId: id })
      : Promise.resolve([]),
  ]);
  const pols = polRows.filter((row): row is NonNullable<typeof row> => row !== null).map(dbToCard);
  const initialPickId = positions[0]?.outcomeId ?? null;
  // The politician a winning outcome IS (multi) — for the resolution panel portrait.
  const winnerPol =
    winningOutcome?.personId != null
      ? (pols.find((p) => p.id === String(winningOutcome.personId)) ?? null)
      : null;
  // One-time right/wrong reveal for this market's resolved prediction (first view).
  const celebrations =
    settled && session?.user
      ? await getCelebrations({ userId: session.user.id, marketId: id })
      : [];

  return (
    <main className="mx-auto max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <CelebrationHost predictions={celebrations} />
      <Link
        href="/#markets"
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        חזרה לתחזיות
      </Link>

      {/*
        Mobile (single column) source order = head → bet → body, so the primary
        betting action sits right under the odds, not buried below the comments.
        Desktop restores the two-column layout: head + body stack in the 1fr
        column, the bet panel is a sticky sidebar spanning both rows.
      */}
      {/* min-w-0 on every grid child: grid items default to min-width:auto, so any
          unbreakable content (long word in a comment, wide image) would otherwise
          force the column wider than the viewport on mobile. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="mb-3 flex items-center gap-3">
            <CategoryBadge category={market.category} />
            {market.hot && <HotBadge />}
          </div>

          <h1 className="font-display text-3xl font-black leading-tight text-foreground sm:text-4xl">
            {market.question}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-accent" />
              <span className="nums font-bold text-foreground">
                {formatCount(predictors)}
              </span>
              ניחשו
            </span>
            <span className="text-border">•</span>
            <Countdown closeAt={market.closeAt} />
          </div>

          {multiOpen ? (
            /* Multi markets: the sorted candidate rows ARE the chart AND the
               picker — no separate odds bar or side bet panel. */
            <div className="mt-6">
              <OutcomeRows
                market={market}
                politicians={pols}
                initialPickId={initialPickId}
                isLoggedIn={isLoggedIn}
              />
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <OddsBar market={market} />
            </div>
          )}
        </div>

        <aside className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-24 lg:self-start">
          {settled ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
              <h3 className="mb-2 font-display text-lg font-bold text-foreground">
                {status === "voided" ? "התחזית בוטלה" : "התחזית הוכרעה"}
              </h3>
              {status === "voided" ? (
                <p className="text-sm text-muted-foreground">
                  התחזית בוטלה — הניחושים לא נספרים.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">התוצאה הזוכה:</p>
                  <div className="mt-1 flex items-center gap-3">
                    {winnerPol && <PoliticianPortrait politician={winnerPol} size="sm" />}
                    <p className="text-2xl font-black text-positive">
                      {winningOutcome?.labelHe ?? "—"}
                    </p>
                  </div>
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
          ) : market.type === "multi" ? (
            /* The rows in the main column do the picking (when open) — the
               sidebar carries the resolution criterion / how-it-works hint.
               A closed-but-unresolved multi must NOT fall through to BetPanel,
               which would invite picks that always fail. */
            <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
              <h3 className="mb-2 font-display text-lg font-bold text-foreground">
                איך מכריעים?
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {bundle.market.descriptionHe ??
                  "בוחרים תשובה אחת מהרשימה. כשהתחזית תוכרע — ניחוש נכון נוסף לרקורד שלכם."}
              </p>
            </div>
          ) : (
            <BetPanel market={market} isLoggedIn={isLoggedIn} />
          )}
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <h2 className="mb-3 font-display text-xl font-bold text-foreground">
            הפוליטיקאים בתחזית
          </h2>
          {pols.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {pols.map((p) => (
                <CaricatureCard key={p.id} politician={p} realData />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-6 text-center text-muted-foreground">
              לא שויכו פוליטיקאים לתחזית הזו.
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
      </div>
    </main>
  );
}
