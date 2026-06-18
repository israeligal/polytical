"use client";

import { useState, useTransition } from "react";
import { createChallengeAction } from "@/app/actions/duels";

/**
 * Mint a single-bet duel for `marketId` and copy the share link. Shared by the
 * market-page button and the feed/rematch suggestion cards. Copies rather than
 * `navigator.share` because minting awaits a server action (which consumes the
 * click's user-activation, blocking the native sheet); copy is reliable
 * post-await, and the link is surfaced for manual paste if the clipboard is denied.
 */
export function useChallengeShare(marketId: string) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function challenge() {
    startTransition(async () => {
      setMessage(null);
      setCopied(false);
      const res = await createChallengeAction({ marketId });
      if (!res.ok || !res.href) {
        setMessage(res.message ?? "שגיאה — נסו שוב");
        return;
      }
      const url =
        typeof window !== "undefined" ? new URL(res.href, window.location.origin).toString() : res.href;
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 4000);
      } catch {
        setMessage(url); // clipboard blocked — show the link to copy manually
      }
    });
  }

  return { challenge, pending, copied, message };
}
