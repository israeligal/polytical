"use client";

import { useEffect, useState, useTransition } from "react";
import type { UnseenResolvedBet } from "@/app/lib/bets/repo";
import { markBetsSeenAction } from "@/app/actions/celebrations";
import { CelebrationOverlay } from "@/components/celebration/celebration-overlay";

/**
 * Queues the user's unseen resolved bets and plays a celebration for each, one at
 * a time. Marks ALL of them seen once on mount (keyed on fetch, not playback) so a
 * reload/navigation never re-fires — worst case the user misses the tail of an
 * animation, never re-sees it.
 */
export function CelebrationHost({ bets }: { bets: UnseenResolvedBet[] }) {
  const [index, setIndex] = useState(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (bets.length === 0) return;
    const ids = bets.map((b) => b.betId);
    startTransition(() => {
      void markBetsSeenAction({ betIds: ids });
    });
  }, [bets]);

  if (bets.length === 0 || index >= bets.length) return null;
  const current = bets[index];

  return (
    <CelebrationOverlay
      key={current.betId}
      kind={current.status === "won" ? "win" : "loss"}
      payout={current.payout}
      questionHe={current.questionHe}
      onClose={() => setIndex((i) => i + 1)}
    />
  );
}
