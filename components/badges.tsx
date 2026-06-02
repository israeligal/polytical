import type { Category } from "@/lib/types";
import { categoryLabel } from "@/lib/categories";
import { timeUntil } from "@/lib/format";
import { Clock, Flame } from "@/components/icons";

/** Category chip — Rubik pill on the card surface, hairline border (the design's Chip). */
export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-accent text-xs font-bold text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      {categoryLabel(category)}
    </span>
  );
}

export function HotBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 px-2.5 py-1 font-accent text-xs font-bold text-accent" style={{ backgroundColor: "rgba(255,194,61,.12)" }}>
      <Flame className="h-3.5 w-3.5" />
      חם
    </span>
  );
}

export function Countdown({ closeAt }: { closeAt: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <Clock className="h-3.5 w-3.5" />
      {timeUntil(closeAt)}
    </span>
  );
}
