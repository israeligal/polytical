import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { db } from "@/app/lib/db";
import { getMarketBundle, getOutcomeCounts, getUserPositions } from "@/app/lib/markets/repo";
import { getMembership, getGroupMotionPicks } from "@/app/lib/groups/repo";
import { CopyMotionLink } from "@/components/groups/copy-motion-link";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import { getUnpredictedOpenMarketCards } from "@/app/lib/markets/feed";
import { getPoliticianByPersonId } from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { getCelebrations } from "@/app/lib/bets/service";
import { marketToOwnDeckQuestion, marketCardToQueueQuestion, mergePoliticians } from "@/app/lib/deck/build";
import { CelebrationHost } from "@/components/celebration/celebration-host";
import { OddsBar } from "@/components/odds-bar";
import { QuestionDeck } from "@/components/question-deck";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { CaricatureCard } from "@/components/caricature-card";
import { CategoryBadge, Countdown, HotBadge } from "@/components/badges";
import { StatusChip } from "@/components/status-chip";
import { CommentThread } from "@/components/comments/comment-thread";
import { Ballot, ChatBubble, ChevronForward, Users } from "@/components/icons";
import { MARKET_CONTAINER , MARKET_GRID } from "@/components/skeletons/containers";

export default async function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getMarketBundle({ marketId: id });
  if (!bundle) notFound();

  const session = await getSession();
  // Group motions are member-only — gate access (and hide global chrome below).
  const groupId = bundle.market.groupId;
  if (groupId) {
    // A logged-out member following a shared vote link → bounce through login
    // back to the motion (instead of a dead 404). Non-members still 404 below.
    if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/market/${id}`)}`);
    const membership = await getMembership({ groupId, userId: session.user.id });
    if (!membership || membership.status !== "active") notFound();
  }

  const counts = await getOutcomeCounts({ marketId: id });
  const market = bundleToMarket({ ...bundle, counts });
  const status = bundle.market.status;
  const settled = status === "resolved" || status === "voided";
  const winningOutcome =
    status === "resolved" && bundle.market.resolvedOutcomeId
      ? bundle.outcomes.find((o) => o.id === bundle.market.resolvedOutcomeId)
      : undefined;

  const isLoggedIn = Boolean(session?.user);
  const predictors = market.outcomes.reduce((sum, o) => sum + o.predictors, 0);
  // The interactive deck renders only on OPEN markets — an admin-closed (or
  // draft/voided) multi must not invite picks that always fail. Past-closeAt
  // open markets keep parity: the server action is the authoritative closeAt guard.
  const isOpen = bundle.market.status === "open";

  // Featured MK cards + the viewer's current pick (highlighted row + the
  // המנדט-שלי header chip, so it's fetched for every market type/status) + deck
  // queue are independent reads — overlap them instead of paying serial roundtrips.
  const [polRows, positions, queueCards] = await Promise.all([
    Promise.all(bundle.personIds.map((personId) => getPoliticianByPersonId({ personId }))),
    session?.user
      ? getUserPositions({ userId: session.user.id, marketId: id })
      : Promise.resolve([]),
    // No global queue inside a group motion's deck (would mix global markets
    // into the group context, and they're a different audience).
    isOpen && session?.user && !groupId
      ? getUnpredictedOpenMarketCards({ db, userId: session.user.id, excludeMarketId: id, limit: 6 })
      : Promise.resolve([]),
  ]);
  const pols = polRows.filter((row): row is NonNullable<typeof row> => row !== null).map(dbToCard);
  const initialPickId = positions[0]?.outcomeId ?? null;
  const myPickLabel = initialPickId
    ? (bundle.outcomes.find((o) => o.id === initialPickId)?.labelHe ?? null)
    : null;

  // Group-motion reveal gate: members see the crowd split + friends' picks only
  // after locking their own pick (or once the motion is settled). Group motions
  // go open→resolved (no intermediate closed state), so this covers all reveals.
  const groupReveal = !groupId || settled || initialPickId != null;
  const friendsPicks =
    groupId && groupReveal && session?.user
      ? await getGroupMotionPicks({ marketId: id, viewerId: session.user.id })
      : null;
  // The deck embeds per-outcome shares into the client payload — for an
  // unrevealed group motion that would leak the split (esp. multi, which renders
  // it). Feed the deck a zero-count market until the viewer has predicted.
  const deckMarket = groupReveal ? market : bundleToMarket({ ...bundle, counts: new Map() });

  // Build deck for open markets (shown to all — logged-out sees login CTA on first card).
  const deckQuestions = isOpen
    ? [
        marketToOwnDeckQuestion({ market: deckMarket, initialPickId }),
        ...queueCards.map(marketCardToQueueQuestion),
      ]
    : [];
  // Merge queue politicians into the page's own list so all portraits resolve.
  const deckPoliticians = isOpen
    ? mergePoliticians(pols, queueCards.flatMap((c) => c.featured))
    : pols;
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
    <main className={MARKET_CONTAINER}>
      <CelebrationHost predictions={celebrations} />
      <Link
        href={groupId ? `/g/by-id/${groupId}` : "/markets"}
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        {groupId ? "חזרה לקואליציה" : "חזרה לתחזיות"}
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
      <div className={MARKET_GRID}>
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="mb-3 flex items-center gap-3">
            <CategoryBadge category={market.category} />
            {market.hot && <HotBadge />}
          </div>

          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-3xl font-black leading-tight text-foreground sm:text-4xl">
              {market.question}
            </h1>
            {/* In focus on this forecast — surface the CTA inline so mobile
                doesn't need the hamburger to reach it (desktop already has
                it in the header nav). Hidden on group motions (no global suggest). */}
            {!groupId && (
              <Link
                href="/suggest"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-3.5 py-1.5 text-sm font-bold text-gold transition-colors hover:border-accent hover:bg-accent/20 md:hidden"
              >
                <Ballot className="h-4 w-4" />
                הצעה לסדר
              </Link>
            )}
            {/* Group motions: share the vote link with fellow members. */}
            {groupId && <CopyMotionLink marketId={market.id} />}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4 text-accent" />
              <span className="nums font-bold text-foreground">
                {formatCount(predictors)}
              </span>
              נתנו מנדט
            </span>
            {myPickLabel && (
              <StatusChip tone="positive">המנדט שלי: {myPickLabel}</StatusChip>
            )}
            <span className="text-border">•</span>
            <Countdown closeAt={market.closeAt} />
          </div>

          {isOpen ? (
            /* Open markets: OddsBar (binary) or the pct overview (multi) then the
               QuestionDeck below — the deck is the primary answering surface for
               both types on the main column. */
            <>
              <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
                {groupReveal ? (
                  <OddsBar market={market} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    בחרו תשובה כדי לראות איך שאר חברי הקואליציה ניבאו.
                  </p>
                )}
              </div>
              <div className="mt-6">
                {/* key=market.id: guarantees a fresh QuestionDeck mount if the
                    user navigates between /market/[id] pages without a full
                    reload, so the frozen question list (BUG 2 fix) always
                    starts from the correct set of questions for this market. */}
                <QuestionDeck
                  key={market.id}
                  questions={deckQuestions}
                  politicians={deckPoliticians}
                  loggedIn={isLoggedIn}
                  feedHref={groupId ? `/g/by-id/${groupId}` : "/markets"}
                  feedLabel={groupId ? "חזרה לקואליציה" : "חזרה לתחזיות"}
                />
              </div>
            </>
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
                  התחזית בוטלה — המנדטים לא נספרים.
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
          ) : (
            /* Open or closed-unresolved: the deck in the main column is the
               answering surface — the aside carries the how-it-works hint for
               all non-settled states (both binary and multi). */
            <div className="rounded-2xl border border-border bg-card p-5 shadow-md">
              <h3 className="mb-2 font-display text-lg font-bold text-foreground">
                איך מכריעים?
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {bundle.market.descriptionHe ??
                  (market.type === "multi"
                    ? "בוחרים תשובה אחת מהרשימה. כשהתחזית תוכרע — מנדט מדויק נוסף לרקורד שלכם."
                    : "בוחרים כן או לא. כשהתחזית תוכרע — מנדט מדויק נוסף לרקורד שלכם.")}
              </p>
            </div>
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

          {friendsPicks?.revealed && friendsPicks.picks.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 inline-flex items-center gap-2 font-display text-xl font-bold text-foreground">
                <Users className="h-5 w-5 text-accent" />
                מי ניבא מה
              </h2>
              <ul className="space-y-2">
                {friendsPicks.picks.map((p) => (
                  <li
                    key={p.userId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-foreground">{p.handle ? `@${p.handle}` : p.name}</span>
                    <span className="shrink-0 font-semibold text-primary">{p.outcomeLabelHe}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <h2 className="mb-3 mt-8 inline-flex items-center gap-2 font-display text-xl font-bold text-foreground">
            <ChatBubble className="h-5 w-5 text-primary" />
            מליאה
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
