import Image from "next/image";
import type { Politician } from "@/lib/types";
import { Sparkle } from "@/components/icons";

type Size = "sm" | "md" | "card";

const SIZE: Record<Size, string> = {
  sm: "h-9 w-9 rounded-full text-sm",
  md: "h-16 w-16 rounded-xl text-xl",
  card: "w-full aspect-[4/5] rounded-[14px] text-6xl",
};

// next/image `sizes` per slot, so the optimizer serves a sensibly-scaled file.
const IMG_SIZES: Record<Size, string> = {
  sm: "36px",
  md: "64px",
  card: "280px",
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("");
}

/**
 * The caricature portrait. With a real `imageUrl` (AI caricature) it renders the
 * image filling the frame; otherwise a styled fallback — a dark category-tinted
 * radial dome + halftone + display initials.
 */
export function PoliticianPortrait({
  politician,
  size = "md",
}: {
  politician: Politician;
  size?: Size;
}) {
  // Real caricature: fill the frame, keep the same ring/rounding.
  if (politician.imageUrl) {
    return (
      <div
        role="img"
        aria-label={`קריקטורה של ${politician.name}`}
        className={`relative overflow-hidden ring-1 ring-border ${SIZE[size]}`}
      >
        <Image
          src={politician.imageUrl}
          alt={`קריקטורה של ${politician.name}`}
          fill
          sizes={IMG_SIZES[size]}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={`קריקטורה של ${politician.name}`}
      className={`relative grid place-items-center overflow-hidden ring-1 ring-border ${SIZE[size]}`}
      style={{
        background: `radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--cat-${politician.cat}) 34%, var(--card)), #0a0f20)`,
      }}
    >
      {/* faint halftone dots — the dome is intentionally dark artwork in BOTH
          themes, so its overlaid text/dots are always light (not theme-foreground,
          which would go dark-on-dark in light mode). */}
      <div
        className="absolute inset-0 text-white/10"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1.3px)",
          backgroundSize: "6px 6px",
        }}
      />
      <span aria-hidden="true" className="relative font-display leading-none text-white/90">
        {initials(politician.name)}
      </span>
      {size === "card" && (
        <span
          className="absolute bottom-1.5 end-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-accent text-[10px] font-bold text-white"
          style={{ backgroundColor: "rgba(8,12,26,.7)" }}
        >
          <Sparkle className="h-2.5 w-2.5" />
          קריקטורה
        </span>
      )}
    </div>
  );
}
