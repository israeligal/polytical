"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Market } from "@/lib/types";
import { PlayerAvatar, SparkBurst } from "@/components/duel/duel-atoms";
import { DuelSuggestionLive } from "@/components/duel/duel-suggestion-live";

/** A standings row, with labels + correctness already resolved by the arena. */
export interface ResultStanding {
  handle: string;
  caricatureUrl?: string | null;
  pickLabel: string | null;
  correct: boolean;
  isChallenger?: boolean;
  isYou?: boolean;
}

const VERDICT = {
  won: { emoji: "🏆", text: "ניצחת בדו-קרב!", className: "text-accent", glow: "shadow-glow-gold", spark: "gold" as const },
  tie: { emoji: "🤝", text: "תיקו!", className: "text-positive", glow: "shadow-glow-mint", spark: "mint" as const },
  lost: { emoji: "🥀", text: "לא הפעם", className: "text-negative", glow: "shadow-glow-coral", spark: "coral" as const },
  none: { emoji: "🏁", text: "הדו-קרב הוכרע", className: "text-foreground", glow: "", spark: "mint" as const },
} as const;

/**
 * The resolved-duel result: a celebratory verdict banner, the winning answer,
 * and a standings leaderboard (everyone's pick + ✓/✗, winners on top). Motion is
 * an enhancement — transform-only entrances keep it readable if rAF is throttled,
 * and the win celebration honors reduced-motion.
 */
export function DuelResult({
  verdict,
  winningLabel,
  standings,
  onShare,
  copied,
  suggestedMarkets,
}: {
  verdict: "won" | "lost" | "tie" | null;
  winningLabel: string;
  standings: ResultStanding[];
  onShare: () => void;
  copied: boolean;
  /** Close-this-week markets to rematch on (this market resolved → can't re-duel it). */
  suggestedMarkets?: Market[];
}) {
  const reduce = useReducedMotion();
  const v = VERDICT[verdict ?? "none"];
  const sorted = [...standings].sort((a, b) => Number(b.correct) - Number(a.correct));

  return (
    <div className="flex flex-col items-center gap-4">
      {/* verdict banner */}
      <motion.div
        className={`relative grid place-items-center rounded-card border border-border bg-card px-6 py-4 text-center ${v.glow}`}
        initial={reduce ? false : { scale: 0.85, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 18 }}
      >
        <SparkBurst fire={verdict === "won"} tone={v.spark} />
        <span className="relative text-3xl">{v.emoji}</span>
        <span className={`relative font-display text-2xl ${v.className}`}>{v.text}</span>
      </motion.div>

      {/* winning answer */}
      <div className="text-center text-sm text-muted-foreground">
        התשובה הנכונה: <span className="font-extrabold text-positive">{winningLabel}</span>
      </div>

      {/* standings — winners on top */}
      <ul className="w-full overflow-hidden rounded-card border border-border bg-card">
        {sorted.map((s, i) => (
          <motion.li
            key={`${s.handle}-${i}`}
            initial={reduce ? false : { y: 10 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 24, delay: 0.05 + i * 0.05 }}
            className={`flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 ${
              s.correct ? "bg-positive-soft/40" : ""
            }`}
          >
            <PlayerAvatar handle={s.handle} caricatureUrl={s.caricatureUrl} size={32} ringClassName="ring-border" />
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <bdi className="truncate text-sm font-extrabold text-foreground">@{s.handle.replace(/^@/, "")}</bdi>
              {s.isYou && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">את/ה</span>}
              {s.isChallenger && <span className="rounded-full bg-accent/15 px-1.5 text-[10px] font-bold text-gold">מאתגר/ת</span>}
            </span>
            <span className="truncate text-xs text-muted-foreground">{s.pickLabel ?? "—"}</span>
            <span className={`text-lg ${s.correct ? "text-positive" : "text-negative"}`}>{s.correct ? "✓" : "✗"}</span>
          </motion.li>
        ))}
      </ul>

      <motion.button
        type="button"
        onClick={onShare}
        whileHover={reduce ? undefined : { scale: 1.04, y: -2 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-extrabold text-primary-foreground shadow-glow-mint transition-colors hover:bg-primary-hover"
      >
        <span aria-hidden>🔗</span>
        {copied ? "הקישור הועתק!" : "שתפו את התוצאה"}
      </motion.button>

      {suggestedMarkets && suggestedMarkets.length > 0 && (
        <div className="w-full">
          <p className="mb-2 text-center text-sm font-extrabold text-gold">רוצים ריוונש? אתגרו על תחזית קרובה 🥊</p>
          <div className="flex flex-col gap-3">
            {suggestedMarkets.slice(0, 2).map((m) => (
              <DuelSuggestionLive key={m.id} market={m} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
