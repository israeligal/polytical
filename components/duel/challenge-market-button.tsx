"use client";

import { ChallengeButton } from "@/components/duel/challenge-cta";
import { useChallengeShare } from "@/components/duel/use-challenge-share";

/**
 * Market-page hook: mints a persisted single-bet duel (challenger = viewer) and
 * copies the share link. See useChallengeShare for why we copy rather than
 * open the native share sheet.
 */
export function ChallengeMarketButton({
  marketId,
  size = "md",
}: {
  marketId: string;
  size?: "sm" | "md";
}) {
  const { challenge, pending, copied, message } = useChallengeShare(marketId);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <ChallengeButton onChallenge={challenge} size={size} disabled={pending} />
      {copied && <span className="text-xs font-semibold text-positive">הקישור הועתק — שלחו לחברים!</span>}
      {message && <span className="max-w-full truncate text-xs font-semibold text-muted-foreground">{message}</span>}
    </span>
  );
}
