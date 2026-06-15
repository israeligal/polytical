import Link from "next/link";
import type { GroupVoteStancesView } from "@/app/lib/groups/stance-service";
import { groupLabel } from "@/lib/group-display";
import { FALLBACK_HANDLE } from "@/app/lib/onboarding/handle";

/**
 * "איך הקואליציה הצביעה" — per the viewer's sharing groups, fellow consenting
 * members' directions on this vote. Presentational; the data is already gated
 * (only sharing groups, only consenting active members) by the service.
 */
export function GroupVoteStances({ groups }: { groups: GroupVoteStancesView[] }) {
  if (groups.length === 0) return null;
  return (
    <section className="mt-6 space-y-4">
      <h2 className="font-display text-xl font-bold text-foreground">איך הקואליציה הצביעה</h2>
      {groups.map(({ group, stances, stats }) => (
        <div key={group.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link href={`/g/${group.slug}`} className="min-w-0 truncate font-display text-base font-bold text-foreground hover:text-primary">
              {groupLabel(group)}
            </Link>
            <span className="shrink-0 text-xs text-muted-foreground">
              <span className="nums">{stats.sharing}</span> מתוך <span className="nums">{stats.total}</span> שיתפו
            </span>
          </div>
          <ul className="space-y-2">
            {stances.map((s) => (
              <li key={s.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-foreground"><bdi>@{s.handle ?? FALLBACK_HANDLE}</bdi></span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    s.stance === "for" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
                  }`}
                >
                  {s.stance === "for" ? "בעד" : "נגד"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
