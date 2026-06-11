import Link from "next/link";
import { redirect } from "next/navigation";
import type { Market } from "@/lib/types";
import { getSession } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { getUserStats } from "@/app/lib/leaderboard/repo";
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
import { Trophy } from "@/components/icons";

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

  const [stats, allPredictions, mySuggestions, celebrations, mutedPushTypes] = await Promise.all([
    getUserStats({ userId: user.id }),
    getUserPredictions({ userId: user.id }),
    getMySuggestions({ userId: user.id }),
    getCelebrations({ userId: user.id }),
    getMutedPushTypes({ userId: user.id }),
  ]);

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
    <main className="mx-auto max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
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

      {/* SETTINGS — push notifications */}
      <PushSettings />
      <NotificationPrefs mutedPushTypes={mutedPushTypes} />

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
              בחרו שוק לנחש עליו
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
    </main>
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
