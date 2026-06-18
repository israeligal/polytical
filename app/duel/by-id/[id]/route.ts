import { notFound, redirect } from "next/navigation";
import { getChallengeTokenById } from "@/app/lib/duels/repo";

// Resolve a duel by challenge id → its token, then redirect to the public arena.
// Used by `duel_settled` notifications (which store refChallengeId, not the
// opaque token). A missing/malformed id 404s.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getChallengeTokenById({ challengeId: id });
  if (!token) notFound();
  redirect(`/duel/${token}`);
}
