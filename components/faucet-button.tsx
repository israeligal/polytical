"use client";
import { useState, useTransition } from "react";
import { claimFaucetAction } from "@/app/actions/faucet";

/** Daily coin faucet with a streak bonus. Gold accent pill; on a successful
 * claim it briefly shows the current streak + the amount granted. */
export function FaucetButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reward, setReward] = useState<string | null>(null);

  function onClick() {
    setMessage(null);
    setReward(null);
    startTransition(async () => {
      try {
        const res = await claimFaucetAction();
        if (res.ok) {
          setReward(`🔥 רצף ${res.streak} · +${res.amount}`);
        } else if (res.message) {
          setMessage(res.message);
        }
      } catch {
        setMessage("אירעה שגיאה — נסו שוב");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {reward ? (
        <span className="hidden text-xs font-bold text-gold sm:inline">{reward}</span>
      ) : message ? (
        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{message}</span>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-extrabold text-accent-foreground transition-all hover:bg-accent-hover hover:shadow-glow-gold disabled:opacity-60"
      >
        <span>{pending ? "מקבל…" : "בונוס יומי"}</span>
      </button>
    </div>
  );
}
