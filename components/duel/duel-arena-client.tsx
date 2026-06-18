"use client";

import { useCallback } from "react";
import { DuelArena } from "@/components/duel/duel-arena";
import { makePredictionAction } from "@/app/actions/bet";
import type { DuelArenaProps } from "@/components/duel/types";

/**
 * Client wrapper that binds the arena's `onPick` to the real prediction action
 * (a duel pick IS a normal `bets` upsert — no parallel prediction store). The
 * RSC route passes plain serializable props; this only adds the behavior.
 */
export function DuelArenaClient(props: Omit<DuelArenaProps, "onPick">) {
  const marketId = props.market.id;
  const onPick = useCallback(
    async (outcomeId: string) => {
      await makePredictionAction({ marketId, outcomeId });
    },
    [marketId],
  );
  return <DuelArena {...props} onPick={onPick} />;
}
