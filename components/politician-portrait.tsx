import type { Politician } from "@/lib/types";
import { Sparkle } from "@/components/icons";

type Size = "sm" | "md" | "card";

const SIZE: Record<Size, string> = {
  sm: "h-9 w-9 rounded-full text-sm",
  md: "h-16 w-16 rounded-xl text-xl",
  card: "w-full aspect-[4/5] rounded-[14px] text-6xl",
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("");
}

/**
 * The caricature portrait. v1 renders a styled fallback: a dark category-tinted
 * radial dome (per the design's rarity-tinted placeholder) + halftone + display
 * initials. A real caricature image swaps in via next/image once available.
 */
export function PoliticianPortrait({
  politician,
  size = "md",
}: {
  politician: Politician;
  size?: Size;
}) {
  return (
    <div
      role="img"
      aria-label={`קריקטורה של ${politician.name}`}
      className={`relative grid place-items-center overflow-hidden ring-1 ring-border ${SIZE[size]}`}
      style={{
        background: `radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--cat-${politician.cat}) 34%, var(--card)), #0a0f20)`,
      }}
    >
      {/* faint halftone dots */}
      <div
        className="absolute inset-0 text-foreground/10"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1.3px)",
          backgroundSize: "6px 6px",
        }}
      />
      <span aria-hidden="true" className="relative font-display leading-none text-foreground/90">
        {initials(politician.name)}
      </span>
      {size === "card" && (
        <span
          className="absolute bottom-1.5 end-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-accent text-[10px] font-bold text-foreground"
          style={{ backgroundColor: "rgba(8,12,26,.7)" }}
        >
          <Sparkle className="h-2.5 w-2.5" />
          קריקטורה
        </span>
      )}
    </div>
  );
}
