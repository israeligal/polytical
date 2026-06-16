"use client";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";

// Animated empty state for /g — six member-orbs orbit a central crest ("a
// coalition forming around you"), the copy sells the feature, and both paths
// (create + join-by-invite) are offered. Entrance staggers in; the orbit loops.
// prefers-reduced-motion → everything renders static.

const ORBS = [1, 2, 3, 4, 5, 6] as const; // map to the theme's --cat-N hues
const RADIUS = 64;
const SPIN = { duration: 26, repeat: Infinity, ease: "linear" as const };

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

export function GroupsEmptyState() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="relative overflow-hidden rounded-card border border-border bg-card p-8 text-center shadow-3 sm:p-10"
    >
      {/* ambient glow behind the motif */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1/4 -top-24 h-64 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-primary)_22%,transparent),transparent)] opacity-70 blur-2xl"
      />

      {/* orbiting members */}
      <motion.div variants={item} className="relative mx-auto mb-6 h-[148px] w-[148px]">
        <motion.div
          className="absolute inset-0"
          animate={reduce ? undefined : { rotate: 360 }}
          transition={SPIN}
        >
          {ORBS.map((cat, i) => (
            <span
              key={cat}
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 -ml-3.5 -mt-3.5 h-7 w-7 rounded-full shadow-md ring-2 ring-card"
              style={{
                transform: `rotate(${i * 60}deg) translateX(${RADIUS}px)`,
                background: `var(--cat-${cat})`,
              }}
            />
          ))}
        </motion.div>
        {/* core crest */}
        <div className="absolute inset-0 m-auto grid h-[60px] w-[60px] place-items-center rounded-full border border-[color-mix(in_oklab,var(--color-primary)_55%,transparent)] bg-[color-mix(in_oklab,var(--color-primary)_16%,var(--color-card))] text-2xl shadow-glow-mint">
          🤝
        </div>
      </motion.div>

      <motion.h2 variants={item} className="font-display text-2xl font-black text-foreground">
        עדיין אין לכם קואליציה
      </motion.h2>
      <motion.p variants={item} className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        קואליציה היא מועדון תחזיות פרטי לכם ולחברים — עם הצעות לסדר משלכם, לוח תוצאות נפרד וזירת דיון סגורה.
      </motion.p>
      <motion.div variants={item}>
        <Link
          href="/g/new"
          className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-6 py-3 font-display text-base font-bold text-primary-foreground shadow-glow-mint transition-colors hover:bg-primary-hover"
        >
          + צרו קואליציה
        </Link>
      </motion.div>
      <motion.p variants={item} className="mt-8 text-xs text-muted-foreground">
        קיבלתם <span className="font-bold text-foreground">קישור הזמנה</span>? פתחו אותו כדי להצטרף.
      </motion.p>
    </motion.div>
  );
}
