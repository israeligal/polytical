// בעד/נגד/נמנע totals bar for a Knesset vote — the 3-segment sibling of
// components/odds-bar.tsx (same height/radius/transition vocabulary).
// "didn't vote" is intentionally NOT a segment: the bar shows positions taken;
// the detail page states non-voters separately. RSC-safe, pure presentational.

import { pct } from "@/lib/format";

export interface VoteTotals {
  totalFor: number | null;
  totalAgainst: number | null;
  totalAbstain: number | null;
}

const SEGMENTS = [
  { key: "for", label: "בעד", cls: "bg-positive text-positive-foreground" },
  { key: "against", label: "נגד", cls: "bg-negative text-negative-foreground" },
  { key: "abstain", label: "נמנע", cls: "bg-abstain text-background" },
] as const;

export function VoteTotalsBar({ totals, className }: { totals: VoteTotals; className?: string }) {
  const counts = {
    for: totals.totalFor ?? 0,
    against: totals.totalAgainst ?? 0,
    abstain: totals.totalAbstain ?? 0,
  };
  const total = counts.for + counts.against + counts.abstain;
  if (total === 0) {
    return (
      <div className={`flex h-10 items-center justify-center rounded-[12px] border border-border bg-muted/50 text-xs font-semibold text-muted-foreground${className ? ` ${className}` : ""}`}>
        אין פירוט הצבעה
      </div>
    );
  }
  return (
    <div
      className={`flex h-10 overflow-hidden rounded-[12px] border border-border${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={`בעד ${counts.for}, נגד ${counts.against}, נמנע ${counts.abstain}`}
    >
      {SEGMENTS.filter((s) => counts[s.key] > 0).map((s) => (
        <div
          key={s.key}
          className={`flex min-w-[64px] items-center justify-center gap-1 px-2 text-xs font-bold transition-[width] duration-500 ease-out ${s.cls}`}
          style={{ width: `${pct(counts[s.key], total)}%` }}
        >
          <span className="truncate">
            {s.label} <span className="nums">{counts[s.key]}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
