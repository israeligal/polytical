import Link from "next/link";
import { redirect } from "next/navigation";
import type { Market } from "@/lib/types";
import { getSession } from "@/lib/auth";
import { formatCount, timeUntil } from "@/lib/format";
import { getUserStats } from "@/app/lib/leaderboard/repo";
import { getSeasonBoard } from "@/app/lib/seasons/service";
import { getAllPoliticians } from "@/app/lib/politicians/repo";
import { getOwnedPersonIds } from "@/app/lib/cards/service";
import { getUserPredictions, getMarketBundle, getOutcomeCounts, type PortfolioPrediction } from "@/app/lib/markets/repo";
import { getMySuggestions } from "@/app/lib/suggestions/service";
import { categoryLabel } from "@/lib/categories";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import { OddsBar } from "@/components/odds-bar";
import { StatusChip } from "@/components/status-chip";
import { EmptyState } from "@/components/empty-state";
import { getCelebrations } from "@/app/lib/bets/service";
import { CelebrationHost } from "@/components/celebration/celebration-host";
import { PushSettings } from "@/components/pwa/push-settings";
import { NotificationPrefs } from "@/components/pwa/notification-prefs";
import { getMutedPushTypes } from "@/app/lib/notifications/prefs";
import { ChevronForward, Gem, Trophy } from "@/components/icons";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { PoliticianPortrait } from "@/components/politician-portrait";
import { PROFILE_CONTAINER } from "@/components/skeletons/containers";

/** Whether a resolved prediction picked the winning outcome. */
function isCorrect(p: PortfolioPrediction): boolean {
  return p.marketStatus === "resolved" && p.resolvedOutcomeId === p.outcomeId;
}

