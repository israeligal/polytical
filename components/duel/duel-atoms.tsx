"use client";

import { useEffect } from "react";
import { animate, motion, useReducedMotion, useMotionValue, useTransform, AnimatePresence } from "motion/react";

/* Identity is always the public @handle — initials derive from it, never a real name. */
function initialFromHandle(handle?: string | null): string {
  const h = (handle ?? "").replace(/^@/, "").trim();
  return h ? h[0]!.toUpperCase() : "?";
}

/**
 * Circular caricature avatar inside a glowing ring. Falls back to the
 * handle-initial circle when there's no caricature (mirrors the app's
 * everywhere-avatar rule). Plain <img> so it renders for blob/remote URLs in
 * stories; production swaps in the shared <UserAvatar>.
 */
export function PlayerAvatar({
  handle,
  caricatureUrl,
  size = 72,
  ringClassName = "ring-border",
  glow,
  placeholder,
}: {
  handle?: string | null;
  caricatureUrl?: string | null;
  size?: number;
  ringClassName?: string;
  glow?: "mint" | "coral" | "gold" | "none";
  /** Render a "?" mystery avatar (the un-revealed opponent / empty "you"). */
  placeholder?: boolean;
}) {
  const glowClass =
    glow === "mint" ? "shadow-glow-mint"
    : glow === "coral" ? "shadow-glow-coral"
    : glow === "gold" ? "shadow-glow-gold"
    : "";

  return (
    <span
      className={`relative inline-grid place-items-center overflow-hidden rounded-full bg-sunken ring-2 ${ringClassName} ${glowClass}`}
      style={{ width: size, height: size }}
    >
      {placeholder ? (
        <span className="font-display text-foreground/40" style={{ fontSize: size * 0.5 }}>
          ?
        </span>
      ) : caricatureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={caricatureUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-display text-foreground" style={{ fontSize: size * 0.42 }}>
          {initialFromHandle(handle)}
        </span>
      )}
    </span>
  );
}

/**
 * Animated number count-up (crowd %, mandate counts). Eases 0 → `to` on mount /
 * when `to` changes; snaps instantly under reduced-motion. Uses Motion's
 * `animate` driver and renders the formatted string.
 */
export function CountUp({
  to,
  duration = 1.1,
  format = (n) => String(Math.round(n)),
  className,
}: {
  to: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  // Derive the formatted string off the motion value — updates the DOM text
  // directly, no React state and so no set-state-in-effect.
  const text = useTransform(mv, (v) => format(v));

  useEffect(() => {
    if (reduce) {
      mv.set(to);
      return;
    }
    const controls = animate(mv, to, { duration, ease: [0.16, 0.84, 0.44, 1] });
    return () => controls.stop();
  }, [to, duration, reduce, mv]);

  return <motion.span className={`nums ${className ?? ""}`}>{text}</motion.span>;
}

function relativeClose(closeAt: string): { label: string; urgent: boolean; closed: boolean } {
  const ms = new Date(closeAt).getTime() - Date.now();
  if (ms <= 0) return { label: "נסגר", urgent: false, closed: true };
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days >= 1) return { label: `נסגר בעוד ${days} ${days === 1 ? "יום" : "ימים"}`, urgent: days <= 1, closed: false };
  if (hrs >= 1) return { label: `נסגר בעוד ${hrs} ${hrs === 1 ? "שעה" : "שעות"}`, urgent: true, closed: false };
  return { label: `נסגר בעוד ${mins} ${mins === 1 ? "דקה" : "דקות"}`, urgent: true, closed: false };
}

/**
 * Live urgency chip — "נסגר בעוד 3 ימים", re-ticking each minute. Pulses when
 * the close is imminent, so a "close bet this week" reads as time-pressured.
 */
export function UrgencyChip({ closeAt }: { closeAt: string }) {
  const reduce = useReducedMotion();
  // Computed at render (like the app's <Countdown>) — no ticking interval, so
  // no set-state-in-effect and no SSR/hydration time skew.
  const state = relativeClose(closeAt);

  const tone = state.urgent
    ? "border-negative/40 bg-negative-soft text-negative"
    : "border-accent/40 bg-accent/10 text-gold";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold ${tone}`}
    >
      <motion.span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full bg-current"
        animate={reduce || !state.urgent ? undefined : { opacity: [1, 0.25, 1], scale: [1, 0.7, 1] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
      />
      {state.label}
    </span>
  );
}

/** A short outward burst of "mandate" sparks fired the moment a pick locks. */
export function SparkBurst({ fire, tone = "mint" }: { fire: boolean; tone?: "mint" | "coral" | "gold" }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const color = tone === "coral" ? "bg-negative" : tone === "gold" ? "bg-accent" : "bg-positive";
  const SPARKS = 10;

  return (
    <AnimatePresence>
      {fire && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
          {Array.from({ length: SPARKS }).map((_, i) => {
            const angle = (i / SPARKS) * Math.PI * 2;
            const dist = 46 + (i % 3) * 14;
            return (
              <motion.span
                key={i}
                className={`absolute h-1.5 w-1.5 rounded-full ${color}`}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                animate={{
                  opacity: [0, 1, 0],
                  x: Math.cos(angle) * dist,
                  y: Math.sin(angle) * dist,
                  scale: [0.4, 1, 0.6],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.65, ease: "easeOut", delay: (i % 5) * 0.012 }}
              />
            );
          })}
        </span>
      )}
    </AnimatePresence>
  );
}
