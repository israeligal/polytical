"use client";

import { useState } from "react";
import { ChallengeButton } from "@/components/duel/challenge-cta";
import { duelPath } from "@/app/lib/duels/token";

/**
 * The market-page hook: mints a single-bet duel link (challenger = viewer, with
 * their current pick) and shares it via the Web Share sheet, copy-link fallback.
 * Token is built client-side with the isomorphic encoder — no round-trip.
 */
export function ChallengeMarketButton({
  marketId,
  challengerHandle,
  pickedOutcomeId,
  size = "md",
}: {
  marketId: string;
  challengerHandle: string;
  pickedOutcomeId?: string | null;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);

  async function handleChallenge() {
    const path = duelPath({
      m: marketId,
      h: challengerHandle.replace(/^@/, ""),
      ...(pickedOutcomeId ? { p: pickedOutcomeId } : {}),
    });
    const url = typeof window !== "undefined" ? new URL(path, window.location.origin).toString() : path;
    const text = "מי צודק? בחרו צד בתחזית הזאת 🥊";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "פוליטיקל · דו-קרב", text, url });
      } catch {
        /* user dismissed the share sheet */
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <ChallengeButton onChallenge={handleChallenge} size={size} />
      {copied && <span className="text-xs font-semibold text-positive">הקישור הועתק!</span>}
    </span>
  );
}
