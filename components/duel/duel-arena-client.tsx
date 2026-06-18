"use client";

import { useCallback } from "react";
import { DuelArena } from "@/components/duel/duel-arena";
import { joinDuelAction } from "@/app/actions/duels";
import type { DuelArenaProps } from "@/components/duel/types";

/**
 * Client wrapper that binds the arena's `onPick` to `joinDuelAction` — accepting
 * a duel records the viewer's pick (a normal `bets` upsert) AND their
 * participation, so the standings + re-share loop see them. The RSC route passes
 * plain serializable props; this only adds the behavior.
 */
export function DuelArenaClient({ token, ...props }: Omit<DuelArenaProps, "onPick"> & { token: string }) {
  const onPick = useCallback(
    async (outcomeId: string) => {
      await joinDuelAction({ token, outcomeId });
    },
    [token],
  );
  return <DuelArena {...props} onPick={onPick} />;
}
