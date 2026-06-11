// The one pulse primitive every skeleton is built from. `motion-safe:` so
// prefers-reduced-motion users get a static placeholder instead of a pulse
// (the shift-manager lesson). Text/label stand-ins; for card-shaped blocks
// keep the real border (`border border-border bg-card`) and pulse the inside.

export function Skeleton({ className }: { className?: string }) {
  return <div className={`motion-safe:animate-pulse rounded bg-muted${className ? ` ${className}` : ""}`} />;
}

/** A bordered card shell whose interior pulses — for blocks that are cards in
 *  the real layout (keeps the structural contrast the flat pulse loses). */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={`motion-safe:animate-pulse rounded-xl border border-border bg-card${className ? ` ${className}` : ""}`} />
  );
}
