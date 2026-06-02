import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getSeasonBoard } from "@/app/lib/seasons/service";
import { formatCoins, timeUntil } from "@/lib/format";
import { Trophy, ChevronForward } from "@/components/icons";
import { EmptyState } from "@/components/empty-state";
import { SeasonTierRow } from "@/components/seasons/season-tier-row";

export const metadata = {
  title: "העונה · פוליטיקל",
  description: "צברו שקוינים בהימורים בעונה הנוכחית ותבעו פרסים בכל דרגה.",
};

// Public season board — anonymous visitors see the tiers + countdown (progress 0
// until they sign in). No cron: claimability is computed live from the ledger.
export default async function SeasonsPage() {
  const session = await getSession();
  const board = await getSeasonBoard({ userId: session?.user?.id ?? null });

  if (!board) {
    return (
      <main className="mx-auto max-w-2xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <header className="mb-6">
          <p className="font-accent text-sm font-bold text-accent">העונה</p>
          <h1 className="font-display text-4xl text-foreground">פרסי עונה</h1>
        </header>
        <EmptyState>אין עונה פעילה כרגע — חזרו בקרוב.</EmptyState>
      </main>
    );
  }

  const { season, progress, tiers, ended } = board;
  const nextGoal = tiers.find((t) => t.state === "locked")?.goalAmount ?? null;
  const topGoal = tiers.length ? tiers[tiers.length - 1].goalAmount : 0;
  const barPct = topGoal > 0 ? Math.min(100, (progress / topGoal) * 100) : 0;

  return (
    <main className="mx-auto max-w-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        חזרה לדף הבית
      </Link>

      {/* banner */}
      <section className="mb-6 overflow-hidden rounded-card border border-accent/30 bg-card p-6 shadow-glow-gold">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent">
            <Trophy className="h-6 w-6" />
          </span>
          <div>
            <p className="font-accent text-sm font-bold text-accent">העונה</p>
            <h1 className="font-display text-3xl text-foreground">{season.nameHe}</h1>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          {ended ? (
            "העונה הסתיימה."
          ) : (
            <>
              מסתיימת <span className="font-bold text-foreground">{timeUntil(season.endAtIso)}</span>
            </>
          )}
        </p>

        {/* progress */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="font-accent text-xs font-bold text-muted-foreground">השקוינים שהימרתם העונה</span>
            <span className="nums font-display text-2xl text-gold">{formatCoins(progress)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${barPct}%` }} />
          </div>
          {nextGoal !== null && !ended && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              עוד <span className="nums font-bold text-foreground">{formatCoins(Math.max(0, nextGoal - progress))}</span> עד הדרגה הבאה
            </p>
          )}
        </div>

        {!session?.user && (
          <Link
            href="/login?callbackUrl=%2Fseasons"
            className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            התחברו כדי לצבור התקדמות
          </Link>
        )}
      </section>

      {/* tiers */}
      <h2 className="mb-3 font-display text-xl text-foreground">דרגות הפרס</h2>
      <div className="space-y-3">
        {tiers.map((t) => (
          <SeasonTierRow
            key={t.id}
            tierId={t.id}
            ordinal={t.ordinal}
            nameHe={t.nameHe}
            goalAmount={t.goalAmount}
            rewardAmount={t.rewardAmount}
            state={t.state}
          />
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        ההתקדמות נמדדת לפי סך השקוינים שהימרתם בחלון העונה. פרס שנתבע נשאר שלכם.
      </p>
    </main>
  );
}
