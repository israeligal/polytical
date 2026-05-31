import type { Category } from "@/lib/types";
import { categoryLabel } from "@/lib/categories";
import { timeUntil } from "@/lib/format";
import { Clock, Flame } from "@/components/icons";

/** Section/overline-style category label — primary blue, sentence-case (no caps/tracking). */
export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      {categoryLabel(category)}
    </span>
  );
}

export function HotBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
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
