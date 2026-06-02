"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shekoin, Sparkle } from "@/components/icons";
import { collectCardAction } from "@/app/actions/cards";

/**
 * Collects an MK's card for `cost` coins. Owned → a static "נאסף" chip. The
 * server action is the authority (balance check, idempotency); on success we
 * flip to owned locally and refresh so the header balance + collection update.
 */
export function CollectButton({
  personId,
  owned,
  cost,
}: {
  personId: number;
  owned: boolean;
  cost: number;
}) {
  const router = useRouter();
  const [isOwned, setIsOwned] = useState(owned);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (isOwned) {
    return (
      <span className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-positive/40 bg-positive/10 px-4 py-2.5 font-bold text-positive">
        <Sparkle className="h-4 w-4" />
        הקלף באוסף שלכם
      </span>
    );
  }

  function onCollect() {
    setError(null);
    startTransition(async () => {
      const res = await collectCardAction({ personId });
      if (res.ok) {
        setIsOwned(true);
        router.refresh();
      } else {
        setError(res.message ?? "אירעה שגיאה");
      }
    });
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onCollect}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 font-display text-lg text-accent-foreground transition-all hover:bg-accent-hover hover:shadow-glow-gold disabled:opacity-60"
      >
        <Shekoin className="h-5 w-5" />
        {pending ? "אוספים…" : <>אספו את הקלף · {cost}</>}
      </button>
      {error && <p className="mt-2 text-center text-sm font-semibold text-negative">{error}</p>}
    </div>
  );
}
