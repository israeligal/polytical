"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Market } from "@/lib/types";
import { UrgencyChip } from "@/components/duel/duel-atoms";

/**
 * The feed/market-page hook: "bet on this with a friend". Tapping creates a
 * single-market challenge and shares the link (real wiring mints a token +
 * opens the Web Share sheet). A gold glove-pill that nudges on hover.
 */
export function ChallengeButton({
  onChallenge,
  size = "md",
  className = "",
}: {
  onChallenge?: () => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pad = size === "sm" ? "px-3 py-1.5 text-sm" : "px-5 py-2.5 text-base";

  return (
    <motion.button
      type="button"
      onClick={onChallenge}
      whileHover={reduce ? undefined : { scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 16 }}
      className={`inline-flex items-center gap-2 rounded-full border-[1.5px] border-accent/50 bg-accent/10 font-extrabold text-gold shadow-glow-gold transition-colors hover:bg-accent/20 ${pad} ${className}`}
    >
      <motion.span
        aria-hidden
        animate={reduce ? undefined : { rotate: [0, -14, 12, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4 }}
        className="inline-block"
      >
        🥊
      </motion.span>
      התערבו על זה עם חבר
    </motion.button>
  );
}

/**
 * A "suggested duel" promo for the global feed — surfaces a close-this-week
 * market and invites the user to challenge a friend on it. The whole card is
 * built to be eye-catching: gold-edged, glowing, with a sweeping shine.
 */
export function DuelSuggestionCard({
  market,
  onChallenge,
}: {
  market: Market;
  onChallenge?: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={{ y: 18 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className="relative overflow-hidden rounded-card border-[1.5px] border-accent/40 bg-card p-5 shadow-2 shadow-glow-gold"
    >
      {!reduce && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -inset-x-1/2 skew-x-[-18deg]"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)" }}
          initial={{ x: "-120%" }}
          whileInView={{ x: "120%" }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      )}
      <div className="relative mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-gold">
          <span aria-hidden>🔥</span> דו-קרב מומלץ · נסגר השבוע
        </span>
        <UrgencyChip closeAt={market.closeAt} />
      </div>
      <h3 className="relative mb-4 font-display text-xl leading-snug text-foreground">{market.question}</h3>
      <div className="relative flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">שלחו לחברים — מי יצדק?</span>
        <ChallengeButton onChallenge={onChallenge} size="sm" />
      </div>
    </motion.div>
  );
}
