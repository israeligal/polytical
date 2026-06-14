import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getGroupForMember } from "@/app/lib/groups/service";
import { GroupMotionForm } from "@/components/groups/group-motion-form";
import { ChevronForward } from "@/components/icons";
import { CATEGORIES } from "@/lib/categories";
import { GroupNotFoundError, NotGroupMemberError } from "@/app/lib/errors";
import { GROUPS_CONTAINER } from "@/components/skeletons/containers";

export default async function NewGroupMotionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session?.user) notFound();

  let group;
  try {
    ({ group } = await getGroupForMember({ slug, userId: session.user.id }));
  } catch (e) {
    if (e instanceof NotGroupMemberError || e instanceof GroupNotFoundError) notFound();
    throw e;
  }

  return (
    <main className={GROUPS_CONTAINER}>
      <Link
        href={`/g/${group.slug}`}
        className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronForward className="h-4 w-4 rotate-180" />
        חזרה ל{group.nameHe}
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-3xl text-foreground sm:text-4xl">הצעה לסדר חדשה</h1>
        <p className="mt-1 text-sm text-muted-foreground">ההצעה תעלה מיד לקואליציה — בלי אישור.</p>
      </header>
      <GroupMotionForm groupId={group.id} slug={group.slug} categories={CATEGORIES} />
    </main>
  );
}
