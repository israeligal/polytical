import type { ReactNode } from "react";

// Shared pill for statuses/outcomes. `tone` is a closed union → the soft-bg ↔
// saturated-text pairing lives in one place (never the near-white -foreground
// token on a soft bg). RSC-safe.
const TONE = {
  neutral: "bg-muted text-foreground",
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
} as const;

export type ChipTone = keyof typeof TONE;

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${TONE[tone]}${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </span>
  );
}
