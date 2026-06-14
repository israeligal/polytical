import { getSession } from "@/lib/auth";
import { getAgendaFeed, type AgendaFeedItem } from "@/app/lib/agenda/read-repo";
import { getAgendaStancesForItems } from "@/app/lib/agenda-stances/repo";
import { AGENDA_AGGREGATE_MIN_STANCERS } from "@/app/lib/agenda-stances/service";
import { AgendaCard, type AgendaCommunity } from "@/components/agenda-card";
import { AgendaHeroSpotlight } from "@/components/hero";
import { EmptyState } from "@/components/empty-state";
import { AGENDA_CONTAINER } from "@/components/skeletons/containers";
import { track } from "@/app/lib/track";

// Community split, k-anonymised: below the threshold the percentage is withheld
// (the raw total is still shown as a "be the first" nudge), mirroring user_stances.
function communityOf(item: AgendaFeedItem): AgendaCommunity {
  const total = item.forCount + item.againstCount;
  const forPct = total >= AGENDA_AGGREGATE_MIN_STANCERS ? Math.round((item.forCount / total) * 100) : null;
  return { forPct, total };
}

// "על סדר היום" — bills approaching their decisive 2nd-3rd reading vote, where a
// user can state a stance in advance. The most-imminent item leads as a hero;
// each card links to the bill page (where the בעד/נגד widget lives) and shows
// its proposing MKs.
export default async function AgendaPage() {
  const [feed, session] = await Promise.all([getAgendaFeed({}), getSession()]);
  track("agenda_viewed", { count: feed.length });
  const myStances = session?.user
    ? await getAgendaStancesForItems({ userId: session.user.id, agendaItemIds: feed.map((f) => f.id) })
    : new Map<string, "for" | "against">();

  const hero = feed[0] ?? null;
  const rest = feed.slice(1);

  return (
    <>
      {hero && (
        <section className="border-b border-border bg-muted">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
            <AgendaHeroSpotlight item={hero} community={communityOf(hero)} mine={myStances.get(hero.id) ?? null} />
          </div>
        </section>
      )}

      <main className={AGENDA_CONTAINER}>
        <p className="text-sm font-bold text-primary">על סדר היום</p>
        <h1 className="font-display text-3xl font-black text-foreground sm:text-4xl">הצעות בדרך להצבעה</h1>
        <p className="mb-6 mt-2 text-lg text-muted-foreground">
          הצעות חוק שמתקרבות לקריאה השנייה והשלישית במליאה. אפשר לקבוע עמדה מראש — והיא תיספר כעמדה רגילה כשתתקיים ההצבעה.
        </p>

        {feed.length === 0 ? (
          <EmptyState>אין כרגע הצעות על סדר היום. נתעדכן כשיתקרבו הצבעות חדשות במליאה.</EmptyState>
        ) : (
          rest.length > 0 && (
            <div className="grid gap-3">
              {rest.map((item) => (
                <AgendaCard
                  key={item.id}
                  item={item}
                  community={communityOf(item)}
                  mine={myStances.get(item.id) ?? null}
                />
              ))}
            </div>
          )
        )}
      </main>
    </>
  );
}
