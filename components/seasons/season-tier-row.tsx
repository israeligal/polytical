"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shekoin, Trophy, Lock, Sparkle } from "@/components/icons";
import { formatCoins } from "@/lib/format";
import { claimTierAction } from "@/app/actions/seasons";

type TierState = "claimed" | "claimable" | "locked";

/**
 * One reward-tier row. `claimable` → an active gold claim button; `claimed` → a
 * static "נתבע" chip; `locked` → the goal it still needs. The server action is
 * the authority (progress + idempotency); on success we flip to claimed locally
 * and refresh so the header balance updates.
 */
export function SeasonTierRow({
  tierId,
  ordinal,
  nameHe,
  goalAmount,
  rewardAmount,
  state,
}: {
  tierId: string;
  ordinal: number;
  nameHe: string;
  goalAmount: number;
  rewardAmount: number;
  state: TierState;
}) {
  const router = useRouter();
  const [localState, setLocalState] = useState<TierState>(state);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClaim() {
    setError(null);
    startTransition(async () => {
      const res = await claimTierAction({ tierId });
      if (res.ok) {
        setLocalState("claimed");
        router.refresh();
      } else {
        setError(res.message ?? "אירעה שגיאה");
      }
    });
  }

  const claimed = localState === "claimed";
  const claimable = localState === "claimable";

  return (
    <div
      className={`flex items-center gap-4 rounded-card border p-4 transition-colors ${
        claimed
          ? "border-positive/40 bg-positive/5"
          : claimable
            ? "border-accent/50 bg-accent/5 shadow-glow-gold"
            : "border-border bg-card"
      }`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-display text-lg ${
          claimed
            ? "bg-positive/15 text-positive"
            : claimable
              ? "bg-accent/15 text-accent"
              : "bg-background text-muted-foreground"
        }`}
      >
        {claimed ? <Sparkle className="h-5 w-5" /> : claimable ? <Trophy className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-display text-lg text-foreground">
          <span className="text-muted-foreground">{ordinal}. </span>
          {nameHe}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="nums">{formatCoins(goalAmount)}</span> שקוינים רווח נקי
          <span className="text-muted-foreground/50">·</span>
          <span className="inline-flex items-center gap-1 font-bold text-gold">
            <Shekoin className="h-4 w-4" />+{formatCoins(rewardAmount)}
          </span>
        </p>
        {error && <p className="mt-1 text-sm font-semibold text-negative">{error}</p>}
      </div>

      {claimed ? (
        <span className="shrink-0 rounded-full border border-positive/40 bg-positive/10 px-3 py-1.5 text-sm font-bold text-positive">
          נתבע ✓
        </span>
      ) : claimable ? (
        <button
          type="button"
          onClick={onClaim}
          disabled={pending}
          className="shrink-0 rounded-full bg-accent px-5 py-2 font-display text-base text-accent-foreground transition-all hover:bg-accent-hover hover:shadow-glow-gold disabled:opacity-60"
        >
          {pending ? "תובע…" : "תבעו פרס"}
        </button>
      ) : (
        <span className="shrink-0 text-sm font-semibold text-muted-foreground">נעול</span>
      )}
    </div>
  );
}
