import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { getMembership } from "@/app/lib/groups/repo";
import { COALITION_COOKIE, coalitionCookieOptions } from "@/app/lib/groups/context";

// Enter a coalition by id: set it as the active-coalition context (only if the
// viewer is an active member) and land on the now-scoped feed. Used by group
// notifications (which store refGroupId, not the slug) and by the "back to
// coalition" link on a motion's market page. A non-member / logged-out hit just
// lands on the national feed — the context is only set when membership checks
// out, and the read path heals a stale cookie regardless.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (session?.user) {
    const membership = await getMembership({ groupId: id, userId: session.user.id });
    if (membership?.status === "active") {
      (await cookies()).set(COALITION_COOKIE, id, coalitionCookieOptions);
    }
  }
  redirect("/");
}
