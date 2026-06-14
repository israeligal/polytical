import { redirect } from "next/navigation";
import { getGroupById } from "@/app/lib/groups/repo";

// Resolves a group id → its /g/[slug] URL. Used by the proxy default-group
// landing and by group notifications (which store refGroupId, not the slug).
// Membership is enforced on the group page itself, not here.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const group = await getGroupById({ id });
  redirect(group ? `/g/${group.slug}` : "/g");
}
