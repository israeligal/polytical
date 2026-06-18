import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMarketBundle, getOutcomeCounts, getUserPositions } from "@/app/lib/markets/repo";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import { FALLBACK_HANDLE } from "@/app/lib/onboarding/handle";
import { getChallengeByToken, getParticipants } from "@/app/lib/duels/repo";
import { duelResult } from "@/app/lib/duels/service";
import type { DuelResolution, DuelStanding } from "@/components/duel/types";
import { DuelArenaClient } from "@/components/duel/duel-arena-client";

/** Public share landing for a single-bet duel — anyone with the link can view. */
export default async function DuelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const challenge = await getChallengeByToken({ token });
  if (!challenge) notFound();

  const bundle = await getMarketBundle({ marketId: challenge.marketId });
  // Global markets only — group motions are member-only (keeps the sandbox intact).
  if (!bundle || bundle.market.groupId) notFound();

  const counts = await getOutcomeCounts({ marketId: challenge.marketId });
  const market = bundleToMarket({ ...bundle, counts });

  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);
  const positions = session?.user
    ? await getUserPositions({ userId: session.user.id, marketId: challenge.marketId })
    : [];
  const myPickId = positions[0]?.outcomeId ?? null;

  const participants = await getParticipants({ challengeId: challenge.id, marketId: challenge.marketId });
  // The "crowd" row = other people who joined (exclude the challenger + the viewer).
  const crowd = participants
    .filter((p) => p.userId !== challenge.challengerUserId && p.userId !== session?.user?.id)
    .map((p) => ({ handle: p.handle, pickedOutcomeId: p.outcomeId }));

  // Resolved market → build the head-to-head result the arena renders.
  let resolution: DuelResolution | undefined;
  if (bundle.market.status === "resolved" && bundle.market.resolvedOutcomeId) {
    const winningOutcomeId = bundle.market.resolvedOutcomeId;
    const viewerId = session?.user?.id;
    const challengerCorrect = challenge.challengerOutcomeId === winningOutcomeId;
    const standings: DuelStanding[] = [
      {
        handle: challenge.challengerHandle,
        outcomeId: challenge.challengerOutcomeId,
        isChallenger: true,
        isYou: viewerId === challenge.challengerUserId,
      },
      ...participants.map((p) => ({ handle: p.handle, outcomeId: p.outcomeId, isYou: p.userId === viewerId })),
    ];
    let verdict: "won" | "lost" | "tie" | null = null;
    if (viewerId === challenge.challengerUserId) verdict = challengerCorrect ? "won" : "lost";
    else if (participants.some((p) => p.userId === viewerId))
      verdict = duelResult(myPickId === winningOutcomeId, challengerCorrect);
    resolution = { winningOutcomeId, verdict, standings };
  }

  return (
    <DuelArenaClient
      token={token}
      market={market}
      challenger={{ handle: challenge.challengerHandle, pickedOutcomeId: challenge.challengerOutcomeId }}
      you={isLoggedIn ? { handle: session!.user.handle ?? FALLBACK_HANDLE } : undefined}
      crowd={crowd}
      myPickId={myPickId}
      resolution={resolution}
      isLoggedIn={isLoggedIn}
      loginHref={`/login?callbackUrl=${encodeURIComponent(`/duel/${token}`)}`}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const challenge = await getChallengeByToken({ token });
  if (!challenge) return { title: "פוליטיקל · דו-קרב" };
  const bundle = await getMarketBundle({ marketId: challenge.marketId });
  const question = bundle?.market.questionHe;
  const title = question ? `דו-קרב: ${question}` : "פוליטיקל · דו-קרב";
  const description = `@${challenge.challengerHandle} מאתגר/ת אותך — מי צודק? בחרו צד ונראה מי ינצח.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}
