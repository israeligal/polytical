import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getAgendaFeed } from "@/app/lib/agenda/read-repo";
import { getAgendaStancesForItems } from "@/app/lib/agenda-stances/repo";
import { AGENDA_AGGREGATE_MIN_STANCERS } from "@/app/lib/agenda-stances/service";
import { EmptyState } from "@/components/empty-state";
import { AGENDA_CONTAINER } from "@/components/skeletons/containers";
import { formatDate } from "@/lib/time";
import { track } from "@/app/lib/track";

// "על סדר היום" — bills approaching their decisive 2nd-3rd reading vote, where a
// user can state a stance in advance. Each row links to the bill page (where the
// בעד/נגד widget lives); the community split is k-anonymised.
export default async function AgendaPage() {
  const [feed, session] = await Promise.all([getAgendaFeed({}), getSession()]);
  track("agenda_viewed", { count: feed.length });
  const myStances = session?.user
    ? await getAgendaStancesForItems({ userId: session.user.id, agendaItemIds: feed.map((f) => f.id) })
    : new Map<string, "for" | "against">();

  return (
    <main className={AGENDA_CONTAINER}>
      <p className="text-sm font-semibold text-muted-foreground">על סדר היום</p>
      <h1 className="mt-1 font-display text-3xl font-black text-foreground">הצעות בדרך להצבעה</h1>
      <p className="mb-6 mt-3 text-sm leading-relaxed text-muted-foreground">
        הצעות חוק שמתקרבות לקריאה השנייה והשלישית במליאה. אפשר לקבוע עמדה מראש — והיא תיספר כעמדה רגילה כשתתקיים ההצבעה.
      </p>

      {feed.length === 0 ? (
        <EmptyState>אין כרגע הצעות על סדר היום. נתעדכן כשיתקרבו הצבעות חדשות במליאה.</EmptyState>
      ) : (
        <div className="grid gap-3">
          {feed.map((item) => {
            const total = item.forCount + item.againstCount;
            const forPct = total >= AGENDA_AGGREGATE_MIN_STANCERS ? Math.round((item.forCount / total) * 100) : null;
            const mine = myStances.get(item.id) ?? null;
            return (
              <Link
                key={item.id}
                href={item.billId != null ? `/bill/${item.billId}` : "/agenda"}
                className="block rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/60"
              >
                <span className="line-clamp-2 font-semibold text-foreground">{item.titleHe}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {item.statusDescHe && <span>{item.statusDescHe}</span>}
                  {item.expectedDate && (
                    <span className="nums">צפוי: {formatDate(`${item.expectedDate}T00:00:00Z`)}</span>
                  )}
                  {forPct != null && (
                    <span className="nums">{forPct}% מהקהילה בעד · {total} עמדות</span>
                  )}
                </span>
                {mine && (
                  <span
                    className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      mine === "for" ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative"
                    }`}
                  >
                    העמדה שלכם: {mine === "for" ? "בעד" : "נגד"}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
