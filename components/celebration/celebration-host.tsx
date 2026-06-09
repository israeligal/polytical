"use client";

import { useEffect, useState, useTransition } from "react";
import type { UnseenResolvedPrediction } from "@/app/lib/bets/repo";
import { markPredictionsSeenAction } from "@/app/actions/celebrations";
import { CelebrationOverlay } from "@/components/celebration/celebration-overlay";

/**
 * Queues the user's unseen resolved predictions and plays a right/wrong reveal for
 * each, one at a time. Marks ALL of them seen once on mount (keyed on fetch, not
 * playback) so a reload/navigation never re-fires — worst case the user misses the
 * tail of an animation, never re-sees it.
 */
export function CelebrationHost({ predictions }: { predictions: UnseenResolvedPrediction[] }) {
  const [index, setIndex] = useState(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (predictions.length === 0) return;
    const ids = predictions.map((p) => p.predictionId);
    startTransition(() => {
      void markPredictionsSeenAction({ predictionIds: ids });
    });
  }, [predictions]);

  if (predictions.length === 0 || index >= predictions.length) return null;
  const current = predictions[index];

  return (
    <CelebrationOverlay
      key={current.predictionId}
      kind={current.correct ? "win" : "loss"}
      questionHe={current.questionHe}
      outcomeLabelHe={current.outcomeLabelHe}
      onClose={() => setIndex((i) => i + 1)}
    />
  );
}
