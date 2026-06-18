"use client";

import { motion, useReducedMotion, AnimatePresence } from "motion/react";
import { PlayerAvatar } from "@/components/duel/duel-atoms";

/** A revealed pick shown under a player's avatar (tinted by direction). */
export interface BandPick {
  label: string;
  toneClassName: string; // e.g. "text-positive border-positive/40 bg-positive-soft"
}

/**
 * The face-off band: challenger (start side) — glowing VS lozenge — you (end
 * side). Each side's pick is masked behind a "?" until `revealed`, then flips
 * up with a spring. The VS pill pulses with a slow rotating sheen.
 */
export function VsBand({
  challengerHandle,
  challengerAvatar,
  challengerPick,
  youHandle,
  youAvatar,
  youPick,
  revealed,
  agree,
}: {
  challengerHandle: string;
  challengerAvatar?: string | null;
  challengerPick?: BandPick;
  youHandle?: string | null;
  youAvatar?: string | null;
  youPick?: BandPick;
  revealed: boolean;
  /** When both have picked: did they land on the same side? */
  agree?: boolean;
}) {
  const reduce = useReducedMotion();

  return (
    <div className="flex items-stretch justify-center gap-2 sm:gap-3">
      <PlayerSide
        handle={challengerHandle}
        avatar={challengerAvatar}
        ringClassName="ring-accent/70"
        glow="gold"
        roleLabel="מאתגר/ת"
        pick={revealed ? challengerPick : undefined}
        masked={!revealed}
      />

      {/* VS lozenge */}
      <div className="flex shrink-0 flex-col items-center justify-center px-1">
        <motion.div
          className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-full border-2 border-accent/50 bg-card text-accent shadow-glow-gold sm:h-16 sm:w-16"
          animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          {!reduce && (
            <motion.span
              aria-hidden
              className="absolute inset-[-40%]"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent, var(--accent) 18%, transparent 38%, transparent 60%, var(--accent) 78%, transparent)",
                opacity: 0.4,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            />
          )}
          <span className="relative font-display text-lg leading-none sm:text-xl">VS</span>
        </motion.div>
        <AnimatePresence>
          {revealed && (
            <motion.span
              key={agree ? "agree" : "clash"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-2 text-center text-[11px] font-extrabold ${agree ? "text-positive" : "text-accent"}`}
            >
              {agree ? "אותו צד!" : "מי צודק?"}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <PlayerSide
        handle={youHandle ?? undefined}
        avatar={youAvatar}
        ringClassName="ring-primary/70"
        glow="mint"
        roleLabel="אתה/את"
        pick={revealed ? youPick : undefined}
        masked={!youPick && !revealed}
        emptyYou={!youHandle && !youPick}
      />
    </div>
  );
}

function PlayerSide({
  handle,
  avatar,
  ringClassName,
  glow,
  roleLabel,
  pick,
  masked,
  emptyYou,
}: {
  handle?: string | null;
  avatar?: string | null;
  ringClassName: string;
  glow: "mint" | "coral" | "gold" | "none";
  roleLabel: string;
  pick?: BandPick;
  masked: boolean;
  emptyYou?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 rounded-card border border-border bg-card/70 p-3 backdrop-blur-sm">
      <PlayerAvatar
        handle={handle}
        caricatureUrl={avatar}
        size={64}
        ringClassName={ringClassName}
        glow={glow}
        placeholder={emptyYou}
      />
      <span className="text-[11px] font-bold uppercase tracking-wide text-text-low">{roleLabel}</span>
      <bdi className="max-w-full truncate text-sm font-extrabold text-foreground">
        {emptyYou ? "אתה?" : `@${(handle ?? "").replace(/^@/, "")}`}
      </bdi>

      {/* pick chip — masked "?" until revealed, then the chosen side flips up */}
      <div className="h-7">
        <AnimatePresence mode="wait" initial={false}>
          {pick ? (
            <motion.span
              key="pick"
              initial={{ opacity: 0, rotateX: -90, y: 6 }}
              animate={{ opacity: 1, rotateX: 0, y: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 20 }}
              className={`inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-1 text-xs font-extrabold ${pick.toneClassName}`}
            >
              {pick.label}
            </motion.span>
          ) : masked ? (
            <motion.span
              key="masked"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center rounded-full border border-border bg-sunken px-3 py-1 text-xs font-extrabold text-text-low"
            >
              ? ? ?
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
