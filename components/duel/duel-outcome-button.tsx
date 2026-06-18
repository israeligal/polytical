"use client";

import { motion, useReducedMotion } from "motion/react";
import { catBorder, catText, catTint } from "@/lib/cat";
import { pct, pctLabel } from "@/lib/format";
import { CountUp, PlayerAvatar, SparkBurst } from "@/components/duel/duel-atoms";
import type { OutcomeTone } from "@/components/duel/types";

function toneStyles(tone: OutcomeTone) {
  if (tone.kind === "positive")
    return { fill: "bg-positive/15", text: "text-positive", glow: "shadow-glow-mint", border: "border-positive", spark: "mint" as const };
  if (tone.kind === "negative")
    return { fill: "bg-negative/15", text: "text-negative", glow: "shadow-glow-coral", border: "border-negative", spark: "coral" as const };
  return { fill: catTint[tone.color], text: catText[tone.color], glow: "", border: catBorder[tone.color], spark: "gold" as const };
}

/**
 * One side of the duel — a big tactile pick. Pre-reveal it's a clean "choose me"
 * target; once the viewer picks, the crowd share grows in as a tinted fill, the
 * % counts up, and the chosen side rings + glows with a spark burst.
 */
export function DuelOutcomeButton({
  label,
  predictors,
  total,
  tone,
  picked,
  revealed,
  winner,
  disabled,
  avatarUrl,
  avatarHandle,
  onPick,
}: {
  label: string;
  predictors: number;
  total: number;
  tone: OutcomeTone;
  picked: boolean;
  revealed: boolean;
  /** The winning outcome once the market resolved — crowned regardless of the viewer's pick. */
  winner?: boolean;
  disabled?: boolean;
  /** Multi-candidate outcome portrait (optional). */
  avatarUrl?: string | null;
  avatarHandle?: string | null;
  onPick: () => void;
}) {
  const reduce = useReducedMotion();
  const t = toneStyles(tone);
  const share = pct(predictors, total);

  return (
    <motion.button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={picked}
      whileHover={disabled || reduce ? undefined : { y: -3, scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      animate={picked && !reduce ? { scale: [1, 1.06, 1] } : undefined}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
      className={`relative flex min-h-[7.5rem] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-card border-2 bg-card p-4 text-center transition-colors duration-200 disabled:cursor-default ${
        winner
          ? "border-positive shadow-glow-mint"
          : picked
            ? `${t.border} ${t.glow}`
            : "border-border hover:border-foreground/25"
      }`}
    >
      {winner && (
        <span className="absolute end-2 top-2 z-10 rounded-full bg-positive px-2 py-0.5 text-[11px] font-extrabold text-positive-foreground">
          🏆 התשובה
        </span>
      )}
      {/* crowd share as a tinted fill — only after the reveal, grows from the start edge */}
      <motion.span
        aria-hidden
        className={`absolute inset-y-0 start-0 ${t.fill}`}
        initial={false}
        animate={{ width: revealed ? `${share}%` : "0%" }}
        transition={{ duration: 0.9, ease: [0.16, 0.84, 0.44, 1], delay: revealed ? 0.15 : 0 }}
      />

      <SparkBurst fire={picked} tone={t.spark} />

      <span className="relative flex items-center gap-2">
        {avatarUrl !== undefined && (
          <PlayerAvatar handle={avatarHandle} caricatureUrl={avatarUrl} size={32} ringClassName="ring-border" />
        )}
        <span className={`font-display text-2xl leading-none ${picked ? t.text : "text-foreground"}`}>
          {label}
        </span>
      </span>

      {/* reveal block: % + mandate count, or a "choose" hint beforehand */}
      <span className="relative mt-1 block h-9">
        {revealed ? (
          <span className="flex flex-col items-center">
            <span className={`text-xl font-black ${t.text}`}>
              <CountUp to={share} duration={1} format={(n) => `${Math.round(n)}%`} />
            </span>
            <span className="nums text-xs text-muted-foreground">{predictors} מנדטים</span>
          </span>
        ) : (
          <span className="text-xs font-bold text-text-low">בחר/י את הצד הזה</span>
        )}
      </span>

      {/* picked badge */}
      {picked && (
        <motion.span
          initial={{ y: 6 }}
          animate={{ y: 0 }}
          className={`relative inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${t.border} ${t.text}`}
        >
          המנדט שלך ✓
        </motion.span>
      )}
      <span className="sr-only">{pctLabel(predictors, total)}</span>
    </motion.button>
  );
}
