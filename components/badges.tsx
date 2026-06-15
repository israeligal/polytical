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
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 font-accent text-xs font-bold text-gold">
      <Flame className="h-3.5 w-3.5" />
      חם
    </span>
  );
}

/** Official topic tag (KNS_IsraelLawClassificiation) — a subtle Rubik pill.
 *  Tokens only; reads as a sibling of CategoryBadge without the leading dot. */
export function TopicBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 font-accent text-xs font-bold text-muted-foreground">
      {label}
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
