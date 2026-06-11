import Link from "next/link";
import { notFound } from "next/navigation";
import type { Politician } from "@/lib/types";
import { appearsIn, voted } from "@/lib/gender";
import {
  getAllPoliticians,
  getPoliticianActivity,
  getPoliticianByPersonId,
} from "@/app/lib/politicians/repo";
import { dbToCard } from "@/app/lib/politicians/adapter";
import { CURRENT_KNESSET } from "@/app/lib/knesset/odata";
import { getMarketsForPolitician, getOutcomeCountsForMarkets } from "@/app/lib/markets/repo";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import { CaricatureCard } from "@/components/caricature-card";
import { MarketCard } from "@/components/market-card";
import { ChevronForward, Trophy, Lock } from "@/components/icons";
import { getSession } from "@/lib/auth";
import { isOwned, getProgressByPerson } from "@/app/lib/cards/service";
import { unlockThreshold } from "@/lib/rarity";
import { getRecentMkVotes } from "@/app/lib/votes/read-repo";
import { formatDate } from "@/lib/time";
import { POLITICIAN_CONTAINER , POLITICIAN_GRID } from "@/components/skeletons/containers";

export default async function PoliticianPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const personId = Number(id);
  const row = Number.isInteger(personId)
    ? await getPoliticianByPersonId({ personId })
    : null;
  if (!row) notFound();

  const politician = dbToCard(row);
  const [activity, recentVotes] = await Promise.all([
    getPoliticianActivity({ personId }),
    getRecentMkVotes({ personId }),
  ]);

  // Collection is unlocked by ACCURACY: getting `threshold` correct predictions on
  // this MK's markets auto-grants the card. Show ownership or progress toward it.
  const session = await getSession();
  const owned = session?.user ? await isOwned({ userId: session.user.id, personId }) : false;
  const threshold = unlockThreshold({ personId, role: row.roleHe });
  const correctCount = session?.user
    ? (await getProgressByPerson({ userId: session.user.id })).get(personId) ?? 0
    : 0;

  // Markets that feature this MK → the same view-model the homepage cards use.
  // Featured portraits resolve against one politicians map (no N+1), mirroring
  // app/page.tsx so each card can show every MK it touches, not just this one.
  const marketBundles = await getMarketsForPolitician({ personId });
  const polById = new Map<string, Politician>();
  for (const p of await getAllPoliticians()) polById.set(String(p.personId), dbToCard(p));
  const featuredFor = (ids: number[]): Politician[] =>
    ids.map((id) => polById.get(String(id))).filter((p): p is Politician => Boolean(p));
  const countsByMarket = await getOutcomeCountsForMarkets({
    marketIds: marketBundles.map((b) => b.market.id),
  });
  const marketCards = marketBundles.map((b) => ({
    market: bundleToMarket({ ...b, counts: countsByMarket.get(b.market.id) }),
    featured: featuredFor(b.personIds),
  }));

  return (
    <main className={POLITICIAN_CONTAINER}>
      <Link
        href="/politicians"
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        חזרה לפוליטיקאים
      </Link>

      <div className={POLITICIAN_GRID}>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <CaricatureCard politician={politician} realData interactive={false} />
          {session?.user ? (
            owned ? (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-bold text-accent">
                <Trophy className="h-4 w-4" />
                הקלף באוסף שלך
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  פתחו את הקלף בדיוק
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  צדקו <span className="nums font-bold text-foreground">{threshold}</span> פעמים בתחזיות {appearsIn({ gender: politician.gender ?? null })} כדי לאסוף את הקלף.
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500"
                    style={{ width: `${Math.min(100, (correctCount / threshold) * 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  <span className="nums font-bold text-foreground">{correctCount}</span>/{threshold} מנדטים מדויקים
                </p>
              </div>
            )
          ) : (
            <Link
              href="/login?callbackUrl=%2Fcollection"
              className="mt-4 block rounded-full border border-border px-4 py-2.5 text-center text-sm font-bold text-muted-foreground transition-colors hover:text-primary"
            >
              התחברו כדי לאסוף את הקלף בדיוק
            </Link>
          )}
        </div>

        <div>
          <h1 className="font-display text-3xl font-black text-foreground sm:text-4xl">
            {politician.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            <span>
              {politician.role}
              {politician.party ? ` · ${politician.party}` : ""}
            </span>
            {politician.isNorwegianMinister && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-bold text-foreground"
                title="שר נורבגי — שר שאינו חבר הכנסת: לפי החוק הנורבגי הוא התפטר ממושבו, ח״כ מסיעתו נכנס במקומו, והוא ממשיך לכהן כשר."
              >
                נורבגי
                <span
                  aria-hidden
                  className="grid h-4 w-4 place-items-center rounded-full border border-border text-[10px] text-muted-foreground"
                >
                  i
                </span>
              </span>
            )}
          </p>

          <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {politician.facts.map((f) => (
              <div
                key={f.label}
                className="flex items-center justify-between gap-3 bg-card px-4 py-3"
              >
                <dt className="text-sm text-muted-foreground">{f.label}</dt>
                <dd className="nums text-sm font-bold text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">
            פעילות פרלמנטרית
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card px-4 py-4 text-center">
              <p className="nums font-display text-3xl font-black text-primary">
                {(activity.lifetime ?? activity.current).bills}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">הצעות חוק</p>
              {activity.lifetime && (
                <p className="nums mt-1 text-xs text-muted-foreground">
                  <bdi>{activity.current.bills}</bdi> בכנסת ה-{CURRENT_KNESSET}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-4 text-center">
              <p className="nums font-display text-3xl font-black text-primary">
                {(activity.lifetime ?? activity.current).queries}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">שאילתות</p>
              {activity.lifetime && (
                <p className="nums mt-1 text-xs text-muted-foreground">
                  <bdi>{activity.current.queries}</bdi> בכנסת ה-{CURRENT_KNESSET}
                </p>
              )}
            </div>
          </div>
          {activity.recentBills.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-bold text-primary">
                הצעות חוק אחרונות
              </h3>
              <ul className="space-y-2">
                {activity.recentBills.map((b) => (
                  <li
                    key={b.billId}
                    className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground"
                  >
                    {b.nameHe}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            נתונים ממקור רשמי · הכנסת (OData)
          </p>

          <h2 className="mb-3 mt-8 font-display text-xl font-bold text-foreground">הצבעות אחרונות</h2>
          {recentVotes.for.length === 0 && recentVotes.against.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-10 text-center">
              <p className="font-bold text-foreground">אין הצבעות מתועדות</p>
              <p className="mt-1 text-sm text-muted-foreground">
                טרם נרשמו ל{politician.name} הצבעות אישיות במליאת הכנסת ה-25.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  { key: "for", title: `${voted({ gender: politician.gender ?? null })} בעד`, votes: recentVotes.for },
                  { key: "against", title: `${voted({ gender: politician.gender ?? null })} נגד`, votes: recentVotes.against },
                ] as const
              ).map((col) => (
                <div key={col.key}>
                  <h3 className={`mb-2 text-sm font-bold ${col.key === "for" ? "text-positive" : "text-negative"}`}>
                    {col.title}
                  </h3>
                  {col.votes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">אין הצבעות {col.key === "for" ? "בעד" : "נגד"} לאחרונה.</p>
                  ) : (
                    <ul className="grid gap-2">
                      {col.votes.map((v) => (
                        <li key={v.voteId}>
                          <Link
                            href={`/vote/${v.voteId}`}
                            className="block rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted/60"
                          >
                            <span className="line-clamp-2">{v.titleHe}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground nums">
                              {formatDate(v.voteDate)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-start">
            <Link href="/votes" className="text-sm font-semibold text-primary hover:underline">
              לכל ההצבעות במליאה
            </Link>
          </p>

          <div className="mb-3 mt-8 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-foreground">
              התחזיות של {politician.name}
            </h2>
            <Link
              href={`/suggest?person=${personId}`}
              className="shrink-0 rounded-full border border-primary px-3 py-1 text-sm font-bold text-primary transition-colors hover:bg-primary/5"
            >
              הצעה לסדר
            </Link>
          </div>
          {marketCards.length > 0 ? (
            <div className="grid gap-4">
              {marketCards.map((c) => (
                <MarketCard key={c.market.id} market={c.market} featured={c.featured} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-10 text-center">
              <p className="font-display text-lg font-bold text-foreground">עדיין אין תחזיות</p>
              <p className="mt-1 text-sm text-muted-foreground">
                עוד לא נפתחו תחזיות סביב {politician.name}.{" "}
                <Link href={`/suggest?person=${personId}`} className="font-bold text-primary hover:underline">
                  הגישו הצעה לסדר
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
