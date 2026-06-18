"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Atmospheric backdrop for the duel arena: two opposing radial glows (techelet
 * vs gold — the two "sides"), a faint grid, drifting ambient sparks and a
 * vignette. Pure decoration (`aria-hidden`), all transform/opacity, and it goes
 * static under reduced-motion.
 */
export function ArenaBackdrop() {
  const reduce = useReducedMotion();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* techelet glow, top-start */}
      <motion.div
        className="absolute -top-32 start-[-10%] h-[60vh] w-[60vh] rounded-full opacity-60 blur-[90px]"
        style={{ background: "radial-gradient(circle, var(--primary), transparent 70%)" }}
        animate={reduce ? undefined : { x: [0, 40, 0], y: [0, 28, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* gold glow, bottom-end */}
      <motion.div
        className="absolute bottom-[-20%] end-[-12%] h-[55vh] w-[55vh] rounded-full opacity-45 blur-[90px]"
        style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }}
        animate={reduce ? undefined : { x: [0, -36, 0], y: [0, -24, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 21, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* faint structural grid — "trading floor" texture */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(120% 90% at 50% 0%, #000 30%, transparent 80%)",
        }}
      />
      {/* drifting ambient sparks */}
      {!reduce &&
        Array.from({ length: 7 }).map((_, i) => {
          const left = 8 + i * 13;
          const delay = i * 1.3;
          const dur = 9 + (i % 4) * 2.5;
          return (
            <motion.span
              key={i}
              className="absolute bottom-0 h-1 w-1 rounded-full bg-accent/70"
              style={{ left: `${left}%` }}
              initial={{ y: 0, opacity: 0 }}
              animate={{ y: "-90vh", opacity: [0, 0.9, 0] }}
              transition={{ duration: dur, repeat: Infinity, ease: "linear", delay }}
            />
          );
        })}
      {/* vignette to seat the content */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(130% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.45))" }}
      />
    </div>
  );
}
