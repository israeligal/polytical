// Split-bill lineage: when a bill is a split child (KNS_BillSplit), a one-line
// reference to the parent it split off. Used on the bill page (as a link) and on
// agenda cards (as plain text — the card is already a Link, so no nested anchor).
// Most "על סדר היום" budget items are split children with no own initiators, so
// this is the meaningful context for them. RSC, presentational; tokens + RTL.

import Link from "next/link";

export function BillLineage({
  parent,
  asLink = true,
  className,
}: {
  parent: { billId: number; nameHe: string };
  /** false inside an outer Link (agenda card) — renders text, not a nested anchor. */
  asLink?: boolean;
  className?: string;
}) {
  const base = `flex items-center gap-1 text-xs text-muted-foreground${className ? ` ${className}` : ""}`;
  if (!asLink) {
    return (
      <p className={base}>
        <span className="shrink-0">חלק מ:</span>
        <span className="truncate font-semibold text-foreground">{parent.nameHe}</span>
      </p>
    );
  }
  return (
    <p className={base}>
      <span className="shrink-0">חלק מהצעת חוק:</span>
      <Link href={`/bill/${parent.billId}`} className="min-w-0 truncate font-semibold text-primary hover:underline">
        {parent.nameHe}
      </Link>
    </p>
  );
}
