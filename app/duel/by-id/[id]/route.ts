import { redirect } from "next/navigation";
import { getChallengeTokenById } from "@/app/lib/duels/repo";

// Resolve a duel by challenge id → its token, then redirect to the public arena.
// Used by `duel_settled` notifications (which store refChallengeId, not the
// opaque token). A missing/malformed id (e.g. a challenge cascade-deleted after
// the notice was sent) redirects to the feed — a route handler's notFound()
// renders a bare blank 404, so land somewhere friendly instead.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getChallengeTokenById({ challengeId: id });
  redirect(token ? `/duel/${token}` : "/markets");
}