export default async function ProfilePage() {
  const session = await getSession();
  const user = session?.user ?? null;
  // proxy.ts already gates /profile, but redirect defensively (and to carry the
  // callbackUrl) so a direct hit without a session still lands on login → back.
  if (!user) redirect("/login?callbackUrl=%2Fprofile");

  const [stats, allPredictions, mySuggestions, celebrations, mutedPushTypes, seasonBoard, politicians, ownedIds] =
    await Promise.all([
      getUserStats({ userId: user.id }),
      getUserPredictions({ userId: user.id }),
      getMySuggestions({ userId: user.id }),
      getCelebrations({ userId: user.id }),
      getMutedPushTypes({ userId: user.id }),
      getSeasonBoard({ userId: user.id }),
      getAllPoliticians(),
      getOwnedPersonIds({ userId: user.id }),
    ]);

  // Collection preview: the owned cards (newest-irrelevant — small set), capped.
  const ownedCards = politicians
    .filter((p) => ownedIds.has(p.personId))
    .slice(0, 6)
    .map((p) => dbToCard(p));

  // Open = still predictable or closed-pending; history = resolved or voided.
  const openPred = allPredictions.filter((p) => p.marketStatus === "open" || p.marketStatus === "closed");
  const history = allPredictions.filter((p) => p.marketStatus === "resolved" || p.marketStatus === "voided");

  // Live crowd split for each open prediction's market: pull the (distinct) market
  // bundles + predictor counts once and map id → view model for the OddsBar.
  const openMarketIds = [...new Set(openPred.map((p) => p.marketId))];
  const marketById = new Map<string, Market>();
  await Promise.all(
    openMarketIds.map(async (id) => {
      const b = await getMarketBundle({ marketId: id });
      if (!b) return;
      const counts = await getOutcomeCounts({ marketId: id });
      marketById.set(b.market.id, bundleToMarket({ ...b, counts }));
    }),
  );

  const initial = user.name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <main className={PROFILE_CONTAINER}>
      <CelebrationHost predictions={celebrations} />
      {/* HEADER + STAT CARDS */}
      <section className="mb-8">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="grid h-14 w-14 place-items-center rounded-full bg-muted font-display text-2xl font-black text-foreground ring-1 ring-border"
          >
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
          <StatCard label="ניחושים נכונים">
            <span className="inline-flex items-center gap-1.5">
              <Trophy className="h-5 w-5 text-accent" />
              <span className="nums text-2xl font-black text-gold">{formatCount(stats?.totalWins ?? 0)}</span>
            </span>
          </StatCard>
          <StatCard label="ניחושים שגויים">
            <span className="nums text-2xl font-black text-foreground">
              {formatCount(stats?.totalWrong ?? 0)}
            </span>
          </StatCard>
          <StatCard label="דיוק">
            <span className="nums text-2xl font-black text-foreground">
              {stats?.accuracy ?? 0}%
            </span>
            <span className="block text-xs text-muted-foreground">
              {stats?.totalWins ?? 0}/{stats?.totalResolved ?? 0} שהוכרעו
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
        </div>

        <Link
          href="/my-match"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <span>
            <span className="block text-sm font-bold text-foreground">מי מצביע כמוכם?</span>
            <span className="block text-xs text-muted-foreground">
              ההתאמה בין העמדות שלכם להצבעות האמיתיות במליאה
            </span>
          </span>
          <span className="shrink-0 text-sm font-bold text-primary">לצפייה ←</span>
        </Link>
      </section>

      {/* Two columns on desktop: activity feed (1fr) + personal-progress sidebar
          (340px). Source order puts the sidebar first so on MOBILE the season +
          collection cards land right after the stats; on lg explicit col/row
          placement moves them into the side column (same pattern as /market). */}
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <aside className="space-y-5 lg:col-start-2 lg:row-start-1 lg:self-start xl:sticky xl:top-24">
          <SeasonCard board={seasonBoard} />
          <CollectionCard ownedCount={ownedIds.size} total={politicians.length} preview={ownedCards} />
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-1">

      {/* OPEN PREDICTIONS */}
      <section className="mb-10">
        <h2 className="mb-3 font-display text-2xl font-bold text-foreground">
          ניחושים פתוחים
        </h2>
        {openPred.length > 0 ? (
          <ul className="space-y-3">
            {openPred.map((p) => (
              <li
                key={p.predictionId}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    href={`/market/${p.marketId}`}
                    className="font-display text-lg font-bold text-foreground hover:text-primary"
                  >
                    {p.questionHe}
                  </Link>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-bold text-foreground">
                    הניחוש שלך: {p.outcomeLabelHe}
                  </span>
                </div>
                {marketById.get(p.marketId) && (
                  <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                    <OddsBar market={marketById.get(p.marketId) as Market} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>
            אין לך ניחושים פתוחים.{" "}
            <Link href="/#markets" className="font-semibold text-primary hover:underline">
              בחרו תחזית לנחש עליה
            </Link>
            .
          </EmptyState>
        )}
      </section>

      {/* HISTORY */}
      <section>
        <h2 className="mb-3 font-display text-2xl font-bold text-foreground">
          היסטוריית ניחושים
        </h2>
        {history.length > 0 ? (
          <ul className="space-y-2">
            {history.map((p) => (
              <li
                key={p.predictionId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/market/${p.marketId}`}
                    className="block truncate font-semibold text-foreground hover:text-primary"
                  >
                    {p.questionHe}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    הניחוש שלך: {p.outcomeLabelHe}
                  </p>
                </div>
                <HistoryResult prediction={p} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>עוד לא הוכרעו אצלך ניחושים.</EmptyState>
        )}
      </section>

      {/* MY SUGGESTIONS */}
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold text-foreground">ההצעות לסדר שלי</h2>
          <Link
            href="/suggest"
            className="shrink-0 rounded-full border border-primary px-3 py-1 text-sm font-bold text-primary transition-colors hover:bg-primary/5"
          >
            הצעה לסדר
          </Link>
        </div>
        {mySuggestions.length > 0 ? (
          <ul className="space-y-2">
            {mySuggestions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  {s.marketId ? (
                    <Link
                      href={`/market/${s.marketId}`}
                      className="block truncate font-semibold text-foreground hover:text-primary"
                    >
                      {s.questionHe}
                    </Link>
                  ) : (
                    <p className="truncate font-semibold text-foreground">{s.questionHe}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {categoryLabel(s.category)}
                    {s.reviewNote ? <> · {s.reviewNote}</> : null}
                  </p>
                </div>
                <SuggestionStatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>
            עוד לא הגשתם הצעה לסדר.{" "}
            <Link href="/suggest" className="font-semibold text-primary hover:underline">
              הגישו את הראשונה
            </Link>
            .
          </EmptyState>
        )}
      </section>

      {/* SETTINGS — push notifications (deliberately last: it's plumbing, not progress) */}
      <section className="mt-10">
        <h2 className="mb-3 font-display text-2xl font-bold text-foreground">הגדרות התראות</h2>
        <PushSettings />
        <NotificationPrefs mutedPushTypes={mutedPushTypes} />
      </section>

        </div>
      </div>
    </main>
  );
}

/** Compact season-progress card for the profile sidebar — the /seasons banner
 *  distilled: countdown, correct-count, progress toward the next tier. */
function SeasonCard({ board }: { board: Awaited<ReturnType<typeof getSeasonBoard>> }) {
  if (!board) return null;
  const { season, progress, tiers, ended } = board;
  const nextGoal = tiers.find((t) => !t.reached)?.goalCorrect ?? null;
  const topGoal = tiers.length ? tiers[tiers.length - 1].goalCorrect : 0;
  const barPct = topGoal > 0 ? Math.min(100, (progress / topGoal) * 100) : 0;
  const reachedName = [...tiers].reverse().find((t) => t.reached)?.nameHe ?? null;

  return (
    <Link
      href="/seasons"
      className="group block rounded-card border border-accent/30 bg-card p-5 shadow-sm transition-shadow hover:shadow-glow-gold"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-accent text-sm font-bold text-accent">
          <Trophy className="h-4 w-4" />
          {season.nameHe}
        </span>
        <ChevronForward className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover:-translate-x-0.5" />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {ended ? "העונה הסתיימה" : <>מסתיימת {timeUntil(season.endAtIso)}</>}
        {reachedName ? <> · דרגה נוכחית: <span className="font-bold text-foreground">{reachedName}</span></> : null}
      </p>

      <div className="mt-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="font-accent text-xs font-bold text-muted-foreground">ניחושים נכונים העונה</span>
          <span className="nums font-display text-xl text-gold">{formatCount(progress)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${barPct}%` }} />
        </div>
        {nextGoal !== null && !ended && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            עוד <span className="nums font-bold text-foreground">{formatCount(Math.max(0, nextGoal - progress))}</span> עד הדרגה הבאה
          </p>
        )}
      </div>
    </Link>
  );
}

/** Compact collection card for the profile sidebar — owned count + a peek at
 *  the latest owned caricatures, linking into the full gallery. */
function CollectionCard({
  ownedCount,
  total,
  preview,
}: {
  ownedCount: number;
  total: number;
  preview: ReturnType<typeof dbToCard>[];
}) {
  return (
    <Link
      href="/collection"
      className="group block rounded-card border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-accent text-sm font-bold text-primary">
          <Gem rarity="legendary" className="h-4 w-4" />
          האוסף שלי
        </span>
        <ChevronForward className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover:-translate-x-0.5" />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        <span className="nums font-bold text-foreground">{formatCount(ownedCount)}</span>
        {" / "}
        <span className="nums">{formatCount(total)}</span> קלפים נאספו
      </p>

      {preview.length > 0 ? (
        <div className="mt-3 flex -space-x-2 space-x-reverse">
          {preview.map((p) => (
            <span key={p.id} className="rounded-full ring-2 ring-card">
              <PoliticianPortrait politician={p} size="sm" />
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          נחשו נכון בתחזיות כדי לאסוף את הקלף הראשון שלכם.
        </p>
      )}
    </Link>
  );
}

function SuggestionStatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  const map = {
    pending: { he: "ממתין", tone: "neutral" },
    approved: { he: "אושר", tone: "positive" },
    rejected: { he: "נדחה", tone: "negative" },
  } as const;
  const { he, tone } = map[status];
  return <StatusChip tone={tone}>{he}</StatusChip>;
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-1.5 text-xs font-bold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** A resolved/voided prediction's outcome chip: right, wrong, or voided. */
function HistoryResult({ prediction }: { prediction: PortfolioPrediction }) {
  if (prediction.marketStatus === "voided") {
    return (
      <StatusChip tone="neutral" className="text-sm">
        בוטל
      </StatusChip>
    );
  }
  if (isCorrect(prediction)) {
    return (
      <StatusChip tone="positive" className="text-sm">
        ניחשת נכון
      </StatusChip>
    );
  }
  return (
    <StatusChip tone="negative" className="text-sm">
      טעית
    </StatusChip>
  );
}
