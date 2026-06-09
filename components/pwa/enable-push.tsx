"use client";

import { usePushSubscription } from "@/hooks/use-push-subscription";

/**
 * Push opt-in affordance for the notifications page. Renders the CTA only when
 * the browser can subscribe and the user has not decided yet ("default"); once
 * subscribed it collapses to a quiet "active" row with a disable action. For
 * "unsupported"/"denied" it renders nothing (no actionable affordance). The
 * enable click must originate from this button so the permission prompt fires
 * inside a user gesture.
 */
export function EnablePush() {
  const { status, busy, enable, disable } = usePushSubscription();

  if (status === "default") {
    return (
      <div className="mb-6">
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-card bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground shadow-glow-mint transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          🔔 קבלו התראות
        </button>
      </div>
    );
  }

  if (status === "subscribed") {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-card border border-border bg-card px-4 py-3">
        <span className="text-sm font-bold text-foreground">ההתראות פעילות ✓</span>
        <button
          type="button"
          onClick={() => void disable()}
          disabled={busy}
          className="ms-auto shrink-0 rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        >
          כבו
        </button>
      </div>
    );
  }

  return null;
}
