import type { Politician } from "@/lib/types";
import { catFrom } from "@/lib/cat";
import { Sparkle } from "@/components/icons";

type Size = "sm" | "md" | "card";

const SIZE: Record<Size, string> = {
  sm: "h-9 w-9 rounded-full text-sm",
  md: "h-16 w-16 rounded-xl text-xl",
  card: "w-full aspect-[4/5] rounded-xl text-6xl",
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("");
}

/**
 * The caricature portrait. v1 renders a styled party-color fallback (halftone +
 * serif initials); a real AI caricature swaps in via next/image once available.
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
      className={`relative grid place-items-center overflow-hidden bg-gradient-to-br ${catFrom[politician.cat]} to-foreground/75 ring-1 ring-foreground/10 ${SIZE[size]}`}
    >
      {/* halftone dots — currentColor via the utility, no raw color literal */}
      <div
        className="absolute inset-0 text-foreground/25"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1.3px)",
          backgroundSize: "6px 6px",
        }}
      />
      <span aria-hidden="true" className="relative font-display font-black leading-none text-card">
        {initials(politician.name)}
      </span>
      {size === "card" && (
        <span className="absolute bottom-1.5 end-1.5 inline-flex items-center gap-0.5 rounded bg-card/85 px-1.5 py-0.5 text-[10px] font-bold text-foreground">
          <Sparkle className="h-2.5 w-2.5" />
          קריקטורה
        </span>
      )}
    </div>
  );
}
