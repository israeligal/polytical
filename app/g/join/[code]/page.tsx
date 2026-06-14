import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getGroupByInviteCode, getMembership, countActiveMembers } from "@/app/lib/groups/repo";
import { JoinGroupButton } from "@/components/groups/join-group-button";
import { EmptyState } from "@/components/empty-state";
import { GROUPS_CONTAINER } from "@/components/skeletons/containers";

// Invite-preview page: a non-member opening an invite link sees a lightweight
// preview (name, member count) + Join. An existing member is sent straight in.
export default async function JoinGroupPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const session = await getSession();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/g/join/${code}`)}`);

  const group = await getGroupByInviteCode({ inviteCode: code });
  if (!group) {
    return (
      <main className={GROUPS_CONTAINER}>
        <EmptyState>קישור ההזמנה אינו תקין או שפג תוקפו.</EmptyState>
      </main>
    );
  }

  const membership = await getMembership({ groupId: group.id, userId: session.user.id });
  if (membership?.status === "active") redirect(`/g/${group.slug}`);

  const memberCount = await countActiveMembers({ groupId: group.id });

  return (
    <main className={GROUPS_CONTAINER}>
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <div aria-hidden className="text-4xl">{group.emblem ?? "🏛️"}</div>
        <h1 className="mt-2 font-display text-3xl text-foreground">{group.nameHe}</h1>
        {group.descriptionHe && <p className="mt-2 text-sm text-muted-foreground">{group.descriptionHe}</p>}
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="nums font-bold text-foreground">{memberCount}</span> חברים
        </p>
        <p className="mt-4 text-sm text-muted-foreground">הוזמנתם להצטרף לקואליציה הזו.</p>
        <div className="mt-5 flex justify-center">
          <JoinGroupButton inviteCode={code} />
        </div>
      </div>
    </main>
  );
}
