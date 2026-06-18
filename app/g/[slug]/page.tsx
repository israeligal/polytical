import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getGroupForMember } from "@/app/lib/groups/service";
import { getGroupScoreboard, listActiveMembers } from "@/app/lib/groups/repo";
import { getStanceSharing } from "@/app/lib/groups/stance-service";
import { StanceSharingToggle } from "@/components/groups/stance-sharing-toggle";
import { GroupActionBar } from "@/components/groups/group-action-bar";
import { GroupNotFoundError, NotGroupMemberError } from "@/app/lib/errors";
import { GROUP_CONTAINER } from "@/components/skeletons/containers";
import { groupIcon, groupTextOnly } from "@/lib/group-display";
import { FALLBACK_HANDLE } from "@/app/lib/onboarding/handle";
import { Ballot } from "@/components/icons";
import { UserAvatar } from "@/components/user-avatar";

/**
 * Coalition MANAGEMENT page. After the global-context redesign the coalition's
 * הצעות are no longer browsed here — they render inline on the main feed once the
 * coalition is the active context (via the header switcher or "צפו בתחזיות
 * הקואליציה" below). This page is now scoreboard + roster + invite/leave bar +
 * stance sharing. Identity is always the public @handle, never the real name.
 */
export default async function GroupManagePage({ params }: { params: Promise<{ slug: string }> }) {
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

  const [board, roster, sharingStances] = await Promise.all([
    getGroupScoreboard({ groupId: group.id }),
    listActiveMembers({ groupId: group.id }),
    getStanceSharing({ groupId: group.id, userId }),
  ]);

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
          <GroupActionBar groupId={group.id} inviteCode={group.inviteCode} />
        </div>
      </header>

      {/* Enter the coalition's scoped feed (its הצעות render on the main feed) +
          post a new motion. /g/by-id sets the active-coalition context. */}
      <div className="mb-8 flex flex-wrap gap-3">
        <Link
          href={`/g/by-id/${group.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          צפו בתחזיות הקואליציה
        </Link>
        <Link
          href={`/g/${group.slug}/new`}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <Ballot className="h-4 w-4" />
          העלו הצעה
        </Link>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 font-display text-lg font-bold text-foreground">לוח התוצאות</h2>
          {board.every((e) => e.groupResolved === 0) ? (
            <p className="text-sm text-muted-foreground">הדירוג ייפתח כשהצעה ראשונה תוכרע.</p>
          ) : (
            <ol className="space-y-2">
              {board.map((e) => (
                <li key={e.userId} className="flex items-center gap-3 text-sm">
                  <span className="nums w-5 text-center font-bold text-muted-foreground">{e.rank}</span>
                  <UserAvatar size="xs" caricatureUrl={e.caricatureUrl} handle={e.handle} />
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
                <span className="flex min-w-0 items-center gap-2">
                  <UserAvatar size="xs" caricatureUrl={m.caricatureUrl} handle={m.handle} />
                  <bdi className="truncate text-foreground">@{m.handle ?? FALLBACK_HANDLE}</bdi>
                </span>
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
      </div>
    </main>
  );
}
