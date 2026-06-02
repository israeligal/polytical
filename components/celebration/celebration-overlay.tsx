"use client";

import { useEffect, useMemo } from "react";
import { Shekoin } from "@/components/icons";
import { formatCoins } from "@/lib/format";

/**
 * A one-shot win/loss celebration. Win = mint glow + a ring of bursting Shekoins
 * (poly-burst-up) + a popping payout card (poly-pop). Loss = a coral X disc.
 * Auto-dismisses; tap anywhere to close. Reduced-motion is honored globally
 * (globals.css neutralizes the keyframes), so it degrades to a static card.
 */
export function CelebrationOverlay({
  kind,
  payout,
  questionHe,
  onClose,
}: {
  kind: "win" | "loss";
  payout: number;
  questionHe: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 2600);
    return () => clearTimeout(t);
  }, [onClose]);

  // Deterministic burst ring (no Math.random → no hydration surprises).
  const coins = useMemo(
    () =>
      kind === "win"
        ? Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return {
              bx: `${Math.round(Math.cos(a) * 130)}px`,
              by: `${Math.round(-90 - Math.abs(Math.sin(a)) * 170)}px`,
              br: `${(i % 2 ? 1 : -1) * 170}deg`,
              delay: `${(i % 4) * 60}ms`,
            };
          })
        : [],
    [kind],
  );

  return (
    <div
      role="dialog"
      aria-label={kind === "win" ? "זכית" : "הפסדת"}
      onClick={onClose}
      className="fixed inset-0 z-[300] grid place-items-center bg-background/70 px-6 backdrop-blur-sm"
    >
      {/* burst ring (win only) */}
      {coins.map((c, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            // @ts-expect-error — CSS custom props for the poly-burst-up keyframe
            "--bx": c.bx,
            "--by": c.by,
            "--br": c.br,
            animation: `poly-burst-up 1.2s var(--ease-out) ${c.delay} forwards`,
          }}
        >
          <Shekoin className="h-7 w-7" />
        </span>
      ))}

      <div
        className="relative flex flex-col items-center gap-3 rounded-card border border-border bg-card px-8 py-7 text-center shadow-3"
        style={{ animation: "poly-pop .5s var(--ease-spring)" }}
      >
        {kind === "win" ? (
          <>
            <span
              className="grid h-20 w-20 place-items-center rounded-full"
              style={{ backgroundColor: "rgba(255,194,61,.18)", boxShadow: "var(--shadow-glow-gold)" }}
            >
              <Shekoin className="h-12 w-12" />
            </span>
            <p className="font-display text-3xl text-foreground">זכית!</p>
            <p className="nums font-display text-2xl text-gold">+{formatCoins(payout)} שקוינים</p>
          </>
        ) : (
          <>
            <span
              className="grid h-20 w-20 place-items-center rounded-full text-4xl font-black text-negative"
              style={{ backgroundColor: "var(--negative-soft)" }}
            >
              ✕
            </span>
            <p className="font-display text-3xl text-foreground">לא הפעם</p>
          </>
        )}
        <p className="max-w-xs text-sm text-muted-foreground">{questionHe}</p>
      </div>
    </div>
  );
}
