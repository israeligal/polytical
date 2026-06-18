import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMarketBundle, getOutcomeCounts, getUserPositions } from "@/app/lib/markets/repo";
import { bundleToMarket } from "@/app/lib/markets/adapter";
import { FALLBACK_HANDLE } from "@/app/lib/onboarding/handle";
import { decodeDuelToken } from "@/app/lib/duels/token";
import { DuelArenaClient } from "@/components/duel/duel-arena-client";

/** Public share landing for a single-bet duel — anyone with the link can view. */
export default async function DuelPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decoded = decodeDuelToken(token);
  if (!decoded) notFound();

  const bundle = await getMarketBundle({ marketId: decoded.m });
  // Global markets only — group motions are member-only and never shareable as
  // an open duel (keeps the groups sandbox intact).
  if (!bundle || bundle.market.groupId) notFound();

  const counts = await getOutcomeCounts({ marketId: decoded.m });
  const market = bundleToMarket({ ...bundle, counts });

  const session = await getSession();
  const isLoggedIn = Boolean(session?.user);
  const positions = session?.user
    ? await getUserPositions({ userId: session.user.id, marketId: decoded.m })
    : [];
  const myPickId = positions[0]?.outcomeId ?? null;

  return (
    <DuelArenaClient
      market={market}
      challenger={{ handle: decoded.h, pickedOutcomeId: decoded.p ?? null }}
      you={isLoggedIn ? { handle: session!.user.handle ?? FALLBACK_HANDLE } : undefined}
      myPickId={myPickId}
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
  const decoded = decodeDuelToken(token);
  if (!decoded) return { title: "פוליטיקל · דו-קרב" };
  const bundle = await getMarketBundle({ marketId: decoded.m });
  const question = bundle?.market.questionHe;
  const title = question ? `דו-קרב: ${question}` : "פוליטיקל · דו-קרב";
  const description = `@${decoded.h} מאתגר/ת אותך — מי צודק? בחרו צד ונראה מי ינצח.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}
