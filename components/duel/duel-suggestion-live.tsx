"use client";

import type { Market } from "@/lib/types";
import { DuelSuggestionCard } from "@/components/duel/challenge-cta";
import { useChallengeShare } from "@/components/duel/use-challenge-share";

/**
 * Wired "suggested duel" promo — the presentational DuelSuggestionCard plus the
 * mint-and-copy behavior. Used on the global feed (discoverability) and in the
 * resolved-duel rematch picker.
 */
export function DuelSuggestionLive({ market }: { market: Market }) {
  const { challenge, pending, copied, message } = useChallengeShare(market.id);
  return (
    <div>
      <DuelSuggestionCard market={market} onChallenge={challenge} disabled={pending} />
      {copied && (
        <p className="mt-1.5 text-center text-xs font-semibold text-positive">הקישור הועתק — שלחו לחברים!</p>
      )}
      {message && <p className="mt-1.5 truncate text-center text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
