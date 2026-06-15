import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getGroupForMember } from "@/app/lib/groups/service";
import { getGroupScoreboard, listGroupMarkets, listActiveMembers } from "@/app/lib/groups/repo";
import { getStanceSharing } from "@/app/lib/groups/stance-service";
import { StanceSharingToggle } from "@/components/groups/stance-sharing-toggle";
import { getOutcomeCountsForMarkets } from "@/app/lib/markets/repo";
import { GroupActionBar } from "@/components/groups/group-action-bar";
import { CopyMotionLink } from "@/components/groups/copy-motion-link";
import { StatusChip } from "@/components/status-chip";
import { Countdown } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { GroupNotFoundError, NotGroupMemberError } from "@/app/lib/errors";
import { GROUP_CONTAINER, GROUP_GRID } from "@/components/skeletons/containers";
import { groupIcon, groupTextOnly } from "@/lib/group-display";
import { FALLBACK_HANDLE } from "@/app/lib/onboarding/handle";

const STATUS_HE: Record<string, { label: string; tone: "positive" | "neutral" | "negative" }> = {
  open: { label: "פתוחה", tone: "positive" },
  closed: { label: "נסגרה", tone: "neutral" },
  resolved: { label: "הוכרעה", tone: "neutral" },
  voided: { label: "בוטלה", tone: "negative" },
  draft: { label: "טיוטה", tone: "neutral" },
};

export default async function GroupHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.user) notFound(); // /g is proxy-protected; defensive
  const userId = session.user.id;

  let group, membership;
  try {
    ({ group, membership } = await getGroupForMember({ slug, userId }));
  } catch (e) {
    if (e instanceof NotGroupMemberError || e instanceof GroupNotFoundError) notFound();
    throw e;
  }

  const [board, motions, roster, sharingStances] = await Promise.all([
    getGroupScoreboard({ groupId: group.id }),
    listGroupMarkets({ groupId: group.id }),
    listActiveMembers({ groupId: group.id }),
    getStanceSharing({ groupId: group.id, userId }),
  ]);
  const counts = await getOutcomeCountsForMarkets({ marketIds: motions.map((m) => m.id) });
  const predictorCount = (marketId: string) =>
    [...(counts.get(marketId)?.values() ?? [])].reduce((a, b) => a + b, 0);

  const isHome = session.user.defaultGroupId === group.id;

  return (
    <main className={GROUP_CONTAINER}>
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-3xl leading-none">{groupIcon(group)}</span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-3xl text-foreground sm:text-4xl">{groupTextOnly(group)}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="nums font-bold text-foreground">{roster.length}</span> חברים ·{" "}
              {membership.role === "owner" ? "אתם הבעלים" : membership.role === "admin" ? "אתם מנהלים" : "אתם חברים"}
            </p>
          </div>
        </div>
        {group.descriptionHe && <p className="mt-2 text-sm text-muted-foreground">{group.descriptionHe}</p>}
        <div className="mt-4">
          <GroupActionBar groupId={group.id} inviteCode={group.inviteCode} isHome={isHome} />
        </div>
      </header>

      <div className={GROUP_GRID}>
        {/* Motions feed */}
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-foreground">הצעות לסדר</h2>
            <Link
              href={`/g/${group.slug}/new`}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              + העלו הצעה
            </Link>
          </div>
          {motions.length === 0 ? (
            <EmptyState>עדיין אין הצעות לסדר. היו הראשונים להעלות אחת!</EmptyState>
          ) : (
            <ul className="space-y-3">
              {motions.map((m) => {
                const st = STATUS_HE[m.status] ?? STATUS_HE.open;
                return (
                  <li key={m.id} className="relative">
                    <Link
                      href={`/market/${m.id}`}
                      className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <StatusChip tone={st.tone}>{st.label}</StatusChip>
                        {m.status === "open" && <Countdown closeAt={m.closeAt.toISOString()} />}
                      </div>
                      <p className="font-display text-lg font-bold leading-snug text-foreground">{m.questionHe}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="nums">{predictorCount(m.id)}</span> חברים ניבאו
                      </p>
                    </Link>
                    {/* Share-to-vote chip — sibling of the Link so a copy never navigates. */}
                    <div className="absolute end-3 top-3 z-10">
                      <CopyMotionLink marketId={m.id} variant="chip" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Scoreboard + roster */}
        <aside className="min-w-0 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 font-display text-lg font-bold text-foreground">לוח התוצאות</h2>
            {board.every((e) => e.groupResolved === 0) ? (
              <p className="text-sm text-muted-foreground">הדירוג ייפתח כשהצעה ראשונה תוכרע.</p>
            ) : (
              <ol className="space-y-2">
                {board.map((e) => (
                  <li key={e.userId} className="flex items-center gap-3 text-sm">
                    <span className="nums w-5 text-center font-bold text-muted-foreground">{e.rank}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                      <bdi>@{e.handle ?? FALLBACK_HANDLE}</bdi>
                    </span>
                    <span className="nums font-bold text-positive">{e.groupWins}</span>
                    <span className="nums text-xs text-muted-foreground">{e.accuracy}%</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 font-display text-lg font-bold text-foreground">חברים</h2>
            <ul className="space-y-2">
              {roster.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-foreground"><bdi>@{m.handle ?? FALLBACK_HANDLE}</bdi></span>
                  {m.role !== "member" && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {m.role === "owner" ? "בעלים" : "מנהל/ת"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <StanceSharingToggle groupId={group.id} slug={group.slug} initialShared={sharingStances} />
        </aside>
      </div>
    </main>
  );
}
