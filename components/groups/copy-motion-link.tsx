"use client";

import { useState } from "react";

/**
 * Copy a group-motion's vote link (`/market/[id]`) to share with fellow members
 * so they can vote immediately. Distinct from the group invite link
 * (`/g/join/[code]`) — this points at the membership-gated motion itself.
 * `variant="chip"` is the compact form for the group feed (stops the wrapping
 * card <Link> from navigating on click).
 */
export function CopyMotionLink({ marketId, variant = "button" }: { marketId: string; variant?: "button" | "chip" }) {
  const [copied, setCopied] = useState(false);

  function copy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/market/${marketId}`;
    void navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false),
    );
  }

  if (variant === "chip") {
    return (
      <button
        type="button"
        onClick={copy}
        aria-label="העתיקו קישור הצבעה"
        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        {copied ? "הועתק ✓" : "🔗 שיתוף"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-bold text-foreground transition-colors hover:border-primary"
    >
      {copied ? "הקישור הועתק ✓" : "🔗 שתפו קישור הצבעה"}
    </button>
  );
}
