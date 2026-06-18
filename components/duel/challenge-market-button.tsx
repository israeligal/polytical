"use client";

import { useState, useTransition } from "react";
import { ChallengeButton } from "@/components/duel/challenge-cta";
import { createChallengeAction } from "@/app/actions/duels";

/**
 * Market-page hook: mints a persisted single-bet duel (challenger = viewer, with
 * their current pick derived server-side) and copies the share link.
 *
 * We copy rather than call `navigator.share` here: minting awaits a server
 * action, which consumes the click's user-activation, so the native share sheet
 * would be blocked. (The duel page's reveal CTA shares synchronously, so it uses
 * the sheet.) Copy-to-clipboard is reliable post-await and the link is shown for
 * manual paste as a fallback.
 */
export function ChallengeMarketButton({
  marketId,
  size = "md",
}: {
  marketId: string;
  size?: "sm" | "md";
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function handleChallenge() {
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

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <ChallengeButton onChallenge={handleChallenge} size={size} disabled={pending} />
      {copied && <span className="text-xs font-semibold text-positive">הקישור הועתק — שלחו לחברים!</span>}
      {message && <span className="max-w-full truncate text-xs font-semibold text-muted-foreground">{message}</span>}
    </span>
  );
}
